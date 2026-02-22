import * as vscode from 'vscode';
import { MessageFromFrontend, MessageToFrontend } from './webview/messages';

export class ImplicitContextViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hylo.implicit-context';

  private view?: vscode.WebviewView;

  /// Objects to dispose when disposing this provider
  private disposables: vscode.Disposable[] = [];

  /// The installation url of the extension, within which all the extension related resources can be found.
  private readonly extensionDirectory: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionDirectory = extensionUri;

    // Listen for cursor position changes in Hylo files
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document.languageId === 'hylo') {
          this.updateImplicitContextView(e.textEditor);
        }
      })
    );

    // Listen for active editor changes in Hylo files
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === 'hylo') {
          this.updateImplicitContextView(editor);
        }
      })
    );

    // Listen for document changes (typing, etc.) in Hylo files
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === 'hylo') {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor && activeEditor.document === e.document) {
            this.updateImplicitContextView(activeEditor);
          }
        }
      })
    );
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [this.extensionDirectory]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((d) => {
      const data = d as MessageFromFrontend;
      switch (data.type) {
        case 'openFileInWindow':
          console.log('openFileInWindow', data.fileUrl);
          vscode.window.showTextDocument(vscode.Uri.parse(data.fileUrl), {
            preserveFocus: true
          });
          break;
      }
    });
  }

  private async updateImplicitContextView(editor: vscode.TextEditor) {
    if (!this.view) {
      return;
    }

    const position = editor.selection.active;
    const document = editor.document;

    try {
      // Create Location parameter for the LSP command
      const location = {
        uri: document.uri.toString(),
        range: {
          start: { line: position.line, character: position.character },
          end: { line: position.line, character: position.character }
        }
      };

      // Execute the custom LSP command
      const givens = await vscode.commands.executeCommand<string[]>(
        'hylo.givens',
        location
      );

      await this.postMessage({
        type: 'implicitContextChanged',
        givens: givens
      });
    } catch (error) {
      await this.postMessage({
        type: 'implicitContextChanged',
        givens: []
      });
    }
  }

  public dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /// Returns true iff the message was delivered.
  private async postMessage(message: MessageToFrontend) {
    if (this.view) {
      return await this.view.webview.postMessage(message);
    }
    return false;
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.

    const vscodeElementsBundleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionDirectory,
        'node_modules/@vscode-elements/elements/dist/bundled.js'
      )
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionDirectory, 'out/webview.js')
    );
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionDirectory,
        'node_modules/@vscode/codicons/dist/codicon.css'
      )
    );
    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
			  <title>Hylo Implicit Context</title>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${codiconsUri}" rel="stylesheet" id="vscode-codicon-stylesheet"/>
			</head>
			<body>
				<div id="view-root"></div>
				<!--script nonce="${nonce}" src="${vscodeElementsBundleUri}" type="module"></script-->
				<script nonce="${nonce}" src="${scriptUri}" type="module"></script>
			</body>
			</html>`;
  }
}

export function getNonce() {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
