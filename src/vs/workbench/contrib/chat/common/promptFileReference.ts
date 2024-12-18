/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { extUri } from '../../../../base/common/resources.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Location } from '../../../../editor/common/languages.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ChatPromptCodec } from './codecs/chatPromptCodec/chatPromptCodec.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileOpenFailed, NotPromptSnippetFile, RecursiveReference } from './promptFileReferenceErrors.js';
import { FileChangesEvent, FileChangeType, IFileService, IFileStreamContent } from '../../../../platform/files/common/files.js';

/**
 * Error conditions that may happen during the file reference resolution.
 */
export type TErrorCondition = FileOpenFailed | RecursiveReference | NotPromptSnippetFile;

/**
 * File extension for the prompt snippet files.
 */
const PROMP_SNIPPET_FILE_EXTENSION: string = '.prompt.md';

/**
 * Configuration key for the prompt snippets feature.
 */
const PROMPT_SNIPPETS_CONFIG_KEY: string = 'chat.experimental.prompt-snippets';

/**
 * Represents a file reference in the chatbot prompt, e.g. `#file:./path/to/file.md`.
 * Contains logic to resolve all nested file references in the target file and all
 * referenced child files recursively, if any.
 *
 * ## Examples
 *
 * ```typescript
 * const fileReference = new PromptFileReference(
 * 	 URI.file('/path/to/file.md'),
 * 	 fileService,
 * );
 *
 * // subscribe to updates to the file reference tree
 * fileReference.onUpdate(() => {
 * 	 // .. do something with the file reference tree ..
 * 	 // e.g. get URIs of all resolved file references in the tree
 * 	 const resolved = fileReference
 * 		// get all file references as a flat array
 * 		.flatten()
 * 		// remove self from the list if only child references are needed
 * 		.slice(1)
 * 		// filter out unresolved references
 * 		.filter(reference => reference.resolveFailed === flase)
 * 		// convert to URIs only
 * 		.map(reference => reference.uri);
 *
 * 	 console.log(resolved);
 * });
 *
 * // *optional* if need to re-resolve file references when target files change
 * // note that this does not sets up filesystem listeners for nested file references
 * fileReference.addFilesystemListeners();
 *
 * // start resolving the file reference tree; this can also be `await`ed if needed
 * // to wait for the resolution on the main file reference to complete (the nested
 * // references can still be resolving in the background)
 * fileReference.resolve();
 *
 * // don't forget to dispose when no longer needed!
 * fileReference.dispose();
 * ```
 */
export class PromptFileReference extends Disposable {
	/**
	 * Child references of the current one.
	 */
	protected readonly children: PromptFileReference[] = [];

	/**
	 * The event is fired when nested prompt snippet references are updated, if any.
	 */
	private readonly _onUpdate = this._register(new Emitter<void>());

	private _errorCondition?: TErrorCondition;
	/**
	 * If file reference resolution fails, this attribute will be set
	 * to an error instance that describes the error condition.
	 */
	public get errorCondition(): TErrorCondition | undefined {
		return this._errorCondition;
	}

	/**
	 * Whether file reference resolution was attempted at least once.
	 */
	private _resolveAttempted: boolean = false;
	/**
	 * Whether file references resolution failed.
	 * Set to `undefined` if the `resolve` method hasn't been ever called yet.
	 */
	public get resolveFailed(): boolean | undefined {
		if (!this._resolveAttempted) {
			return undefined;
		}

		return !!this._errorCondition;
	}

	constructor(
		private readonly _uri: URI | Location,
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configService: IConfigurationService,
	) {
		super();
		this.onFilesChanged = this.onFilesChanged.bind(this);

		// make sure the variable is updated on file changes
		this.addFilesystemListeners();
	}

	/**
	 * Subscribe to the `onUpdate` event.
	 * @param callback
	 */
	public onUpdate(callback: () => unknown): this {
		this._register(this._onUpdate.event(callback));

		return this;
	}

	/**
	 * Check if the prompt snippets feature is enabled.
	 * @see {@link PROMPT_SNIPPETS_CONFIG_KEY}
	 */
	public static promptSnippetsEnabled(
		configService: IConfigurationService,
	): boolean {
		const value = configService.getValue(PROMPT_SNIPPETS_CONFIG_KEY);

		if (!value) {
			return false;
		}

		if (typeof value === 'string') {
			return value.trim().toLowerCase() === 'true';
		}

		return !!value;
	}

	/**
	 * Check if the current reference points to a prompt snippet file.
	 */
	public get isPromptSnippetFile(): boolean {
		return this.uri.path.endsWith(PROMP_SNIPPET_FILE_EXTENSION);
	}

	/**
	 * Associated URI of the reference.
	 */
	public get uri(): URI {
		return this._uri instanceof URI
			? this._uri
			: this._uri.uri;
	}

	/**
	 * Get the directory name of the file reference.
	 */
	public get dirname() {
		return URI.joinPath(this.uri, '..');
	}

	/**
	 * Check if the current reference points to a given resource.
	 */
	public sameUri(other: URI | Location): boolean {
		const otherUri = other instanceof URI ? other : other.uri;

		return this.uri.toString() === otherUri.toString();
	}

	/**
	 * Add file system event listeners for the current file reference.
	 */
	private addFilesystemListeners(): this {
		this._register(
			this.fileService.onDidFilesChange(this.onFilesChanged),
		);

		return this;
	}

	/**
	 * Event handler for the `onDidFilesChange` event.
	 */
	private onFilesChanged(event: FileChangesEvent) {
		const fileChanged = event.contains(this.uri, FileChangeType.UPDATED);
		const fileDeleted = event.contains(this.uri, FileChangeType.DELETED);
		const fileAdded = event.contains(this.uri, FileChangeType.ADDED);

		// if the change does not relate to the current file, nothing to do
		if (!fileChanged && !fileDeleted && !fileAdded) {
			return;
		}

		// handle file changes only for prompt snippet files but in the case a file was
		// deleted, it does not matter if it was a prompt - we still need to handle it by
		// calling the `resolve()` method, which will set an error condition if the file
		// does not exist anymore, or of it is not a prompt snippet file
		if (fileChanged && !this.isPromptSnippetFile) {
			return;
		}

		// if we receive an `add` event, validate that the file was previously deleted, because
		// that is the only way we could have end up in this state of the file reference object
		if (fileAdded && (!this._errorCondition || !(this._errorCondition instanceof FileOpenFailed))) {
			this.logService.warn(
				[
					`Received 'add' event for file at '${this.uri.path}', but it was not previously deleted.`,
					'This most likely indicates a bug in our logic, so please report it.',
				].join(' '),
			);
		}

		// if file is changed or deleted, re-resolve the file reference
		// in the case when the file is deleted, this should result in
		// failure to open the file, so the `errorCondition` field will
		// be updated to an appropriate error instance and the `children`
		// field will be cleared up
		this.resolve();
	}

	/**
	 * Get file stream, if the file exsists.
	 */
	private async getFileStream(): Promise<IFileStreamContent | null> {
		try {
			// read the file first
			const result = await this.fileService.readFileStream(this.uri);

			// if file exists but not a prompt snippet file, set appropriate error
			// condition and return null so we don't resolve nested references in it
			if (this.uri.path.endsWith(PROMP_SNIPPET_FILE_EXTENSION) === false) {
				this._errorCondition = new NotPromptSnippetFile(this.uri);

				return null;
			}

			return result;
		} catch (error) {
			this._errorCondition = new FileOpenFailed(this.uri, error);

			return null;
		}
	}

	/**
	 * Resolve the current file reference on the disk and
	 * all nested file references that may exist in the file.
	 *
	 * @param waitForChildren Whether need to block until all child references are resolved.
	 */
	public async resolve(
		waitForChildren: boolean = false,
	): Promise<this> {
		return await this.resolveReference(waitForChildren);
	}

	/**
	 * Private implementation of the {@link resolve} method, that allows
	 * to pass `seenReferences` list to the recursive calls to prevent
	 * infinite file reference recursion.
	 */
	private async resolveReference(
		waitForChildren: boolean = false,
		seenReferences: string[] = [],
	): Promise<this> {
		// remove current error condition from the previous resolve attempt, if any
		delete this._errorCondition;

		// dispose current child references, if any exist from a previous resolve
		this.disposeChildren();

		// to prevent infinite file recursion, we keep track of all references in
		// the current branch of the file reference tree and check if the current
		// file reference has been already seen before
		if (seenReferences.includes(this.uri.path)) {
			seenReferences.push(this.uri.path);

			this._errorCondition = new RecursiveReference(this.uri, seenReferences);
			this._resolveAttempted = true;
			this._onUpdate.fire();

			return this;
		}

		// we don't care if reading the file fails below, hence can add the path
		// of the current reference to the `seenReferences` set immediately, -
		// even if the file doesn't exist, we would never end up in the recursion
		seenReferences.push(this.uri.path);

		// try to get stream for the contents of the file, it may
		// fail to multiple reasons, e.g. file doesn't exist, etc.
		const fileStream = await this.getFileStream();
		this._resolveAttempted = true;

		// failed to open the file, nothing to resolve
		if (fileStream === null) {
			this._onUpdate.fire();

			return this;
		}

		// get all file references in the file contents
		const references = await ChatPromptCodec.decode(fileStream.value).consumeAll();

		// recursively resolve all references and add to the `children` array
		//
		// Note! we don't register the children references as disposables here, because we dispose them
		//		 explicitly in the `dispose` override method of this class. This is done to prevent
		//       the disposables store to be littered with already-disposed child instances due to
		// 		 the fact that the `resolve` method can be called multiple times on target file changes
		const childPromises = [];
		for (const reference of references) {
			const childUri = extUri.resolvePath(this.dirname, reference.path);

			const child = new PromptFileReference(
				childUri,
				this.logService,
				this.fileService,
				this.configService,
			);

			// subscribe to child updates
			child.onUpdate(
				this._onUpdate.fire.bind(this._onUpdate),
			);
			this.children.push(child);

			// start resolving the child in the background, including its children
			// Note! we have to clone the `seenReferences` list here to ensure that
			// 		 different tree branches don't interfere with each other as we
			//       care about the parent references when checking for recursion
			childPromises.push(
				child.resolveReference(waitForChildren, [...seenReferences]),
			);
		}

		// if should wait for all children to resolve, block here
		if (waitForChildren) {
			await Promise.all(childPromises);
		}

		this._onUpdate.fire();

		return this;
	}

	/**
	 * Dispose current child file references.
	 */
	private disposeChildren(): this {
		for (const child of this.children) {
			child.dispose();
		}

		this.children.length = 0;
		this._onUpdate.fire();

		return this;
	}

	/**
	 * Flatten the current file reference tree into a single array.
	 */
	public flatten(): readonly PromptFileReference[] {
		const result = [];

		// then add self to the result
		result.push(this);

		// get flattened children references first
		for (const child of this.children) {
			result.push(...child.flatten());
		}

		return result;
	}

	/**
	 * Get list of all valid child references.
	 */
	public get validChildReferences(): readonly PromptFileReference[] {
		return this.flatten()
			// skip the root reference itself (this variable)
			.slice(1)
			// filter out unresolved references
			.filter((reference) => {
				return (reference.resolveFailed === false) ||
					(reference.errorCondition instanceof NotPromptSnippetFile);
			});
	}

	/**
	 * Get list of all valid child references as URIs.
	 */
	public get validFileReferenceUris(): readonly URI[] {
		return this.validChildReferences
			.map(child => child.uri);
	}

	/**
	 * Check if the current reference is equal to a given one.
	 */
	public equals(other: PromptFileReference): boolean {
		if (!this.sameUri(other.uri)) {
			return false;
		}

		return true;
	}

	/**
	 * Returns a string representation of this reference.
	 */
	public override toString() {
		return `#file:${this.uri.path}`;
	}

	public override dispose() {
		this.disposeChildren();
		super.dispose();
	}
}
