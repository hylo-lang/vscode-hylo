// import * as decompress from 'decompress'
import * as decompress from 'decompress';
import fetch from 'node-fetch';
// import * as https from 'https'
import * as fs from 'fs';
import * as path from 'path';
// import { mkdir, writeFile, readFile, rm } from 'fs/promises'
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import * as os from 'os';
import { getOutputChannel } from '../debug/hyloDebug';
import { window } from 'vscode';

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

async function downloadFile(url: string, directory = '.') {
  const res = await fetch(url);
  const fileName = path.basename(url);
  const destination = path.resolve(directory, fileName);
  const size = Number(res.headers.get('Content-Length'));
  // wrappedOutput.appendLine(`Download: ${url}, size: ${size/1024} KB, destination: ${destination}`)
  let from_stream = Readable.from(res.body!);
  // let to_stream   = fs.createWriteStream(fileName, { flags: 'wx' });
  let to_stream = fs.createWriteStream(destination);
  let written = 0;
  let progressPercent = 0;
  let outputChannel = getOutputChannel();
  from_stream.pipe(to_stream);
  from_stream.on('data', (data) => {
    written += data.length;
    let newPercent = Math.floor((written / size) * 100);
    for (let i = progressPercent; i < newPercent; i++) {
      outputChannel.append(i % 10 === 0 ? `${i}%` : '.');
    }
    progressPercent = newPercent;
    // wrappedOutput.appendLine(`written ${written/1024} of ${size/1024} KB (${(written/size*100).toFixed(2)}%)`);
  });

  // await finished(Readable.from(res.body).pipe(fileStream));
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

  static fromJsonData(data: any) {
    return new VersionData(data.id, data.name, new Date(data.published_at));
  }
}

export function getInstalledVersion(): VersionData | null {
  try {
    const manifestPath = `dist/manifest.json`;

    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    const jsonString = fs.readFileSync(manifestPath, 'utf-8');
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

export async function updateLanguageServer(
  overwriteDev: boolean,
  specifiedVersion?: string
): Promise<boolean> {
  try {
    let releaseUrl: string;

    if (specifiedVersion && specifiedVersion !== 'latest') {
      releaseUrl = `https://api.github.com/repos/hylo-lang/hylo-language-server/releases/tags/${specifiedVersion}`;
    } else {
      releaseUrl =
        'https://api.github.com/repos/hylo-lang/hylo-language-server/releases/latest';
    }

    const distDirectory = 'dist';
    const lspDirectory = `${distDirectory}/bin`;
    const stdlibDirectory = `${distDirectory}/hylo-stdlib`;
    const stdlibAssetFilename = 'hylo-stdlib.zip';
    const manifestPath = `${distDirectory}/manifest.json`;

    const output = getOutputChannel();
    output.appendLine(
      `Check for new release: ${releaseUrl}, overwriteDev: ${overwriteDev}, specifiedVersion: ${specifiedVersion || 'latest'}`
    );

    const response = await fetch(releaseUrl);
    const body = await response.text();
    const data = JSON.parse(body);

    const latestVersion = VersionData.fromJsonData(data);
    const localVersion = getInstalledVersion();
    const target = getTargetLspFilename();

    if (!overwriteDev && localVersion?.isDev) {
      output.appendLine(`Dev version detected: ${localVersion}`);
      return true;
    }

    if (latestVersion.equals(localVersion)) {
      output.appendLine(
        `Installed version is up-to-date: ${localVersion}, LSP target artifact: ${target}`
      );
      return true;
    }

    output.appendLine(
      `Installation of new LSP release required\nlocal version: ${localVersion}\nlatest version: ${latestVersion}`
    );

    if (!fs.existsSync(distDirectory)) {
      fs.mkdirSync(distDirectory, { recursive: true });
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

    // Download release artifacts
    output.appendLine(`Download LSP server: ${lspUrl}`);
    await downloadFile(lspUrl, distDirectory);

    output.appendLine(`Download stdlib: ${stdlibUrl}`);
    await downloadFile(stdlibUrl, distDirectory);

    // Delete outdated local artifacts
    if (fs.existsSync(stdlibDirectory)) {
      output.appendLine(`Delete outdated stdlib: ${stdlibDirectory}`);
      fs.rmSync(stdlibDirectory, { recursive: true, force: true });
    }

    if (fs.existsSync(lspDirectory)) {
      // NOTE: We delete whole directory to not have to deal with naming and windows extension etc
      output.appendLine(
        `Delete outdated lsp executable in: ${stdlibDirectory}`
      );
      fs.rmSync(lspDirectory, { recursive: true, force: true });
    }

    if (!fs.existsSync(lspDirectory)) {
      fs.mkdirSync(lspDirectory, { recursive: true });
    }

    // Extract updated artifacts
    output.appendLine(`Unzip LSP archive: ${targetLspFilepath}`);
    await decompress(targetLspFilepath, lspDirectory, { strip: 1 });

    output.appendLine(`Unzip stdlib archive: ${targetStdlibFilepath}`);
    await decompress(targetStdlibFilepath, distDirectory);

    output.appendLine(`Write manifest: ${path.resolve(manifestPath)}`);
    const indentedManifest = JSON.stringify(data, null, '  ');
    fs.writeFileSync(manifestPath, indentedManifest);

    return true;
  } catch (error) {
    notifyError(`[updateLspServer] Exception: ${error}`);
    return false;
  }
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
