import * as vscode from 'vscode';
import { DebugSession, InitializedEvent, TerminatedEvent, OutputEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import * as fs from 'fs';
import { isWindows, normalizePath, getHyloOutputChannel, spawnProcess } from '../util/shared';

// Output channel reference for debug sessions
let debugOutputChannel: vscode.OutputChannel | undefined;

/**
 * This is the debug adapter that "pretends" to debug Hylo files
 * but actually just compiles and runs them.
 */
export class HyloDebugSession extends DebugSession {
    public constructor() {
        super();

        // We do everything in the initialized request
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        // Create output channel if it doesn't exist
        if (!debugOutputChannel) {
            debugOutputChannel = vscode.window.createOutputChannel('Hylo Debug');
        }
    }

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the debug adapter about the features it provides.
     */
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        // This debug adapter provides these features
        response.body = response.body || {};

        // Now it's ok to process events
        this.sendResponse(response);

        // Signal readiness
        this.sendEvent(new InitializedEvent());
    }

    /**
     * Called at the start of a debug session
     * This is where we do our "fake" debugging (just run the program)
     */
    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: any): Promise<void> {
        // Extract program path from arguments
        const programPath = args.program as string;
        const isFolder = args.isFolder as boolean;

        // Show output channel
        if (debugOutputChannel) {
            debugOutputChannel.clear();
            debugOutputChannel.show(true);
        }

        try {
            // If it's a folder, find all .hylo files and compile them
            if (isFolder) {
                await this.compileFolder(programPath, args);
            } else {
                // If it's a file, just compile that file
                await this.compileFile(programPath, args);
            }

            // Tell the client we're done debugging
            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.sendEvent(new OutputEvent(`Error: ${message}\n`, 'stderr'));
            this.sendResponse(response);
            this.sendEvent(new TerminatedEvent());
        }
    }

    /**
     * Compile a single Hylo file
     */
    private async compileFile(filePath: string, args: any): Promise<void> {
        const fileName = path.basename(filePath);
        const fileNameWithoutExt = path.parse(fileName).name;

        await this.compileAndRunHylo(normalizePath(filePath), normalizePath(fileNameWithoutExt), args);
    }

    /**
     * Compile all Hylo files in a folder
     */
    private async compileFolder(folderPath: string, args: any): Promise<void> {
        const folderName = path.basename(folderPath);
        const hyloFiles = await this.findHyloFiles(folderPath);

        if (hyloFiles.length === 0) {
            this.sendEvent(new OutputEvent('No Hylo files found in the selected folder\n', 'console'));
            return;
        }

        await this.compileAndRunHylo(hyloFiles, folderName, args);
    }

    /**
     * Find all Hylo files in a directory recursively
     */
    private async findHyloFiles(directoryPath: string): Promise<string[]> {
        const hyloFiles: string[] = [];

        // Read all files in the directory
        try {
            const files = fs.readdirSync(directoryPath);

            for (const file of files) {
                const filePath = path.join(directoryPath, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                    // Recursively search subdirectories
                    const subDirFiles = await this.findHyloFiles(filePath);
                    hyloFiles.push(...subDirFiles);
                } else if (path.extname(file).toLowerCase() === '.hylo') {
                    // Add Hylo files to the list
                    hyloFiles.push(filePath);
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.sendEvent(new OutputEvent(`Error reading directory: ${message}\n`, 'stderr'));
        }

        return hyloFiles;
    }

    /**
     * Compile and run Hylo code with real-time output streaming
     */
    private async compileAndRunHylo(sourcePath: string | string[], outputName: string, args: any): Promise<void> {
        if(!Array.isArray(sourcePath)) {
            sourcePath = [sourcePath]; // Ensure sourcePath is always an array
        }
        if(!sourcePath.length) {
            this.sendEvent(new OutputEvent('No source files provided\n', 'stderr'));
            return;
        }
        sourcePath = sourcePath.map(normalizePath);
        if (!debugOutputChannel) {
            this.sendEvent(new OutputEvent('Output channel not available\n', 'stderr'));
            return;
        }

        // Get extension configuration
        const config = vscode.workspace.getConfiguration('hylo');

        // Get config from extension settings first, then override with launch.json if specified
        const compilerPath = args.compilerPath !== undefined ? args.compilerPath : config.get<string>('compilerPath', 'hc');
        const useCommandTemplate = args.useCommandTemplate !== undefined ? args.useCommandTemplate : config.get<boolean>('useCommandTemplate', false);
        const commandTemplate = args.commandTemplate !== undefined ? args.commandTemplate : config.get<string>('commandTemplate', 'swift run hc ${ARGS}');
        let tempOutputDir = args.tempOutputDir !== undefined ? args.tempOutputDir : config.get<string>('tempOutputDir', '${workspaceFolder}/.hylo_temp');

        // Get working directory - default to ${workspaceFolder}, but allow override via args.cwd
        let workingDirectory: string | undefined;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (args.cwd) {
            // If cwd provided in launch config, use that (replacing ${workspaceFolder} if needed)
            workingDirectory = args.cwd.replace(/\${workspaceFolder}/g, workspaceFolder?.uri.fsPath || '');
        } else if (workspaceFolder) {
            // Otherwise default to workspace folder
            workingDirectory = workspaceFolder.uri.fsPath;
        }

        // Replace ${workspaceFolder} with actual workspace folder path in tempOutputDir
        if (tempOutputDir.includes('${workspaceFolder}')) {
            if (workspaceFolder) {
                tempOutputDir = tempOutputDir.replace('${workspaceFolder}', workspaceFolder.uri.fsPath);
            } else {
                tempOutputDir = path.join(path.dirname(sourcePath[0]), '.hylo_temp');
            }
        }

        // Normalize tempOutputDir for the current platform
        tempOutputDir = normalizePath(tempOutputDir);

        // Create output directory if it doesn't exist
        if (!fs.existsSync(tempOutputDir)) {
            fs.mkdirSync(tempOutputDir, { recursive: true });
        }

        // On Windows, add .exe extension to the output file
        const outputExecutableName = isWindows() ? `${outputName}.exe` : outputName;
        const outputPath = path.join(tempOutputDir, outputExecutableName);

        // Ensure the output channel is visible
        debugOutputChannel.show(true);


        // Build the compiler command components
        let executable: string;

        let compileArgs = ['-o', outputPath, ...sourcePath];
        if (useCommandTemplate) {
            // Split the template into executable and args if using a template
            const formattedCommand = commandTemplate
                .replace('${ARGS}', compileArgs.join(' '));
            
            const commandParts = formattedCommand.split(' '); // todo handle spaces in paths

            compileArgs = commandParts.slice(1);
            executable = commandParts[0];
        } else {
            executable = compilerPath;
        }

        // Output the compilation message and command
        debugOutputChannel.appendLine('Compiling Hylo code...');

        try {
            // Compile the code and stream output in real-time
            await spawnProcess(executable, compileArgs, debugOutputChannel, workingDirectory);

            // If we get here, compilation succeeded, so run the program
            debugOutputChannel.appendLine(`Running ${outputPath}...`);

            // Run the compiled program and stream its output
            await spawnProcess(outputPath, [], debugOutputChannel, workingDirectory);

        } catch (error) {
            // If compilation or execution fails, show the error and stop the process
            debugOutputChannel.appendLine(`Error: ${error}`);
            throw new Error(`Process failed with error: ${error}`);
        }
    }
}

// This method is called when the debug adapter is loaded
export function createHyloDebugAdapterDescriptorFactory(): vscode.DebugAdapterDescriptorFactory {
    return {
        createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
            // Create the output channel if it doesn't exist
            if (!debugOutputChannel) {
                debugOutputChannel = vscode.window.createOutputChannel('Hylo Debug');
            }

            return new vscode.DebugAdapterInlineImplementation(new HyloDebugSession());
        }
    };
}

// Export the output channel for use in extension.ts
export function getOutputChannel(): vscode.OutputChannel {
    if (!debugOutputChannel) {
        debugOutputChannel = vscode.window.createOutputChannel('Hylo Debug');
    }
    return debugOutputChannel;
}