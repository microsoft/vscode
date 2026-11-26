/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { IModalEditorOptions, IModalEditorOptionsProvider } from '../../../../../../platform/editor/common/editor.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';

export interface IRemotesSharingViewState {
	readonly expanded: boolean;
	readonly selectedMethod: 'githubEnvironment' | 'devTunnel' | undefined;
	readonly failedMethod: 'githubEnvironment' | 'devTunnel';
	readonly failure: string | undefined;
}

export class RemotesEditorInput extends EditorInput implements IModalEditorOptionsProvider {
	static readonly ID = 'sessions.input.remotes';
	private static instance: RemotesEditorInput | undefined;
	/** One-shot continuation when opening diagnostics closes the management modal. */
	sharingState: IRemotesSharingViewState | undefined;

	readonly resource = undefined;

	static getOrCreate(): RemotesEditorInput {
		if (!RemotesEditorInput.instance || RemotesEditorInput.instance.isDisposed()) {
			const sharingState = RemotesEditorInput.instance?.sharingState;
			RemotesEditorInput.instance = new RemotesEditorInput();
			RemotesEditorInput.instance.sharingState = sharingState;
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
