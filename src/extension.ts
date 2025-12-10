import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { commands, debug, ExtensionContext, workspace } from 'vscode';
import {
  Executable,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  Trace,
  TransportKind
} from 'vscode-languageclient/node';
import { ASTExplorerViewProvider } from './ast-explorer-view';
import { createHyloDebugAdapterDescriptorFactory } from './debug/hyloDebug';
import {
  getInstalledVersion,
  languageServerExecutableFilename,
  updateLanguageServer
} from './lsp/download-language-server';
import {
  getHyloOutputChannel,
  isWindows,
  normalizePath,
  spawnProcess
} from './util/shared';

let globalClient: LanguageClient | null = null;

async function activateBackend(
  context: ExtensionContext
): Promise<LanguageClient> {
  process.chdir(context.extensionPath);
  let outputChannel = getHyloOutputChannel();

  outputChannel.appendLine(
    `Working directory: ${process.cwd()}, activeDebugSession: ${debug.activeDebugSession}, __filename: ${__filename}`
  );

  // Check if language server is installed, download if needed
  let installedVersion = getInstalledVersion();
  const config = workspace.getConfiguration('hylo.languageServer');
  const specifiedVersion = config.get<string>('version', 'latest');
  const autoUpdate = config.get<boolean>('autoUpdate', true);

  if (!installedVersion) {
    outputChannel.appendLine(
      `Language server not found. Downloading version: ${specifiedVersion}...`
    );
    const downloadSuccess = await updateLanguageServer(false, specifiedVersion);
    if (!downloadSuccess) {
      throw new Error('Failed to download language server.');
    }
    installedVersion = getInstalledVersion();
    if (!installedVersion) {
      throw new Error('Language server installation failed.');
    }
  } else if (autoUpdate && !installedVersion.isDev) {
    // Check for updates if auto-update is enabled
    outputChannel.appendLine('Checking for language server updates...');
    await updateLanguageServer(false, specifiedVersion);
    installedVersion = getInstalledVersion();
  }

  let serverExe = `${context.extensionPath}/dist/bin/${languageServerExecutableFilename()}`;

  let hyloRoot: string | undefined = undefined;
  let env = process.env;

  env['HYLO_STDLIB_PATH'] = `${context.extensionPath}/dist/hylo-stdlib`;

  // installedVersion should always be defined at this point
  if (!installedVersion) {
    throw new Error('Language server installation state is invalid.');
  }

  let transport = installedVersion.isDev
    ? TransportKind.pipe
    : TransportKind.stdio;

  outputChannel.appendLine(
    `Hylo root directory: ${hyloRoot}, lsp server executable: ${serverExe}, transport: ${transport}`
  );

  let executable: Executable = {
    command: serverExe,
    args: [],
    transport: transport,
    options: {
      cwd: context.extensionPath,
      env: env
    }
  };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  let serverOptions: ServerOptions = {
    run: executable,
    debug: executable
  };

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [
      // { scheme: 'file', language: 'hylo' }
      { pattern: '**/*.hylo' }
    ],
    synchronize: {
      // Synchronize the setting section 'languageServerExample' to the server
      configurationSection: 'hylo',
      fileEvents: workspace.createFileSystemWatcher('**/*.hylo')
    },

    outputChannel: outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Info
  };

  // Create the language client and start the client.
  let forceDebug = false;
  let client = new LanguageClient(
    'hylo',
    'Hylo LSP Extension',
    serverOptions,
    clientOptions,
    forceDebug
  );
  client.registerProposedFeatures();
  client.setTrace(Trace.Messages);

  client
    .start()
    .catch((reason) => {
      outputChannel.appendLine(`Client error: ${reason}`);
    })
    .finally(() => {
      outputChannel.appendLine(`Client finally`);
    });

  return client;
}

export async function activate(context: vscode.ExtensionContext) {
  let output = getHyloOutputChannel();
  output.appendLine(
    `Activating Hylo extension in directory ${context.extensionPath}`
  );

  const astExplorerViewProvider = new ASTExplorerViewProvider(
    context.extensionUri
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ASTExplorerViewProvider.viewType,
      astExplorerViewProvider
    )
  );

  // Register commands for Hylo file execution and compilation
  context.subscriptions.push(
    vscode.commands.registerCommand('hylo.runCurrentFile', runCurrentFile),
    vscode.commands.registerCommand(
      'hylo.compileAndRunFolder',
      compileAndRunFolder
    ),
    vscode.commands.registerCommand('hylo.startDebugging', startDebugging)
  );

  // Register the debug adapter factory
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(
      'hylo',
      createHyloDebugAdapterDescriptorFactory()
    )
  );

  globalClient = await activateBackend(context);

  commands.registerCommand('hylo.updateLanguageServer', async () => {
    const config = workspace.getConfiguration('hylo.languageServer');
    const specifiedVersion = config.get<string>('version', 'latest');
    await updateLanguageServer(true, specifiedVersion);
  });

  commands.registerCommand('hylo.restartLanguageServer', async () => {
    await globalClient?.restart();
  });

  // Export the output channel management function for use elsewhere
  return {
    getHyloOutputChannel
  };
}

export async function deactivate() {
  if (globalClient) {
    await globalClient.stop();
  }
}

/**
 * Run the current Hylo file
 */
async function runCurrentFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  if (document.languageId !== 'hylo') {
    vscode.window.showErrorMessage('Not a Hylo file');
    return;
  }

  const filePath = document.uri.fsPath;
  const fileName = path.basename(filePath);
  const fileNameWithoutExt = path.parse(fileName).name;

  try {
    await compileAndRunHylo(filePath, fileNameWithoutExt);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to run Hylo file: ${error}`);
  }
}

/**
 * Compile and run a folder of Hylo files
 * @param folderUri Optional URI of the folder to compile (provided when called from context menu)
 */
async function compileAndRunFolder(folderUri?: vscode.Uri) {
  let folderPath: string;

  if (folderUri) {
    // Use the provided folder URI directly (from context menu)
    folderPath = folderUri.fsPath;
  } else {
    // No URI provided, show folder picker dialog
    const folderUris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select Folder with Hylo Files'
    });

    if (!folderUris || folderUris.length === 0) {
      return;
    }

    folderPath = folderUris[0]!.fsPath;
  }

  const folderName = path.basename(folderPath);

  try {
    // Find all Hylo files in the folder
    const hyloFiles = await findHyloFiles(folderPath);

    if (hyloFiles.length === 0) {
      vscode.window.showWarningMessage(
        'No Hylo files found in the selected folder'
      );
      return;
    }

    await compileAndRunHylo(hyloFiles, folderName);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to compile and run folder: ${error}`
    );
  }
}

/**
 * Find all Hylo files in a directory recursively
 */
async function findHyloFiles(directoryPath: string): Promise<string[]> {
  const hyloFiles: string[] = [];
  const outputChannel = getHyloOutputChannel();

  // Read all files in the directory
  try {
    const files = fs.readdirSync(directoryPath);

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        const subDirFiles = await findHyloFiles(filePath);
        hyloFiles.push(...subDirFiles);
      } else if (path.extname(file).toLowerCase() === '.hylo') {
        // Add Hylo files to the list
        hyloFiles.push(filePath);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Error reading directory: ${errorMessage}`);
    throw error;
  }

  return hyloFiles;
}

function required<T>(
  value: T | undefined,
  message: string = 'Required value is missing'
): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

/**
 * Compile and run Hylo code with real-time output streaming
 * @param sourcePath Path to the source file or array of file paths
 * @param outputName Name for the output executable
 */
async function compileAndRunHylo(
  sourcePath: string | string[],
  outputName: string
) {
  // Get or create output channel and show it
  const outputChannel = getHyloOutputChannel();
  outputChannel.clear();
  outputChannel.show(true);

  // Get extension configuration
  const config = vscode.workspace.getConfiguration('hylo');
  const compilerPath = config.get<string>('compilerPath', 'hc');
  const useCommandTemplate = config.get<boolean>('useCommandTemplate', false);
  const commandTemplate = config.get<string>(
    'commandTemplate',
    'swift run hc ${ARGS}'
  );

  // Default working directory to workspace folder
  let workingDirectory: string | undefined;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    workingDirectory = normalizePath(workspaceFolder.uri.fsPath);
  }

  // Get or create temp output directory
  let tempOutputDir = config.get<string>(
    'tempOutputDir',
    '${workspaceFolder}/.hylo_temp'
  );

  // Replace ${workspaceFolder} with actual workspace folder path
  if (tempOutputDir.includes('${workspaceFolder}')) {
    if (workspaceFolder) {
      tempOutputDir = tempOutputDir.replace(
        '${workspaceFolder}',
        normalizePath(workspaceFolder.uri.fsPath)
      );
    } else {
      tempOutputDir = path.join(
        path.dirname(
          Array.isArray(sourcePath)
            ? required(sourcePath[0], 'Source path must be provided.')
            : sourcePath
        ),
        '.hylo_temp'
      );
    }
  }

  // Create output directory if it doesn't exist
  if (!fs.existsSync(tempOutputDir)) {
    fs.mkdirSync(tempOutputDir, { recursive: true });
  }

  // On Windows, add .exe extension to the output file
  const outputExecutableName = isWindows() ? `${outputName}.exe` : outputName;
  const outputPath = path.join(tempOutputDir, outputExecutableName);

  // Prepare source paths for the command
  const sourcePaths = Array.isArray(sourcePath) ? sourcePath : [sourcePath];

  // Build the compiler command components
  let compilerExecutable: string;
  let compilerArgs: string[] = [];

  if (useCommandTemplate) {
    // Split the template into executable and args if using a template
    const formattedCommand = commandTemplate.replace(
      '${ARGS}',
      `-o "${outputPath}" ${sourcePaths.map((p) => `"${p}"`).join(' ')}`
    );

    // Extract the executable and args from the formatted command
    const parts = formattedCommand.split(' ');
    if (parts.length === 0) {
      throw new Error(
        'At least the compiler executable must be specified in the command template.'
      );
    }
    compilerExecutable = parts[0]!.replace(/"/g, '');
    compilerArgs = parts.slice(1);
  } else {
    compilerExecutable = compilerPath;
    compilerArgs = ['-o', outputPath, ...sourcePaths.map(normalizePath)];
  }

  // Output the compilation message and command
  outputChannel.appendLine('Compiling Hylo code...');

  try {
    // Compile the code and stream output in real-time
    await spawnProcess(
      normalizePath(compilerExecutable),
      compilerArgs,
      outputChannel,
      workingDirectory
    );

    // If we get here, compilation succeeded, so run the program
    outputChannel.appendLine(`Running ${outputPath}...`);

    // Run the compiled program and stream its output
    await spawnProcess(outputPath, [], outputChannel, workingDirectory);
  } catch (error) {
    // If compilation or execution fails, show the error and stop the process
    outputChannel.appendLine(`Error: ${error}`);
    throw new Error(`Process failed with error: ${error}`);
  }
}

/**
 * Start debugging the current Hylo file using the Hylo debugger
 */
async function startDebugging() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const document = editor.document;
  if (document.languageId !== 'hylo') {
    vscode.window.showErrorMessage('Not a Hylo file');
    return;
  }

  const filePath = document.uri.fsPath;

  // Save the document if it has unsaved changes
  if (document.isDirty) {
    await document.save();
  }

  // Get workspace folder as default cwd
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workingDirectory = workspaceFolder
    ? workspaceFolder.uri.fsPath
    : undefined;

  // Start debugging with the Hylo debug configuration
  const debugConfig = {
    type: 'hylo',
    request: 'launch',
    name: 'Debug Hylo File',
    program: filePath,
    isFolder: false,
    cwd: workingDirectory // Add workspace folder as default working directory
  };

  try {
    await vscode.debug.startDebugging(undefined, debugConfig);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start debugging: ${error}`);
  }
}
