/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChatEditorInput_1;
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
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../../../platform/theme/common/iconRegistry.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatEditorTitleMaxLength } from '../../../common/constants.js';
import { LocalChatSessionUri, getChatSessionType } from '../../../common/model/chatUri.js';
const ChatEditorIcon = registerIcon('chat-editor-label-icon', Codicon.chatSparkle, nls.localize('chatEditorLabelIcon', 'Icon of the chat editor label.'));
let ChatEditorInput = class ChatEditorInput extends EditorInput {
    static { ChatEditorInput_1 = this; }
    static { this.TypeID = 'workbench.input.chatSession'; }
    static { this.EditorID = 'workbench.editor.chatSession'; }
    /**
     * Get the uri of the session this editor input is associated with.
     *
     * This should be preferred over using `resource` directly, as it handles cases where a chat editor becomes a session
     */
    get sessionResource() { return this._sessionResource; }
    get model() {
        return this.modelRef.value?.object;
    }
    static getNewEditorUri() {
        return ChatEditorUri.getNewEditorUri();
    }
    constructor(resource, options, chatService, dialogService, chatSessionsService, instantiationService) {
        super();
        this.resource = resource;
        this.options = options;
        this.chatService = chatService;
        this.dialogService = dialogService;
        this.chatSessionsService = chatSessionsService;
        this.instantiationService = instantiationService;
        this.didTransferOutEditingSession = false;
        this.modelRef = this._register(new MutableDisposable());
        this.closeHandler = this;
        if (resource.scheme === Schemas.vscodeChatEditor) {
            const parsed = ChatEditorUri.parse(resource);
            if (!parsed || typeof parsed !== 'number') {
                throw new Error('Invalid chat URI');
            }
        }
        else if (resource.scheme === Schemas.vscodeLocalChatSession) {
            const localSessionId = LocalChatSessionUri.parseLocalSessionId(resource);
            if (!localSessionId) {
                throw new Error('Invalid local chat session URI');
            }
            this._sessionResource = resource;
        }
        else {
            this._sessionResource = resource;
        }
    }
    showConfirm() {
        return !!(this.model && shouldShowClearEditingSessionConfirmation(this.model));
    }
    transferOutEditingSession() {
        this.didTransferOutEditingSession = true;
        return this.model?.editingSession;
    }
    async confirm(editors) {
        if (!this.model?.editingSession || this.didTransferOutEditingSession || this.getSessionType() !== localChatSessionType) {
            return 0 /* ConfirmResult.SAVE */;
        }
        const titleOverride = nls.localize('chatEditorConfirmTitle', "Close Chat Editor");
        const messageOverride = nls.localize('chat.startEditing.confirmation.pending.message.default', "Closing the chat editor will end your current edit session.");
        const result = await showClearEditingSessionConfirmation(this.model, this.dialogService, { titleOverride, messageOverride });
        return result ? 0 /* ConfirmResult.SAVE */ : 2 /* ConfirmResult.CANCEL */;
    }
    get editorId() {
        return ChatEditorInput_1.EditorID;
    }
    get capabilities() {
        return super.capabilities | 1024 /* EditorInputCapabilities.ForceReveal */ | 128 /* EditorInputCapabilities.CanDropIntoEditor */;
    }
    copy() {
        return this.instantiationService.createInstance(ChatEditorInput_1, ChatEditorInput_1.getNewEditorUri(), {});
    }
    matches(otherInput) {
        if (!(otherInput instanceof ChatEditorInput_1)) {
            return false;
        }
        return isEqual(this.sessionResource, otherInput.sessionResource);
    }
    get typeId() {
        return ChatEditorInput_1.TypeID;
    }
    getName() {
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
    getTitle(verbosity) {
        const name = this.getName();
        if (verbosity === 2 /* Verbosity.LONG */) { // Verbosity LONG is used for tooltips
            const sessionTypeDisplayName = this.getSessionTypeDisplayName();
            if (sessionTypeDisplayName) {
                return `${name} | ${sessionTypeDisplayName}`;
            }
        }
        return name;
    }
    getSessionTypeDisplayName() {
        const sessionType = this.getSessionType();
        if (sessionType === localChatSessionType) {
            return;
        }
        const contributions = this.chatSessionsService.getAllChatSessionContributions();
        const contribution = contributions.find(c => c.type === sessionType);
        return contribution?.displayName;
    }
    getIcon() {
        const resolvedIcon = this.resolveIcon();
        if (resolvedIcon) {
            this.cachedIcon = resolvedIcon;
            return resolvedIcon;
        }
        // Fall back to default icon
        return ChatEditorIcon;
    }
    resolveIcon() {
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
    getSessionType() {
        return getChatSessionType(this.resource);
    }
    async resolve() {
        const searchParams = new URLSearchParams(this.resource.query);
        const chatSessionType = searchParams.get('chatSessionType');
        const inputType = chatSessionType ?? this.resource.authority;
        if (this._sessionResource) {
            this.modelRef.value = await this.chatService.acquireOrLoadSession(this._sessionResource, ChatAgentLocation.Chat, CancellationToken.None, 'ChatEditorInput#resolve');
            // For local session only, if we find no existing session, create a new one
            if (!this.model && LocalChatSessionUri.parseLocalSessionId(this._sessionResource)) {
                this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: true, debugOwner: 'ChatEditorInput#resolveNewLocalSession' });
            }
        }
        else if (!this.options.target) {
            this.modelRef.value = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { canUseTools: !inputType, debugOwner: 'ChatEditorInput#resolveUntitled' });
        }
        else if (this.options.target.data) {
            this.modelRef.value = this.chatService.loadSessionFromData(this.options.target.data, 'ChatEditorInput#resolveImportedData');
        }
        if (!this.model || this.isDisposed()) {
            return null;
        }
        this._sessionResource = this.model.sessionResource;
        this._register(this.model.onDidChange((e) => {
            // Invalidate icon cache when label changes
            this.cachedIcon = undefined;
            this._onDidChangeLabel.fire();
        }));
        // Check if icon has changed after model resolution
        const newIcon = this.resolveIcon();
        if (newIcon && (!this.cachedIcon || !this.iconsEqual(this.cachedIcon, newIcon))) {
            this.cachedIcon = newIcon;
        }
        this._onDidChangeLabel.fire();
        return this._register(new ChatEditorModel(this.model));
    }
    iconsEqual(a, b) {
        if (ThemeIcon.isThemeIcon(a) && ThemeIcon.isThemeIcon(b)) {
            return a.id === b.id;
        }
        if (a instanceof URI && b instanceof URI) {
            return a.toString() === b.toString();
        }
        return false;
    }
};
ChatEditorInput = ChatEditorInput_1 = __decorate([
    __param(2, IChatService),
    __param(3, IDialogService),
    __param(4, IChatSessionsService),
    __param(5, IInstantiationService)
], ChatEditorInput);
export { ChatEditorInput };
export class ChatEditorModel extends Disposable {
    constructor(model) {
        super();
        this.model = model;
        this._isResolved = false;
    }
    async resolve() {
        this._isResolved = true;
    }
    isResolved() {
        return this._isResolved;
    }
    isDisposed() {
        return this._store.isDisposed;
    }
}
var ChatEditorUri;
(function (ChatEditorUri) {
    const scheme = Schemas.vscodeChatEditor;
    function getNewEditorUri() {
        const handle = Math.floor(Math.random() * 1e9);
        return URI.from({ scheme, path: `chat-${handle}` });
    }
    ChatEditorUri.getNewEditorUri = getNewEditorUri;
    function parse(resource) {
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
    ChatEditorUri.parse = parse;
})(ChatEditorUri || (ChatEditorUri = {}));
export class ChatEditorInputSerializer {
    canSerialize(input) {
        return input instanceof ChatEditorInput && !!input.sessionResource;
    }
    serialize(input) {
        if (!this.canSerialize(input)) {
            return undefined;
        }
        const obj = {
            options: input.options,
            sessionResource: input.sessionResource,
            resource: input.resource,
        };
        return JSON.stringify(obj);
    }
    deserialize(instantiationService, serializedEditor) {
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
        }
        catch (err) {
            return undefined;
        }
    }
}
export async function showClearEditingSessionConfirmation(model, dialogService, options) {
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
                    await model.editingSession.accept();
                    return true;
                }
            },
            {
                label: nls.localize('chat.startEditing.confirmation.discardEdits', "Undo & Continue"),
                run: async () => {
                    await model.editingSession.reject();
                    return true;
                }
            }
        ],
    });
    return Boolean(result);
}
/** Returns the number of files in the  model's modifications that need a prompt before saving */
export function shouldShowClearEditingSessionConfirmation(model, options) {
    if (!model.editingSession || (model.willKeepAlive && !options?.isArchiveAction)) {
        return 0; // safe to dispose without confirmation
    }
    const currentEdits = model.editingSession.entries.get();
    const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === 0 /* ModifiedFileEntryState.Modified */);
    return undecidedEdits.length;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRvcklucHV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0YsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxLQUFLLEdBQUcsTUFBTSwwQkFBMEIsQ0FBQztBQUNoRCxPQUFPLEVBQWlCLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUV2RixPQUFPLEVBQUUsV0FBVyxFQUF1QixNQUFNLDZDQUE2QyxDQUFDO0FBQy9GLE9BQU8sRUFBdUIsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDL0YsT0FBTyxF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