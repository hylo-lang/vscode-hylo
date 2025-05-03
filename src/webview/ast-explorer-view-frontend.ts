// This script will be run within the webview itself

// import { VscodeTextfield, VscodeTree } from '@vscode-elements/elements';
import { VscodeTree, VscodeTextfield } from '@vscode-elements/elements';
import {
  TreeItemIconConfig,
  TreeItem
} from '@vscode-elements/elements/dist/vscode-tree/vscode-tree';

import { vscode } from './vscode';
import {
  asFunctionDecl,
  asModuleDecl,
  asParameterDecl,
  asProductTypeDecl,
  AST,
  asTranslationUnit,
  isModuleDecl,
  isTranslationUnit,
  ModuleDecl,
  node,
  NodeID,
  nodeKind,
  siteOf
} from './types';
import { MessageFromFrontend } from './messages';

function postMessage(message: MessageFromFrontend) {
  vscode.postMessage(message);
}

class ASTExplorerView {
  private readonly astInput: VscodeTextfield;
  private readonly astTreeView: VscodeTree;
  public readonly root: HTMLDivElement;
  private ast: AST | null = null;

  constructor() {
    this.astInput = new VscodeTextfield();
    this.astInput.label = 'AST';
    this.astInput.placeholder = 'Enter AST here';

    this.astInput.addEventListener('input', () => {
      // vscode.postMessage({ type: 'colorSelected', value: this.astInput.value });
      let ast: AST | null;
      try {
        ast = JSON.parse(this.astInput.value) as AST;
      } catch (e) {
        this.astTreeView.data = [];
        return;
      }

      this.updateAst(ast);
    });

    this.astTreeView = new VscodeTree();

    this.astTreeView.arrows = true;
    this.astTreeView.addEventListener('vsc-run-action', ((e: CustomEvent) => {
      const actionId = e.detail.actionId;
      const item = e.detail.item;

      switch (actionId) {
        case 'openSourceFile':
          const translationUnitId = JSON.parse(item.value) as NodeID; // only works for translationUnit (todo fix)
          const translationUnit = asTranslationUnit(node(this.ast!, translationUnitId));

          postMessage({ type: 'openSourceFile', fileUrl: translationUnit.site.fileUrl });
          break;

        case 'highlightFullDeclaration': // only works for functionDecl (todo fix)
          console.log('highlightFullDeclaration');
          const nodeId = JSON.parse(item.value) as NodeID;
          const n = node(this.ast!, nodeId);

          const site = siteOf(n);
          if (site) {
            postMessage({ type: 'highlightFullDeclaration', range: site });
          }
      }
    }) as EventListener);
    this.astTreeView.addEventListener('vsc-select', ((e: CustomEvent) => {
      let nodeId: NodeID | null = null;
      try {
        nodeId = JSON.parse(e.detail.value) as NodeID | null;
        if (nodeId === null) {
          throw new Error('nodeId is null');
        }
      } catch (err) {
        console.log('error parsing nodeId ', e.detail.value);
        return;
      }
      const n = node(this.ast!, nodeId);

      if (isTranslationUnit(n)) {
        postMessage({ type: 'openSourceFile', fileUrl: n.TranslationUnit.site.fileUrl });
      }
    }) as EventListener);

    this.root = document.createElement('div');
    this.root.appendChild(this.astInput);
    this.root.appendChild(this.astTreeView);
  }

  updateAst(ast: AST) {
    this.ast = ast;

    this.astTreeView.data = ast.modulesIds.map((moduleId) => renderModuleDecl(ast, moduleId));
  }
}

function renderModuleDecl(ast: AST, moduleId: NodeID): TreeItem {
  const moduleDecl = asModuleDecl(node(ast, moduleId));

  return {
    icons: uniformIcon('file-submodule'),
    label: moduleDecl.baseName,
    value: JSON.stringify(moduleId),
    subItems: moduleDecl.sources.map((translationUnitId) =>
      renderTranslationUnitDecl(ast, translationUnitId)
    )
  } satisfies TreeItem;
}
function renderTranslationUnitDecl(ast: AST, translationUnitId: NodeID): TreeItem {
  const translationUnit = asTranslationUnit(node(ast, translationUnitId));
  return {
    icons: uniformIcon('file'),
    label: translationUnit.site.fileUrl.split('/').pop()!,
    tooltip: translationUnit.site.fileUrl,
    value: JSON.stringify(translationUnitId),
    actions: [
      {
        actionId: 'highlightFullDeclaration',
        icon: 'open-preview',
        tooltip: 'Highligh Declaration'
      }
    ],
    subItems: translationUnit.decls.map((declId) => renderAnyDecl(ast, declId))
  } satisfies TreeItem;
}

function renderFunctionDecl(ast: AST, functionDeclId: NodeID): TreeItem {
  const n = asFunctionDecl(node(ast, functionDeclId));
  return {
    icons: uniformIcon('symbol-function'),
    label: n.name,
    value: JSON.stringify(functionDeclId),
    subItems: [
      {
        icons: uniformIcon('symbol-property'),
        label: 'parameters',
        value: 'n',
        subItems: n.parameters.map((parameterId) => renderParameterDecl(ast, parameterId))
      }
    ],
    decorations: [
      {
        content: 'FunctionDecl',
        color: 'var(--vscode-textLink-foreground)',
        appearance: 'text'
      }
    ],
    actions: [
      {
        actionId: 'highlightFullDeclaration',
        icon: 'open-preview',
        tooltip: 'Highligh Declaration'
      }
    ]
  };
}

function renderMissing(ast: AST, nodeId: NodeID): TreeItem {
  return {
    icons: uniformIcon('question'),
    label: 'Unknown',
    value: JSON.stringify(nodeId),
    subItems: [],
    decorations: [
      {
        content: nodeKind(node(ast, nodeId)),
        color: 'var(--vscode-errorForeground)',
        appearance: 'text'
      }
    ]
  };
}

function renderProductTypeDecl(ast: AST, productTypeDeclId: NodeID): TreeItem {
  const n = asProductTypeDecl(node(ast, productTypeDeclId));

  return {
    icons: uniformIcon('symbol-class'),
    label: n.name,
    value: JSON.stringify(productTypeDeclId),
    subItems: [],
    decorations: [
      {
        content: 'ProductTypeDecl',
        color: 'var(--vscode-textLink-foreground)',
        appearance: 'text'
      }
    ],
    actions: [
      {
        actionId: 'highlightFullDeclaration',
        icon: 'open-preview',
        tooltip: 'Highligh Declaration'
      }
    ]
  };
}

function renderParameterDecl(ast: AST, parameterDeclId: NodeID): TreeItem {
  const n = asParameterDecl(node(ast, parameterDeclId));

  return {
    icons: uniformIcon('symbol-parameter'),
    label: n.identifier + (' (label: ' + (n.label ?? '<none>') + ')'),
    value: JSON.stringify(parameterDeclId),
    subItems: [],
    decorations: [
      {
        content: 'ParameterDecl',
        color: 'var(--vscode-textLink-foreground)',
        appearance: 'text'
      }
    ],
    actions: [
      {
        actionId: 'highlightFullDeclaration',
        icon: 'open-preview',
        tooltip: 'Highligh Declaration'
      }
    ]
  };
}
function renderAnyDecl(ast: AST, nodeId: NodeID): TreeItem {
  const n = node(ast, nodeId);

  switch (nodeKind(n)) {
    case 'ModuleDecl':
      return renderModuleDecl(ast, nodeId);
    case 'FunctionDecl':
      return renderFunctionDecl(ast, nodeId);
    case 'TranslationUnit':
      return renderTranslationUnitDecl(ast, nodeId);
    case 'missing':
      return renderMissing(ast, nodeId);
    case 'ProductTypeDecl':
      return renderProductTypeDecl(ast, nodeId);
    case 'ParameterDecl':
      return renderParameterDecl(ast, nodeId);
  }
}
const view = new ASTExplorerView();

document.querySelector('#view-root')!.appendChild(view.root);

function uniformIcon(iconName: string): TreeItemIconConfig {
  return {
    branch: iconName,
    leaf: iconName,
    open: iconName
  };
}
