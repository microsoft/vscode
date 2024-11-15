/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Location } from '../../../../editor/common/languages.js';
import { FileOpenFailed, RecursiveReference } from './promptFileReferenceErrors.js';
import { ChatbotPromptCodec } from '../../../common/codecs/chatbotPromptCodec/chatbotPromptCodec.js';
import { FileChangesEvent, FileChangeType, IFileService, IFileStreamContent } from '../../../../platform/files/common/files.js';

/**
 * TODO: @legomushroom
 *  - handle recursive child references
 *  - use cancellation tokens
 *  - add tracing/telemetry
 *  - add unit tests
 *  - add more docs
 */

/**
 * Error conditions that may happen during the file reference resolution.
 */
export type TErrorCondition = FileOpenFailed | RecursiveReference;

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
	 * Chatbot prompt message codec helps to parse out prompt syntax.
	 */
	private readonly codec = this._register(new ChatbotPromptCodec());

	/**
	 * Child references of the current one.
	 */
	protected readonly children: PromptFileReference[] = [];

	private readonly _onUpdate = this._register(new Emitter<void>());
	/**
	 * The event is fired when nested prompt snippet references are updated, if any.
	 */
	public readonly onUpdate = this._onUpdate.event;

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
		private readonly fileService: IFileService
	) {
		super();
		this.onFilesChanged = this.onFilesChanged.bind(this);
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
	 * Check if the current reference points to a given resource.
	 */
	public sameUri(other: URI | Location): boolean {
		const otherUri = other instanceof URI ? other : other.uri;

		return this.uri.toString() === otherUri.toString();
	}

	/**
	 * Get the parent folder of the file reference.
	 */
	public get parentFolder() {
		return URI.joinPath(this.uri, '..');
	}

	/**
	 * Add file system event listeners for the current file reference.
	 */
	public addFilesystemListeners(): this {
		this._register(this.fileService.onDidFilesChange(this.onFilesChanged));

		return this;
	}

	/**
	 * Event handler for the `onDidFilesChange` event.
	 */
	private onFilesChanged(event: FileChangesEvent) {
		const fileChanged = event.contains(this.uri, FileChangeType.UPDATED);
		const fileDeleted = event.contains(this.uri, FileChangeType.DELETED);
		if (!fileChanged && !fileDeleted) {
			return;
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
			const fileStream = await this.fileService.readFileStream(this.uri);

			return fileStream;
		} catch (error) {
			this._errorCondition = new FileOpenFailed(this.uri, error);

			// TODO: @legomushroom - trace the error
			return null;
		}
	}

	/**
	 * Resolve the current file reference on the disk and
	 * all nested file references that may exist in the file.
	 *
	 * @param waitForChildren Whether need to block until all child references resolved.
	 */
	// TODO: @legomushroom - add cancellation token
	public async resolve(
		waitForChildren: boolean = false,
	): Promise<this> {
		// remove current error condition from the previous resolve attempt, if any
		delete this._errorCondition;

		// dispose current child references, if any
		this.disposeChildren();

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
		const references = await this.codec.decode(fileStream.value).consumeAll();

		// recursively resolve all references and add to the `children` array
		//
		// Note! we don't register the children references as disposables here, because we dispose them
		//		 explicitly in the `dispose` override method of this class. This is done to prevent
		//       the disposables store to be littered with already-disposed child instances due to
		// 		 the fact that the `resolve` method can be called multiple times on target file changes
		const childPromises = [];
		for (const reference of references) {
			const child = new PromptFileReference(
				URI.joinPath(this.parentFolder, reference.path), // TODO: unit test the absolute paths
				this.fileService,
			);

			// subscribe to child updates
			// TODO: @legomushroom - throttle the child update events
			this._register(child.onUpdate(
				this._onUpdate.fire.bind(this._onUpdate),
			));
			this.children.push(child);

			// start resolving the child immediately in the background
			childPromises.push(child.resolve());
		}

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
	public getValidChildReferences(): readonly PromptFileReference[] {
		return this.flatten()
			// skip the root reference itself (this variable)
			.slice(1)
			// filter out unresolved references
			.filter(reference => reference.resolveFailed === false);
	}

	public override dispose() {
		this.disposeChildren();
		super.dispose();
	}
}
