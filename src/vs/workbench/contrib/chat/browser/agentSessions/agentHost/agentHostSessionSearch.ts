/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { raceTimeout, RunOnceScheduler } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { escapeIcons } from '../../../../../../base/common/iconLabels.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { AgentSession, IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionInfo, IAgentHostConnectionsService, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { MAX_SESSION_SEARCH_QUERY_LENGTH, getAgentSessionSearchTerms, IAgentSessionSearchMatch } from '../../../../../../platform/agentHost/common/agentHostSessionSearch.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { AGENT_HOST_SCHEME } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { supportsAgentHostSessionSearch } from '../../../../../../platform/agentHost/common/meta/agentHostSessionSearchMeta.js';
import { DEFAULT_CHAT_ID, isSessionStatusArchived, parseChatUri } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService, type IWorkspace } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IEmbeddingsService } from '../../../../../services/embeddings/common/embeddingsService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { CHAT_CATEGORY } from '../../actions/chatActions.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../../chat.js';
import { sessionOpenerRegistry } from '../agentSessionsOpener.js';
import { isAgentHostSessionInWorkspace } from './agentHostSessionListStore.js';
import { ISemanticSessionSearchOptions, MAX_SEMANTIC_SESSION_SEARCH_DOCUMENT_CHUNKS, mergeSessionSearchResults, SemanticSessionSearch, SemanticSessionSearchConsent, SessionSearchMatchSource } from './semanticSessionSearch.js';

export const SEARCH_AGENT_SESSION_CONTENT_COMMAND_ID = 'workbench.action.chat.searchAgentSessionContent';
export const SEARCH_AGENT_SESSION_CONTENT_TITLE = localize2('searchAgentSessionContent', "Search Agent Session Content (Preview)");
const searchableProvider = 'copilotcli';

interface ISearchSession {
	readonly host: IAgentHostConnectionInfo;
	readonly metadata: IAgentSessionMetadata;
}

export interface IAgentHostSessionSearchItem extends IQuickPickItem {
	readonly session: ISearchSession;
	readonly match: IAgentSessionSearchMatch;
	readonly resource: URI;
	readonly semanticScore?: number;
}

interface ISearchState {
	readonly items: readonly IAgentHostSessionSearchItem[];
	readonly busy: boolean;
	readonly scanned: number;
	readonly total: number;
	readonly failures: number;
	readonly unavailableHosts: readonly string[];
	readonly hasMore: boolean;
	readonly message?: string;
	readonly semantic?: { readonly scanned: number; readonly unavailable: number; readonly incomplete: number };
	readonly semanticBudget?: { readonly used: number; readonly exhausted: boolean };
}

function plainText(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchItemKey(item: IAgentHostSessionSearchItem): string {
	return JSON.stringify([item.session.host.authority, item.match.chat, item.match.turnId, item.match.role]);
}

/** Empty editor windows and the Agents window search across workspaces. */
export function getAgentHostSessionSearchWorkspace(workspace: IWorkspace, isSessionsWindow: boolean): IWorkspace | undefined {
	return !isSessionsWindow && workspace.folders.length > 0
		? { ...workspace, folders: [...workspace.folders] }
		: undefined;
}

function isSearchHostInWorkspace(host: IAgentHostConnectionInfo, workspace: IWorkspace): boolean {
	return workspace.folders.some(folder => folder.uri.scheme === AGENT_HOST_SCHEME
		? folder.uri.authority === host.authority
		: host.isAmbient);
}

function isSearchSessionInWorkspace(session: IAgentSessionMetadata, workspace: IWorkspace): boolean {
	return isAgentHostSessionInWorkspace({
		workingDirectories: session.workingDirectories?.map(directory => directory.toString()),
		project: session.project ? { ...session.project, uri: session.project.uri.toString() } : undefined,
		_meta: session._meta,
	}, workspace);
}

export function createAgentHostSessionSearchItem(session: ISearchSession, match: IAgentSessionSearchMatch, source?: SessionSearchMatchSource): IAgentHostSessionSearchItem | undefined {
	const chat = parseChatUri(match.chat);
	if (!chat || !isEqual(URI.parse(chat.session), session.metadata.session)) {
		return undefined;
	}
	const provider = AgentSession.provider(session.metadata.session);
	if (provider !== searchableProvider) {
		return undefined;
	}
	const scheme = session.host.isAmbient ? `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${provider}` : remoteAgentHostSessionTypeId(session.host.authority, provider);
	const resource = session.metadata.session.with({ scheme, fragment: chat.chatId === DEFAULT_CHAT_ID ? '' : chat.chatId });
	const title = plainText(session.metadata.summary ?? '') || localize('search.untitled', "Untitled session");
	const author = match.role === 'user' ? localize('search.user', "User") : localize('search.assistant', "Assistant");
	const project = plainText(session.metadata.project?.displayName ?? '') || localize('search.noProject', "No project");
	const host = plainText(session.host.name);
	let description = isSessionStatusArchived(session.metadata.status)
		? localize('search.archivedDescription', "{0} · {1} · {2} · Archived", author, host, project)
		: localize('search.description', "{0} · {1} · {2}", author, host, project);
	if (source) {
		const kind = source === 'both' ? localize('search.bothMatch', "Keyword and semantic match")
			: source === 'semantic' ? localize('search.semanticMatch', "Semantic match") : localize('search.keywordMatch', "Keyword match");
		description = localize('search.matchDescription', "{0} · {1}", description, kind);
	}
	const snippet = plainText(match.snippet);
	return {
		label: escapeIcons(title),
		description: escapeIcons(description),
		detail: escapeIcons(snippet),
		ariaLabel: localize('search.resultAria', "{0}, {1}, {2}", title, description, snippet),
		alwaysShow: true,
		session,
		match,
		resource,
	};
}

/** Serializes query generations while allowing at most four session requests in a generation. */
export class AgentHostSessionSearch extends Disposable {
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.start(), 300));
	private readonly cancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private generation = 0;
	private pending: string | undefined;
	private running = false;
	private disposed = false;

	constructor(
		private readonly connections: () => readonly IAgentHostConnectionInfo[],
		private readonly update: (state: ISearchState) => void,
		private readonly logService: ILogService,
		private readonly getWorkspace: () => IWorkspace | undefined = () => undefined,
		private readonly getSemanticOptions: () => ISemanticSessionSearchOptions | undefined = () => undefined,
	) {
		super();
	}

	setQuery(value: string): void {
		this.cancellation.value?.cancel();
		this.cancellation.clear();
		this.generation++;
		this.pending = value.trim() || undefined;
		this.scheduler.cancel();
		let message: string | undefined;
		if (this.pending && this.pending.length > MAX_SESSION_SEARCH_QUERY_LENGTH) {
			message = localize('search.queryTooLong', "Use at most {0} characters to search saved messages.", MAX_SESSION_SEARCH_QUERY_LENGTH);
			this.pending = undefined;
		} else if (this.pending && getAgentSessionSearchTerms(this.pending).length === 0) {
			message = localize('search.noTerms', "Enter a word or number to search saved messages.");
			this.pending = undefined;
		}
		this.update({ items: [], busy: !!this.pending, scanned: 0, total: 0, failures: 0, unavailableHosts: [], hasMore: false, message });
		if (this.pending) {
			this.scheduler.schedule();
		}
	}

	override dispose(): void {
		this.cancellation.value?.cancel();
		this.disposed = true;
		this.generation++;
		this.pending = undefined;
		super.dispose();
	}

	private start(): void {
		if (this.running || this.disposed || !this.pending) {
			return;
		}
		const query = this.pending;
		const generation = this.generation;
		this.pending = undefined;
		this.running = true;
		const cancellation = new CancellationTokenSource();
		this.cancellation.value = cancellation;
		void this.search(query, generation, cancellation.token).finally(() => {
			if (this.cancellation.value === cancellation) {
				this.cancellation.clear();
			}
			this.running = false;
			if (!this.scheduler.isScheduled()) {
				this.start();
			}
		});
	}

	private async search(query: string, generation: number, token: CancellationToken): Promise<void> {
		const current = () => !this.disposed && generation === this.generation;
		const workspace = this.getWorkspace();
		const items: IAgentHostSessionSearchItem[] = [];
		const semanticItems: IAgentHostSessionSearchItem[] = [];
		const keywordKeys = new Set<string>();
		const options = this.getSemanticOptions();
		const semanticSearch = options && new SemanticSessionSearch(query, options, token);
		const semantic = semanticSearch ? { scanned: 0, unavailable: 0, incomplete: 0 } : undefined;
		const sessions: ISearchSession[] = [];
		const unavailableHosts: string[] = [];
		let scanned = 0;
		let failures = 0;
		let hasMore = false;
		const publish = (busy: boolean) => {
			if (current()) {
				const merged = semanticSearch
					? mergeSessionSearchResults(items, semanticItems, searchItemKey)
						.map(({ item, source }) => createAgentHostSessionSearchItem(item.session, item.match, source)!)
					: items;
				this.update({
					items: merged.slice(0, 100), busy, scanned, total: sessions.length, failures, unavailableHosts: [...unavailableHosts],
					hasMore: hasMore || merged.length > 100, semantic: semantic && { ...semantic },
					semanticBudget: semanticSearch && { used: semanticSearch.documentChunksUsed, exhausted: semanticSearch.budgetExhausted },
				});
			}
		};
		for (const host of this.connections()) {
			if (!current()) {
				return;
			}
			if (workspace && !isSearchHostInWorkspace(host, workspace)) {
				continue;
			}
			const connection = host.connection;
			if (!connection) {
				continue;
			}
			const initialized = connection.initializeResult.get();
			if (!connection.searchSessionHistory || (!connection.supportsSessionHistorySearch && initialized && !supportsAgentHostSessionSearch(initialized))) {
				unavailableHosts.push(plainText(host.name));
				continue;
			}
			try {
				const catalog = await connection.listSessions();
				if (!current()) {
					return;
				}
				const supported = connection.supportsSessionHistorySearch
					? await connection.supportsSessionHistorySearch()
					: supportsAgentHostSessionSearch(connection.initializeResult.get());
				if (!current()) {
					return;
				}
				if (supported) {
					sessions.push(...catalog.filter(metadata => AgentSession.provider(metadata.session) === searchableProvider
						&& (!workspace || isSearchSessionInWorkspace(metadata, workspace))).map(metadata => ({ metadata, host })));
				} else {
					unavailableHosts.push(plainText(host.name));
				}
			} catch (error) {
				failures++;
				this.logFailure('catalog', host, undefined, error);
			}
			publish(true);
		}
		let next = 0;
		const worker = async () => {
			while (current() && next < sessions.length && (semanticSearch || items.length < 100)) {
				const session = sessions[next++];
				let refreshed = false;
				try {
					const result = await session.host.connection!.searchSessionHistory!(session.metadata.session, query);
					if (!current()) {
						return;
					}
					hasMore ||= result.hasMore;
					refreshed = true;
					for (const match of result.matches) {
						if (items.length === 100) {
							hasMore = true;
							break;
						}
						const item = createAgentHostSessionSearchItem(session, match);
						if (item) {
							if (semanticSearch && keywordKeys.has(searchItemKey(item))) {
								continue;
							}
							items.push(item);
							keywordKeys.add(searchItemKey(item));
						}
					}
				} catch (error) {
					if (!current()) {
						return;
					}
					failures++;
					this.logFailure('session', session.host, session.metadata.session, error);
				}
				if (semanticSearch && semantic) {
					publish(true);
					try {
						if (!refreshed) {
							throw new Error('Session index could not be refreshed');
						}
						const result = await semanticSearch.search(session.host.connection!, session.metadata.session);
						if (!current()) {
							return;
						}
						hasMore ||= result.hasMore;
						if (result.incomplete) {
							semantic.incomplete++;
						}
						for (const match of result.matches) {
							const item = createAgentHostSessionSearchItem(session, match);
							if (item) {
								const existing = semanticItems.findIndex(candidate => searchItemKey(candidate) === searchItemKey(item));
								if (existing < 0) {
									semanticItems.push({ ...item, semanticScore: match.score });
								} else if (semanticItems[existing].semanticScore! < match.score) {
									semanticItems[existing] = { ...item, semanticScore: match.score };
								}
							}
						}
						semanticItems.sort((a, b) => b.semanticScore! - a.semanticScore!);
						if (semanticItems.length > 100) {
							hasMore = true;
							semanticItems.length = 100;
						}
					} catch (error) {
						if (!current()) {
							return;
						}
						semantic.unavailable++;
						semantic.incomplete++;
						this.logFailure('semantic', session.host, session.metadata.session, error);
					}
					semantic.scanned++;
				}
				scanned++;
				publish(true);
			}
		};
		await Promise.all(Array.from({ length: Math.min(4, sessions.length) }, () => worker()));
		hasMore ||= next < sessions.length;
		publish(false);
	}

	private logFailure(stage: string, host: IAgentHostConnectionInfo, session: URI | undefined, error: unknown): void {
		// Server error messages can contain search terms or saved conversation text.
		this.logService.warn('[AgentHostSessionSearch]', stage, host.authority, session?.toString(), error instanceof Error ? error.name : 'Error');
	}
}

/** Reveals the exact turn and role; missing turns must not redirect to another message with similar text. */
export function revealAgentHostSessionSearchMatch(widget: IChatWidget, match: IAgentSessionSearchMatch): boolean {
	const candidates = widget.viewModel?.getItems().filter(item => match.role === 'user' ? isRequestVM(item) : isResponseVM(item)) ?? [];
	const item = candidates.find(item => item.id === match.turnId || (isResponseVM(item) && item.requestId === match.turnId));
	if (!item) {
		return false;
	}
	widget.reveal(item);
	widget.focus(item);
	return true;
}

export async function openAgentHostSessionSearchResult(item: IAgentHostSessionSearchItem, openChat: (resource: URI) => Promise<IChatWidget | undefined>): Promise<boolean> {
	const widget = await openChat(item.resource);
	if (!widget) {
		throw new Error('Session search result could not be opened');
	}
	return revealAgentHostSessionSearchMatch(widget, item.match);
}

/** Sessions navigation updates the active chat before its widget finishes loading. */
export async function waitForAgentHostSessionSearchWidget(item: IAgentHostSessionSearchItem, chatWidgetService: IChatWidgetService, connectionsService: IAgentHostConnectionsService): Promise<IChatWidget | undefined> {
	const store = new DisposableStore();
	try {
		return await raceTimeout(new Promise<IChatWidget>(resolve => {
			const check = () => {
				const widget = chatWidgetService.getAllWidgets().find(widget => {
					const resource = widget.viewModel?.sessionResource;
					const identity = resource && connectionsService.resolveSessionResourceIdentity(resource);
					return identity?.connectionAuthority === item.session.host.authority
						&& isEqual(identity.backendSession, item.session.metadata.session)
						&& (resource?.fragment || DEFAULT_CHAT_ID) === (item.resource.fragment || DEFAULT_CHAT_ID);
				});
				if (widget) {
					resolve(widget);
				}
			};
			store.add(chatWidgetService.onDidAddWidget(widget => {
				store.add(widget.onDidChangeViewModel(check));
				check();
			}));
			for (const widget of chatWidgetService.getAllWidgets()) {
				store.add(widget.onDidChangeViewModel(check));
			}
			check();
		}), 10_000);
	} finally {
		store.dispose();
	}
}

registerAction2(class SearchAgentSessionContentAction extends Action2 {
	constructor() {
		super({
			id: SEARCH_AGENT_SESSION_CONTENT_COMMAND_ID,
			title: SEARCH_AGENT_SESSION_CONTENT_TITLE,
			icon: Codicon.search,
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: { id: MenuId.AgentSessionsToolbar, group: 'navigation', order: 2, when: ChatContextKeys.enabled },
		});
	}

	override run(accessor: ServicesAccessor): void {
		const quickInputService = accessor.get(IQuickInputService);
		const connectionsService = accessor.get(IAgentHostConnectionsService);
		const chatWidgetService = accessor.get(IChatWidgetService);
		const chatSessionsService = accessor.get(IChatSessionsService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		const embeddingsService = accessor.get(IEmbeddingsService);
		const dialogService = accessor.get(IDialogService);
		const getWorkspace = () => getAgentHostSessionSearchWorkspace(workspaceContextService.getWorkspace(), environmentService.isSessionsWindow);
		const getScopeLabel = () => getWorkspace()
			? localize('search.workspaceScope', "Copilot · Current workspace · Archived sessions included")
			: localize('search.scope', "Copilot · All projects on connected hosts · Archived sessions included");
		const store = new DisposableStore();
		const consent = store.add(new SemanticSessionSearchConsent());
		const picker = store.add(quickInputService.createQuickPick<IAgentHostSessionSearchItem>());
		let semanticNotice = '';
		let enablingSemantic = false;
		const updateSemanticButton = () => {
			const enabled = !!consent.approved;
			picker.title = enabled
				? localize('search.hybridTitle', "{0} — Keyword and Semantic", SEARCH_AGENT_SESSION_CONTENT_TITLE.value)
				: localize('search.keywordTitle', "{0} — Keyword", SEARCH_AGENT_SESSION_CONTENT_TITLE.value);
			picker.buttons = [{
				iconClass: ThemeIcon.asClassName(Codicon.sparkle),
				tooltip: enabled
					? localize('search.disableSemantic', "Disable Semantic Search (Enabled for This Search: {0})", consent.approved!.providerId)
					: localize('search.enableSemantic', "Enable Semantic Search (Sends Saved Messages to Copilot After Confirmation)"),
				toggle: { checked: enabled },
			}];
			picker.placeholder = enabled
				? localize('search.semanticPlaceholder', "Search saved user and assistant messages by keyword or meaning")
				: localize('search.placeholder', "Search saved user and assistant messages (all literal terms must match)");
		};
		picker.ariaLabel = localize('search.aria', "Search saved Copilot session messages");
		picker.description = getScopeLabel();
		picker.matchOnLabel = false;
		picker.matchOnDescription = false;
		picker.matchOnDetail = false;
		picker.sortByLabel = false;
		updateSemanticButton();
		let lastState: ISearchState | undefined;
		const update = (state: ISearchState) => {
			lastState = state;
			const scope = getScopeLabel();
			picker.items = state.items;
			picker.busy = state.busy;
			if (!picker.value.trim()) {
				picker.description = localize('search.idleStatus', "{0}\n{1}", scope, semanticNotice);
				return;
			}
			const progress = state.message ?? localize('search.progress', "{0} results · {1}/{2} sessions scanned · {3} failures", state.items.length, state.scanned, state.total, state.failures);
			const more = state.hasMore ? localize('search.more', " More matches may be available; refine your search.") : '';
			const unavailable = state.unavailableHosts.length
				? localize('search.unavailable', " Search unavailable on {0}; connect or update the host and search again.", state.unavailableHosts.join(', '))
				: '';
			const semanticProgress = state.semantic
				? localize('search.semanticProgress', " Semantic coverage: {0}/{1} sessions checked · {2} incomplete. Document embedding budget: {3}/{4} chunks per query.", state.semantic.scanned, state.total, state.semantic.incomplete, state.semanticBudget?.used ?? 0, MAX_SEMANTIC_SESSION_SEARCH_DOCUMENT_CHUNKS)
				: '';
			const budget = state.semanticBudget?.exhausted
				? localize('search.semanticBudgetExhausted', " Embedding budget exhausted; searching cached vectors. Semantic coverage is incomplete.")
				: '';
			const semanticUnavailable = state.semantic?.unavailable
				? localize('search.semanticUnavailableSessions', " Semantic unavailable; showing keyword results for {0} sessions.", state.semantic.unavailable)
				: semanticNotice;
			picker.description = localize('search.status', "{0}\n{1}{2}{3}{4}{5}{6}", scope, progress, more, unavailable, semanticProgress, semanticUnavailable, budget);
			if (!state.busy) {
				status(localize('search.announcement', "{0}{1}{2}{3}{4}{5}", progress, more, unavailable, semanticProgress, semanticUnavailable, budget));
			}
		};
		const search = store.add(new AgentHostSessionSearch(() => connectionsService.connections, update, logService, getWorkspace, () => consent.approved));
		store.add(picker.onDidTriggerButton(async () => {
			if (enablingSemantic) {
				consent.cancelPending();
				return;
			}
			semanticNotice = '';
			if (consent.approved) {
				consent.revoke();
				updateSemanticButton();
				search.setQuery(picker.value);
				return;
			}
			enablingSemantic = true;
			picker.ignoreFocusOut = true;
			let restartSearch = false;
			try {
				const result = await consent.enable(embeddingsService, async (providers, token) => {
					if (providers.length === 1) {
						return providers[0];
					}
					return (await dialogService.prompt<string>({
						type: 'question',
						message: localize('search.selectEmbeddingProvider', "Select a Copilot Embeddings Provider"),
						detail: localize('search.selectEmbeddingProviderDetail', "You will be asked to confirm before any query or saved messages are sent."),
						buttons: providers.map(provider => ({ label: provider, run: () => provider })),
						cancelButton: true,
						custom: true,
						token,
					})).result;
				}, async (provider, token) => {
					const scope = getWorkspace()
						? localize('search.consentWorkspace', "the current workspace")
						: localize('search.consentAllProjects', "all projects on connected hosts");
					return (await dialogService.confirm({
						type: 'question',
						message: localize('search.semanticConfirmation', "Enable Semantic Search for This Open Search?"),
						detail: localize('search.semanticConfirmationDetail', "Your search queries and saved user and assistant messages in {0}, including archived sessions, will be sent to the selected Copilot embeddings provider: {1}. The first pass may take time and use the provider's quota. Each query embeds at most {2} document chunks across all sessions, plus one query embedding. Vectors are stored locally by each host; unchanged cached chunks are not re-embedded. After the budget is exhausted, search uses cached vectors and reports incomplete coverage. Permission lasts only while this search is open and is revoked when the workspace changes. Cancel sends nothing to the provider.", scope, provider, MAX_SEMANTIC_SESSION_SEARCH_DOCUMENT_CHUNKS),
						primaryButton: localize('search.semanticConfirm', "Enable Semantic Search"),
						custom: true,
						token,
					})).confirmed;
				});
				if (result === 'unavailable') {
					semanticNotice = localize('search.semanticUnavailableProvider', " Semantic unavailable; showing keyword results. Sign in to Copilot or enable a Copilot embeddings provider and try again.");
				}
				restartSearch = result === 'enabled';
			} catch {
				semanticNotice = localize('search.semanticEnableFailed', " Semantic unavailable; showing keyword results.");
			} finally {
				enablingSemantic = false;
				if (!store.isDisposed) {
					picker.ignoreFocusOut = false;
					updateSemanticButton();
					if (restartSearch) {
						search.setQuery(picker.value);
					} else if (lastState) {
						update(lastState);
					} else if (semanticNotice) {
						picker.description = localize('search.idleStatus', "{0}\n{1}", getScopeLabel(), semanticNotice);
						status(semanticNotice);
					}
				}
			}
		}));
		store.add(Event.any(
			workspaceContextService.onDidChangeWorkspaceFolders,
			workspaceContextService.onDidChangeWorkbenchState,
			workspaceContextService.onDidChangeWorkspaceName,
		)(() => {
			const wasEnabled = !!consent.approved;
			consent.revoke();
			semanticNotice = wasEnabled
				? localize('search.semanticScopeChanged', " Semantic search disabled because the workspace changed. Enable it again to confirm the new scope.")
				: '';
			updateSemanticButton();
			search.setQuery(picker.value);
		}));
		store.add(embeddingsService.onDidChange(() => {
			if (consent.approved && ![...embeddingsService.allProviders].includes(consent.approved.providerId)) {
				consent.revoke();
				semanticNotice = localize('search.semanticProviderRemoved', " Semantic unavailable; showing keyword results. The selected Copilot embeddings provider is no longer available.");
				updateSemanticButton();
				search.setQuery(picker.value);
			}
		}));
		store.add(picker.onDidChangeValue(value => {
			consent.cancelPending();
			search.setQuery(value);
		}));
		store.add(picker.onDidHide(() => store.dispose()));
		store.add(picker.onDidAccept(async () => {
			const item = picker.selectedItems[0];
			if (!item) {
				return;
			}
			picker.hide();
			try {
				const revealed = await openAgentHostSessionSearchResult(item, async resource => {
					for (const participant of sessionOpenerRegistry.getParticipants()) {
						if (await participant.handleOpenSessionResource?.(accessor, resource.with({ fragment: resource.fragment || DEFAULT_CHAT_ID }))) {
							return waitForAgentHostSessionSearchWidget(item, chatWidgetService, connectionsService);
						}
					}
					await chatSessionsService.activateChatSessionItemProvider(resource.scheme);
					return chatWidgetService.openSession(resource, ChatViewPaneTarget, { revealIfOpened: true });
				});
				if (!revealed) {
					notificationService.info(localize('search.turnUnavailable', "The chat was opened, but the saved matching message could not be located. Use Find in the chat to search for the text."));
				}
			} catch {
				logService.warn('[AgentHostSessionSearch] Could not open result', item.session.host.authority, item.resource.toString());
				notificationService.warn(localize('search.openFailed', "Could not open the matching chat. The session may have been deleted or its host disconnected."));
			}
		}));
		picker.show();
	}
});
