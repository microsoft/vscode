/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHTMLElement } from '../../../../base/browser/dom.js';
import { Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions, IModalEditorPartOptions } from '../../../../platform/editor/common/editor.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { BrowserViewEditorId } from '../../../../workbench/contrib/browserView/common/browserView.js';
import { getEditorOverrideForChatResource } from '../../../../workbench/contrib/chat/browser/widget/chatEditorAssociations.js';
import { IChatRequestVariableEntry, toFileVariableEntry, toPasteVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorGroup, IEditorGroupsService, IModalEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, MODAL_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { SessionReviewHasSelectionContext, SessionReviewSectionContext, SessionReviewVisibleContext } from '../../../common/contextkeys.js';
import { ISessionInputDraftService } from '../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionWorkTrackingService } from '../../../services/sessions/browser/sessionWorkTrackingService.js';
import { ISessionReviewSelection, ISessionReviewService } from '../../../services/sessions/browser/sessionReviewService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, IGitHubPullRequestRef, ISession, sessionHasChanges } from '../../../services/sessions/common/session.js';
import { ISessionReviewState, SessionReviewSection } from '../../../services/sessions/common/sessionReview.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesService } from '../../changes/browser/sessionChangesService.js';
import { OPEN_PULL_REQUEST_REVIEW_ACTION_ID } from '../../github/common/types.js';
import { getArtifactPullRequest, getSessionReviewPullRequests } from '../common/sessionReviewResources.js';
import { SessionReviewEditorInput } from './sessionReviewEditor.js';
import { SessionReviewComposer } from './sessionReviewComposer.js';
import { SessionReviewSidebar } from './sessionReviewSidebar.js';

/** Coordinates native editor opens; it never owns or reparents an editor's DOM. */
export class SessionReviewController extends Disposable implements ISessionReviewService {
	declare readonly _serviceBrand: undefined;
	private readonly _selection = observableValue<ISessionReviewSelection | undefined>(this, undefined);
	readonly selection: IObservable<ISessionReviewSelection | undefined> = this._selection;
	private readonly _section = observableValue<SessionReviewSection | undefined>(this, undefined);
	readonly section: IObservable<SessionReviewSection | undefined> = this._section;
	private readonly _opens = new Sequencer();
	private readonly _openToken = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _selectionListener = this._register(new MutableDisposable());
	private readonly _sending = new ResourceSet();
	private readonly _metadataInputs = this._register(new DisposableMap<SessionReviewSection, SessionReviewEditorInput>());
	private _modal: IModalEditorPart | undefined;
	private _group: IEditorGroup | undefined;
	private _sidebar: SessionReviewSidebar | undefined;
	private _composer: SessionReviewComposer | undefined;
	private _owner: URI | undefined;
	private _shownState: ISessionReviewState | undefined;
	private _lease = 0;
	private _editorStates = new WeakMap<EditorInput, ISessionReviewState>();

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@ISessionInputDraftService private readonly drafts: ISessionInputDraftService,
		@ISessionWorkTrackingService private readonly workTracking: ISessionWorkTrackingService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ISessionChangesService private readonly changesService: ISessionChangesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const visibleKey = SessionReviewVisibleContext.bindTo(contextKeyService);
		const sectionKey = SessionReviewSectionContext.bindTo(contextKeyService);
		const selectionKey = SessionReviewHasSelectionContext.bindTo(contextKeyService);
		this._register(autorun(reader => {
			const state = this.sessionsService.sessionReview.read(reader);
			visibleKey.set(!!state);
			sectionKey.set(this._section.read(reader) ?? state?.section ?? '');
			selectionKey.set(!!state && !!this._selection.read(reader));
		}));
		this._register(autorun(reader => {
			const state = this.sessionsService.sessionReview.read(reader);
			this._openToken.value?.cancel();
			const cts = new CancellationTokenSource();
			this._openToken.value = cts;
			void this._opens.queue(async () => {
				if (cts.token.isCancellationRequested) { return; }
				if (!state) {
					await this._closeGroup(true);
					return;
				}
				await this._show(state, cts.token);
			}).catch(error => {
				if (isCancellationError(error) || this._store.isDisposed) { return; }
				this.logService.error('[SessionReviewController] Failed to open review result', error);
				this.notificationService.error(error);
				if (!this._modal) {
					this._clearOwnedReview();
					this.sessionsService.closeSessionReview();
				}
			});
		}));
		this._register(this.editorService.onDidActiveEditorChange(() => this._updateSelection()));
	}

	private async _show(state: ISessionReviewState, token: CancellationToken): Promise<void> {
		const session = this.sessionsService.visibleSessions.get().find(candidate => candidate && isEqual(candidate.resource, state.sessionResource));
		if (!session || token.isCancellationRequested) { return; }

		let pullRequest: IGitHubPullRequestRef | undefined;
		if (state.section === SessionReviewSection.PullRequest) {
			pullRequest = state.pullRequest ?? (state.artifact && getArtifactPullRequest(state.artifact));
			if (!pullRequest) {
				const references = getSessionReviewPullRequests(session);
				if (references.length > 1) {
					const picked = await this.quickInputService.pick(references.map(reference => ({
						label: reference.title ?? `${reference.owner}/${reference.repo}#${reference.number}`,
						description: reference.uri.toString(),
						reference,
					})), { placeHolder: localize('sessionReview.choosePullRequest', "Choose a pull request to review") }, token);
					if (token.isCancellationRequested) { return; }
					if (!picked) {
						await this._restoreShownReview();
						return;
					}
					pullRequest = picked.reference;
				} else {
					pullRequest = references[0];
				}
			}
			state = { ...state, pullRequest };
		}
		if (this._owner && !isEqual(this._owner, state.sessionResource)) {
			const previousLease = this._lease;
			this._lease++;
			const closed = await this._closeGroup();
			if (!closed) {
				this._lease = previousLease;
				if (!token.isCancellationRequested) {
					await this._restoreShownReview();
				}
				return;
			}
			if (token.isCancellationRequested) { return; }
		}

		const firstOpen = !this._modal;
		if (firstOpen) {
			const existing = this.editorGroupsService.activeModalEditorPart;
			if (existing && !await existing.close()) {
				if (!token.isCancellationRequested) { this.sessionsService.closeSessionReview(); }
				return;
			}
			if (token.isCancellationRequested) { return; }
			this._owner = state.sessionResource;
			const modal = await this.editorGroupsService.createModalEditorPart(this._modalOptions(session, ++this._lease));
			if (token.isCancellationRequested && modal !== this.editorGroupsService.activeModalEditorPart) { return; }
			if (modal !== this.editorGroupsService.activeModalEditorPart || !this._sidebar || !this._composer) {
				throw new Error(localize('sessionReview.modalUnavailable', "The session review could not attach to its native editor window."));
			}
			this._modal = modal;
			this._group = modal.activeGroup;
		}
		if (token.isCancellationRequested || !this._modal) { return; }

		let placeholder: SessionReviewEditorInput | undefined;
		const showMetadata = state.section === SessionReviewSection.Conversation
			|| state.section === SessionReviewSection.Artifacts && !state.artifact && !state.resource
			|| state.section === SessionReviewSection.PullRequest && !pullRequest;
		if (firstOpen || showMetadata) {
			let input = this._metadataInputs.get(state.section);
			if (!input || input.isDisposed()) {
				input = this.instantiationService.createInstance(SessionReviewEditorInput, session.resource, state.section);
				this._metadataInputs.set(state.section, input);
			}
			input.status.set(state.section === SessionReviewSection.PullRequest && !pullRequest
				? localize('sessionReview.noPullRequest', "This session does not have a pull request.")
				: localize('sessionReview.loadingResult', "Opening the session result..."), undefined);
			const pane = await this.editorService.openEditor(input, { pinned: true, transient: true }, MODAL_GROUP);
			if (!pane) {
				if (token.isCancellationRequested) { return; }
				throw new Error(localize('sessionReview.editorUnavailable', "The session review editor could not be opened."));
			}
			if (!this._modal || token.isCancellationRequested) { return; }
			this._group = pane.group;
			this._editorStates.set(input, state);
			this._shownState = state;
			if (showMetadata) {
				this._updateSelection();
				return;
			}
			placeholder = input;
		}
		if (token.isCancellationRequested || !this._group) { return; }
		const previousEditor = this._group.activeEditor;
		try {
			if (state.section === SessionReviewSection.Changes) {
				await this.changesService.openChangesEditor(session.resource, { changesetSelection: { kind: 'id', id: undefined } }, MODAL_GROUP);
			} else if (pullRequest) {
				await this.commandService.executeCommand(OPEN_PULL_REQUEST_REVIEW_ACTION_ID, pullRequest, { pinned: true } satisfies IEditorOptions, MODAL_GROUP);
			} else {
				const resource = state.artifact?.uri ?? state.artifact?.link ?? state.resource;
				if (!resource) {
					throw new Error(localize('sessionReview.noResource', "This artifact does not have a resource to open."));
				}
				const browser = resource.scheme === Schemas.http || resource.scheme === Schemas.https || ['.html', '.htm'].includes(extname(resource).toLowerCase());
				const override = getEditorOverrideForChatResource(resource, this.configurationService) ?? (browser ? BrowserViewEditorId : undefined);
				await this.editorService.openEditor({ resource, options: { pinned: true, override } }, MODAL_GROUP);
			}
		} catch (error) {
			placeholder?.status.set(localize('sessionReview.openFailed', "Could not open this result: {0}", toErrorMessage(error)), undefined);
			throw error;
		}
		if (token.isCancellationRequested || !this._modal) { return; }
		this._group = this._modal.activeGroup;
		const editor = this._group.activeEditor;
		const requestedResource = state.artifact?.uri ?? state.artifact?.link ?? pullRequest?.uri ?? state.resource;
		if (editor === previousEditor && !isEqual(editor?.resource, requestedResource)) {
			placeholder?.status.set(localize('sessionReview.noResultOpened', "No result was opened. Choose another result or try again."), undefined);
			return;
		}
		if (editor) { this._editorStates.set(editor, state); }
		this._shownState = state;
		if (placeholder && editor !== placeholder) {
			await this.editorService.closeEditor({ editor: placeholder, groupId: this._group.id }, { preserveFocus: true });
		}
		this._updateSelection();
	}

	private async _restoreShownReview(): Promise<void> {
		const previous = this._shownState;
		const session = previous && this.sessionsService.visibleSessions.get().find(candidate => candidate && isEqual(candidate.resource, previous.sessionResource));
		if (previous && session) {
			await this.sessionsService.openSessionReview(session, previous.section, { artifact: previous.artifact, pullRequest: previous.pullRequest, resource: previous.resource });
		} else {
			this.sessionsService.closeSessionReview();
		}
	}

	private _modalOptions(session: IActiveSession, lease: number): IModalEditorPartOptions {
		return {
			sidebar: {
				placement: 'left',
				sidebarWidth: 240,
				sidebarHidden: false,
				render: (container, onDidLayout, contextKeyService) => {
					if (!isHTMLElement(container)) { throw new Error('Expected a native modal sidebar container'); }
					const store = new DisposableStore();
					const instantiation = store.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
					const sidebar = store.add(instantiation.createInstance(SessionReviewSidebar, container, onDidLayout, session));
					this._sidebar = sidebar;
					return store;
				},
			},
			contentFooter: {
				height: 220,
				render: (container, onDidLayout, contextKeyService) => {
					if (!isHTMLElement(container)) { throw new Error('Expected a native modal content footer container'); }
					const store = new DisposableStore();
					const instantiation = store.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
					this._composer = store.add(instantiation.createInstance(SessionReviewComposer, container, onDidLayout, session));
					store.add(toDisposable(() => {
						if (this._lease === lease) {
							this._clearOwnedReview();
							this.sessionsService.closeSessionReview();
						}
					}));
					return store;
				},
			},
		};
	}

	private _updateSelection(): void {
		this._selectionListener.clear();
		this._group = this._modal?.activeGroup;
		const editor = this._group?.activeEditor;
		let state = editor && this._editorStates.get(editor);
		if (editor?.resource && !state && this._owner) {
			state = editor instanceof SessionReviewEditorInput
				? { sessionResource: editor.sessionResource, section: editor.section }
				: { sessionResource: this._owner, section: SessionReviewSection.Artifacts, resource: editor.resource };
			this._editorStates.set(editor, state);
		}
		if (!editor || !state || !isEqual(state.sessionResource, this._owner)) {
			this._selection.set(undefined, undefined);
			return;
		}
		const resource = state.artifact?.uri ?? state.artifact?.link ?? state.pullRequest?.uri ?? editor.resource;
		const section = state.section;
		const sessionResource = state.sessionResource;
		this._shownState = state;
		this._selectionListener.value = autorun(reader => {
			const session = this.sessionsService.visibleSessions.read(reader).find(session => session && isEqual(session.resource, sessionResource));
			const emptyChanges = section === SessionReviewSection.Changes && (!session || !sessionHasChanges(session, reader));
			transaction(tx => {
				this._section.set(section, tx);
				this._selection.set(resource && !emptyChanges && !(editor instanceof SessionReviewEditorInput)
					? { resource, label: editor.getName() }
					: undefined, tx);
			});
		});
	}

	async close(): Promise<boolean> {
		this._openToken.value?.cancel();
		return this._opens.queue(async () => {
			const closed = await this._closeGroup();
			if (closed) { this.sessionsService.closeSessionReview(); }
			return closed;
		});
	}

	private async _closeGroup(preserveEditors = false): Promise<boolean> {
		const modal = this._modal;
		if (!modal) { return true; }
		if (preserveEditors) {
			for (const group of modal.groups) {
				await this.editorService.closeEditors(group.editors.filter(editor => editor instanceof SessionReviewEditorInput).map(editor => ({ editor, groupId: group.id })), { preserveFocus: true });
			}
		}
		const closed = modal === this.editorGroupsService.activeModalEditorPart
			? await modal.close({ mergeAllEditorsToMainPart: preserveEditors })
			: true;
		if (closed) {
			this._clearOwnedReview();
		}
		return closed;
	}

	private _clearOwnedReview(): void {
		this._selectionListener.clear();
		this._modal = undefined;
		this._group = undefined;
		this._owner = undefined;
		this._shownState = undefined;
		this._sidebar = undefined;
		this._composer = undefined;
		this._metadataInputs.clearAndDisposeAll();
		this._editorStates = new WeakMap();
		transaction(tx => {
			this._selection.set(undefined, tx);
			this._section.set(undefined, tx);
		});
	}

	discuss(): void {
		const state = this.sessionsService.sessionReview.get();
		const session = this.sessionsService.activeSession.get();
		if (!state || !session || !isEqual(session.resource, state.sessionResource)) { return; }
		const chat = session.activeChat.get();
		const editor = this._group?.activeEditor;
		const metadata = editor && this._editorStates.get(editor);
		if (!editor || !metadata) { return; }
		const attachments: IChatRequestVariableEntry[] = [];
		if (metadata.section === SessionReviewSection.Changes) {
			const defaultChangeset = session.changesets.get()?.find(changeset => changeset.isDefault.get());
			const changes = defaultChangeset?.changes.get() ?? session.changes.get();
			const control = this.editorService.activeEditorPane?.group.id === this._group?.id ? getCodeEditor(this.editorService.activeTextEditorControl) : null;
			const selected = control?.getModel()?.uri;
			const matching = selected && changes.find(change => isEqual(change.modifiedUri, selected) || isEqual(change.originalUri, selected) || isIChatSessionFileChange2(change) && isEqual(change.uri, selected));
			if (matching) {
				attachments.push(toFileVariableEntry(isIChatSessionFileChange2(matching) ? matching.uri : matching.modifiedUri, control?.getSelection() ?? undefined));
			} else {
				attachments.push(...changes.map(change => toFileVariableEntry(isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri)));
			}
		} else {
			const resource = metadata.artifact?.uri ?? metadata.artifact?.link ?? metadata.pullRequest?.uri ?? editor.resource;
			if (resource) {
				attachments.push(resource.scheme === Schemas.http || resource.scheme === Schemas.https
					? toPasteVariableEntry(editor.getName(), resource.toString(), { id: `session-review:${resource.toString()}`, icon: metadata.section === SessionReviewSection.PullRequest ? Codicon.gitPullRequest : Codicon.link })
					: toFileVariableEntry(resource));
			}
		}
		if (!attachments.length) {
			this.notificationService.info(localize('sessionReview.selectResult', "Select a result to discuss with this session."));
			return;
		}
		this.drafts.addAttachments(chat.resource, attachments);
		this.focusReply();
	}

	async send(session: ISession, chat: IChat, query: string, attachments: readonly IChatRequestVariableEntry[]): Promise<boolean> {
		this._assertCanReply(session, chat);
		if (!query.trim()) { return false; }
		if (this._sending.has(chat.resource)) {
			throw new Error(localize('sessionReview.alreadySending', "A reply is already being prepared for this chat."));
		}
		const attachedContext = [...attachments];
		this._sending.add(chat.resource);
		try {
			if (!await this.sessionsService.canOpenSession(session)) { return false; }
			this._assertCanReply(session, chat);
			await this.managementService.sendRequest(session, chat, { query, attachedContext });
			this.workTracking.markOpened(session.resource);
			return true;
		} finally {
			this._sending.delete(chat.resource);
		}
	}

	private _assertCanReply(session: ISession, chat: IChat): void {
		if (!isEqual(session.mainChat.get().resource, chat.resource) && !session.chats.get().some(candidate => isEqual(candidate.resource, chat.resource))) {
			throw new Error(localize('sessionReview.chatChanged', "This chat no longer belongs to the selected session."));
		}
		if (this.entitlementService.sentiment.hidden || session.isArchived.get() || chat.interactivity.get() !== ChatInteractivity.Full) {
			throw new Error(localize('sessionReview.readOnly', "This chat is not available for replies."));
		}
	}

	focusReply(): void { this._composer?.focus(); }

	override dispose(): void {
		this._openToken.value?.cancel();
		super.dispose();
	}
}

registerSingleton(ISessionReviewService, SessionReviewController, InstantiationType.Delayed);
