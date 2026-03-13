/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import * as nls from '../../../../../nls.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

const ChatManagementEditorIcon = registerIcon('ai-management-editor-label-icon', Codicon.copilot, nls.localize('aiManagementEditorLabelIcon', 'Icon of the AI Management editor label.'));
const ModelsManagementEditorIcon = registerIcon('models-management-editor-label-icon', Codicon.settings, nls.localize('modelsManagementEditorLabelIcon', 'Icon of the Models Management editor label.'));

export const CHAT_MANAGEMENT_SECTION_USAGE = 'usage';
export const CHAT_MANAGEMENT_SECTION_MODELS = 'models';

export class ChatManagementEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.input.chatManagement';

	readonly resource = undefined;

	constructor() {
		super();
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof ChatManagementEditorInput;
	}

	override get typeId(): string {
		return ChatManagementEditorInput.ID;
	}

	override getName(): string {
		return nls.localize('aiManagementEditorInputName', "Manage Copilot");
	}

	override getIcon(): ThemeIcon {
		return ChatManagementEditorIcon;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}

export class ModelsManagementEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.input.modelsManagement';

	readonly resource = undefined;

	constructor() {
		super();
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof ModelsManagementEditorInput;
	}

	override get typeId(): string {
		return ModelsManagementEditorInput.ID;
	}

	override getName(): string {
		return nls.localize('modelsManagementEditorInputName', "Language Models");
	}

	override getIcon(): ThemeIcon {
		return ModelsManagementEditorIcon;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}
