/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../platform/editor/common/editor.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

export class ChatPetAchievementsEditorInput extends EditorInput implements IModalEditorOptionsProvider {

	static readonly ID = 'workbench.editors.chatPetAchievements';
	private static instance: ChatPetAchievementsEditorInput | undefined;

	readonly resource = undefined;

	static getOrCreate(): ChatPetAchievementsEditorInput {
		if (!ChatPetAchievementsEditorInput.instance || ChatPetAchievementsEditorInput.instance.isDisposed()) {
			ChatPetAchievementsEditorInput.instance = new ChatPetAchievementsEditorInput();
		}
		return ChatPetAchievementsEditorInput.instance;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	override get typeId(): string {
		return ChatPetAchievementsEditorInput.ID;
	}

	override getName(): string {
		return localize('chatPet.achievements.editorName', "Achievements");
	}

	override getIcon(): ThemeIcon {
		return Codicon.starFull;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof ChatPetAchievementsEditorInput;
	}

	getModalEditorOptions(): IModalEditorOptions {
		return { compactHeader: true };
	}

	override async resolve(): Promise<null> {
		return null;
	}
}
