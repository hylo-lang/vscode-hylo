// import * as decompress from 'decompress'
import fetch from 'node-fetch';
// import * as https from 'https'
import * as fs from 'fs/promises';
import * as path from 'path';
import * as tar from 'tar';
// import { mkdir, writeFile, readFile, rm } from 'fs/promises'
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import * as os from 'os';
import {
  window,
  ProgressLocation,
  CancellationToken,
  Progress,
  OutputChannel
} from 'vscode';
import { LSP_REPOSITORY_URL } from '../constants';
import { getHyloOutputChannel } from '../util/shared';

async function fileExists(path: string): Promise<boolean> {
  try {
    // F_OK checks if the file is visible to the calling process
    await fs.access(path, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a bundled language server exists in the dist directory.
 */
export async function hasBundledLanguageServer(): Promise<boolean> {
  return (
    (await fileExists('dist/manifest.json')) ||
    (await fileExists(`dist/bin/${languageServerExecutableFilename()}`))
  );
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

  return `hylo-language-server-${osName}-${archName}.tar.zst`;
}

function monotonicTimeMillis() {
  const nanos = process.hrtime.bigint();
  return Number(nanos / 1_000_000n);
}

async function downloadFile(
  sourceUrl: string,
  targetDirectory: string,
  progress: Progress<{ increment?: number; message?: string }>,
  token: CancellationToken
) {
  const outputChannel = getHyloOutputChannel();

  outputChannel.appendLine(`Starting download from: ${sourceUrl}`);
  const res = await fetch(sourceUrl);

  if (!res.ok) {
    throw new Error(`Failed to download: ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error('Response body is null');
  }

  const fileName = path.basename(sourceUrl);
  const destination = path.resolve(targetDirectory, fileName);
  const size = Number(res.headers.get('Content-Length'));
  if (!size || isNaN(size)) {
    throw new Error('Invalid Content-Length header');
  }

  const sizeMB = (size / (1024 * 1024)).toFixed(2);

  let written = 0;
  let progressPercent = 0;

  outputChannel.appendLine(`Downloading ${fileName} (${sizeMB} MB)...`);

  let lastUpdate = monotonicTimeMillis();
  // Create a transform stream for progress tracking and cancellation
  const progressTransform = new Transform({
    transform(chunk, _encoding, callback) {
      // Check for cancellation
      if (token?.isCancellationRequested) {
        callback(new Error('Download cancelled by user'));
        return;
      }

      written += chunk.length;
      const newPercent = Math.floor((written / size) * 100);

      const downloadedMB = (written / (1024 * 1024)).toFixed(2);

      // Throttle progress updates to at most every 100ms
      let now = monotonicTimeMillis();
      if (now - lastUpdate >= 100) {
        progress.report({
          increment: newPercent - progressPercent,
          message: `${fileName}: ${downloadedMB} MB / ${sizeMB} MB (${newPercent}%)`
        });
        outputChannel.appendLine(`${newPercent}%`);
        lastUpdate = now;
      }

      progressPercent = newPercent;
      callback(null, chunk);
    }
  });

  try {
    // Use pipeline for proper error handling and cleanup
    const fileHandle = await fs.open(destination, 'w');
    try {
      await pipeline(
        Readable.from(res.body),
        progressTransform,
        fileHandle.createWriteStream()
      );
      outputChannel.appendLine('100%');
    } finally {
      await fileHandle.close();
    }
  } catch (error) {
    // Clean up partial download on error or cancellation
    try {
      await fs.rm(destination);
    } catch {}
    throw error;
  }
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

  static fromJsonData(
    data: any,
    output: OutputChannel = getHyloOutputChannel()
  ): VersionData | null {
    if (!data) {
      output.appendLine('No data found for version');
      return null;
    }
    if (Number.isNaN(Number(data.id)) || !data.name || !data.published_at) {
      output.appendLine('Incomplete data found for version');
      return null;
    }
    // todo validate data types using zod
    return new VersionData(data.id, data.name, new Date(data.published_at));
  }
}

/// Retrieves the currently installed version of the Hylo language server, or null if not installed.
///
/// Returns null without logging if the manifest file doesn't exist (expected for fresh installs).
export async function getInstalledVersion(
  output: OutputChannel
): Promise<VersionData | null> {
  try {
    const jsonString = await fs.readFile('dist/manifest.json', 'utf-8');
    const data = JSON.parse(jsonString);

    output.appendLine(
      'Read manifest contents: ' + JSON.stringify(data, null, 2)
    );
    return VersionData.fromJsonData(data, output);
  } catch (error) {
    output.appendLine(
      `[getInstalledVersion] Couldn't read version from manifest. ${error}`
    );
    return null;
  }
}
export function notifyError(message: string) {
  const output = getHyloOutputChannel();
  output.appendLine(`Error: ${message}`);
  window.showErrorMessage(message);
}

async function verifyLocalBundledVersion(
  output: OutputChannel
): Promise<boolean> {
  if (await hasBundledLanguageServer()) {
    output.appendLine('Using bundled language server version');
    return true;
  } else {
    notifyError(
      'Bundled language server not found. Please set version to "latest" or a specific version to download.'
    );
    return false;
  }
}

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}
interface GitHubReleaseResponse {
  assets: GitHubReleaseAsset[];
}
/// Attempts to update / download the Hylo language server, reporting progress on the specified UI location.
///
/// If `specifiedVersion` is 'bundled', no download occurs and bundled version is used.
/// If `specifiedVersion` is 'latest', the latest release will be downloaded.
/// Otherwise, the specified version tag will be downloaded.
export async function doUpdateLanguageServer(
  location: ProgressLocation,
  specifiedVersion: string = 'latest'
): Promise<boolean> {
  const output = getHyloOutputChannel();

  // Handle bundled version - no download needed
  const localVersion = await getInstalledVersion(output);

  if (localVersion?.isDev) {
    return verifyLocalBundledVersion(output);
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

        let releaseUrl =
          specifiedVersion == 'latest'
            ? `${LSP_REPOSITORY_URL}/releases/latest`
            : `${LSP_REPOSITORY_URL}/releases/tags/${specifiedVersion}`;

        const distDirectory = 'dist';

        output.appendLine(
          `Checking for release: ${releaseUrl}, specifiedVersion: ${specifiedVersion}`
        );

        const response = await fetch(releaseUrl);
        const data = (await response.json()) as GitHubReleaseResponse;

        const latestVersion = VersionData.fromJsonData(data);
        if (!latestVersion) {
          notifyError('Failed to parse release information from GitHub');
          return false;
        }

        const localVersion = await getInstalledVersion(output);
        const archiveFileName = getTargetLspFilename();

        if (latestVersion.equals(localVersion)) {
          output.appendLine(
            `Installed version is up-to-date: ${localVersion}, LSP artifact: ${archiveFileName}`
          );
          progress.report({ increment: 100, message: 'Already up-to-date' });
          window.showInformationMessage(
            `Hylo LSP: Already up-to-date (${latestVersion.name})`
          );
          return true;
        }

        progress.report({
          increment: 0,
          message: `Found version ${latestVersion.name}`
        });

        output.appendLine(
          `Installation of new LSP release required\nlocal version: ${localVersion}\nlatest version: ${latestVersion}`
        );

        // Recreate clean dist directory
        await fs.rm(distDirectory, { recursive: true, force: true });
        await fs.mkdir(distDirectory, { recursive: true });

        const lspAsset = data.assets.find((a) => a.name === archiveFileName);

        if (!lspAsset) {
          notifyError(
            `Could not find matching release asset for target: ${archiveFileName}`
          );
          return false;
        }

        progress.report({
          increment: 0,
          message: 'Downloading language server...'
        });

        const targetLspFilepath = path.resolve(distDirectory, archiveFileName);

        output.appendLine(
          `Downloading language server from: ${lspAsset.browser_download_url}`
        );
        await downloadFile(
          lspAsset.browser_download_url,
          distDirectory,
          progress,
          token
        );

        progress.report({ increment: 0, message: 'Extracting LSP server...' });
        output.appendLine(`Extracting LSP archive: ${targetLspFilepath}`);
        await tar.x({zstd: true, file: targetLspFilepath, cwd: distDirectory, strip: 1});

        const manifestPath = `${distDirectory}/manifest.json`;
        output.appendLine(`Write manifest: ${path.resolve(manifestPath)}`);
        await fs.writeFile(manifestPath, JSON.stringify(data, null, '  '));

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
      return 'hylo-language-server';
    case 'win32':
      return 'hylo-language-server.exe';
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
