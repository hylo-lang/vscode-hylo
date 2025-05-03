import { SymbolKind } from 'vscode';
import * as vscode from 'vscode';
import { ASTExplorerViewProvider } from './ast-explorer-view';

let highlightDecorationType: vscode.TextEditorDecorationType;
let lastPositionDecoration: vscode.DecorationOptions[] = [];

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
      const startPos = new vscode.Position(position.line, Math.max(0, position.character - 2));
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

  const astExplorerViewProvider = new ASTExplorerViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ASTExplorerViewProvider.viewType, astExplorerViewProvider)
  );
}

export function deactivate() {
  if (highlightDecorationType) {
    highlightDecorationType.dispose();
  }
}

function range(l1: number, c1: number, l2: number, c2: number) {
  return new vscode.Range(new vscode.Position(l1, c1), new vscode.Position(l2, c2));
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
