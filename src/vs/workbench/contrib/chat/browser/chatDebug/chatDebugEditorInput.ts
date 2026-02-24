/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

const chatDebugEditorIcon = registerIcon('chat-debug-editor-label-icon', Codicon.bug, localize('chatDebugEditorLabelIcon', 'Icon of the chat debug editor label.'));

export class ChatDebugEditorInput extends EditorInput {

	static readonly ID = 'workbench.editor.chatDebug';

	static readonly RESOURCE = URI.from({
		scheme: 'chat-debug',
		path: 'default'
	});

	private static _instance: ChatDebugEditorInput;
	static get instance() {
		if (!ChatDebugEditorInput._instance || ChatDebugEditorInput._instance.isDisposed()) {
			ChatDebugEditorInput._instance = new ChatDebugEditorInput();
		}

		return ChatDebugEditorInput._instance;
	}

	override get typeId(): string { return ChatDebugEditorInput.ID; }

	override get editorId(): string | undefined { return ChatDebugEditorInput.ID; }

	override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton; }

	readonly resource = ChatDebugEditorInput.RESOURCE;

	override getName(): string {
		return localize('chatDebugInputName', "Chat Debug Panel");
	}

	override getIcon(): ThemeIcon {
		return chatDebugEditorIcon;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}

		return other instanceof ChatDebugEditorInput;
	}
}

export class ChatDebugEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(editorInput: EditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): EditorInput {
		return ChatDebugEditorInput.instance;
	}
}
