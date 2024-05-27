/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { ThemeIcon } from 'vs/base/common/themables';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import type { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';

const ChatEditorIcon = registerIcon('chat-editor-label-icon', Codicon.commentDiscussion, nls.localize('chatEditorLabelIcon', 'Icon of the chat editor label.'));

export class ChatEditorInput extends EditorInput {
	static readonly countsInUse = new Set<number>();

	static readonly TypeID: string = 'workbench.input.chatSession';
	static readonly EditorID: string = 'workbench.editor.chatSession';

	private readonly inputCount: number;
	public sessionId: string | undefined;

	private model: IChatModel | undefined;

	static getNewEditorUri(): URI {
		const handle = Math.floor(Math.random() * 1e9);
		return ChatUri.generate(handle);
	}

	static getNextCount(): number {
		let count = 0;
		while (ChatEditorInput.countsInUse.has(count)) {
			count++;
		}

		return count;
	}

	constructor(
		readonly resource: URI,
		readonly options: IChatEditorOptions,
		@IChatService private readonly chatService: IChatService
	) {
		super();

		const parsed = ChatUri.parse(resource);
		if (typeof parsed?.handle !== 'number') {
			throw new Error('Invalid chat URI');
		}

		this.sessionId = (options.target && 'sessionId' in options.target) ?
			options.target.sessionId :
			undefined;
		this.inputCount = ChatEditorInput.getNextCount();
		ChatEditorInput.countsInUse.add(this.inputCount);
		this._register(toDisposable(() => ChatEditorInput.countsInUse.delete(this.inputCount)));
	}

	override get editorId(): string | undefined {
		return ChatEditorInput.EditorID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return otherInput instanceof ChatEditorInput && otherInput.resource.toString() === this.resource.toString();
	}

	override get typeId(): string {
		return ChatEditorInput.TypeID;
	}

	override getName(): string {
		return this.model?.title || nls.localize('chatEditorName', "Chat") + (this.inputCount > 0 ? ` ${this.inputCount + 1}` : '');
	}

	override getIcon(): ThemeIcon {
		return ChatEditorIcon;
	}

	override async resolve(): Promise<ChatEditorModel | null> {
		if (typeof this.sessionId === 'string') {
			this.model = this.chatService.getOrRestoreSession(this.sessionId);
		} else if (!this.options.target) {
			this.model = this.chatService.startSession(ChatAgentLocation.Panel, CancellationToken.None);
		} else if ('data' in this.options.target) {
			this.model = this.chatService.loadSessionFromContent(this.options.target.data);
		}

		if (!this.model) {
			return null;
		}

		this.sessionId = this.model.sessionId;
		this._register(this.model.onDidChange(() => this._onDidChangeLabel.fire()));

		return this._register(new ChatEditorModel(this.model));
	}

	override dispose(): void {
		super.dispose();
		if (this.sessionId) {
			this.chatService.clearSession(this.sessionId);
		}
	}
}

export class ChatEditorModel extends Disposable {
	private _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private _isDisposed = false;
	private _isResolved = false;

	constructor(
		readonly model: IChatModel
	) { super(); }

	async resolve(): Promise<void> {
		this._isResolved = true;
	}

	isResolved(): boolean {
		return this._isResolved;
	}

	isDisposed(): boolean {
		return this._isDisposed;
	}

	override dispose(): void {
		super.dispose();
		this._isDisposed = true;
	}
}

export namespace ChatUri {

	export const scheme = Schemas.vscodeChatSesssion;


	export function generate(handle: number): URI {
		return URI.from({ scheme, path: `chat-${handle}` });
	}

	export function parse(resource: URI): { handle: number } | undefined {
		if (resource.scheme !== scheme) {
			return undefined;
		}

		const match = resource.path.match(/chat-(\d+)/);
		const handleStr = match?.[1];
		if (typeof handleStr !== 'string') {
			return undefined;
		}

		const handle = parseInt(handleStr);
		if (isNaN(handle)) {
			return undefined;
		}

		return { handle };
	}
}

interface ISerializedChatEditorInput {
	options: IChatEditorOptions;
	sessionId: string;
	resource: URI;
}

export class ChatEditorInputSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): input is ChatEditorInput & { readonly sessionId: string } {
		return input instanceof ChatEditorInput && typeof input.sessionId === 'string';
	}

	serialize(input: EditorInput): string | undefined {
		if (!this.canSerialize(input)) {
			return undefined;
		}

		const obj: ISerializedChatEditorInput = {
			options: input.options,
			sessionId: input.sessionId,
			resource: input.resource
		};
		return JSON.stringify(obj);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const parsed: ISerializedChatEditorInput = JSON.parse(serializedEditor);
			const resource = URI.revive(parsed.resource);
			return instantiationService.createInstance(ChatEditorInput, resource, { ...parsed.options, target: { sessionId: parsed.sessionId } });
		} catch (err) {
			return undefined;
		}
	}
}
