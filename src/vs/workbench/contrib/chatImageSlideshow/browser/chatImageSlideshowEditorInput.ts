/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../common/editor/editorInput.js';
import { ITextResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { URI } from '../../../../base/common/uri.js';
import { ISlideshowImageCollection } from './chatImageSlideshowTypes.js';

/**
 * Editor input for the chat image slideshow
 */
export class ChatImageSlideshowEditorInput extends EditorInput implements ITextResourceEditorInput {
	static readonly ID = 'workbench.input.chatImageSlideshow';

	private _resource: URI;

	constructor(
		public readonly collection: ISlideshowImageCollection
	) {
		super();
		// Create a virtual URI for this slideshow
		this._resource = URI.from({
			scheme: 'chat-slideshow',
			path: `/${collection.id}`,
			query: `title=${encodeURIComponent(collection.title)}`
		});
	}

	get typeId(): string {
		return ChatImageSlideshowEditorInput.ID;
	}

	get resource(): URI {
		return this._resource;
	}

	override getName(): string {
		return this.collection.title;
	}

	override matches(other: EditorInput | ITextResourceEditorInput): boolean {
		if (other instanceof ChatImageSlideshowEditorInput) {
			return other.collection.id === this.collection.id;
		}
		return false;
	}
}
