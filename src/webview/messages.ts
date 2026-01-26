interface TypedMessage<T extends string> {
  type: T;
}

export interface OpenFileInWindow extends TypedMessage<'openFileInWindow'> {
  fileUrl: string;
}

export interface ImplicitContextChanged extends TypedMessage<'implicitContextChanged'> {
  givens: string[];
}

export type MessageFromFrontend = OpenFileInWindow;
export type MessageToFrontend = ImplicitContextChanged;
