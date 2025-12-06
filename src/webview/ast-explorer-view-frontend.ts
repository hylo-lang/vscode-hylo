// This script will be run within the webview itself

// import { VscodeTextfield, VscodeTree } from '@vscode-elements/elements';
import { VscodeTextfield, VscodeTree } from '@vscode-elements/elements';
import { MessageFromFrontend } from './messages';
import { vscode } from './vscode';

export function postMessage(message: MessageFromFrontend) {
  vscode.postMessage(message);
}

class ASTExplorerView {
  private readonly astInput: VscodeTextfield;
  private readonly astTreeView: VscodeTree;
  public readonly root: HTMLDivElement;

  constructor() {
    this.astInput = new VscodeTextfield();
    this.astInput.label = 'AST';
    this.astInput.placeholder = 'Enter AST here';

    this.astInput.addEventListener('input', () => {});

    this.astTreeView = new VscodeTree();

    this.astTreeView.arrows = true;
    this.astTreeView.addEventListener('vsc-run-action', ((e: CustomEvent) => {
      const actionId = e.detail.actionId;
      // const item = e.detail.item;

      switch (actionId) {
        case 'openSourceFile':
          // const translationUnitId = JSON.parse(item.value) as NodeID; // only works for translationUnit (todo fix)
          break;
      }
    }) as EventListener);
    this.astTreeView.addEventListener('vsc-select', ((_: CustomEvent) => {
      // nodeId = JSON.parse(e.detail.value) as NodeID | null;
    }) as EventListener);

    this.root = document.createElement('div');
    this.root.appendChild(this.astInput);
    this.root.appendChild(this.astTreeView);
  }
}

const view = new ASTExplorerView();

document.querySelector('#view-root')!.appendChild(view.root);
