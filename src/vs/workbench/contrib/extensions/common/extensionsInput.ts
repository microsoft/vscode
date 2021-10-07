/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { EditorInputCapabilities, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IExtension, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { join } from 'vs/base/common/path';

export class ExtensionsInput extends EditorInput {

	static readonly ID = 'workbench.extensions.input2';

	override get typeId(): string {
		return ExtensionsInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	override get resource() {
		return URI.from({
			scheme: Schemas.extension,
			path: join(this._extension.identifier.id, 'extension')
		});
	}

	constructor(
		private _extension: IExtension,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super();
		this._register(extensionsWorkbenchService.onChange(extension => {
			if (extension && areSameExtensions(this._extension.identifier, extension.identifier)) {
				this._extension = extension;
			}
		}));
	}

	get extension(): IExtension { return this._extension; }

	override getName(): string {
		return localize('extensionsInputName', "Extension: {0}", this._extension.displayName);
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof ExtensionsInput && areSameExtensions(this._extension.identifier, other._extension.identifier);
	}
}
