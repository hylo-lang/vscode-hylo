import * as vscode from 'vscode';
import { spawn, SpawnOptionsWithoutStdio } from 'child_process';

// Single shared output channel
let hyloOutputChannel: vscode.OutputChannel | undefined;

/**
 * Check if the current platform is Windows
 */
export const isWindows = (): boolean => false && Boolean(vscode.env.appRoot && vscode.env.appRoot[0] !== "/");

/**
 * Get or create the shared Hylo output channel
 */
export function getHyloOutputChannel(): vscode.OutputChannel {
  if (!hyloOutputChannel) {
    hyloOutputChannel = vscode.window.createOutputChannel('Hylo');
  }
  return hyloOutputChannel;
}

/**
 * Normalize a file system path for the current platform
 */
export function normalizePath(filePath: string): string {  
  // On Windows, ensure backslashes
  if (isWindows()) {
    return filePath.replace(/\//g, '\\');
  }
  
  // On other platforms, ensure forward slashes
  return filePath.replace(/\\/g, '/');
}

/**
 * Spawn a process and return a promise that resolves when the process completes
 * or rejects if the process fails. Streams output to the output channel.
 */
export function spawnProcess(
  command: string, 
  args: string[], 
  outputChannel: vscode.OutputChannel, 
  cwd?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Remove quotes from command if present
    const cleanCommand = command.replace(/^"(.*)"$/, '$1');
    
    // Normalize working directory path for the current platform
    if (cwd) {
      cwd = normalizePath(cwd);
    }
    
    // Create options object with shell and optional working directory
    const options : SpawnOptionsWithoutStdio = {
      shell: true,
      cwd: cwd
    };

    args = args.map(normalizePath)

    outputChannel.appendLine(`Executing : ${cleanCommand} ${args.join(' ')}`);
    outputChannel.appendLine(`Working directory : ${cwd}\n\n===================================================\n`);
    
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