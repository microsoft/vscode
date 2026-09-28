/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IUntypedEditorInput, EditorInputCapabilities } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';

export class SessionWorktreeCleanupEditorInput extends EditorInput {

	static readonly ID = 'sessions.input.sessionWorktreeCleanup';

	readonly resource = undefined;

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof SessionWorktreeCleanupEditorInput;
	}

	override get typeId(): string {
		return SessionWorktreeCleanupEditorInput.ID;
	}

	override getName(): string {
		return localize('sessionWorktreeCleanupEditor.name', "Clean Up Agent Worktrees");
	}

	override getIcon(): ThemeIcon {
		return Codicon.database;
	}

	override async resolve(): Promise<null> {
		return null;
	}
}
