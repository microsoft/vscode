/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network';
import { URI } from '../../../../base/common/uri';
import { localize } from '../../../../nls';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor';
import { EditorInput } from '../../../common/editor/editorInput';
import { ExtensionEditorTab, IExtension } from './extensions';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil';
import { join } from '../../../../base/common/path';
import { IEditorOptions } from '../../../../platform/editor/common/editor';
import { ThemeIcon } from '../../../../base/common/themables';
import { Codicon } from '../../../../base/common/codicons';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry';

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
