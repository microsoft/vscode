/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../../platform/editor/common/editor.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';

export class RemotesEditorInput extends EditorInput implements IModalEditorOptionsProvider {
	static readonly ID = 'sessions.input.remotes';
	private static instance: RemotesEditorInput | undefined;

	readonly resource = undefined;

	static getOrCreate(): RemotesEditorInput {
		if (!RemotesEditorInput.instance || RemotesEditorInput.instance.isDisposed()) {
			RemotesEditorInput.instance = new RemotesEditorInput();
		}
		return RemotesEditorInput.instance;
	}

	override get typeId(): string {
		return RemotesEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.RequiresModal;
	}

	override getName(): string {
		return localize('remotes.editorName', "Remote Environments");
	}

	override getIcon() {
		return Codicon.remote;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof RemotesEditorInput;
	}

	getModalEditorOptions(): IModalEditorOptions {
		return { compactHeader: true, canMoveToEditorArea: false };
	}
}
