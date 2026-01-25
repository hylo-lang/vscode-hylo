interface TypedMessage<T extends string> {
  type: T;
}

export interface OpenFileMessage extends TypedMessage<'openSourceFile'> {
  fileUrl: string;
}

export interface UpdateSymbolInfoMessage extends TypedMessage<'updateSymbolInfo'> {
  givens: string[];
}

export type MessageFromFrontend = OpenFileMessage;
export type MessageToFrontend = UpdateSymbolInfoMessage;
