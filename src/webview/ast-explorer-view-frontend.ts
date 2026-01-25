// This script will be run within the webview itself

import { MessageFromFrontend, MessageToFrontend } from './messages';
import { vscode } from './vscode';

export function postMessage(message: MessageFromFrontend) {
  vscode.postMessage(message);
}

class SymbolInfoView {
  private readonly contentContainer: HTMLDivElement;
  private readonly emptyStateElement: HTMLDivElement;
  public readonly root: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.padding = '10px';
    this.root.style.fontFamily = 'var(--vscode-editor-font-family)';
    this.root.style.fontSize = 'var(--vscode-editor-font-size)';

    // Empty state message
    this.emptyStateElement = document.createElement('div');
    this.emptyStateElement.style.color = 'var(--vscode-descriptionForeground)';
    this.emptyStateElement.style.fontStyle = 'italic';
    this.emptyStateElement.textContent = 'No symbol information available';

    // Content container for multiple code blocks
    this.contentContainer = document.createElement('div');
    this.contentContainer.style.display = 'none';

    this.root.appendChild(this.emptyStateElement);
    this.root.appendChild(this.contentContainer);

    // Listen for messages from the extension
    window.addEventListener('message', (event) => {
      const message = event.data as MessageToFrontend;
      this.handleMessage(message);
    });
  }

  private handleMessage(message: MessageToFrontend) {
    switch (message.type) {
      case 'updateSymbolInfo':
        this.updateContent(message.givens);
        break;
    }
  }

  private updateContent(givens: string[]) {
    // Clear existing content
    this.contentContainer.innerHTML = '';

    if (givens.length === 0) {
      this.contentContainer.style.display = 'none';
      this.emptyStateElement.style.display = 'block';
      return;
    }

    // Show content and hide empty state
    this.contentContainer.style.display = 'block';
    this.emptyStateElement.style.display = 'none';

    // Create a code block for each given
    givens.forEach((given, index) => {
      const codeBlock = document.createElement('pre');
      codeBlock.style.margin = index > 0 ? '8px 0 16px 0' : '0';
      codeBlock.style.padding = '8px';
      codeBlock.style.backgroundColor =
        'var(--vscode-textCodeBlock-background)';
      codeBlock.style.borderRadius = '3px';
      codeBlock.style.whiteSpace = 'pre-wrap';
      codeBlock.style.wordBreak = 'break-word';
      codeBlock.style.fontFamily = 'var(--vscode-editor-font-family)';
      codeBlock.style.fontSize = 'var(--vscode-editor-font-size)';
      codeBlock.style.border = '1px solid var(--vscode-panel-border)';

      const code = document.createElement('code');
      code.className = 'language-hylo';

      let lines = given.split('\n');
      code.textContent =
        lines.length > 0 ? lines[0] + (lines.length > 1 ? '...' : '') : '';

      codeBlock.appendChild(code);
      this.contentContainer.appendChild(codeBlock);
    });
  }
}

const view = new SymbolInfoView();

document.querySelector('#view-root')!.appendChild(view.root);
