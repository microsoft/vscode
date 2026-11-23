/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { chatSessionAttentionRegistry, IChatDraftRequestService, IChatInputSuggestion, IChatInputSuggestionService, IChatSessionAnnotationService, IChatSessionAttentionService, IChatSessionContentRef, IChatSessionObserverService, IChatSessionTranscript } from '../../contrib/chat/common/sessionObserver/chatSessionObserver.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ILinkPresentationService } from '../../../platform/dataChannel/common/dataChannel.js';
import { IMarkdownRendererService } from '../../../platform/markdown/browser/markdownRenderer.js';
import { ChatConfiguration } from '../../contrib/chat/common/constants.js';
import { decoratesAsRichLink } from '../../contrib/chat/browser/widget/chatContentParts/chatMarkdownDecorationsRenderer.js';
import { getChatRichLinkTooltip } from '../../contrib/chat/browser/widget/chatContentParts/chatRichLink.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatSessionObserverShape, ExtHostContext, IChatSessionAnnotationDto, MainContext, MainThreadChatSessionObserverShape } from '../common/extHost.protocol.js';

/**
 * Proposed APIs `chatSessionObserver`, `chatInputSuggestion` and `chatDraftRequests`: the
 * session event log, ghost-text suggestions and drafts, for one extension host.
 */
@extHostNamedCustomer(MainContext.MainThreadChatSessionObserver)
export class MainThreadChatSessionObserver extends Disposable implements MainThreadChatSessionObserverShape {

	private readonly proxy: ExtHostChatSessionObserverShape;
	private readonly observations = this._register(new DisposableMap<number, IChatSessionTranscript>());
	private readonly observationListeners = this._register(new DisposableMap<number, DisposableStore>());
	private listening = false;
	/** Suggestions and drafts are owned per extension host; the owner id keeps hosts apart. */
	private readonly owner: string;
	private readonly drafts = new Set<string>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatSessionObserverService private readonly observer: IChatSessionObserverService,
		@IChatInputSuggestionService private readonly suggestions: IChatInputSuggestionService,
		@IChatDraftRequestService private readonly draftService: IChatDraftRequestService,
		@IChatSessionAnnotationService private readonly annotations: IChatSessionAnnotationService,
		@IChatSessionAttentionService private readonly attention: IChatSessionAttentionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILinkPresentationService private readonly linkPresentationService: ILinkPresentationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatSessionObserver);
		this.owner = `exthost:${extHostContext.extensionHostKind}:${Math.random().toString(36).slice(2)}`;
		this._register(this.suggestions.onDidChangeSuggestionState(e => {
			if (e.owner === this.owner) {
				this.proxy.$onDidChangeChatInputSuggestion(e);
			}
		}));
		this._register(this.suggestions.onDidSubmitRequest(e => {
			this.proxy.$onDidSubmitChatRequest({
				...e,
				...(e.fromSuggestion && e.fromSuggestion.owner !== this.owner ? { fromSuggestion: undefined } : {}),
				...(e.fromDraft && e.fromDraft.owner !== this.owner ? { fromDraft: undefined } : {}),
			});
		}));
		this._register(this.draftService.onDidChangeDraftState(e => {
			if (e.draft.owner === this.owner) {
				this.proxy.$onDidChangeDraftState(e.draft.id, e.state, e.host);
			}
		}));
		this._register(this.draftService.onDidResolveDraft(e => {
			if (e.draft.owner === this.owner) {
				this.drafts.delete(e.draft.id);
				this.proxy.$onDidResolveDraft(e.draft.id, { outcome: e.outcome, edited: e.edited, ...(e.finalText !== undefined ? { finalText: e.finalText } : {}), ...(e.reason ? { reason: e.reason } : {}), ...(e.requestId ? { requestId: e.requestId } : {}) });
			}
		}));
	}

	async $startListening() {
		if (!this.listening) {
			this.listening = true;
			this._register(this.observer.onDidChangeSessions(e => this.proxy.$onDidChangeChatSessions(e)));
			this._register(this.observer.onDidChangeActiveSessions(a => this.proxy.$onDidChangeActiveChatSessions([...a])));
		}
		return [...this.observer.activeSessions];
	}

	async $getChatSessions(activeSince: number | undefined) {
		return [...await this.observer.getSessions(activeSince)];
	}

	async $observeChatSession(handle: number, resource: UriComponents, fromSeq: number | undefined) {
		const t = await this.observer.observe(URI.revive(resource));
		this.observations.set(handle, t);
		const store = new DisposableStore();
		store.add(t.onDidAppend(events => this.proxy.$onDidAppend(handle, [...events])));
		store.add(t.onDidChangeInfo(info => this.proxy.$onDidChangeInfo(handle, info)));
		this.observationListeners.set(handle, store);
		const events = fromSeq ? t.events.filter(e => e.seq > fromSeq) : t.events;
		return { info: t.info, events: [...events] };
	}

	$disposeObservation(handle: number): void {
		this.observationListeners.deleteAndDispose(handle);
		this.observations.deleteAndDispose(handle);
	}

	async $fetchContent(handle: number, ref: IChatSessionContentRef): Promise<string> {
		return this.observations.get(handle)?.fetchContent(ref) ?? '';
	}

	$openChatSession(resource: UriComponents): Promise<void> {
		return this.observer.openSession(URI.revive(resource));
	}

	$revealChatSessionEvent(resource: UriComponents, eventId: string): Promise<void> {
		return this.observer.revealEvent(URI.revive(resource), eventId);
	}

	$revealChatSessionPromptAt(resource: UriComponents, timestamp: number): Promise<void> {
		return this.observer.revealPromptAt(URI.revive(resource), timestamp);
	}

	$openChatSessionEditDiff(resource: UriComponents, eventId: string): Promise<void> {
		return this.observer.openEditDiff(URI.revive(resource), eventId);
	}

	async $setChatInputSuggestion(resource: UriComponents, suggestion: IChatInputSuggestion | undefined): Promise<boolean> {
		return this.suggestions.setSuggestion(this.owner, URI.revive(resource), suggestion);
	}

	$setChatSessionAnnotations(resource: UriComponents, annotations: IChatSessionAnnotationDto[]): void {
		this.annotations.setAnnotations(this.owner, URI.revive(resource), annotations.map(a => ({
			id: a.id, timestamp: a.timestamp, label: a.label,
			...(a.detail ? { detail: a.detail } : {}),
			...(a.icon ? { icon: ThemeIcon.fromId(a.icon) } : {}),
		})));
	}

	async $getChatLinkTooltips(hrefs: string[]): Promise<string[]> {
		const richLinks = this.configurationService.getValue<boolean>(ChatConfiguration.RichLinks) === true;
		return Promise.all(hrefs.map(async href => {
			// The transcript's own two paths: a rich link's presentation, else the title its markdown renderer gives the link.
			if (decoratesAsRichLink(href, richLinks)) {
				const tooltip = await getChatRichLinkTooltip(this.linkPresentationService, href, 2000, CancellationToken.None);
				if (tooltip !== undefined) {
					return tooltip;
				}
			}
			const rendered = this.markdownRendererService.render(new MarkdownString(`[link](<${href}>)`));
			try {
				// eslint-disable-next-line eslint-js/no-restricted-syntax
				return rendered.element.querySelector('a')?.getAttribute('title') ?? '';
			} finally {
				rendered.dispose();
			}
		}));
	}

	$setChatSessionAttention(resource: UriComponents, attention: { icon: string; tooltip: string } | undefined): void {
		chatSessionAttentionRegistry.set(this.owner, URI.revive(resource), attention && { icon: ThemeIcon.fromId(attention.icon), tooltip: attention.tooltip });
	}

	async $notifyChatSession(resource: UriComponents, notification: { title?: string; body: string }, handle: number): Promise<{ shown: boolean; reason?: 'windowFocused' | 'off' }> {
		const result = await this.attention.notify(this.owner, URI.revive(resource), notification);
		if (result.shown) {
			result.clicked.then(clicked => this.proxy.$onDidSettleChatSessionNotification(handle, clicked), () => this.proxy.$onDidSettleChatSessionNotification(handle, false));
		}
		return { shown: result.shown, ...(result.reason ? { reason: result.reason } : {}) };
	}

	$addChatDraftRequest(resource: UriComponents, draft: { id: string; text: string; label: string; detail?: string; warning?: string }): void {
		this.drafts.add(draft.id);
		this.draftService.setDraft({ ...draft, owner: this.owner, session: URI.revive(resource), createdAt: Date.now() });
	}

	$updateChatDraftRequest(id: string, patch: { text?: string; label?: string; detail?: string; warning?: string }): void {
		this.draftService.updateDraft(id, patch);
	}

	$disposeChatDraftRequest(id: string): void {
		if (this.drafts.delete(id)) {
			this.draftService.resolveDraft(id, 'expired', { reason: 'withdrawn' });
		}
	}

	override dispose(): void {
		this.annotations.clearOwner(this.owner);
		chatSessionAttentionRegistry.clearOwner(this.owner);
		this.attention.clearOwner(this.owner);
		for (const id of [...this.drafts]) {
			this.draftService.resolveDraft(id, 'expired', { reason: 'extension_host_ended' });
		}
		super.dispose();
	}
}
