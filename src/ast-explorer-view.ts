import * as vscode from 'vscode';
import { SourceRange } from './webview/types';
import { MessageFromFrontend } from './webview/messages';

export class ASTExplorerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hylo.ast-explorer';

  private view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
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
        case 'highlightFullDeclaration':
          console.log('highlightFullDeclaration', data.range);
          vscode.window.showTextDocument(vscode.Uri.parse(data.range.fileUrl), {
            selection: toVscodeRange(data.range)
          });
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
			  <title>Hylo AST Explorer View</title>
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

function toVscodeRange(range: SourceRange): vscode.Range {
  return new vscode.Range(
    range.start.line - 1,
    range.start.column - 1,
    range.end.line - 1,
    range.end.column - 1
  );
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
