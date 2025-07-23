/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IEditorIdentifier, IEditorSerializer, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput, IEditorCloseHandler } from '../../../common/editor/editorInput.js';
import type { IChatEditorOptions } from './chatEditor.js';
import { IChatModel, IChatRequestModel } from '../common/chatModel.js';
import { IChatService } from '../common/chatService.js';
import { ChatAgentLocation } from '../common/constants.js';
import { ConfirmResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IChatEditingSession, ModifiedFileEntryState } from '../common/chatEditingService.js';
import { IClearEditingSessionConfirmationOptions } from './actions/chatActions.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { OffsetRange } from '../../../../editor/common/core/ranges/offsetRange.js';
import { IParsedChatRequest, ChatRequestTextPart } from '../common/chatParserTypes.js';

const ChatEditorIcon = registerIcon('chat-editor-label-icon', Codicon.commentDiscussion, nls.localize('chatEditorLabelIcon', 'Icon of the chat editor label.'));

export class ChatEditorInput extends EditorInput implements IEditorCloseHandler {
	static readonly countsInUse = new Set<number>();

	static readonly TypeID: string = 'workbench.input.chatSession';
	static readonly EditorID: string = 'workbench.editor.chatSession';

	private readonly inputCount: number;
	public sessionId: string | undefined;

	private model: IChatModel | undefined;

	private readonly parsedResource: ChatSessionIdentifier;

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
		@IChatService private readonly chatService: IChatService,
		@IDialogService private readonly dialogService: IDialogService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		const parsed = ChatUri.parse(resource);
		if (!parsed || (parsed.type === 'handle' && typeof parsed.handle !== 'number')) {
			throw new Error('Invalid chat URI');
		}
		this.parsedResource = parsed;

		this.sessionId = (options.target && 'sessionId' in options.target) ?
			options.target.sessionId :
			undefined;
		this.inputCount = ChatEditorInput.getNextCount();
		ChatEditorInput.countsInUse.add(this.inputCount);
		this._register(toDisposable(() => ChatEditorInput.countsInUse.delete(this.inputCount)));
	}

	override closeHandler = this;

	showConfirm(): boolean {
		return this.model?.editingSession ? shouldShowClearEditingSessionConfirmation(this.model.editingSession) : false;
	}

	async confirm(editors: ReadonlyArray<IEditorIdentifier>): Promise<ConfirmResult> {
		if (!this.model?.editingSession) {
			return ConfirmResult.SAVE;
		}

		const titleOverride = nls.localize('chatEditorConfirmTitle', "Close Chat Editor");
		const messageOverride = nls.localize('chat.startEditing.confirmation.pending.message.default', "Closing the chat editor will end your current edit session.");
		const result = await showClearEditingSessionConfirmation(this.model.editingSession, this.dialogService, { titleOverride, messageOverride });
		return result ? ConfirmResult.SAVE : ConfirmResult.CANCEL;
	}

	override get editorId(): string | undefined {
		return ChatEditorInput.EditorID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor;
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
			this.model = await this.chatService.getOrRestoreSession(this.sessionId)
				?? this.chatService.startSession(ChatAgentLocation.Panel, CancellationToken.None);
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

		const chatEditorModel = this._register(new ChatEditorModel(this.model));

		// TODO: This should not live here
		if (this.parsedResource.type === 'session') {
			const chatSessionType = this.parsedResource.chatSessionType;
			const content = await this.chatSessionsService.provideChatSessionContent(chatSessionType, this.parsedResource.sessionId, CancellationToken.None);

			let lastRequest: IChatRequestModel | undefined;
			for (const message of content.history) {
				if (message.type === 'request') {
					const requestText = message.prompt;

					const parsedRequest: IParsedChatRequest = {
						text: requestText,
						parts: [new ChatRequestTextPart(
							new OffsetRange(0, requestText.length),
							{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: requestText.length + 1 },
							requestText
						)]
					};
					lastRequest = this.model.addRequest(parsedRequest,
						{ variables: [] }, // variableData
						0, // attempt
						undefined, // chatAgent - will use default
						undefined, // slashCommand
						undefined, // confirmation
						undefined, // locationData
						undefined, // attachments
						true // isCompleteAddedRequest - this indicates it's a complete request, not user input
					);
				} else {
					// response
					if (lastRequest) {
						for (const part of message.parts) {
							this.model.acceptResponseProgress(lastRequest, part);
						}
					}
				}
			}

			if (content.progressEvent) {
				content.progressEvent(e => {
					if (lastRequest) {
						for (const progress of e) {

							if (progress.kind === 'progressMessage' && progress.content.value === 'Session completed') {
								this.model?.completeResponse(lastRequest);
							} else {
								this.model?.acceptResponseProgress(lastRequest, progress);
							}
						}
					}
				});
			} else {
				if (lastRequest) {
					this.model.completeResponse(lastRequest);
				}
			}


		}

		return chatEditorModel;
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

type ChatSessionIdentifier = {
	type: 'handle';
	handle: number;
} | {
	type: 'session';
	chatSessionType: string;
	sessionId: string;
};

export namespace ChatUri {

	export const scheme = Schemas.vscodeChatEditor;
	export const customSessionAuthority = 'custom-session';


	export function generate(handle: number): URI {
		return URI.from({ scheme, path: `chat-${handle}` });
	}

	export function generateForSession(chatSessionType: string, id: string): URI {
		const encodedId = encodeBase64(VSBuffer.wrap(new TextEncoder().encode(id)), false, true);
		return URI.from({ scheme, authority: customSessionAuthority, path: '/' + chatSessionType + '/' + encodedId });
	}

	export function parse(resource: URI): ChatSessionIdentifier | undefined {
		if (resource.scheme !== scheme) {
			return undefined;
		}

		if (resource.authority === customSessionAuthority) {
			const parts = resource.path.split('/');
			if (parts.length !== 3) {
				return undefined;
			}

			const chatSessionType = parts[1];
			const decodedSessionId = decodeBase64(parts[2]);
			return { type: 'session', chatSessionType, sessionId: new TextDecoder().decode(decodedSessionId.buffer) };
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

		return { type: 'handle', handle };
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

export async function showClearEditingSessionConfirmation(editingSession: IChatEditingSession, dialogService: IDialogService, options?: IClearEditingSessionConfirmationOptions): Promise<boolean> {
	const defaultPhrase = nls.localize('chat.startEditing.confirmation.pending.message.default1', "Starting a new chat will end your current edit session.");
	const defaultTitle = nls.localize('chat.startEditing.confirmation.title', "Start new chat?");
	const phrase = options?.messageOverride ?? defaultPhrase;
	const title = options?.titleOverride ?? defaultTitle;

	const currentEdits = editingSession.entries.get();
	const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);

	const { result } = await dialogService.prompt({
		title,
		message: phrase + ' ' + nls.localize('chat.startEditing.confirmation.pending.message.2', "Do you want to keep pending edits to {0} files?", undecidedEdits.length),
		type: 'info',
		cancelButton: true,
		buttons: [
			{
				label: nls.localize('chat.startEditing.confirmation.acceptEdits', "Keep & Continue"),
				run: async () => {
					await editingSession.accept();
					return true;
				}
			},
			{
				label: nls.localize('chat.startEditing.confirmation.discardEdits', "Undo & Continue"),
				run: async () => {
					await editingSession.reject();
					return true;
				}
			}
		],
	});

	return Boolean(result);
}

export function shouldShowClearEditingSessionConfirmation(editingSession: IChatEditingSession): boolean {
	const currentEdits = editingSession.entries.get();
	const currentEditCount = currentEdits.length;

	if (currentEditCount) {
		const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
		return !!undecidedEdits.length;
	}

	return false;
}
