/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { truncate } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { ConfirmResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IEditorIdentifier, IEditorSerializer, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput, IEditorCloseHandler } from '../../../common/editor/editorInput.js';
import { IChatEditingSession, ModifiedFileEntryState } from '../common/chatEditingService.js';
import { IChatModel } from '../common/chatModel.js';
import { IChatService } from '../common/chatService.js';
import { ChatAgentLocation, ChatEditorTitleMaxLength } from '../common/constants.js';
import { IClearEditingSessionConfirmationOptions } from './actions/chatActions.js';
import type { IChatEditorOptions } from './chatEditor.js';

const ChatEditorIcon = registerIcon('chat-editor-label-icon', Codicon.chatSparkle, nls.localize('chatEditorLabelIcon', 'Icon of the chat editor label.'));

export class ChatEditorInput extends EditorInput implements IEditorCloseHandler {
	/** Maps input name strings to sets of active editor counts */
	static readonly countsInUseMap = new Map<string, Set<number>>();

	static readonly TypeID: string = 'workbench.input.chatSession';
	static readonly EditorID: string = 'workbench.editor.chatSession';

	private readonly inputCount: number;
	private readonly inputName: string;

	public sessionId: string | undefined;
	private hasCustomTitle: boolean = false;

	private model: IChatModel | undefined;

	static getNewEditorUri(): URI {
		const handle = Math.floor(Math.random() * 1e9);
		return ChatEditorUri.generate(handle);
	}

	static getNextCount(inputName: string): number {
		let count = 0;
		while (ChatEditorInput.countsInUseMap.get(inputName)?.has(count)) {
			count++;
		}

		return count;
	}

	constructor(
		readonly resource: URI,
		readonly options: IChatEditorOptions,
		@IChatService private readonly chatService: IChatService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		super();

		if (resource.scheme === Schemas.vscodeChatEditor) {
			const parsed = ChatEditorUri.parse(resource);
			if (!parsed || typeof parsed !== 'number') {
				throw new Error('Invalid chat URI');
			}
		} else if (resource.scheme !== Schemas.vscodeChatSession) {
			throw new Error('Invalid chat URI');
		}

		this.sessionId = (options.target && 'sessionId' in options.target) ?
			options.target.sessionId :
			undefined;

		// Check if we already have a custom title for this session
		const hasExistingCustomTitle = this.sessionId && (
			this.chatService.getSession(this.sessionId)?.title ||
			this.chatService.getPersistedSessionTitle(this.sessionId)?.trim()
		);

		this.hasCustomTitle = Boolean(hasExistingCustomTitle);

		// Input counts are unique to the displayed fallback title
		this.inputName = options.title?.fallback ?? '';
		if (!ChatEditorInput.countsInUseMap.has(this.inputName)) {
			ChatEditorInput.countsInUseMap.set(this.inputName, new Set());
		}

		// Only allocate a count if we don't already have a custom title
		if (!this.hasCustomTitle) {
			this.inputCount = ChatEditorInput.getNextCount(this.inputName);
			ChatEditorInput.countsInUseMap.get(this.inputName)?.add(this.inputCount);
			this._register(toDisposable(() => {
				// Only remove if we haven't already removed it due to custom title
				if (!this.hasCustomTitle) {
					ChatEditorInput.countsInUseMap.get(this.inputName)?.delete(this.inputCount);
					if (ChatEditorInput.countsInUseMap.get(this.inputName)?.size === 0) {
						ChatEditorInput.countsInUseMap.delete(this.inputName);
					}
				}
			}));
		} else {
			this.inputCount = 0; // Not used when we have a custom title
		}
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
		if (!(otherInput instanceof ChatEditorInput)) {
			return false;
		}

		if (this.resource.scheme === Schemas.vscodeChatSession) {
			return isEqual(this.resource, otherInput.resource);
		}

		if (this.resource.scheme === Schemas.vscodeChatEditor && otherInput.resource.scheme === Schemas.vscodeChatEditor) {
			return this.sessionId === otherInput.sessionId;
		}

		return false;
	}

	override get typeId(): string {
		return ChatEditorInput.TypeID;
	}

	override getName(): string {
		// If we have a resolved model, use its title
		if (this.model?.title) {
			// Only truncate if the default title is being used (don't truncate custom titles)
			return this.model.hasCustomTitle ? this.model.title : truncate(this.model.title, ChatEditorTitleMaxLength);
		}

		// If we have a sessionId but no resolved model, try to get the title from persisted sessions
		if (this.sessionId) {
			// First try the active session registry
			const existingSession = this.chatService.getSession(this.sessionId);
			if (existingSession?.title) {
				return existingSession.title;
			}

			// If not in active registry, try persisted session data
			const persistedTitle = this.chatService.getPersistedSessionTitle(this.sessionId);
			if (persistedTitle && persistedTitle.trim()) { // Only use non-empty persisted titles
				return persistedTitle;
			}
		}

		// Fall back to default naming pattern
		const inputCountSuffix = (this.inputCount > 0 ? ` ${this.inputCount + 1}` : '');
		const defaultName = this.options.title?.fallback ?? nls.localize('chatEditorName', "Chat");
		return defaultName + inputCountSuffix;
	}

	override getIcon(): ThemeIcon {
		return ChatEditorIcon;
	}

	override async resolve(): Promise<ChatEditorModel | null> {
		const searchParams = new URLSearchParams(this.resource.query);
		const chatSessionType = searchParams.get('chatSessionType');
		const inputType = chatSessionType ?? this.resource.authority;
		if (this.resource.scheme === Schemas.vscodeChatSession) {
			this.model = await this.chatService.loadSessionForResource(this.resource, ChatAgentLocation.Chat, CancellationToken.None);
		} else if (typeof this.sessionId === 'string') {
			this.model = await this.chatService.getOrRestoreSession(this.sessionId)
				?? this.chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None, undefined, inputType);
		} else if (!this.options.target) {
			this.model = this.chatService.startSession(ChatAgentLocation.Chat, CancellationToken.None, undefined, inputType);
		} else if ('data' in this.options.target) {
			this.model = this.chatService.loadSessionFromContent(this.options.target.data);
		}

		if (!this.model || this.isDisposed()) {
			return null;
		}

		this.sessionId = this.model.sessionId;
		this._register(this.model.onDidChange((e) => {
			// When a custom title is set, we no longer need the numeric count
			if (e && e.kind === 'setCustomTitle' && !this.hasCustomTitle) {
				this.hasCustomTitle = true;
				ChatEditorInput.countsInUseMap.get(this.inputName)?.delete(this.inputCount);
				if (ChatEditorInput.countsInUseMap.get(this.inputName)?.size === 0) {
					ChatEditorInput.countsInUseMap.delete(this.inputName);
				}
			}
			this._onDidChangeLabel.fire();
		}));

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


export namespace ChatEditorUri {

	export const scheme = Schemas.vscodeChatEditor;

	export function generate(handle: number): URI {
		return URI.from({ scheme, path: `chat-${handle}` });
	}

	export function parse(resource: URI): number | undefined {
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

		return handle;
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
