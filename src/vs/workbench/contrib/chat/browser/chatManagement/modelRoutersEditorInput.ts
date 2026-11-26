/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../../platform/editor/common/editor.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

const modelRoutersEditorIcon = registerIcon('model-routers-editor-label-icon', Codicon.typeHierarchySub, localize('modelRoutersEditorLabelIcon', 'Icon of the Model Routers editor label.'));

/**
 * The editor that lists model routers. It opens beside the Language Models editor, and only a window
 * that has routers registers an editor pane for it.
 */
export class ModelRoutersEditorInput extends EditorInput implements IModalEditorOptionsProvider {

	static readonly ID: string = 'workbench.input.modelRouters';

	readonly resource = undefined;

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof ModelRoutersEditorInput;
	}

	override get typeId(): string {
		return ModelRoutersEditorInput.ID;
	}

	override getName(): string {
		return localize('modelRoutersEditorInputName', "Model Routers");
	}

	override getIcon(): ThemeIcon {
		return modelRoutersEditorIcon;
	}

	/** In a modal, the header lists this editor and the Language Models editor it opened beside as tabs. */
	getModalEditorOptions(): IModalEditorOptions {
		return { showEditorsInHeader: true };
	}

	override async resolve(): Promise<null> {
		return null;
	}
}
