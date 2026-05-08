/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Host abstractions. The extension implements these against `vscode.*`; the
 * future CLI implements them against the file system and stdin/stdout.
 *
 * The shapes here are deliberately minimal — only the surface area actually
 * touched by the extracted modules. Anything VS Code-specific (webviews,
 * tree views, chat participants) stays in the extension layer.
 */

/**
 * Subset of `PromiseLike` that mirrors VS Code's globally-declared `Thenable`.
 * Defined locally so the core package compiles without `vscode.d.ts` while
 * still accepting any value that satisfies the VS Code shape.
 */
export interface Thenable<T> {
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: unknown) => TResult | Thenable<TResult>): Thenable<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: unknown) => void): Thenable<TResult>;
}

export interface SecretStore {
	get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
	store(key: string, value: string): Thenable<void> | Promise<void>;
	delete(key: string): Thenable<void> | Promise<void>;
}

export interface ConfigStore {
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	update?(key: string, value: unknown): Thenable<void> | Promise<void>;
	onDidChange?(listener: (event: ConfigChangeEvent) => void): Disposable;
}

export interface ConfigChangeEvent {
	affectsConfiguration(section: string): boolean;
}

export interface FileStore {
	read(path: string): Promise<Uint8Array>;
	write(path: string, content: Uint8Array): Promise<void>;
	exists(path: string): Promise<boolean>;
	list(path: string): Promise<ReadonlyArray<{ name: string; isDirectory: boolean }>>;
}

export interface Notifier {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
}

export interface WorkspaceFolderInfo {
	readonly fsPath: string;
	readonly name: string;
}

export interface WorkspaceInfo {
	readonly folders: ReadonlyArray<WorkspaceFolderInfo>;
	readonly isTrusted: boolean;
}

export interface Disposable {
	dispose(): void;
}

/**
 * Memento-shaped key/value store backed by global persistence (in the
 * extension this is `ExtensionContext.globalState`; in the CLI it is a JSON
 * file under `~/.son-of-anton/data/`).
 */
export interface MementoStore {
	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

/**
 * Returns the assembled `AGENTS.md` / `CLAUDE.md` content for the current
 * workspace, or `undefined` when no project-context file was found. The value
 * is consumed by `BaseAgent.buildSystemPrompt` and embedded as a
 * "Project Context" section between the role description and the project
 * memory block.
 *
 * The provider is intentionally synchronous: callers run on every chat turn,
 * and stalling them on disk I/O for what is usually a sub-8KB markdown file
 * isn't worth the complexity. Implementations are expected to load the file
 * eagerly (extension: on activation; CLI: on host construction) and fire
 * `onDidChange` when the underlying file is mutated.
 */
export interface ProjectContextProvider {
	/**
	 * Returns the assembled AGENTS.md / CLAUDE.md content for the current
	 * workspace, or `undefined` if none was found.
	 */
	get(): string | undefined;
	/**
	 * Subscribe to file-change notifications. Fires when the underlying
	 * project-context file is created, modified, or deleted.
	 */
	onDidChange(listener: () => void): Disposable;
}

export interface CoreHost {
	readonly secrets: SecretStore;
	readonly config: ConfigStore;
	readonly files: FileStore;
	readonly notifier: Notifier;
	readonly workspace: WorkspaceInfo;
	readonly globalState: MementoStore;
	/**
	 * Optional. When supplied, `BaseAgent.buildSystemPrompt` will inject the
	 * provider's current value as a "Project Context" section. Hosts without
	 * a workspace concept may omit this entirely.
	 */
	readonly projectContext?: ProjectContextProvider;
}
