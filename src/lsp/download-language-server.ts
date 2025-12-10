// import * as decompress from 'decompress'
import * as decompress from 'decompress';
import fetch from 'node-fetch';
// import * as https from 'https'
import * as fs from 'fs/promises';
import * as path from 'path';
// import { mkdir, writeFile, readFile, rm } from 'fs/promises'
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import * as os from 'os';
import { getOutputChannel } from '../debug/hyloDebug';
import {
  window,
  ProgressLocation,
  CancellationToken,
  Progress,
  OutputChannel
} from 'vscode';
import { LSP_REPOSITORY_URL } from '../config';
import * as fsSync from 'fs';

/**
 * Checks if a bundled language server exists in the dist directory.
 */
export function hasBundledLanguageServer(): boolean {
  try {
    const manifestPath = 'dist/manifest.json';
    if (!fsSync.existsSync(manifestPath)) {
      return false;
    }

    const binPath = `dist/bin/${languageServerExecutableFilename()}`;
    if (!fsSync.existsSync(binPath)) {
      return false;
    }

    const stdlibPath = 'dist/hylo-stdlib';
    if (!fsSync.existsSync(stdlibPath)) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

function getTargetLspFilename(): string {
  const platform = os.platform();
  const arch = os.arch();

  let osName: string;
  let archName: string;

  // Map platform
  switch (platform) {
    case 'darwin':
      osName = 'macos';
      break;
    case 'linux':
      osName = 'linux';
      break;
    case 'win32':
      osName = 'windows';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  // Map architecture
  switch (arch) {
    case 'x64':
      archName = 'x64';
      break;
    case 'arm64':
      archName = 'arm64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }

  return `hylo-lsp-server-${osName}-${archName}.zip`;
}

async function downloadFile(
  url: string,
  directory: string,
  progress: Progress<{ increment?: number; message?: string }>,
  token: CancellationToken
) {
  const res = await fetch(url);
  const fileName = path.basename(url);
  const destination = path.resolve(directory, fileName);
  const size = Number(res.headers.get('Content-Length'));
  const sizeMB = (size / (1024 * 1024)).toFixed(2);

  let from_stream = Readable.from(res.body!);
  let to_stream = fsSync.createWriteStream(destination);
  let written = 0;
  let progressPercent = 0;
  let outputChannel = getOutputChannel();

  outputChannel.appendLine(`Downloading ${fileName} (${sizeMB} MB)...`);

  from_stream.pipe(to_stream);
  from_stream.on('data', (data) => {
    // Check for cancellation
    if (token?.isCancellationRequested) {
      from_stream.destroy();
      to_stream.destroy();
      fsSync.unlinkSync(destination);
      throw new Error('Download cancelled by user');
    }

    written += data.length;
    let newPercent = Math.floor((written / size) * 100);

    if (newPercent > progressPercent) {
      const increment = newPercent - progressPercent;
      const downloadedMB = (written / (1024 * 1024)).toFixed(2);

      if (progress) {
        progress.report({
          increment,
          message: `${fileName}: ${downloadedMB} MB / ${sizeMB} MB (${newPercent}%)`
        });
      }

      for (let i = progressPercent; i < newPercent; i++) {
        outputChannel.append(i % 10 === 0 ? `${i}%` : '.');
      }
      progressPercent = newPercent;
    }
  });

  await finished(to_stream);
  outputChannel.appendLine('100%');
}

class VersionData {
  id: number;
  name: string;
  publishDate: Date;

  public get isDev() {
    return this.name === 'dev';
  }

  constructor(id: number, name: string, publishDate: Date) {
    this.id = id;
    this.name = name;
    this.publishDate = publishDate;
  }

  toString(): string {
    return JSON.stringify(this, null, 2);
  }

  equals(v: VersionData | null) {
    return (
      v !== null &&
      this.id === v.id &&
      this.name === v.name &&
      this.publishDate.getTime() === v.publishDate.getTime()
    );
  }

  static fromJsonData(data: any): VersionData | null {
    if (!data) {
      return null;
    }
    if (!data.id || !data.name || !data.published_at) {
      return null;
    }
    // todo validate data types using zod
    return new VersionData(data.id, data.name, new Date(data.published_at));
  }
}

/// Retrieves the currently installed version of the Hylo language server, or null if not installed.
///
/// Returns null without logging if the manifest file doesn't exist (expected for fresh installs).
export async function getInstalledVersion(): Promise<VersionData | null> {
  try {
    const manifestPath = 'dist/manifest.json';
    if (!fsSync.existsSync(manifestPath)) {
      return null;
    }
    const jsonString = await fs.readFile(manifestPath, 'utf-8');
    const data = JSON.parse(jsonString);

    return VersionData.fromJsonData(data);
  } catch (error) {
    getOutputChannel().appendLine(`[getInstalledVersion] Exception: ${error}`);
    return null;
  }
}
export function notifyError(message: string) {
  const output = getOutputChannel();
  output.appendLine(`Error: ${message}`);
  window.showErrorMessage(message);
}

function checkLocalBundledVersion(output: OutputChannel): boolean {
  if (hasBundledLanguageServer()) {
    output.appendLine('Using bundled language server version');
    return true;
  } else {
    const message =
      'Bundled language server not found. Please set version to "latest" or a specific version to download.';
    output.appendLine(message);
    window.showErrorMessage(message);
    return false;
  }
}

/// Attempts to update / download the Hylo language server, reporting progress on the specified UI location.
///
/// If `specifiedVersion` is 'bundled', no download occurs and bundled version is used.
/// If `specifiedVersion` is 'latest', the latest release will be downloaded.
/// Otherwise, the specified version tag will be downloaded.
export async function updateLanguageServer(
  location: ProgressLocation,
  specifiedVersion: string = 'latest'
): Promise<boolean> {
  const output = getOutputChannel();

  // Handle bundled version - no download needed
  const localVersion = await getInstalledVersion();

  if (localVersion?.isDev) {
    return checkLocalBundledVersion(output);
  }

  return window.withProgress(
    {
      location: location,
      title: 'Hylo Language Server',
      cancellable: true
    },
    async (progress, token) => {
      try {
        progress.report({ increment: 0, message: 'Checking for updates...' });

        let releaseUrl: string;

        if (specifiedVersion !== 'latest') {
          releaseUrl = `${LSP_REPOSITORY_URL}/releases/tags/${specifiedVersion}`;
        } else {
          releaseUrl = `${LSP_REPOSITORY_URL}/releases/latest`;
        }

        const distDirectory = 'dist';
        const lspDirectory = `${distDirectory}/bin`;
        const stdlibDirectory = `${distDirectory}/hylo-stdlib`;
        const stdlibAssetFilename = 'hylo-stdlib.zip';
        const manifestPath = `${distDirectory}/manifest.json`;

        output.appendLine(
          `Checking for release: ${releaseUrl}, specifiedVersion: ${specifiedVersion}`
        );

        const response = await fetch(releaseUrl);
        const body = await response.text();
        const data = JSON.parse(body);

        const latestVersion = VersionData.fromJsonData(data);
        if (!latestVersion) {
          notifyError('Failed to parse release information from GitHub');
          return false;
        }

        const localVersion = await getInstalledVersion();
        const target = getTargetLspFilename();

        if (latestVersion.equals(localVersion)) {
          output.appendLine(
            `Installed version is up-to-date: ${localVersion}, LSP target artifact: ${target}`
          );
          progress.report({ increment: 100, message: 'Already up-to-date' });
          window.showInformationMessage(
            `Hylo LSP: Already up-to-date (${latestVersion.name})`
          );
          return true;
        }

        progress.report({
          increment: 5,
          message: `Found version ${latestVersion.name}`
        });

        output.appendLine(
          `Installation of new LSP release required\nlocal version: ${localVersion}\nlatest version: ${latestVersion}`
        );

        if (!fsSync.existsSync(distDirectory)) {
          fsSync.mkdirSync(distDirectory, { recursive: true });
        }

        const lspAsset = data.assets.find((a: any) => a.name === target);

        if (!lspAsset) {
          notifyError(
            `Could not find matching release asset for target: ${target}`
          );
          return false;
        }

        const stdlibAsset = data.assets.find(
          (a: any) => a.name === stdlibAssetFilename
        );

        if (!stdlibAsset) {
          notifyError(
            `Could not find stdlib release asset: ${stdlibAssetFilename}`
          );
          return true;
        }

        const lspUrl = lspAsset.browser_download_url;
        const stdlibUrl = stdlibAsset.browser_download_url;

        const targetLspFilepath = path.resolve(distDirectory, target);
        const targetStdlibFilepath = path.resolve(
          distDirectory,
          stdlibAssetFilename
        );

        // Download release artifacts (50% of progress: 5-55)
        progress.report({ increment: 0, message: 'Downloading LSP server...' });
        output.appendLine(`Download LSP server: ${lspUrl}`);
        await downloadFile(lspUrl, distDirectory, progress, token);

        progress.report({
          increment: 0,
          message: 'Downloading standard library...'
        });
        output.appendLine(`Download stdlib: ${stdlibUrl}`);
        await downloadFile(stdlibUrl, distDirectory, progress, token);

        // Cleanup (10% of progress: 55-65)
        progress.report({ increment: 10, message: 'Removing old files...' });

        if (fsSync.existsSync(stdlibDirectory)) {
          output.appendLine(`Delete outdated stdlib: ${stdlibDirectory}`);
          fsSync.rmSync(stdlibDirectory, { recursive: true, force: true });
        }

        if (fsSync.existsSync(lspDirectory)) {
          output.appendLine(
            `Delete outdated lsp executable in: ${lspDirectory}`
          );
          fsSync.rmSync(lspDirectory, { recursive: true, force: true });
        }

        if (!fsSync.existsSync(lspDirectory)) {
          fsSync.mkdirSync(lspDirectory, { recursive: true });
        }

        // Extract updated artifacts (25% of progress: 65-90)
        progress.report({ increment: 0, message: 'Extracting LSP server...' });
        output.appendLine(`Unzip LSP archive: ${targetLspFilepath}`);
        await decompress(targetLspFilepath, lspDirectory, { strip: 1 });

        progress.report({
          increment: 15,
          message: 'Extracting standard library...'
        });
        output.appendLine(`Unzip stdlib archive: ${targetStdlibFilepath}`);
        await decompress(targetStdlibFilepath, distDirectory);

        // Finalize (10% of progress: 90-100)
        progress.report({
          increment: 10,
          message: 'Finalizing installation...'
        });
        output.appendLine(`Write manifest: ${path.resolve(manifestPath)}`);
        const indentedManifest = JSON.stringify(data, null, '  ');
        fsSync.writeFileSync(manifestPath, indentedManifest);

        progress.report({ increment: 0, message: 'Installation complete!' });
        window.showInformationMessage(
          `Hylo LSP: Successfully updated to version ${latestVersion.name}`
        );

        return true;
      } catch (error) {
        if (token.isCancellationRequested) {
          // output.appendLine('Update cancelled by user');
          window.showWarningMessage('Hylo LSP: Update cancelled');
          return false;
        }
        notifyError(`[updateLspServer] Exception: ${error}`);
        return false;
      }
    }
  );
}

export function languageServerExecutableFilename(): string {
  const platform = os.platform();

  switch (platform) {
    case 'darwin':
    case 'linux':
      return 'hylo-lsp-server';
    case 'win32':
      return 'hylo-lsp-server.exe';
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
