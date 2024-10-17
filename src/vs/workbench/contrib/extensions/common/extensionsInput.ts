/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ExtensionEditorTab, IExtension } from './extensions.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { join } from '../../../../base/common/path.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

const ExtensionEditorIcon = registerIcon('extensions-editor-label-icon', Codicon.extensions, localize('extensionsEditorLabelIcon', 'Icon of the extensions editor label.'));

export interface IExtensionEditorOptions extends IEditorOptions {
	showPreReleaseVersion?: boolean;
	tab?: ExtensionEditorTab;
	feature?: string;
	sideByside?: boolean;
}

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

	constructor(private _extension: IExtension) {
		super();
	}

	get extension(): IExtension { return this._extension; }

	override getName(): string {
		return localize('extensionsInputName', "Extension: {0}", this._extension.displayName);
	}

	override getIcon(): ThemeIcon | undefined {
		return ExtensionEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof ExtensionsInput && areSameExtensions(this._extension.identifier, other._extension.identifier);
	}
}
