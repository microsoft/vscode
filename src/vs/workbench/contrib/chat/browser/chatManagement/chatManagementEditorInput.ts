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

export class ChatManagementEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.input.aiManagement';

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
