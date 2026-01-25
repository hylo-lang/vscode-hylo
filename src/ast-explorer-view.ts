import * as vscode from 'vscode';
import { MessageFromFrontend, MessageToFrontend } from './webview/messages';

export class ASTExplorerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hylo.ast-explorer';

  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {
    // Listen for cursor position changes
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document.languageId === 'hylo') {
          this.updateSymbolInfo(e.textEditor);
        }
      })
    );

    // Listen for active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === 'hylo') {
          this.updateSymbolInfo(editor);
        }
      })
    );

    // Listen for document changes (typing, etc.)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === 'hylo') {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor && activeEditor.document === e.document) {
            this.updateSymbolInfo(activeEditor);
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

      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((d) => {
      const data = d as MessageFromFrontend;
      switch (data.type) {
        case 'openSourceFile':
          console.log('openSourceFile', data.fileUrl);
          vscode.window.showTextDocument(vscode.Uri.parse(data.fileUrl), {
            preserveFocus: true
          });
          break;
      }
    });
  }

  public addColor() {
    if (this.view) {
      this.view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
      // this.view.webview.postMessage({ type: 'addColor' });
    }
  }

  public clearColors() {
    if (this.view) {
      // this.view.webview.postMessage({ type: 'clearColors' });
    }
  }

  private async updateSymbolInfo(editor: vscode.TextEditor) {
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
      const result = await vscode.commands.executeCommand<string[] | string>(
        'hylo.listGivens',
        location
      );

      // Parse the result (handle both array and legacy string format)
      let givens: string[] = [];
      if (Array.isArray(result)) {
        givens = result;
      } else if (typeof result === 'string' && result) {
        givens = result.split('\n').filter((line) => line.trim());
      }

      // Send the result to the webview
      const message: MessageToFrontend = {
        type: 'updateSymbolInfo',
        givens
      };

      this.view.webview.postMessage(message);
    } catch (error) {
      // Send empty array on error
      const message: MessageToFrontend = {
        type: 'updateSymbolInfo',
        givens: []
      };
      this.view.webview.postMessage(message);
    }
  }

  public dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.

    const vscodeElementsBundleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        'node_modules/@vscode-elements/elements/dist/bundled.js'
      )
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'out/webview.js')
    );
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
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

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->

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
