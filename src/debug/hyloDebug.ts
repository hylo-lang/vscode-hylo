import * as vscode from 'vscode';
import { DebugSession, InitializedEvent, TerminatedEvent, OutputEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Output channel reference that will be used instead of terminal
let outputChannel: vscode.OutputChannel | undefined;

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
        if (!outputChannel) {
            outputChannel = vscode.window.createOutputChannel('Hylo Debug');
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
        if (outputChannel) {
            outputChannel.clear();
            outputChannel.show(true);
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
        
        await this.compileAndRunHylo(filePath, fileNameWithoutExt, args);
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
        if (!outputChannel) {
            this.sendEvent(new OutputEvent('Output channel not available\n', 'stderr'));
            return;
        }
        
        // Get extension configuration
        const config = vscode.workspace.getConfiguration('hylo');
        
        // Get config from extension settings first, then override with launch.json if specified
        const compilerPath = args.compilerPath !== undefined ? args.compilerPath : config.get<string>('compilerPath', 'hc');
        const useCommandTemplate = args.useCommandTemplate !== undefined ? args.useCommandTemplate : config.get<boolean>('useCommandTemplate', false);
        const commandTemplate = args.commandTemplate !== undefined ? args.commandTemplate : config.get<string>('commandTemplate', '${COMPILER} ${ARGS}');
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
        
        // Ensure the output channel is visible
        outputChannel.show(true);
        
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
            await this.spawnProcess(compilerExecutable, compilerArgs, workingDirectory);
            
            // If we get here, compilation succeeded, so run the program
            outputChannel.appendLine(`Running ${outputPath}...`);
            
            // Run the compiled program and stream its output
            await this.spawnProcess(outputPath, [], workingDirectory);
            
        } catch (error) {
            // If compilation or execution fails, show the error and stop the process
            outputChannel.appendLine(`Error: ${error}`);
            throw new Error(`Process failed with error: ${error}`);
        }
    }

    /**
     * Spawn a process and return a promise that resolves when the process completes
     * or rejects if the process fails. Streams output to the output channel.
     */
    private spawnProcess(command: string, args: string[], cwd?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Remove quotes from command if present
            const cleanCommand = command.replace(/^"(.*)"$/, '$1');
            
            // Create options object with shell and optional working directory
            const options = { 
                shell: true,
                cwd: cwd 
            };
            
            const proc = spawn(cleanCommand, args, options);
            
            proc.stdout.on('data', (data) => {
                const text = data.toString();
                if (outputChannel && text.trim()) {
                    outputChannel.append(text);
                }
                this.sendEvent(new OutputEvent(text, 'stdout'));
            });
            
            proc.stderr.on('data', (data) => {
                const text = data.toString();
                if (outputChannel && text.trim()) {
                    outputChannel.append(text);
                }
                this.sendEvent(new OutputEvent(text, 'stderr'));
            });
            
            proc.on('error', (err) => {
                const errorMessage = `Failed to start process: ${err.message}`;
                if (outputChannel) {
                    outputChannel.appendLine(errorMessage);
                }
                reject(errorMessage);
            });
            
            proc.on('close', (code) => {
                if (code !== 0) {
                    const errorMessage = `Process exited with code ${code}`;
                    if (outputChannel) {
                        outputChannel.appendLine(errorMessage);
                    }
                    reject(errorMessage);
                } else {
                    resolve();
                }
            });
        });
    }
}

// This method is called when the debug adapter is loaded
export function createHyloDebugAdapterDescriptorFactory(): vscode.DebugAdapterDescriptorFactory {
    return {
        createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
            // Create the output channel if it doesn't exist
            if (!outputChannel) {
                outputChannel = vscode.window.createOutputChannel('Hylo Debug');
            }
            
            return new vscode.DebugAdapterInlineImplementation(new HyloDebugSession());
        }
    };
}

// Export the output channel for use in extension.ts
export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Hylo Debug');
    }
    return outputChannel;
}