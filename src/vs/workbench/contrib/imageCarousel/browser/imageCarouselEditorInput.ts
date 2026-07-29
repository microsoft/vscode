/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IImageCarouselCollection } from './imageCarouselTypes.js';

const imageCarouselEditorIcon = registerIcon('image-carousel-editor-label-icon', Codicon.fileMedia, localize('imageCarouselEditorLabelIcon', 'Icon of the image carousel editor label.'));

export class ImageCarouselEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.imageCarousel';

	private _resource: URI;
	private _name: string;

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	constructor(
		public readonly collection: IImageCarouselCollection,
		public readonly startIndex: number = 0
	) {
		super();
		this._resource = URI.from({
			scheme: Schemas.vscodeImageCarousel,
			path: `/${encodeURIComponent(collection.id)}`,
		});
		this._name = collection.title;
	}

	get typeId(): string {
		return ImageCarouselEditorInput.ID;
	}

	get resource(): URI {
		return this._resource;
	}

	override getName(): string {
		return this._name;
	}

	override getIcon(): ThemeIcon {
		return imageCarouselEditorIcon;
	}

	setName(name: string): void {
		if (this._name !== name) {
			this._name = name;
			this._onDidChangeLabel.fire();
		}
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (other instanceof ImageCarouselEditorInput) {
			return other.collection.id === this.collection.id;
		}
		return false;
	}
}
