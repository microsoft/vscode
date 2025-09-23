// our vs code version requirement is v1.66 but the document drop interfaces came in after
// that. we declare the types here so we have them and then only call the function if
// we are in more recent versions of vscode

declare module 'vscode' {

  export interface DataTransferFile {
    readonly name: string;
    readonly uri?: Uri;
    data(): Thenable<Uint8Array>;
  }

  export interface DocumentDropEditProvider {
    provideDocumentDropEdits(document: TextDocument, position: Position, dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<DocumentDropEdit>;
  }

  export namespace languages {
    export function registerDocumentDropEditProvider(selector: DocumentSelector, provider: DocumentDropEditProvider): Disposable;
  }

}
