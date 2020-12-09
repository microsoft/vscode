## Introduction

Diagnostics are currently the only data objects in the languages space that an extension pushed to VS Code. The reasoning behind that architecture is as follows:

- VS Code wants to encourage extensions to provide workspace diagnostics and not only single file diagnostics. In a workspace diagnostic model the extension (e.g. LSP server) can decide when it is a good time to compute the diagnostics and push them to the server.
- diagnostic can easily be stream since they can be delivered on a file by file basis

However the approach has also some downsides:

- the extension doesn't know which files to prioritize since VS Code has no API to query the visuals (e.g. which files are presented in tabs, ....).
- the extension doesn't know if the client is presenting the diagnostics at all (e.g. a corresponding status or problems view is visible).
- if a language is file based (e.g. all linters) then such an extension usually only validates the open files. But again the VS Code API doesn't allow to query if a file is visible hence extensions rely on the open / close events which fire when the content of a document is 'opened' which for example also happens when a workspace edit is applied or a hover preview is computed. In these cases extension shouldn't start computing diagnostics since their computation can be expensive.

## Pull Model

Instead of letting the server push diagnostics a client could pull them. Such a model would be analogous to the other language features which are usually pull also (for example semantic tokens). However a pull model has some drawbacks as well:

- how does a client decide when to pull for workspace diagnostics.
- project configuration changes might require to re-pull all diagnostics (e.g. file and workspace based)


## API Proposal

A diagnostic pull model should be align with the current API design. A possible API could look like this:

```typescript
	export interface DiagnosticProviderOptions {

		/**
		 * The name with which all diagnostics of a provider will be associated, for instance `typescript`.
		 * This is comparable to [DiagnosticCollection.name](#DiagnosticCollection.name)
		 */
		readonly name?: string;
	}

	export interface DocumentDiagnosticProvider {

		/**
		 * An optional event to signal that all diagnostics from this provider have changed
		 * and should be re-pulled.
		 */
		onDidChangeDiagnostics?: Event<void>;

		/**
		 * Provides diagnostics for the given document.
		 *
		 * @param document The text document to get diagnostics for.
		 * @param token A cancellation token.
		 */
		provideDocumentDiagnostics(document: TextDocument, token: CancellationToken): ProviderResult<Diagnostic[]>;
	}

	export interface DiagnosticResultItem {
		/**
		 * The resource identifer.
		 */
		readonly resource: Uri;

		/**
		 * The diagnostics of the resource. An empty array or `null` indicates
		 * that the diagnostics should be cleared.
		 */
		readonly diagnostics: [] | null;
	}

	export interface WorkspaceDiagnosticResult {

		/**
		 * The result id if available.
		 */
		readonly resultId?: string;

		/**
		 * Adds additional values to the workspace diagnostic result.
		 *
		 * @param values The values to add.
		 */
		add(values: DiagnosticResultItem[]): void;

		/**
		 * Signals that no additional result items will be added to this
		 * diagnostic result.
		 *
		 * @param retrigger Whether the client should immediately re-trigger the workspace pull.
		 */
		done(retrigger?: boolean): void;
	}

	export interface WorkspaceDiagnosticProvider {

		/**
		 * An optional event to signal that all diagnostics from this provider have changed
		 * and should be re-pulled.
		 */
		onDidChangeDiagnostics?: Event<void>;

		/**
		 * Provide diagnostics for the whole workspace.
		 *
		 * @param priorities If possible diagnostics for the provided Uris should be computed with higher priority.
		 * @param token The cancellation token.
		 */
		provideWorkspaceDiagnostics(priorities: Uri[], token: CancellationToken): ProviderResult<WorkspaceDiagnosticResult>;

		/**
		 * Provides a diagnostic delta for the whole workspace relative to a previous result.
		 *
		 * @param priorities If possible diagnostics for the provided Uris should be computed with higher priority.
		 * @param previousResultId The id of a previous result.
		 * @param token The cancellation token.
		 */
		provideWorkspaceDiagnosticsEdits?(priorities: Uri[], previousResultId: string, token: CancellationToken): ProviderResult<WorkspaceDiagnosticResult>;
	}

	export namespace languages {

		export function registerDocumentDiagnosticProvider(selector: DocumentSelector, provider: DocumentDiagnosticProvider, options?: DiagnosticProviderOptions): Disposable;

		export function registerWorkspaceDiagnosticProvider(provider: WorkspaceDiagnosticProvider, options?: DiagnosticProviderOptions): Disposable;
	}
```

## Requesting Diagnostics

Pulling for document scoped diagnostics should be done analogous to other providers that are document scoped. A good blueprint could be document symbols for which the pull frequency is adopted to computation time, file size, user typing, ... However it is unclear if the client should pull for all open visible documents or only for the focused one. If the client pulls for all visible documents the pull frequency should be higher for the active document.

Pulling for workspace diagnostics needs to address the following issues:

1. streaming to allow extensions to hand off computed diagnostics file by file.
1. delta encoding to avoid sending the same diagnostics over and over again.
1. ability to abort a current pull and ask the client to re-trigger.

These characteristics are addressed as follows:

1. The result of a provider call is a `WorkspaceDiagnosticResult` to which the extension can add values later on. The result is consider to be open until the extension calls `done` on it.
1. Delta encoding is done analogous to semantic tokens by using result ids and two distinct provider functions (a) `provideWorkspaceDiagnostics` and (b) `provideWorkspaceDiagnosticsEdits` to pull the delta. An item in a result is identified using the `resource` property of a `DiagnosticResultItem`. This means a result item with a resource `X` replace on from a previous result with the same resource. Items are clear for a specific resource by using a `DiagnosticResultItem` with the resource's uri and an empty diagnostics array.
1. An extension can at any time call `done` on a `WorkspaceDiagnosticResult`. The result items delivered are consider to be valid. However the extension can pass in a flag to as the client to immediately re-trigger a diagnostic pull. Please note that such a re-trigger is even possible if no result items have been add. This allows an extension to signal a busy case indicating that it is not a good time right now to ask for workspace diagnostics.
