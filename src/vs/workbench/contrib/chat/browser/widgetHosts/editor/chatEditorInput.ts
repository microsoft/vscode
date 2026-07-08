/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../../base/common/marshalling.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { truncate } from '../../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import * as nls from '../../../../../../nls.js';
import { ConfirmResult, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { registerIcon } from '../../../../../../platform/theme/common/iconRegistry.js';
import { EditorInputCapabilities, IEditorIdentifier, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../../../common/editor.js';
import { EditorInput, IEditorCloseHandler } from '../../../../../common/editor/editorInput.js';
import { IChatModelReference, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatEditorTitleMaxLength, getComputedDefaultSessionResource, getComputedDefaultSessionType, getDefaultNewChatSessionResource } from '../../../common/constants.js';
import { IChatEditingSession, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { LocalChatSessionUri, getChatSessionType, isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IClearEditingSessionConfirmationOptions } from '../../actions/chatActions.js';
import type { IChatEditorOptions } from './chatEditor.js';

const ChatEditorIcon = registerIcon('chat-editor-label-icon', Codicon.chatSparkle, nls.localize('chatEditorLabelIcon', 'Icon of the chat editor label.'));

export class ChatEditorInput extends EditorInput implements IEditorCloseHandler {
	static readonly TypeID: string = 'workbench.input.chatSession';
	static readonly EditorID: string = 'workbench.editor.chatSession';

	private _sessionResource: URI | undefined;

	/**
	 * Get the uri of the session this editor input is associated with.
	 *
	 * This should be preferred over using `resource` directly, as it handles cases where a chat editor becomes a session
	 */
	public get sessionResource(): URI | undefined { return this._sessionResource; }

	private didTransferOutEditingSession = false;
	private cachedIcon: ThemeIcon | URI | undefined;

	private readonly modelRef = this._register(new MutableDisposable<IChatModelReference>());
	private readonly _modelChangeListener = this._register(new MutableDisposable());

	private get model(): IChatModel | undefined {
		return this.modelRef.value?.object;
	}

	static getNewEditorUri(): URI {
		return ChatEditorUri.getNewEditorUri();
	}

	constructor(
		readonly resource: URI,
		readonly options: IChatEditorOptions,
		@IChatService private readonly chatService: IChatService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		if (resource.scheme === Schemas.vscodeChatEditor) {
			const parsed = ChatEditorUri.parse(resource);
			if (!parsed || typeof parsed !== 'number') {
				throw new Error('Invalid chat URI');
			}
		} else if (resource.scheme === Schemas.vscodeLocalChatSession) {
			const localSessionId = LocalChatSessionUri.parseLocalSessionId(resource);
			if (!localSessionId) {
				throw new Error('Invalid local chat session URI');
			}
			this._sessionResource = resource;
		} else {
			this._sessionResource = resource;
		}
	}

	override closeHandler = this;

	showConfirm(): boolean {
		return !!(this.model && shouldShowClearEditingSessionConfirmation(this.model));
	}

	transferOutEditingSession(): IChatEditingSession | undefined {
		this.didTransferOutEditingSession = true;
		return this.model?.editingSession;
	}

	async confirm(editors: ReadonlyArray<IEditorIdentifier>): Promise<ConfirmResult> {
		if (!this.model?.editingSession || this.didTransferOutEditingSession || this.getSessionType() !== localChatSessionType) {
			return ConfirmResult.SAVE;
		}

		const titleOverride = nls.localize('chatEditorConfirmTitle', "Close Chat Editor");
		const messageOverride = nls.localize('chat.startEditing.confirmation.pending.message.default', "Closing the chat editor will end your current edit session.");
		const result = await showClearEditingSessionConfirmation(this.model, this.dialogService, { titleOverride, messageOverride });
		return result ? ConfirmResult.SAVE : ConfirmResult.CANCEL;
	}

	override get editorId(): string | undefined {
		return ChatEditorInput.EditorID;
	}

	override get capabilities(): EditorInputCapabilities {
		return super.capabilities | EditorInputCapabilities.ForceReveal | EditorInputCapabilities.CanDropIntoEditor;
	}

	override copy(): EditorInput {
		return this.instantiationService.createInstance(ChatEditorInput, ChatEditorInput.getNewEditorUri(), {});
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (!(otherInput instanceof ChatEditorInput)) {
			return false;
		}

		return isEqual(this.sessionResource, otherInput.sessionResource);
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
		if (this._sessionResource) {
			// First try the active session registry
			const existingSession = this.chatService.getSession(this._sessionResource);
			if (existingSession?.title) {
				return existingSession.title;
			}

			// If not in active registry, try persisted session data
			const persistedTitle = this.chatService.getSessionTitle(this._sessionResource);
			if (persistedTitle && persistedTitle.trim()) { // Only use non-empty persisted titles
				return persistedTitle;
			}
		}

		// If a preferred title was provided in options, use it
		if (this.options.title?.preferred) {
			return this.options.title.preferred;
		}

		// Fall back to default naming pattern
		return this.options.title?.fallback ?? nls.localize('chatEditorName', "Chat");
	}

	override getTitle(verbosity?: Verbosity): string {
		const name = this.getName();
		if (verbosity === Verbosity.LONG) { // Verbosity LONG is used for tooltips
			const sessionTypeDisplayName = this.getSessionTypeDisplayName();
			if (sessionTypeDisplayName) {
				return `${name} | ${sessionTypeDisplayName}`;
			}
		}
		return name;
	}

	private getSessionTypeDisplayName(): string | undefined {
		const sessionType = this.getSessionType();
		if (sessionType === localChatSessionType) {
			return;
		}
		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		const contribution = contributions.find(c => c.type === sessionType);
		return contribution?.displayName;
	}

	override getIcon(): ThemeIcon | URI | undefined {
		const resolvedIcon = this.resolveIcon();
		if (resolvedIcon) {
			this.cachedIcon = resolvedIcon;
			return resolvedIcon;
		}

		// Fall back to default icon
		return ChatEditorIcon;
	}

	private resolveIcon(): ThemeIcon | URI | undefined {
		// TODO@osortega,@rebornix double check: Chat Session Item icon is reserved for chat session list and deprecated for chat session status. thus here we use session type icon. We may want to show status for the Editor Title.
		const sessionType = this.getSessionType();
		if (sessionType !== localChatSessionType) {
			return this.chatSessionsService.getChatSessionContribution(sessionType)?.icon;
		}

		return undefined;
	}

	/**
	 * Returns chat session type from a URI, or {@linkcode localChatSessionType} if not specified or cannot be determined.
	 */
	public getSessionType(): string {
		return getChatSessionType(this._sessionResource ?? this.resource);
	}

	override async resolve(): Promise<ChatEditorModel | null> {
		const searchParams = new URLSearchParams(this.resource.query);
		const chatSessionType = searchParams.get('chatSessionType');
		const inputType = chatSessionType ?? this.resource.authority;

		if (this._sessionResource) {
			try {
				this.modelRef.value = await this.chatService.acquireOrLoadSession(this._sessionResource, ChatAgentLocation.Chat, CancellationToken.None, 'ChatEditorInput#resolve');
			} catch (error) {
				this.logService.warn(`[ChatEditorInput] Failed to acquire session ${this._sessionResource.toString()}`, error);
			}

			if (!this.model && isUntitledChatSession(this._sessionResource) && getChatSessionType(this._sessionResource) !== localChatSessionType) {
				this.logService.warn(`[ChatEditorInput] Falling back to a local chat session because ${this._sessionResource.toString()} could not be acquired`);
				this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: 'ChatEditorInput#resolveUntitledFallback' });
			}

			if (this.shouldReplaceEmptyLocalSession(this._sessionResource)) {
				const defaultResource = getComputedDefaultSessionResource(this.configurationService, this.chatSessionsService);
				if (getChatSessionType(defaultResource) !== localChatSessionType) {
					let modelRef: IChatModelReference | undefined;
					try {
						modelRef = await this.chatService.acquireOrLoadSession(defaultResource, ChatAgentLocation.Chat, CancellationToken.None, 'ChatEditorInput#resolveDefaultSession');
					} catch (error) {
						this.logService.warn(`[ChatEditorInput] Failed to acquire default session ${defaultResource.toString()}`, error);
					}
					if (modelRef) {
						this._sessionResource = defaultResource;
						this.modelRef.value = modelRef;
					} else {
						this.logService.warn(`[ChatEditorInput] Keeping local chat session because default session ${defaultResource.toString()} could not be acquired`);
					}
				}
			}

			// For local session only, if we find no existing session, create a new one
			if (!this.model && LocalChatSessionUri.parseLocalSessionId(this._sessionResource)) {
				this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: true, debugOwner: 'ChatEditorInput#resolveNewLocalSession' });
			}
		} else if (!this.options.target) {
			if (this.options.explicitSessionType === localChatSessionType) {
				this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: 'ChatEditorInput#resolveExplicitLocal' });
			} else {
				const defaultResource = getDefaultNewChatSessionResource(this.configurationService, this.chatSessionsService, this.storageService);
				if (getChatSessionType(defaultResource) === localChatSessionType) {
					this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: 'ChatEditorInput#resolveUntitled' });
				} else {
					try {
						this.modelRef.value = await this.chatService.acquireOrLoadSession(defaultResource, ChatAgentLocation.Chat, CancellationToken.None, 'ChatEditorInput#resolveDefaultUntitled');
					} catch (error) {
						this.logService.warn(`[ChatEditorInput] Failed to acquire default session ${defaultResource.toString()}`, error);
					}
					if (this.model) {
						this._sessionResource = defaultResource;
					} else {
						this.logService.warn(`[ChatEditorInput] Falling back to a local chat session because ${defaultResource.toString()} could not be acquired`);
						this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: 'ChatEditorInput#resolveUntitledFallback' });
					}
				}
			}
		} else if (this.options.target.data) {
			this.modelRef.value = this.chatService.loadSessionFromData(this.options.target.data, 'ChatEditorInput#resolveImportedData');
		}

		if (!this.model || this.isDisposed()) {
			return null;
		}

		this._sessionResource = this.model.sessionResource;

		this._trackModelChanges();

		// Check if icon has changed after model resolution
		const newIcon = this.resolveIcon();
		if (newIcon && (!this.cachedIcon || !this.iconsEqual(this.cachedIcon, newIcon))) {
			this.cachedIcon = newIcon;
		}

		this._onDidChangeLabel.fire();

		return this._register(new ChatEditorModel(this.model));
	}

	private shouldReplaceEmptyLocalSession(sessionResource: URI): boolean {
		return LocalChatSessionUri.isLocalSession(sessionResource)
			&& this.options.explicitSessionType !== localChatSessionType
			&& !!this.model
			&& !this.model.hasRequests
			&& getComputedDefaultSessionType(this.configurationService, this.chatSessionsService) !== localChatSessionType;
	}

	/**
	 * Updates the editor input to track a new model. Called when the widget swaps
	 * from an untitled session to a real session.
	 */
	updateModel(model: IChatModel): void {
		this._sessionResource = model.sessionResource;
		this.modelRef.value = this.chatService.acquireExistingSession(model.sessionResource, 'ChatEditorInput#updateModel');
		this._trackModelChanges();
		this.cachedIcon = undefined;
		this._onDidChangeLabel.fire();
	}

	private _trackModelChanges(): void {
		if (!this.model) {
			return;
		}
		this._modelChangeListener.value = this.model.onDidChange(() => {
			this.cachedIcon = undefined;
			this._onDidChangeLabel.fire();
		});
	}

	private iconsEqual(a: ThemeIcon | URI, b: ThemeIcon | URI): boolean {
		if (ThemeIcon.isThemeIcon(a) && ThemeIcon.isThemeIcon(b)) {
			return a.id === b.id;
		}
		if (a instanceof URI && b instanceof URI) {
			return a.toString() === b.toString();
		}
		return false;
	}

}

export class ChatEditorModel extends Disposable {
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
		return this._store.isDisposed;
	}
}


namespace ChatEditorUri {

	const scheme = Schemas.vscodeChatEditor;

	export function getNewEditorUri(): URI {
		const handle = Math.floor(Math.random() * 1e9);
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
	readonly options: IChatEditorOptions;
	readonly resource: URI;
	readonly sessionResource: URI | undefined;
}

export class ChatEditorInputSerializer implements IEditorSerializer {
	canSerialize(input: EditorInput): input is ChatEditorInput {
		return input instanceof ChatEditorInput && !!input.sessionResource;
	}

	serialize(input: EditorInput): string | undefined {
		if (!this.canSerialize(input)) {
			return undefined;
		}

		const obj: ISerializedChatEditorInput = {
			options: input.options,
			sessionResource: input.sessionResource,
			resource: input.resource,

		};
		return JSON.stringify(obj);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			// Old inputs have a session id for local session
			// Use revive to properly restore URIs and other special objects in options.target.data
			const parsed = revive(JSON.parse(serializedEditor));

			// First if we have a modern session resource, use that
			if (parsed.sessionResource) {
				const sessionResource = URI.revive(parsed.sessionResource);
				return instantiationService.createInstance(ChatEditorInput, sessionResource, parsed.options);
			}

			// Otherwise check to see if we're a chat editor with a local session id
			let resource = URI.revive(parsed.resource);
			if (resource.scheme === Schemas.vscodeChatEditor && parsed.sessionId) {
				resource = LocalChatSessionUri.forSession(parsed.sessionId);
			}

			return instantiationService.createInstance(ChatEditorInput, resource, parsed.options);
		} catch (err) {
			return undefined;
		}
	}
}

export async function showClearEditingSessionConfirmation(model: IChatModel, dialogService: IDialogService, options?: IClearEditingSessionConfirmationOptions): Promise<boolean> {
	const undecidedEdits = shouldShowClearEditingSessionConfirmation(model, options);
	if (!undecidedEdits) {
		return true; // safe to dispose without confirmation
	}

	const defaultPhrase = nls.localize('chat.startEditing.confirmation.pending.message.default1', "Starting a new chat will end your current edit session.");
	const defaultTitle = nls.localize('chat.startEditing.confirmation.title', "Start new chat?");
	const phrase = options?.messageOverride ?? defaultPhrase;
	const title = options?.titleOverride ?? defaultTitle;

	const { result } = await dialogService.prompt({
		title,
		message: phrase + ' ' + nls.localize('chat.startEditing.confirmation.pending.message.2', "Do you want to keep pending edits to {0} files?", undecidedEdits),
		type: 'info',
		cancelButton: true,
		buttons: [
			{
				label: nls.localize('chat.startEditing.confirmation.acceptEdits', "Keep & Continue"),
				run: async () => {
					await model.editingSession!.accept();
					return true;
				}
			},
			{
				label: nls.localize('chat.startEditing.confirmation.discardEdits', "Undo & Continue"),
				run: async () => {
					await model.editingSession!.reject();
					return true;
				}
			}
		],
	});

	return Boolean(result);
}

/** Returns the number of files in the  model's modifications that need a prompt before saving */
export function shouldShowClearEditingSessionConfirmation(model: IChatModel, options?: IClearEditingSessionConfirmationOptions): number {
	if (!model.editingSession || (model.willKeepAlive && !options?.isArchiveAction)) {
		return 0; // safe to dispose without confirmation
	}

	const currentEdits = model.editingSession.entries.get();
	const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
	return undecidedEdits.length;
}
