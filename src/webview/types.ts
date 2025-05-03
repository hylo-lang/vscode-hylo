export interface NodeID {
  base: number;
  offset: number;
}

export interface SourcePosition {
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
  fileUrl: string;
}

export interface FunctionDecl {
  name: string;
  site: SourceRange;
  parameters: NodeID[];
}

export interface ModuleDecl {
  baseName: string;
  canAccessBuiltins: boolean;
  site: SourceRange;
  sources: NodeID[];
}

export interface TranslationUnit {
  decls: NodeID[];
  site: SourceRange;
}

export interface ProductTypeDecl {
  name: string;
  site: SourceRange;
  identifierSite: SourceRange;
}

export interface ParameterDecl {
  site: SourceRange;
  label?: string;
  identifier: string;
}

// Union type for all possible node types
export type ASTNode =
  | { missing: {} }
  | { FunctionDecl: FunctionDecl }
  | { TranslationUnit: TranslationUnit }
  | { ModuleDecl: ModuleDecl }
  | { ProductTypeDecl: ProductTypeDecl }
  | { ParameterDecl: ParameterDecl };

// Top-level AST structure
export interface AST {
  modulesIds: NodeID[];
  nodes: ASTNode[][];
}

export function node(from: AST, id: NodeID): ASTNode {
  return from.nodes[id.base][id.offset];
}

type ExtractNodeValue<K extends keyof ASTNode[keyof ASTNode]> = Extract<
  ASTNode,
  { [P in K]: any }
>[K];

function asX<K extends keyof ASTNode[keyof ASTNode]>(node: ASTNode, key: K): ExtractNodeValue<K> {
  if (key in node) {
    return (node as any)[key];
  }
  throw new Error(`Expected ${String(key)}`);
}

export function asFunctionDecl(node: ASTNode): FunctionDecl {
  return asX(node, 'FunctionDecl');
}
export function asModuleDecl(node: ASTNode): ModuleDecl {
  return asX(node, 'ModuleDecl');
}
export function asTranslationUnit(node: ASTNode): TranslationUnit {
  return asX(node, 'TranslationUnit');
}
export function asProductTypeDecl(node: ASTNode): ProductTypeDecl {
  return asX(node, 'ProductTypeDecl');
}
export function asParameterDecl(node: ASTNode): ParameterDecl {
  return asX(node, 'ParameterDecl');
}

function isX(node: ASTNode, key: keyof ASTNode[keyof ASTNode]): boolean {
  return key in node;
}

export function isFunctionDecl(node: ASTNode): node is { FunctionDecl: FunctionDecl } {
  return isX(node, 'FunctionDecl');
}
export function isModuleDecl(node: ASTNode): node is { ModuleDecl: ModuleDecl } {
  return isX(node, 'ModuleDecl');
}
export function isTranslationUnit(node: ASTNode): node is { TranslationUnit: TranslationUnit } {
  return isX(node, 'TranslationUnit');
}
export function isProductTypeDecl(node: ASTNode): node is { ProductTypeDecl: ProductTypeDecl } {
  return isX(node, 'ProductTypeDecl');
}

type KeyOfUnion<T> = T extends T ? keyof T : never;

// Function to extract the key from an ASTNode
export function nodeKind(node: ASTNode): KeyOfUnion<ASTNode> {
  return Object.keys(node)[0] as KeyOfUnion<ASTNode>;
}

export function siteOf(node: ASTNode): SourceRange | null {
  switch (nodeKind(node)) {
    case 'FunctionDecl':
      return asFunctionDecl(node).site;
    case 'ModuleDecl':
      return null;
    case 'TranslationUnit':
      return asTranslationUnit(node).site;
    case 'ProductTypeDecl':
      return asProductTypeDecl(node).site;
    case 'ParameterDecl':
      return asParameterDecl(node).site;
    case 'missing':
      return null;
  }
}

let m = {
  "storage":
    { "nodes": [[{ "data": { "site": { "end": 10, "start": 0, "file": 0 }, "introducerSite": { "end": 4, "start": 0, "file": 0 }, "members": [], "identifier": { "value": "E", "range": { "file": 0, "end": 6, "start": 5 } }, "accessModifier": { "value": { "private": {} }, "range": { "end": 0, "file": 0, "start": 0 } }, "conformances": [] }, "kind": 15 }, { "data": { "identifier": { "value": "x", "range": { "start": 29, "end": 30, "file": 0 } } }, "kind": 20 }, { "data": { "site": { "file": 0, "end": 30, "start": 29 }, "decl": { "rawValue": { "bits": 65536 } } }, "kind": 51 }, { "data": { "name": { "range": { "start": 32, "file": 0, "end": 33 }, "value": { "stem": "E", "labels": [] } }, "site": { "file": 0, "end": 33, "start": 32 }, "arguments": [], "domain": { "none": {} } }, "kind": 36 }, { "data": { "introducer": { "value": { "let": {} }, "range": { "end": 28, "file": 0, "start": 25 } }, "subpattern": { "base": { "rawValue": { "bits": 131072 }, "kind": 51 } }, "site": { "end": 33, "file": 0, "start": 25 }, "annotation": { "base": { "rawValue": { "bits": 196608 }, "kind": 36 } } }, "kind": 49 }, { "data": { "accessModifier": { "range": { "start": 25, "end": 25, "file": 0 }, "value": { "private": {} } }, "pattern": { "rawValue": { "bits": 262144 } }, "isGiven": false, "site": { "end": 33, "file": 0, "start": 25 }, "attributes": [] }, "kind": 2 }, { "data": { "identifier": { "range": { "start": 42, "end": 43, "file": 0 }, "value": "y" } }, "kind": 20 }, { "data": { "site": { "start": 42, "end": 43, "file": 0 }, "decl": { "rawValue": { "bits": 393216 } } }, "kind": 51 }, { "data": { "domain": { "none": {} }, "site": { "start": 45, "file": 0, "end": 46 }, "arguments": [], "name": { "value": { "labels": [], "stem": "E" }, "range": { "start": 45, "file": 0, "end": 46 } } }, "kind": 36 }, { "data": { "site": { "start": 38, "end": 46, "file": 0 }, "annotation": { "base": { "kind": 36, "rawValue": { "bits": 524288 } } }, "subpattern": { "base": { "rawValue": { "bits": 458752 }, "kind": 51 } }, "introducer": { "range": { "end": 41, "file": 0, "start": 38 }, "value": { "var": {} } } }, "kind": 49 }, { "data": { "site": { "file": 0, "start": 38, "end": 46 }, "pattern": { "rawValue": { "bits": 589824 } }, "attributes": [], "isGiven": false, "accessModifier": { "range": { "file": 0, "start": 38, "end": 38 }, "value": { "private": {} } } }, "kind": 2 }, { "data": { "site": { "file": 0, "start": 12, "end": 48 }, "members": [{ "base": { "rawValue": { "bits": 327680 }, "kind": 2 } }, { "base": { "kind": 2, "rawValue": { "bits": 655360 } } }], "accessModifier": { "range": { "end": 12, "file": 0, "start": 12 }, "value": { "private": {} } }, "introducerSite": { "file": 0, "start": 12, "end": 16 }, "conformances": [], "identifier": { "range": { "end": 18, "file": 0, "start": 17 }, "value": "A" } }, "kind": 15 }, { "data": { "decls": [{ "base": { "rawValue": { "bits": 0 }, "kind": 15 } }, { "base": { "rawValue": { "bits": 720896 }, "kind": 15 } }], "site": { "end": 50, "file": 0, "start": 0 } }, "kind": 71 }, { "data": { "baseName": "ModuleA", "sources": [{ "rawValue": { "bits": 786432 } }], "site": { "start": 0, "file": 1, "end": 21 }, "canAccessBuiltins": false }, "kind": 11 }], [{ "data": { "stmts": [], "site": { "file": 2, "end": 12, "start": 8 } }, "kind": 56 }, { "data": { "introducerSite": { "start": 0, "end": 3, "file": 2 }, "accessModifier": { "range": { "file": 2, "end": 0, "start": 0 }, "value": { "private": {} } }, "attributes": [], "parameters": [], "api": 0, "explicitCaptures": [], "isInExprContext": false, "site": { "start": 0, "end": 12, "file": 2 }, "identifier": { "range": { "start": 4, "end": 5, "file": 2 }, "value": "f" }, "body": { "block": { "_0": { "rawValue": { "bits": 1 } } } } }, "kind": 5 }, { "kind": 15, "data": { "identifier": { "range": { "end": 20, "start": 19, "file": 2 }, "value": "K" }, "conformances": [], "introducerSite": { "file": 2, "start": 14, "end": 18 }, "accessModifier": { "range": { "start": 14, "file": 2, "end": 14 }, "value": { "private": {} } }, "site": { "file": 2, "start": 14, "end": 25 }, "members": [] } }, { "kind": 36, "data": { "name": { "range": { "file": 2, "end": 38, "start": 37 }, "value": { "labels": [], "stem": "K" } }, "arguments": [], "domain": { "none": {} }, "site": { "file": 2, "end": 38, "start": 37 } } }, { "kind": 37, "data": { "convention": { "range": { "file": 2, "start": 36, "end": 36 }, "value": 1 }, "site": { "file": 2, "end": 38, "start": 36 }, "isAutoclosure": false, "bareType": { "base": { "rawValue": { "bits": 196609 }, "kind": 36 } } } }, { "kind": 14, "data": { "identifier": { "value": "p1", "range": { "file": 2, "end": 35, "start": 33 } }, "isImplicit": false, "annotation": { "rawValue": { "bits": 262145 } }, "label": { "value": "p1", "range": { "start": 33, "file": 2, "end": 35 } }, "site": { "file": 2, "start": 33, "end": 38 } } }, { "kind": 36, "data": { "domain": { "none": {} }, "name": { "value": { "stem": "K", "labels": [] }, "range": { "start": 47, "end": 48, "file": 2 } }, "site": { "start": 47, "end": 48, "file": 2 }, "arguments": [] } }, { "kind": 37, "data": { "site": { "start": 46, "file": 2, "end": 48 }, "convention": { "value": 1, "range": { "file": 2, "end": 46, "start": 46 } }, "bareType": { "base": { "kind": 36, "rawValue": { "bits": 393217 } } }, "isAutoclosure": false } }, { "kind": 14, "data": { "annotation": { "rawValue": { "bits": 458753 } }, "site": { "end": 48, "file": 2, "start": 40 }, "identifier": { "value": "i2", "range": { "end": 45, "start": 43, "file": 2 } }, "isImplicit": false, "label": { "value": "p2", "range": { "end": 42, "file": 2, "start": 40 } } } }, { "kind": 36, "data": { "name": { "value": { "labels": [], "stem": "K" }, "range": { "start": 56, "end": 57, "file": 2 } }, "arguments": [], "site": { "start": 56, "end": 57, "file": 2 }, "domain": { "none": {} } } }, { "kind": 37, "data": { "site": { "end": 57, "start": 55, "file": 2 }, "convention": { "value": 1, "range": { "file": 2, "start": 55, "end": 55 } }, "isAutoclosure": false, "bareType": { "base": { "rawValue": { "bits": 589825 }, "kind": 36 } } } }, { "kind": 14, "data": { "identifier": { "range": { "file": 2, "start": 52, "end": 54 }, "value": "i3" }, "site": { "file": 2, "start": 52, "end": 57 }, "isImplicit": false, "annotation": { "rawValue": { "bits": 655361 } } } }, { "kind": 56, "data": { "site": { "end": 67, "start": 59, "file": 2 }, "stmts": [] } }, { "kind": 5, "data": { "accessModifier": { "value": { "private": {} }, "range": { "file": 2, "start": 27, "end": 27 } }, "isInExprContext": false, "identifier": { "value": "g", "range": { "end": 32, "start": 31, "file": 2 } }, "attributes": [], "explicitCaptures": [], "body": { "block": { "_0": { "rawValue": { "bits": 786433 } } } }, "parameters": [{ "rawValue": { "bits": 327681 } }, { "rawValue": { "bits": 524289 } }, { "rawValue": { "bits": 720897 } }], "api": 0, "site": { "start": 27, "end": 67, "file": 2 }, "introducerSite": { "start": 27, "end": 30, "file": 2 } } }, { "data": { "site": { "start": 0, "file": 2, "end": 67 }, "decls": [{ "base": { "rawValue": { "bits": 65537 }, "kind": 5 } }, { "base": { "rawValue": { "bits": 131073 }, "kind": 15 } }, { "base": { "kind": 5, "rawValue": { "bits": 851969 } } }] }, "kind": 71 }, { "data": { "baseName": "ModuleB", "canAccessBuiltins": false, "sources": [{ "rawValue": { "bits": 917505 } }], "site": { "file": 3, "start": 0, "end": 21 } }, "kind": 11 }]], "compilationConditions": { "operatingSystem": { "linux": {} }, "compilerVersion": { "major": 0, "minor": 1, "patch": 0 }, "freestanding": false, "hyloVersion": { "major": 0, "minor": 1, "patch": 0 }, "architecture": "x86_64" }, "modules": [{ "rawValue": { "bits": 851968 } }, { "rawValue": { "bits": 983041 } }] }, "decodingState": { "allInstances": [{ "url": "file:\/\/\/workspaces\/hylo-ast-vis\/Tests\/HyloTests\/ASTExportingDemo\/a.hylo", "text": "type E {\n}\n\ntype A {\n    let x: E\n    var y: E\n}\n\n" }, { "url": "synthesized:\/\/101CCC22-4440-4E0D-AD20-C46E509579F4", "text": "\/* module: ModuleA *\/" }, { "url": "file:\/\/\/workspaces\/hylo-ast-vis\/Tests\/HyloTests\/ASTExportingDemo\/b.hylo", "text": "fun f() {\n\n}\n\ntype K {\n\n}\n\nfun g(p1: K, p2 i2: K, _ i3: K) {\n    \n}" }, { "text": "\/* module: ModuleB *\/", "url": "synthesized:\/\/5E426349-222B-4870-845A-78F8714FA4D8" }] }
}