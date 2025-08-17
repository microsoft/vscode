# VSCode RPC Protocol API Reference

## Overview

This document provides a complete API reference for the VSCode RPC protocol, including all interfaces, classes, and types used for inter-process communication.

## Core Interfaces

### IRPCProtocol

The main interface for RPC communication (`src/vs/workbench/services/extensions/common/proxyIdentifier.ts`).

```typescript
interface IRPCProtocol {
  /**
   * Returns a proxy to an object addressable/named in the extension host process or in the renderer process.
   */
  getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T>;

  /**
   * Register manually created instance.
   */
  set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R;

  /**
   * Assert these identifiers are already registered via `.set`.
   */
  assertRegistered(identifiers: ProxyIdentifier<any>[]): void;

  /**
   * Wait for the write buffer (if applicable) to become empty.
   */
  drain(): Promise<void>;

  dispose(): void;
}
```

### IMessagePassingProtocol

The underlying transport interface (`src/vs/base/parts/ipc/common/ipc.ts`).

```typescript
interface IMessagePassingProtocol {
  send(buffer: VSBuffer): void;
  onMessage: Event<VSBuffer>;
  /**
   * Wait for the write buffer (if applicable) to become empty.
   */
  drain?(): Promise<void>;
}
```

### IRPCProtocolLogger

Interface for logging RPC communication.

```typescript
interface IRPCProtocolLogger {
  logIncoming(msgLength: number, req: number, initiator: RequestInitiator, str: string, data?: any): void;
  logOutgoing(msgLength: number, req: number, initiator: RequestInitiator, str: string, data?: any): void;
}
```

## Core Classes

### RPCProtocol

The main RPC protocol implementation (`src/vs/workbench/services/extensions/common/rpcProtocol.ts`).

```typescript
class RPCProtocol extends Disposable implements IRPCProtocol {
  static readonly UNRESPONSIVE_TIME = 3 * 1000; // 3s

  readonly onDidChangeResponsiveState: Event<ResponsiveState>;
  readonly responsiveState: ResponsiveState;

  constructor(
    protocol: IMessagePassingProtocol,
    logger: IRPCProtocolLogger | null = null,
    transformer: IURITransformer | null = null
  );

  getProxy<T>(identifier: ProxyIdentifier<T>): Proxied<T>;
  set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R;
  assertRegistered(identifiers: ProxyIdentifier<any>[]): void;
  drain(): Promise<void>;
  transformIncomingURIs<T>(obj: T): T;
  dispose(): void;
}
```

### ProxyIdentifier

Unique identifier for remote objects (`src/vs/workbench/services/extensions/common/proxyIdentifier.ts`).

```typescript
class ProxyIdentifier<T> {
  static count: number = 0;
  
  readonly sid: string;    // String identifier
  readonly nid: number;    // Numeric identifier

  constructor(sid: string);
}
```

### SerializableObjectWithBuffers

Wrapper for objects containing binary data (`src/vs/workbench/services/extensions/common/proxyIdentifier.ts`).

```typescript
class SerializableObjectWithBuffers<T> {
  constructor(public readonly value: T);
}
```

## Type Definitions

### Proxied Type

Transforms method signatures for RPC calls.

```typescript
type Proxied<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: { [K in keyof A]: Dto<A[K]> }) => Promise<Dto<Awaited<R>>>
    : never
};
```

### Dto Type

Ensures only serializable data crosses process boundaries.

```typescript
type Dto<T> = T extends { toJSON(): infer U }
  ? U
  : T extends VSBuffer
  ? T
  : T extends CancellationToken
  ? T
  : T extends Function
  ? never
  : T extends object
  ? { [k in keyof T]: Dto<T[k]> }
  : T;
```

## Enums

### MessageType

RPC message types (`src/vs/workbench/services/extensions/common/rpcProtocol.ts`).

```typescript
const enum MessageType {
  RequestJSONArgs = 1,
  RequestJSONArgsWithCancellation = 2,
  RequestMixedArgs = 3,
  RequestMixedArgsWithCancellation = 4,
  Acknowledged = 5,
  Cancel = 6,
  ReplyOKEmpty = 7,
  ReplyOKVSBuffer = 8,
  ReplyOKJSON = 9,
  ReplyOKJSONWithBuffers = 10,
  ReplyErrError = 11,
  ReplyErrEmpty = 12
}
```

### ArgType

Argument serialization types.

```typescript
const enum ArgType {
  String = 1,
  VSBuffer = 2,
  SerializableObjectWithBuffers = 3,
  Undefined = 4
}
```

### RequestInitiator

Indicates which side initiated a request.

```typescript
const enum RequestInitiator {
  LocalSide = 0,
  OtherSide = 1
}
```

### ResponsiveState

Extension host responsiveness state.

```typescript
const enum ResponsiveState {
  Responsive = 0,
  Unresponsive = 1
}
```

## Utility Functions

### createProxyIdentifier

Creates a new proxy identifier.

```typescript
function createProxyIdentifier<T>(identifier: string): ProxyIdentifier<T>;
```

### getStringIdentifierForProxy

Gets string identifier from numeric ID.

```typescript
function getStringIdentifierForProxy(nid: number): string;
```

### stringifyJsonWithBufferRefs

Serializes objects with buffer references.

```typescript
function stringifyJsonWithBufferRefs<T>(
  obj: T,
  replacer?: JSONStringifyReplacer | null,
  useSafeStringify?: boolean
): StringifiedJsonWithBufferRefs;
```

### parseJsonAndRestoreBufferRefs

Deserializes objects and restores buffer references.

```typescript
function parseJsonAndRestoreBufferRefs(
  jsonString: string,
  buffers: readonly VSBuffer[],
  uriTransformer: IURITransformer | null
): any;
```

## Extension Host Protocol Interfaces

### IExtHostContext

Main interface for extension host communication.

```typescript
interface IExtHostContext extends IRPCProtocol {
  readonly remoteAuthority: string | null;
  readonly extensionHostKind: ExtensionHostKind;
}
```

### IMainContext

Main thread communication interface.

```typescript
interface IMainContext extends IRPCProtocol {
  // Inherits all IRPCProtocol methods
}
```

## Main Thread Service Shapes

### MainThreadCommandsShape

Command execution interface.

```typescript
interface MainThreadCommandsShape {
  $registerCommand(id: string): void;
  $unregisterCommand(id: string): void;
  $executeCommand<T>(id: string, args: any[], retry: boolean): Promise<T>;
  $getCommands(): Promise<string[]>;
}
```

### MainThreadDocumentsShape

Document management interface.

```typescript
interface MainThreadDocumentsShape {
  $tryCreateDocument(options: ICreateFileOptions): Promise<URI>;
  $tryOpenDocument(uri: URI): Promise<IOpenedTextDocument>;
  $trySaveDocument(uri: URI): Promise<boolean>;
  $tryCloseDocument(uri: URI): Promise<boolean>;
}
```

### MainThreadEditorsShape

Editor management interface.

```typescript
interface MainThreadEditorsShape {
  $tryShowTextDocument(uri: URI, options: ITextEditorOptions): Promise<string>;
  $tryHideEditor(id: string): Promise<boolean>;
  $trySetOptions(id: string, options: ITextEditorConfigurationUpdate): Promise<void>;
  $trySetDecorations(id: string, key: string, ranges: IDecorationOptions[]): void;
  $tryRevealRange(id: string, range: IRange, revealType: TextEditorRevealType): Promise<void>;
  $trySetSelections(id: string, selections: ISelection[]): Promise<void>;
  $tryApplyEdits(id: string, modelVersionId: number, edits: ISingleEditOperation[], opts: IApplyEditsOptions): Promise<boolean>;
}
```

### MainThreadLanguageFeaturesShape

Language features interface.

```typescript
interface MainThreadLanguageFeaturesShape {
  $registerCompletionSupport(handle: number, selector: IDocumentSelector, triggerCharacters: string[], supportsResolveDetails: boolean): void;
  $registerSignatureHelpProvider(handle: number, selector: IDocumentSelector, metadata: ISignatureHelpProviderMetadata): void;
  $registerHoverProvider(handle: number, selector: IDocumentSelector): void;
  $registerDocumentHighlightProvider(handle: number, selector: IDocumentSelector): void;
  $registerDefinitionProvider(handle: number, selector: IDocumentSelector): void;
  $registerImplementationProvider(handle: number, selector: IDocumentSelector): void;
  $registerTypeDefinitionProvider(handle: number, selector: IDocumentSelector): void;
  $registerDeclarationProvider(handle: number, selector: IDocumentSelector): void;
  $registerReferenceProvider(handle: number, selector: IDocumentSelector): void;
  $registerRenameProvider(handle: number, selector: IDocumentSelector, supportsResolveInitialValues: boolean): void;
  $registerDocumentFormattingProvider(handle: number, selector: IDocumentSelector, extensionId: ExtensionIdentifier, displayName: string): void;
  $registerRangeFormattingProvider(handle: number, selector: IDocumentSelector, extensionId: ExtensionIdentifier, displayName: string): void;
  $registerOnTypeFormattingProvider(handle: number, selector: IDocumentSelector, autoFormatTriggerCharacters: string[], extensionId: ExtensionIdentifier): void;
  $registerCodeActionProvider(handle: number, selector: IDocumentSelector, metadata: ICodeActionProviderMetadata, displayName: string, supportsResolve: boolean): void;
  $registerCodeLensProvider(handle: number, selector: IDocumentSelector, eventHandle: number): void;
  $registerOutlineSupport(handle: number, selector: IDocumentSelector, displayName: string): void;
  $registerDocumentColorProvider(handle: number, selector: IDocumentSelector): void;
  $registerFoldingRangeProvider(handle: number, selector: IDocumentSelector, eventHandle: number): void;
  $registerSelectionRangeProvider(handle: number, selector: IDocumentSelector): void;
  $registerCallHierarchyProvider(handle: number, selector: IDocumentSelector): void;
  $registerTypeHierarchyProvider(handle: number, selector: IDocumentSelector): void;
  $registerDocumentSemanticTokensProvider(handle: number, selector: IDocumentSelector, legend: languages.SemanticTokensLegend, eventHandle: number): void;
  $registerDocumentRangeSemanticTokensProvider(handle: number, selector: IDocumentSelector, legend: languages.SemanticTokensLegend): void;
  $registerInlineValuesProvider(handle: number, selector: IDocumentSelector, eventHandle: number): void;
  $registerInlayHintsProvider(handle: number, selector: IDocumentSelector, supportsResolve: boolean, eventHandle: number, displayName?: string): void;
  $registerLinkedEditingRangeProvider(handle: number, selector: IDocumentSelector): void;
  $registerDocumentDropEditProvider(handle: number, selector: IDocumentSelector, metadata: IDocumentDropEditProviderMetadata): void;
  
  // Provider method calls
  $provideCompletionItems(handle: number, resource: URI, position: IPosition, context: languages.CompletionContext, token: CancellationToken): Promise<languages.CompletionList | undefined>;
  $resolveCompletionItem(handle: number, item: languages.CompletionItem, token: CancellationToken): Promise<languages.CompletionItem>;
  // ... many more provider methods
}
```

## Extension Host Service Shapes

### ExtHostCommandsShape

Extension host command interface.

```typescript
interface ExtHostCommandsShape {
  $executeContributedCommand<T>(id: string, args: any[]): Promise<T>;
  $getContributedCommandHandlerDescriptions(): Promise<{ [id: string]: string | ICommandHandlerDescription }>;
}
```

### ExtHostDocumentsShape

Extension host document interface.

```typescript
interface ExtHostDocumentsShape {
  $acceptDocumentsAndEditorsDelta(delta: IDocumentsAndEditorsDelta): void;
  $acceptModelModeChanged(uri: URI, oldModeId: string, newModeId: string): void;
  $acceptModelSaved(uri: URI): void;
  $acceptDirtyStateChanged(uri: URI, isDirty: boolean): void;
  $acceptModelChanged(uri: URI, e: IModelChangedEvent, isDirty: boolean): void;
}
```

### ExtHostEditorsShape

Extension host editor interface.

```typescript
interface ExtHostEditorsShape {
  $acceptEditorPropertiesChanged(id: string, props: IEditorPropertiesChangeData): void;
  $acceptEditorPositionData(data: ITextEditorPositionData): void;
}
```

## Data Transfer Objects

### IDocumentsAndEditorsDelta

Document synchronization delta.

```typescript
interface IDocumentsAndEditorsDelta {
  removedDocuments?: URI[];
  addedDocuments?: IModelAddedData[];
  removedEditors?: string[];
  addedEditors?: ITextEditorAddData[];
  newActiveEditor?: string | null;
}
```

### IModelAddedData

Document addition data.

```typescript
interface IModelAddedData {
  uri: URI;
  versionId: number;
  lines: string[];
  EOL: string;
  modeId: string;
  isDirty: boolean;
}
```

### ITextEditorAddData

Editor addition data.

```typescript
interface ITextEditorAddData {
  id: string;
  documentUri: URI;
  options: IResolvedTextEditorConfiguration;
  selections: ISelection[];
  visibleRanges: IRange[];
  editorPosition?: EditorGroupColumn;
}
```

### IModelChangedEvent

Document change event.

```typescript
interface IModelChangedEvent {
  changes: IModelContentChange[];
  eol: string;
  versionId: number;
}
```

### IModelContentChange

Individual content change.

```typescript
interface IModelContentChange {
  range: IRange;
  rangeOffset: number;
  rangeLength: number;
  text: string;
}
```

## Configuration Interfaces

### IResolvedTextEditorConfiguration

Text editor configuration.

```typescript
interface IResolvedTextEditorConfiguration {
  tabSize: number;
  indentSize: number;
  insertSpaces: boolean;
  cursorStyle: TextEditorCursorStyle;
  lineNumbers: RenderLineNumbersType;
}
```

### ITextEditorConfigurationUpdate

Text editor configuration update.

```typescript
interface ITextEditorConfigurationUpdate {
  tabSize?: number;
  indentSize?: number;
  insertSpaces?: boolean;
  cursorStyle?: TextEditorCursorStyle;
  lineNumbers?: RenderLineNumbersType;
}
```

## Error Handling

### Serialized Error Format

```typescript
interface SerializedError {
  $isError: true;
  name: string;
  message: string;
  stack: string;
}
```

### Common Error Types

- **ConnectionError**: Transport layer failure
- **DeserializationError**: Message parsing failure  
- **TimeoutError**: Operation timeout
- **CancellationError**: Operation cancelled
- **UnresponsiveError**: Extension host not responding

## Constants

### MarshalledId Enum

Complete list of marshalled object types:

```typescript
export const enum MarshalledId {
  Uri = 1,
  Regexp = 2,
  ScmResource = 3,
  ScmResourceGroup = 4,
  ScmProvider = 5,
  CommentController = 6,
  CommentThread = 7,
  CommentThreadInstance = 8,
  CommentThreadReply = 9,
  CommentNode = 10,
  CommentThreadNode = 11,
  TimelineActionContext = 12,
  NotebookCellActionContext = 13,
  NotebookActionContext = 14,
  TerminalContext = 15,
  TestItemContext = 16,
  Date = 17,
  TestMessageMenuArgs = 18,
  ChatViewContext = 19,
  LanguageModelToolResult = 20,
  LanguageModelTextPart = 21,
  LanguageModelThinkingPart = 22,
  LanguageModelPromptTsxPart = 23,
  LanguageModelDataPart = 24,
  ChatSessionContext = 25,
  ChatResponsePullRequestPart = 26
}
```

### Special Buffer References

```typescript
const refSymbolName = '$$ref$$';
const undefinedRef = { [refSymbolName]: -1 };
```

### RPC Protocol Symbols

```typescript
const _RPCProtocolSymbol = Symbol.for('rpcProtocol');
const _RPCProxySymbol = Symbol.for('rpcProxy');
```

### Performance Constants

```typescript
const UNRESPONSIVE_TIME = 3 * 1000;        // 3 seconds
const DEFAULT_REQUEST_TIMEOUT = 60 * 1000;  // 60 seconds
const BATCH_DELAY = 100;                    // 100ms batching delay
```

## Usage Notes

### Method Naming Convention

- **$-prefixed methods**: RPC methods that cross process boundaries
- **Regular methods**: Local methods within the same process
- **Private methods**: Implementation details, prefixed with underscore

### Type Safety

- Use `Dto<T>` for all data crossing process boundaries
- Use `Proxied<T>` for remote service interfaces
- All async operations return Promises
- CancellationToken is automatically handled

### Performance Considerations

- Batch related operations when possible
- Use appropriate data types (avoid complex object graphs)
- Implement cancellation for long-running operations
- Handle errors gracefully (network issues, process crashes)

### Memory Management

- Dispose of RPC protocol instances to prevent memory leaks
- Clean up event listeners and subscriptions
- Use weak references where appropriate
- Implement proper resource cleanup in extension host services

This API reference covers all public interfaces and classes used in the VSCode RPC protocol implementation.