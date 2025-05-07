import { SymbolKind } from 'vscode';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ASTExplorerViewProvider } from './ast-explorer-view';
import { createHyloDebugAdapterDescriptorFactory, getOutputChannel } from './debug/hyloDebug';
import { spawn } from 'child_process';

let highlightDecorationType: vscode.TextEditorDecorationType;
let lastPositionDecoration: vscode.DecorationOptions[] = [];

// OUTPUT channel management for both regular commands and debug sessions
let hyloOutputChannel: vscode.OutputChannel | undefined;

export function getOrCreateHyloOutputChannel(): vscode.OutputChannel {
  if (!hyloOutputChannel) {
    hyloOutputChannel = vscode.window.createOutputChannel('Hylo');
  }
  return hyloOutputChannel;
}

export function activate(context: vscode.ExtensionContext) {
  highlightDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.3)',
    border: '1px solid rgba(255, 255, 0, 0.7)'
  });

  // Update highlight on cursor movement
  vscode.window.onDidChangeTextEditorSelection(
    (event) => {
      const editor = event.textEditor;
      const position = editor.selection.active;

      // Create range for ±1 character around cursor
      const startPos = new vscode.Position(
        position.line,
        Math.max(0, position.character - 2)
      );
      const endPos = new vscode.Position(position.line, position.character + 2);
      const range = new vscode.Range(startPos, endPos);

      lastPositionDecoration = [
        {
          range: range,
          hoverMessage: 'Cursor highlight'
        }
      ];

      // editor.setDecorations(highlightDecorationType, lastPositionDecoration);
    },
    null,
    context.subscriptions
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
    vscode.commands.registerCommand('hylo.compileAndRunFolder', compileAndRunFolder),
    vscode.commands.registerCommand('hylo.startDebugging', startDebugging)
  );

  // Register the debug adapter factory
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('hylo', createHyloDebugAdapterDescriptorFactory())
  );

  // Export the output channel management function for use elsewhere
  return {
    getOrCreateHyloOutputChannel
  };
}

export function deactivate() {
  if (highlightDecorationType) {
    highlightDecorationType.dispose();
  }
  
  if (hyloOutputChannel) {
    hyloOutputChannel.dispose();
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

    folderPath = folderUris[0].fsPath;
  }

  const folderName = path.basename(folderPath);

  try {
    // Find all Hylo files in the folder
    const hyloFiles = await findHyloFiles(folderPath);
    
    if (hyloFiles.length === 0) {
      vscode.window.showWarningMessage('No Hylo files found in the selected folder');
      return;
    }

    await compileAndRunHylo(hyloFiles, folderName);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to compile and run folder: ${error}`);
  }
}

/**
 * Find all Hylo files in a directory recursively
 */
async function findHyloFiles(directoryPath: string): Promise<string[]> {
  const hyloFiles: string[] = [];
  const outputChannel = getOrCreateHyloOutputChannel();
  
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

/**
 * Spawn a process and return a promise that resolves when the process completes
 * or rejects if the process fails. Streams output to the output channel.
 */
function spawnProcess(command: string, args: string[], outputChannel: vscode.OutputChannel, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Remove quotes from command if present
    const cleanCommand = command.replace(/^"(.*)"$/, '$1');
    
    // Use provided working directory or current directory
    const options = { 
      shell: true,
      cwd: cwd
    };
    
    const proc = spawn(cleanCommand, args, options);
    
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) {
        outputChannel.append(text);
      }
    });
    
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) {
        outputChannel.append(text);
      }
    });
    
    proc.on('error', (err) => {
      const errorMessage = `Failed to start process: ${err.message}`;
      outputChannel.appendLine(errorMessage);
      reject(errorMessage);
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        const errorMessage = `Process exited with code ${code}`;
        outputChannel.appendLine(errorMessage);
        reject(errorMessage);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Compile and run Hylo code with real-time output streaming
 * @param sourcePath Path to the source file or array of file paths
 * @param outputName Name for the output executable
 */
async function compileAndRunHylo(sourcePath: string | string[], outputName: string) {
  // Get or create output channel and show it
  const outputChannel = getOrCreateHyloOutputChannel();
  outputChannel.clear();
  outputChannel.show(true);
  
  // Get extension configuration
  const config = vscode.workspace.getConfiguration('hylo');
  const compilerPath = config.get<string>('compilerPath', 'hc');
  const useCommandTemplate = config.get<boolean>('useCommandTemplate', false);
  const commandTemplate = config.get<string>('commandTemplate', 'swift run hc ${ARGS}');
  
  // Default working directory to workspace folder
  let workingDirectory: string | undefined;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    workingDirectory = workspaceFolder.uri.fsPath;
  }
  
  // Get or create temp output directory
  let tempOutputDir = config.get<string>('tempOutputDir', '${workspaceFolder}/.hylo_temp');
  
  // Replace ${workspaceFolder} with actual workspace folder path
  if (tempOutputDir.includes('${workspaceFolder}')) {
    if (workspaceFolder) {
      tempOutputDir = tempOutputDir.replace('${workspaceFolder}', workspaceFolder.uri.fsPath);
    } else {
      tempOutputDir = path.join(path.dirname(Array.isArray(sourcePath) ? sourcePath[0] : sourcePath), '.hylo_temp');
    }
  }
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(tempOutputDir)) {
    fs.mkdirSync(tempOutputDir, { recursive: true });
  }
  
  // On Windows, add .exe extension to the output file
  const isWindows = process.platform === 'win32';
  const outputExecutableName = isWindows ? `${outputName}.exe` : outputName;
  const outputPath = path.join(tempOutputDir, outputExecutableName);
  
  // Prepare source paths for the command
  const sourcePaths = Array.isArray(sourcePath) ? sourcePath : [sourcePath];
  
  // Build the compiler command components
  let compilerExecutable: string;
  let compilerArgs: string[] = [];
  
  if (useCommandTemplate) {
    // Split the template into executable and args if using a template
    const formattedCommand = commandTemplate
      .replace('${COMPILER}', compilerPath)
      .replace('${ARGS}', `-o "${outputPath}" ${sourcePaths.map(p => `"${p}"`).join(' ')}`);
    
    // Extract the executable and args from the formatted command
    // This is a simplistic approach and might not work for complex command templates
    const parts = formattedCommand.split(' ');
    compilerExecutable = parts[0].replace(/"/g, '');
    compilerArgs = parts.slice(1);
  } else {
    compilerExecutable = compilerPath;
    compilerArgs = ['-o', outputPath, ...sourcePaths];
  }
  
  // Output the compilation message and command
  outputChannel.appendLine('Compiling Hylo code...');
  outputChannel.appendLine(`Running: "${compilerExecutable}" ${compilerArgs.join(' ')}`);
  if (workingDirectory) {
    outputChannel.appendLine(`Working directory: ${workingDirectory}`);
  }
  
  try {
    // Compile the code and stream output in real-time
    await spawnProcess(compilerExecutable, compilerArgs, outputChannel, workingDirectory);
    
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

function range(l1: number, c1: number, l2: number, c2: number) {
  return new vscode.Range(
    new vscode.Position(l1, c1),
    new vscode.Position(l2, c2)
  );
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
  const workingDirectory = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;

  // Start debugging with the Hylo debug configuration
  const debugConfig = {
    type: 'hylo',
    request: 'launch',
    name: 'Debug Hylo File',
    program: filePath,
    isFolder: false,
    cwd: workingDirectory  // Add workspace folder as default working directory
  };

  try {
    await vscode.debug.startDebugging(undefined, debugConfig);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start debugging: ${error}`);
  }
}

function node(
  title: string,
  details: string,
  symbolKind: SymbolKind,
  r: vscode.Range,
  children: vscode.DocumentSymbol[]
) {
  const n = new vscode.DocumentSymbol(title, details, symbolKind, r, r);
  n.children = children;
  return n;
}

function parameter(name: string, r: vscode.Range, defaultValue?: string) {
  return node(
    name,
    'Parameter',
    SymbolKind.Variable,
    r,
    defaultValue
      ? [
          node('default value', '', SymbolKind.Property, r, [
            node(defaultValue, '', SymbolKind.String, r, [])
          ])
        ]
      : []
  );
}
class HyloSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.DocumentSymbol[] | Thenable<vscode.DocumentSymbol[]> {
    return [
      node('B', 'ProductType', SymbolKind.Class, range(0, 0, 6, 1), [
        node('a', 'Binding', SymbolKind.Field, range(2, 4, 2, 21), []),
        node('b', 'Binding', SymbolKind.Field, range(5, 4, 5, 21), [])
      ]),
      node('asd', 'Function', SymbolKind.Function, range(8, 0, 10, 1), [
        node('parameters', '', SymbolKind.Property, range(0, 3, 1, 1), [
          parameter('a', range(8, 8, 8, 18)),
          parameter('b', range(8, 20, 8, 31), '12')
        ])
      ])
    ];
  }
}

vscode.languages.registerDocumentSymbolProvider(
  { scheme: 'file', language: 'hylo' },
  new HyloSymbolProvider()
);
