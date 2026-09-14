/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/pullRequestReviewEditor.css';
import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { ActiveEditorContext, EditorAreaFocusContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { EditorExtensions, IEditorOpenContext, IUntypedEditorInput } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { getChatMarkdownRenderOptions } from '../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../workbench/services/editor/common/editorService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IGitHubPullRequestRef } from '../../../services/sessions/common/session.js';
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubCICheck, IGitHubPullRequest, IGitHubPullRequestReview, IGitHubPullRequestReviewThread, OPEN_PULL_REQUEST_REVIEW_ACTION_ID } from '../common/types.js';
import { getPullRequestKey } from '../common/utils.js';
import { IGitHubService } from './githubService.js';
import { GitHubPullRequestCIModel } from './models/githubPullRequestCIModel.js';

export class PullRequestReviewEditorInput extends EditorInput {
	static readonly ID = 'sessions.pullRequestReviewInput';

	private title: string;

	constructor(readonly pullRequest: IGitHubPullRequestRef) {
		super();
		this.title = pullRequest.title ?? '';
	}

	override get typeId(): string { return PullRequestReviewEditorInput.ID; }
	override get editorId(): string { return PullRequestReviewEditor.ID; }
	override get resource(): URI { return this.pullRequest.uri; }
	override getIcon() { return Codicon.gitPullRequest; }

	override getName(): string {
		return this.title || localize('pullRequestReview.name', "Pull Request #{0}", this.pullRequest.number);
	}

	override getDescription(): string {
		return `${this.pullRequest.owner}/${this.pullRequest.repo}#${this.pullRequest.number}`;
	}

	override getTitle(): string {
		return localize('pullRequestReview.title', "{0}: {1}", this.getDescription(), this.getName());
	}

	setTitle(title: string): void {
		if (this.title !== title) {
			this.title = title;
			this._onDidChangeLabel.fire();
		}
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof PullRequestReviewEditorInput
			&& getPullRequestKey(this.pullRequest.owner, this.pullRequest.repo, this.pullRequest.number) === getPullRequestKey(other.pullRequest.owner, other.pullRequest.repo, other.pullRequest.number)
			&& isEqual(this.resource, other.resource);
	}
}

interface IRefreshState {
	readonly loading: boolean;
	readonly error: string | undefined;
}

interface IReviewData<T> extends IRefreshState {
	readonly value: T | undefined;
}

/** Tracks only this view's on-demand requests; the shared models own data and polling. */
class ReviewModelRefresh extends Disposable {
	readonly state = observableValue<IRefreshState>(this, { loading: false, error: undefined });
	private pending: Promise<void> | undefined;

	constructor(
		private readonly refreshModel: () => Promise<void>,
		private readonly logService: ILogService,
	) {
		super();
	}

	refresh(): Promise<void> {
		if (this._store.isDisposed) {
			return Promise.resolve();
		}
		if (!this.pending) {
			this.pending = this.doRefresh().finally(() => this.pending = undefined);
		}
		return this.pending;
	}

	private async doRefresh(): Promise<void> {
		this.state.set({ loading: true, error: undefined }, undefined);
		let error: string | undefined;
		try {
			await this.refreshModel();
		} catch (cause) {
			this.logService.error('[PullRequestReviewEditor] Failed to refresh GitHub data', cause);
			error = toErrorMessage(cause);
		}
		if (!this._store.isDisposed) {
			this.state.set({ loading: false, error }, undefined);
		}
	}
}

export class PullRequestReviewModel extends Disposable {
	readonly details: IObservable<IReviewData<IGitHubPullRequest>>;
	readonly reviews: IObservable<IReviewData<readonly IGitHubPullRequestReview[]>>;
	readonly threads: IObservable<IReviewData<readonly IGitHubPullRequestReviewThread[]>>;
	readonly checks: IObservable<IReviewData<readonly IGitHubCICheck[]>>;
	readonly loading: IObservable<boolean>;

	private readonly detailsRefresh: ReviewModelRefresh;
	private readonly threadsRefresh: ReviewModelRefresh;
	private readonly ci = observableValue<{ model: GitHubPullRequestCIModel; refresh: ReviewModelRefresh } | undefined>(this, undefined);

	constructor(
		ref: IGitHubPullRequestRef,
		@IGitHubService gitHubService: IGitHubService,
		@ILogService logService: ILogService,
	) {
		super();
		const details = this._register(gitHubService.createPullRequestModelReference(ref.owner, ref.repo, ref.number)).object;
		const threads = this._register(gitHubService.createPullRequestReviewThreadsModelReference(ref.owner, ref.repo, ref.number)).object;
		this.detailsRefresh = this._register(new ReviewModelRefresh(() => details.refresh(), logService));
		this.threadsRefresh = this._register(new ReviewModelRefresh(() => threads.refresh(), logService));

		this.details = derived(this, reader => ({ ...this.detailsRefresh.state.read(reader), value: details.pullRequest.read(reader) }));
		this.reviews = derived(this, reader => ({ ...this.detailsRefresh.state.read(reader), value: details.reviews.read(reader) }));
		this.threads = derived(this, reader => {
			const state = this.threadsRefresh.state.read(reader);
			const hasLoaded = threads.hasLoaded.read(reader);
			return {
				...state,
				value: hasLoaded ? threads.reviewThreads.read(reader) : undefined,
				error: state.error ?? (!state.loading && !hasLoaded && threads.initialRefreshCompleted.read(reader)
					? localize('pullRequestReview.threadsFailed', "Review threads could not be loaded.")
					: undefined),
			};
		});

		const headSha = details.pullRequest.map(pullRequest => pullRequest?.headSha);
		this._register(autorun(reader => {
			const sha = headSha.read(reader);
			if (!sha) {
				this.ci.set(undefined, undefined);
				return;
			}
			const reference = reader.store.add(gitHubService.createPullRequestCIModelReference(ref.owner, ref.repo, ref.number, sha));
			const refresh = reader.store.add(new ReviewModelRefresh(() => reference.object.refresh(), logService));
			this.ci.set({ model: reference.object, refresh }, undefined);
			void refresh.refresh();
		}));

		this.checks = derived(this, reader => {
			const ci = this.ci.read(reader);
			if (!ci) {
				return { loading: this.details.read(reader).loading, error: undefined, value: undefined };
			}
			const checks = ci.model.checks.read(reader);
			// CI models do not distinguish an empty result from a failed initial refresh.
			return { ...ci.refresh.state.read(reader), value: checks.length ? checks : undefined };
		});
		this.loading = derived(this, reader => this.details.read(reader).loading || this.threads.read(reader).loading || this.checks.read(reader).loading);

		void this.detailsRefresh.refresh();
		void this.threadsRefresh.refresh();
	}

	async refresh(): Promise<void> {
		await Promise.all([this.detailsRefresh.refresh(), this.threadsRefresh.refresh(), this.ci.get()?.refresh.refresh()]);
	}
}

export class PullRequestReviewEditor extends EditorPane {
	static readonly ID = 'sessions.pullRequestReviewEditor';

	private readonly inputDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly onDidChangeContent = this._register(new Emitter<void>());
	private container: HTMLElement | undefined;
	private content: HTMLElement | undefined;
	private scrollable: DomScrollableElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(PullRequestReviewEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.container = dom.append(parent, dom.$('.sessions-pull-request-review-editor'));
	}

	override async setInput(input: PullRequestReviewEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		this.clearView();
		const store = new DisposableStore();
		this.inputDisposables.value = store;
		await super.setInput(input, options, context, token);
		if (store.isDisposed || token.isCancellationRequested || this.input !== input || !this.container) {
			store.dispose();
			return;
		}
		store.add(input.onWillDispose(() => store.dispose()));
		const model = store.add(this.instantiationService.createInstance(PullRequestReviewModel, input.pullRequest));
		const toolbarContainer = dom.append(this.container, dom.$('.pull-request-review-toolbar'));
		const toolbar = store.add(this.instantiationService.createInstance(WorkbenchToolBar, toolbarContainer, {
			ariaLabel: localize('pullRequestReview.actions', "Pull Request Review Actions"),
			actionViewItemProvider: (action, options) => new ActionViewItem(undefined, action, { ...options, icon: false, label: true }),
		}));
		const open = store.add(new Action('pullRequestReview.openExternal', localize('pullRequestReview.openExternal', "Open on GitHub"), undefined, true, async () => {
			if (!await this.openerService.open(input.resource, { openExternal: true, allowContributedOpeners: true })) {
				throw new Error(localize('pullRequestReview.openFailed', "The pull request could not be opened on GitHub."));
			}
		}));
		const retry = store.add(new Action('pullRequestReview.retry', localize('pullRequestReview.retry', "Retry"), undefined, true, () => model.refresh()));
		toolbar.setActions([open, retry]);
		store.add(toolbar.actionRunner.onDidRun(event => {
			if (event.error) {
				this.notificationService.error(event.error);
			}
		}));
		store.add(autorun(reader => retry.enabled = !model.loading.read(reader)));

		const content = this.content = dom.$('.pull-request-review-content', { tabIndex: 0, role: 'document' });
		const scrollable = this.scrollable = store.add(new DomScrollableElement(content, { horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Auto }));
		dom.append(this.container, scrollable.getDomNode());
		store.add(dom.addDisposableListener(content, dom.EventType.KEY_DOWN, event => {
			if (event.target !== content) {
				return;
			}
			const key = new StandardKeyboardEvent(event);
			if (key.ctrlKey || key.metaKey || key.altKey || key.shiftKey) {
				return;
			}
			const position = scrollable.getScrollPosition();
			let scrollTop: number;
			switch (key.keyCode) {
				case KeyCode.UpArrow: scrollTop = position.scrollTop - 40; break;
				case KeyCode.DownArrow: scrollTop = position.scrollTop + 40; break;
				case KeyCode.PageUp: scrollTop = position.scrollTop - content.clientHeight; break;
				case KeyCode.PageDown: scrollTop = position.scrollTop + content.clientHeight; break;
				case KeyCode.Home: scrollTop = 0; break;
				case KeyCode.End: scrollTop = content.scrollHeight; break;
				default: return;
			}
			key.preventDefault();
			key.stopPropagation();
			scrollable.setScrollPosition({ scrollTop });
		}));
		const updateAriaLabel = () => {
			const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
			content.setAttribute('aria-label', keybinding && this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionReview)
				? localize('pullRequestReview.ariaHelp', "Pull request review. Use {0} for accessibility help.", keybinding)
				: localize('pullRequestReview.ariaLabel', "Pull request review"));
		};
		updateAriaLabel();
		store.add(this.keybindingService.onDidUpdateKeybindings(updateAriaLabel));
		store.add(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AccessibilityVerbositySettingId.SessionReview)) {
				updateAriaLabel();
			}
		}));

		dom.append(content, dom.$('p.pull-request-review-identity', undefined, input.getDescription()));
		const title = dom.append(content, dom.$('h1.pull-request-review-title'));
		const state = dom.append(content, dom.$('p.pull-request-review-state', { role: 'status' }));
		store.add(autorun(reader => {
			const details = model.details.read(reader);
			if (details.value) {
				input.setTitle(details.value.title);
			}
			title.textContent = input.getName();
			state.textContent = details.value ? getPullRequestStateLabel(details.value) : details.loading
				? localize('pullRequestReview.loading', "Loading pull request...")
				: localize('pullRequestReview.stateUnavailable', "Pull request state unavailable");
			this.contentChanged();
		}));
		dom.append(content, dom.$('p.pull-request-review-notice', undefined, localize('pullRequestReview.readOnly', "Read-only GitHub data. Retry or open on GitHub to verify the latest status.")));
		this.bindSection(content, localize('pullRequestReview.description', "Description"),
			model.details.map(data => ({ ...data, value: data.value?.body })),
			localize('pullRequestReview.descriptionUnavailable', "Pull request details are unavailable. Retry or open on GitHub."),
			store, (body, container, disposables) => this.renderMarkdown(body || localize('pullRequestReview.noDescription', "No description provided."), container, input.resource, disposables));
		this.bindSection(content, localize('pullRequestReview.checks', "Checks"), model.checks,
			localize('pullRequestReview.checksUnavailable', "No check results are available. Retry or open on GitHub to verify."),
			store, (checks, container) => {
				const list = dom.append(container, dom.$('ul.pull-request-review-list'));
				for (const check of checks) {
					dom.append(list, dom.$('li', undefined, localize('pullRequestReview.check', "{0}: {1}", check.name, getCheckLabel(check))));
				}
			});
		this.bindSection(content, localize('pullRequestReview.reviews', "Reviews"), model.reviews,
			localize('pullRequestReview.reviewsUnavailable', "Reviews are unavailable. Retry or open on GitHub."),
			store, (reviews, container) => {
				if (!reviews.length) {
					dom.append(container, dom.$('p', undefined, localize('pullRequestReview.noReviews', "No reviews submitted.")));
				}
				const list = dom.append(container, dom.$('ul.pull-request-review-list'));
				for (const review of reviews) {
					dom.append(list, dom.$('li', undefined, localize('pullRequestReview.review', "{0}: {1}", review.author.login, getReviewLabel(review.state))));
				}
			});
		this.bindSection(content, localize('pullRequestReview.feedback', "Review feedback"), model.threads,
			localize('pullRequestReview.feedbackUnavailable', "Review feedback is unavailable. Retry or open on GitHub."),
			store, (threads, container, disposables) => {
				if (!threads.length) {
					dom.append(container, dom.$('p', undefined, localize('pullRequestReview.noThreads', "No review threads.")));
				}
				for (const thread of threads) {
					const threadElement = dom.append(container, dom.$('section.pull-request-review-thread'));
					dom.append(threadElement, dom.$('h3', undefined, thread.line === undefined ? thread.path : localize('pullRequestReview.location', "{0}, line {1}", thread.path, thread.line)));
					dom.append(threadElement, dom.$('p.pull-request-review-thread-state', undefined, thread.isResolved
						? localize('pullRequestReview.resolved', "Resolved")
						: localize('pullRequestReview.unresolved', "Unresolved")));
					for (const comment of thread.comments) {
						dom.append(threadElement, dom.$('p.pull-request-review-author', undefined, comment.author.login));
						this.renderMarkdown(comment.body, threadElement, input.resource, disposables);
					}
				}
			});
		this.contentChanged();
	}

	private bindSection<T>(parent: HTMLElement, title: string, data: IObservable<IReviewData<T>>, unavailable: string, store: DisposableStore, render: (value: T, container: HTMLElement, store: DisposableStore) => void): void {
		const section = dom.append(parent, dom.$('section.pull-request-review-section', { 'aria-label': title }));
		dom.append(section, dom.$('h2', undefined, title));
		const status = dom.append(section, dom.$('p.pull-request-review-status', { role: 'status' }));
		const body = dom.append(section, dom.$('.pull-request-review-section-body'));
		store.add(autorun(reader => {
			const state = data.read(reader);
			section.setAttribute('aria-busy', String(state.loading));
			status.textContent = state.error
				? localize('pullRequestReview.error', "{0} Retry or open on GitHub.", state.error)
				: state.loading ? localize('pullRequestReview.sectionLoading', "Loading...")
					: state.value === undefined ? unavailable : '';
			status.hidden = !status.textContent;
			status.classList.toggle('error', !!state.error);
			this.contentChanged();
		}));
		const value = data.map(state => state.value);
		store.add(autorun(reader => {
			const current = value.read(reader);
			dom.clearNode(body);
			if (current !== undefined) {
				render(current, body, reader.store);
			}
			this.contentChanged();
		}));
	}

	private renderMarkdown(value: string, parent: HTMLElement, baseUri: URI, store: DisposableStore): void {
		const markdown = new MarkdownString(value, { isTrusted: false, supportHtml: false, supportThemeIcons: false });
		markdown.baseUri = baseUri;
		const rendered = store.add(this.markdownRendererService.render(markdown, getChatMarkdownRenderOptions({
			asyncRenderCallback: () => {
				if (!store.isDisposed) {
					this.contentChanged();
				}
			},
		})));
		rendered.element.classList.add('pull-request-review-markdown');
		dom.append(parent, rendered.element);
	}

	private contentChanged(): void {
		this.scrollable?.scanDomNode();
		this.onDidChangeContent.fire();
	}

	override layout(dimension: dom.Dimension): void {
		if (this.container) {
			dom.size(this.container, dimension.width, dimension.height);
			this.scrollable?.scanDomNode();
		}
	}

	override focus(): void {
		this.content?.focus();
	}

	getAccessibleProvider(type: AccessibleViewType): AccessibleContentProvider {
		const input = this.input;
		const focused = dom.getActiveElement();
		const provider = new AccessibleContentProvider(
			AccessibleViewProviderId.SessionReview,
			{ type, language: 'plaintext' },
			() => type === AccessibleViewType.Help ? [
				localize('pullRequestReview.help.overview', "This read-only editor shows a GitHub pull request's description, checks, reviews, and review threads."),
				localize('pullRequestReview.help.navigation', "Use Tab and Shift+Tab to move between content, links, and the toolbar. Use Left and Right Arrow within the toolbar. Use Page Up, Page Down, Home, and End to scroll the content."),
				localize('pullRequestReview.help.actions', "Retry reloads GitHub data. Open on GitHub opens this pull request externally. This editor cannot submit reviews, change checks, or resolve threads."),
				localize('pullRequestReview.help.accessibleView', "Use {0} to read the content in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			].join('\n\n') : this.input === input && this.content ? this.content.innerText : localize('pullRequestReview.closed', "This pull request review is no longer open."),
			() => {
				if (this.input === input && !this._store.isDisposed) {
					if (dom.isHTMLElement(focused) && focused.isConnected) {
						focused.focus();
					} else {
						this.focus();
					}
				}
			},
			AccessibilityVerbositySettingId.SessionReview,
		);
		provider.onDidChangeContent = this.onDidChangeContent.event;
		return provider;
	}

	private clearView(): void {
		this.inputDisposables.clear();
		this.content = undefined;
		this.scrollable = undefined;
		if (this.container) {
			dom.clearNode(this.container);
		}
		this.onDidChangeContent.fire();
	}

	override clearInput(): void {
		this.clearView();
		super.clearInput();
	}
}

function getPullRequestStateLabel(pullRequest: IGitHubPullRequest): string {
	switch (pullRequest.state) {
		case GitHubPullRequestState.Merged: return localize('pullRequestReview.merged', "Merged");
		case GitHubPullRequestState.Closed: return localize('pullRequestReview.closedState', "Closed");
		case GitHubPullRequestState.Open: return pullRequest.isDraft ? localize('pullRequestReview.draft', "Draft") : localize('pullRequestReview.open', "Open");
	}
}

function getCheckLabel(check: IGitHubCICheck): string {
	if (check.status === GitHubCheckStatus.Queued) {
		return localize('pullRequestReview.queued', "Queued");
	}
	if (check.status === GitHubCheckStatus.InProgress) {
		return localize('pullRequestReview.inProgress', "In progress");
	}
	switch (check.conclusion) {
		case GitHubCheckConclusion.Success: return localize('pullRequestReview.succeeded', "Succeeded");
		case GitHubCheckConclusion.Failure: return localize('pullRequestReview.failed', "Failed");
		case GitHubCheckConclusion.Neutral: return localize('pullRequestReview.neutral', "Neutral");
		case GitHubCheckConclusion.Cancelled: return localize('pullRequestReview.cancelled', "Cancelled");
		case GitHubCheckConclusion.Skipped: return localize('pullRequestReview.skipped', "Skipped");
		case GitHubCheckConclusion.TimedOut: return localize('pullRequestReview.timedOut', "Timed out");
		case GitHubCheckConclusion.ActionRequired: return localize('pullRequestReview.actionRequired', "Action required");
		case GitHubCheckConclusion.Stale: return localize('pullRequestReview.stale', "Stale");
		default: return localize('pullRequestReview.conclusionUnavailable', "Conclusion unavailable");
	}
}

function getReviewLabel(state: string): string {
	switch (state.toUpperCase()) {
		case 'APPROVED': return localize('pullRequestReview.approved', "Approved");
		case 'CHANGES_REQUESTED': return localize('pullRequestReview.changesRequested', "Changes requested");
		case 'COMMENTED': return localize('pullRequestReview.commented', "Commented");
		case 'DISMISSED': return localize('pullRequestReview.dismissed', "Dismissed");
		case 'PENDING': return localize('pullRequestReview.pendingReview', "Pending");
		default: return localize('pullRequestReview.reviewState', "Review state: {0}", state);
	}
}

function isPullRequestRef(value: unknown): value is IGitHubPullRequestRef {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const ref = value as Partial<IGitHubPullRequestRef>;
	return typeof ref.owner === 'string' && !!ref.owner.trim()
		&& typeof ref.repo === 'string' && !!ref.repo.trim()
		&& typeof ref.number === 'number' && Number.isSafeInteger(ref.number) && ref.number > 0
		&& (ref.title === undefined || typeof ref.title === 'string')
		&& URI.isUri(ref.uri) && (ref.uri.scheme === Schemas.https || ref.uri.scheme === Schemas.http) && !!ref.uri.authority;
}

const enabled = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled);

export class OpenPullRequestReviewAction extends Action2 {
	constructor() {
		super({
			id: OPEN_PULL_REQUEST_REVIEW_ACTION_ID,
			title: localize2('pullRequestReview.openAction', "Open Pull Request Review"),
			f1: false,
			precondition: enabled,
		});
	}

	override async run(accessor: ServicesAccessor, ref: IGitHubPullRequestRef, options?: IEditorOptions, group?: PreferredGroup): Promise<void> {
		if (!isPullRequestRef(ref)) {
			throw new Error(localize('pullRequestReview.invalidRef', "A GitHub pull request reference with an owner, repository, positive number, and HTTP or HTTPS URI is required."));
		}
		if (accessor.get(IChatEntitlementService).sentiment.hidden) {
			throw new Error(localize('pullRequestReview.disabled', "Pull request review is unavailable while AI features are disabled."));
		}
		const store = new DisposableStore();
		const input = store.add(new PullRequestReviewEditorInput(ref));
		try {
			const pane = await accessor.get(IEditorService).openEditor(input, { pinned: true, ...options }, group);
			if (pane?.input === input) {
				store.deleteAndLeak(input);
			}
		} finally {
			store.dispose();
		}
	}
}

registerAction2(OpenPullRequestReviewAction);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(PullRequestReviewEditor, PullRequestReviewEditor.ID, localize('pullRequestReview.editor', "Pull Request Review")),
	[new SyncDescriptor(PullRequestReviewEditorInput)],
);

for (const type of [AccessibleViewType.Help, AccessibleViewType.View]) {
	AccessibleViewRegistry.register({
		type,
		name: 'pullRequestReview',
		priority: 120,
		when: ContextKeyExpr.and(enabled, EditorAreaFocusContext, ActiveEditorContext.isEqualTo(PullRequestReviewEditor.ID)),
		getProvider: accessor => {
			const pane = accessor.get(IEditorService).activeEditorPane;
			return pane instanceof PullRequestReviewEditor && pane.hasFocus() ? pane.getAccessibleProvider(type) : undefined;
		},
	});
}
