interface TypedMessage<T extends string> {
  type: T;
}

export interface OpenFileMessage extends TypedMessage<'openSourceFile'> {
  fileUrl: string;
}

export type MessageFromFrontend = OpenFileMessage; // | OtherMessageTypesHere
