/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../common/editor/editorInput.js';
import { IUntypedEditorInput } from '../../../common/editor.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { IImageCarouselCollection } from './imageCarouselTypes.js';

export class ImageCarouselEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.imageCarousel';

	private _resource: URI;

	constructor(
		public readonly collection: IImageCarouselCollection,
		public readonly startIndex: number = 0
	) {
		super();
		this._resource = URI.from({
			scheme: Schemas.vscodeImageCarousel,
			path: `/${encodeURIComponent(collection.id)}`,
		});
	}

	get typeId(): string {
		return ImageCarouselEditorInput.ID;
	}

	get resource(): URI {
		return this._resource;
	}

	override getName(): string {
		return this.collection.title;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (other instanceof ImageCarouselEditorInput) {
			return other.collection.id === this.collection.id;
		}
		return false;
	}
}
