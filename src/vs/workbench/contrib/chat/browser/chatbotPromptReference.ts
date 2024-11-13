/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Location } from '../../../../editor/common/languages.js';
import { IFileService, IFileStreamContent } from '../../../../platform/files/common/files.js';
import { ChatbotPromptCodec } from '../../../common/codecs/chatbotPromptCodec/chatbotPromptCodec.js';

/**
 * TODO: @legomushroom
 */
export class ChatbotPromptReference extends Disposable {
	// Chatbot prompt message codec helps to parse out prompt syntax.
	private readonly codec = this._register(new ChatbotPromptCodec());

	// Child references of the current one.
	private readonly children: ChatbotPromptReference[] = [];

	private readonly _onUpdate = this._register(new Emitter<void>());
	// The event is fired when nested prompt snippet references are updated, if any.
	public readonly onUpdate = this._onUpdate.event;

	// Whether the referenced file exists on disk (private attribute).
	private fileExists?: boolean = undefined;

	constructor(
		private readonly _uri: URI | Location,
		private readonly fileService: IFileService
	) {
		super();
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

	// Whether the referenced file exists on disk.
	public get isFileExists(): boolean | undefined {
		return this.fileExists;
	}

	/**
	 * Get the parent folder of the file reference.
	 */
	public get parentFolder() {
		return URI.joinPath(this.uri, '..');
	}

	/**
	 * Get file stream, if the file exsists.
	 */
	private async getFileStream(): Promise<IFileStreamContent | null> {
		try {
			const fileStream = await this.fileService.readFileStream(this.uri);

			this.fileExists = true;

			return fileStream;
		} catch (error) {
			this.fileExists = false;
			// TODO: @legomushroom - trace the error
			return null;
		}
	}

	/**
	 * Resolve the current file reference on the disk and
	 * all nested file references that may exist in the file.
	 */
	public async resolve(): Promise<this> {
		const fileStream = await this.getFileStream();

		// file does not exist, nothing to resolve
		if (fileStream === null) {
			return this;
		}

		// get all file references in the file contents
		const references = await this.codec.decode(fileStream.value).consume();

		// recursively resolve all references and add to the `children` array
		for (const reference of references) {
			const child = this._register(new ChatbotPromptReference(
				URI.joinPath(this.parentFolder, reference.path), // TODO: unit test the absolute paths
				this.fileService
			));

			// TODO: @legomushroom - do this in parallel
			this.children.push(await child.resolve());
		}

		this._onUpdate.fire();

		return this;
	}

	/**
	 * Flatten the current file reference tree into a single array.
	 */
	public flatten(): ChatbotPromptReference[] {
		const result: ChatbotPromptReference[] = [];

		// then add self to the result
		result.push(this);

		// get flattened children references first
		for (const child of this.children) {
			result.push(...child.flatten());
		}

		return result;
	}
}
