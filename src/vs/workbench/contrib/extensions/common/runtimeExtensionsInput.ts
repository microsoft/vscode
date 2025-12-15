/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

const RuntimeExtensionsEditorIcon = registerIcon('runtime-extensions-editor-label-icon', Codicon.extensions, nls.localize('runtimeExtensionEditorLabelIcon', 'Icon of the runtime extensions editor label.'));

export class RuntimeExtensionsInput extends EditorInput {

	static readonly ID = 'workbench.runtimeExtensions.input';

	override get typeId(): string {
		return RuntimeExtensionsInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	static _instance: RuntimeExtensionsInput;
	static get instance() {
		if (!RuntimeExtensionsInput._instance || RuntimeExtensionsInput._instance.isDisposed()) {
			RuntimeExtensionsInput._instance = new RuntimeExtensionsInput();
		}

		return RuntimeExtensionsInput._instance;
	}

	readonly resource = URI.from({
		scheme: 'runtime-extensions',
		path: 'default'
	});

	override getName(): string {
		return nls.localize('extensionsInputName', "Running Extensions");
	}

	override getIcon(): ThemeIcon {
		return RuntimeExtensionsEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return other instanceof RuntimeExtensionsInput;
	}
}
