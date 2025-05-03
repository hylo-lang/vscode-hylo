import { SourceRange } from './types';

interface TypedMessage<T extends string> {
  type: T;
}

export interface OpenFileMessage extends TypedMessage<'openSourceFile'> {
  fileUrl: string;
}

export interface HighlightFullDeclarationMessage extends TypedMessage<'highlightFullDeclaration'> {
  range: SourceRange;
}
export type MessageFromFrontend = OpenFileMessage | HighlightFullDeclarationMessage;
