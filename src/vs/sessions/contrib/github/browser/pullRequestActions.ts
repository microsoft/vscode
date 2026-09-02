/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedHoverContent, IManagedHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { $ } from '../../../../base/browser/dom.js';
import { toAction } from '../../../../base/common/actions.js';
import { arrayEquals } from '../../../../base/common/equals.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { Menus } from '../../../browser/menus.js';
import { ChatPillActionViewItem } from '../../../../workbench/browser/chatPills.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { SessionHasPullRequestContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { getGitHubPullRequestRefs, getHighestPriorityPullRequestIcon, IGitHubPullRequestRef, ISession } from '../../../services/sessions/common/session.js';
import { computePullRequestIcon, GitHubPullRequestState, IGitHubPullRequest, IPullRequestIconStatus, OPEN_PULL_REQUEST_ACTION_ID } from '../common/types.js';
import { IGitHubService } from './githubService.js';
import { GitHubReferenceList, IGitHubReferenceListEntry } from './githubReferenceList.js';
import { createPullRequestHoverElement } from './pullRequestHover.js';
import { IPullRequestIconCache } from './pullRequestIconCache.js';
import { computePullRequestIconStatus } from './pullRequestIconStatus.js';

interface IResolvedSessionPullRequest {
	readonly ref: IGitHubPullRequestRef;
	readonly pullRequest: IGitHubPullRequest | undefined;
	readonly icon: ThemeIcon | undefined;
	readonly status: IPullRequestIconStatus;
}

interface IPullRequestIdentity {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

interface IPullRequestListEntry extends IGitHubReferenceListEntry {
	readonly owner: string;
	readonly repo: string;
	readonly uri: URI;
}

// --- Open Pull Request action

const githubPullRequestsExtensionId = 'github.vscode-pull-request-github';
const openPullRequestWebviewPath = '/open-pull-request-webview';

class PullRequestActionContext {
	constructor(readonly pullRequest: IGitHubPullRequestRef) { }
}

function isPullRequestActionContext(target: unknown): target is PullRequestActionContext {
	if (!target || typeof target !== 'object') {
		return false;
	}

	const candidate = target as { readonly pullRequest?: IGitHubPullRequestRef };
	return !!candidate.pullRequest &&
		typeof candidate.pullRequest.owner === 'string' &&
		typeof candidate.pullRequest.repo === 'string' &&
		typeof candidate.pullRequest.number === 'number' &&
		URI.isUri(candidate.pullRequest.uri);
}

class OpenPullRequestAction extends Action2 {
	static readonly ID = OPEN_PULL_REQUEST_ACTION_ID;

	constructor() {
		super({
			id: OpenPullRequestAction.ID,
			title: localize2('agentSessions.openPullRequest', "Open Pull Request"),
			icon: Codicon.gitPullRequest,
			f1: false,
			// Metadata pill that summarizes the session's pull requests.
			menu: [{
				id: Menus.SessionHeaderMeta,
				group: 'navigation',
				order: 1,
				when: SessionHasPullRequestContext
			}, {
				id: Menus.SessionItemContextMenu,
				group: '2_pullRequest',
				order: 0,
				when: SessionHasPullRequestContext
			}],
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: IActiveSession | ISession | ISession[] | PullRequestActionContext): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);

		const target = (Array.isArray(sessionOrContext) ? sessionOrContext[0] : sessionOrContext) ?? sessionsService.activeSession.get();
		const pullRequest = isPullRequestActionContext(target) ? target.pullRequest : getSessionPullRequest(target);
		if (!pullRequest) {
			return;
		}

		const extensionService = accessor.get(IExtensionService);
		const urlService = accessor.get(IURLService);
		const openerService = accessor.get(IOpenerService);
		if (await extensionService.getExtension(githubPullRequestsExtensionId)) {
			const uri = urlService.create({
				authority: githubPullRequestsExtensionId,
				path: openPullRequestWebviewPath,
				query: JSON.stringify({
					owner: pullRequest.owner,
					repo: pullRequest.repo,
					pullRequestNumber: pullRequest.number,
				}),
			});
			if (await urlService.open(uri, { trusted: true })) {
				return;
			}
		}

		await openerService.open(pullRequest.uri, { openExternal: true });
	}
}
registerAction2(OpenPullRequestAction);

// --- Copy Pull Request URL action

function getSessionPullRequest(session: ISession | undefined): IGitHubPullRequestRef | undefined {
	const gitHubInfo = session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
	return getGitHubPullRequestRefs(gitHubInfo)[0];
}

class CopyPullRequestUrlAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.copyPullRequestUrl';

	constructor() {
		super({
			id: CopyPullRequestUrlAction.ID,
			title: localize2('agentSessions.copyPullRequestUrl', "Copy Pull Request URL"),
			f1: false,
			menu: [{
				id: Menus.SessionItemContextMenu,
				group: '2_pullRequest',
				order: 1,
				when: SessionHasPullRequestContext
			}],
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: IActiveSession | ISession | ISession[] | PullRequestActionContext): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const sessionsService = accessor.get(ISessionsService);

		const target = (Array.isArray(sessionOrContext) ? sessionOrContext[0] : sessionOrContext) ?? sessionsService.activeSession.get();
		const pullRequest = isPullRequestActionContext(target) ? target.pullRequest : getSessionPullRequest(target);
		if (!pullRequest) {
			return;
		}

		await clipboardService.writeText(pullRequest.uri.toString(true));
	}
}
registerAction2(CopyPullRequestUrlAction);

// --- Open Pull Request action view item (session header pull request pill)

/**
 * Renders the session's pull requests as a single header pill and opens a picker for history.
 */
export class OpenPullRequestActionViewItem extends ChatPillActionViewItem {

	private readonly _pullRequestRefsObs: IObservable<readonly IGitHubPullRequestRef[]>;
	private readonly _pullRequestIdentitiesObs: IObservable<readonly IPullRequestIdentity[]>;
	private readonly _pullRequestsObs: IObservable<readonly IResolvedSessionPullRequest[]>;
	private readonly _pullRequestList = this._register(new MutableDisposable<GitHubReferenceList<IPullRequestListEntry>>());

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@ISessionContext sessionContext: ISessionContext,
		@ICommandService private readonly _commandService: ICommandService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@IPullRequestIconCache private readonly _pullRequestIconCache: IPullRequestIconCache,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super(undefined, action, options);

		this._pullRequestRefsObs = derivedOpts<readonly IGitHubPullRequestRef[]>({
			owner: this,
			equalsFn: (a, b) => arrayEquals(a, b, (x, y) =>
				x.owner === y.owner &&
				x.repo === y.repo &&
				x.number === y.number &&
				isEqual(x.uri, y.uri) &&
				(x.icon === y.icon || (!!x.icon && !!y.icon && ThemeIcon.isEqual(x.icon, y.icon))))
		}, reader => {
			const session = sessionContext.session.read(reader);
			const workspace = session?.workspace.read(reader);
			const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
			return getGitHubPullRequestRefs(gitHubInfo);
		});

		this._pullRequestIdentitiesObs = derivedOpts<readonly IPullRequestIdentity[]>({
			owner: this,
			equalsFn: (a, b) => arrayEquals(a, b, (x, y) => x.owner === y.owner && x.repo === y.repo && x.number === y.number)
		}, reader => this._pullRequestRefsObs.read(reader).map(({ owner, repo, number }) => ({ owner, repo, number })));

		this._pullRequestsObs = derived(reader => this._pullRequestRefsObs.read(reader).map((ref, index) => {
			const reference = reader.store.add(this._gitHubService.createPullRequestModelReference(ref.owner, ref.repo, ref.number));
			const pullRequest = reference.object.pullRequest.read(reader);
			const status = pullRequest ? computePullRequestIconStatus(reader, this._gitHubService, ref.owner, ref.repo, pullRequest) : {};
			const icon = pullRequest
				? computePullRequestIcon(pullRequest.isDraft ? 'draft' : pullRequest.state, status)
				: this._pullRequestIconCache.get(ref.uri.toString()) ?? ref.icon ?? (index === 0 ? computePullRequestIcon(GitHubPullRequestState.Open) : undefined);
			if (pullRequest && icon) {
				this._pullRequestIconCache.set(ref.uri.toString(), icon);
			}
			return {
				ref,
				pullRequest,
				icon,
				status,
			};
		}));

		this._register(autorun(reader => {
			for (const identity of this._pullRequestIdentitiesObs.read(reader)) {
				const reference = reader.store.add(this._gitHubService.createPullRequestModelReference(identity.owner, identity.repo, identity.number));
				const model = reference.object;
				model.refresh();

				const shouldPoll = derived(this, pollReader => {
					const state = model.pullRequest.read(pollReader)?.state;
					return state === undefined || state === GitHubPullRequestState.Open;
				});
				reader.store.add(autorun(pollReader => {
					if (shouldPoll.read(pollReader)) {
						pollReader.store.add(model.startPolling());
					}
				}));

				reader.store.add(autorun(statusReader => {
					const pullRequest = model.pullRequest.read(statusReader);
					if (!pullRequest || pullRequest.isDraft || pullRequest.state !== GitHubPullRequestState.Open) {
						return;
					}

					const ciReference = statusReader.store.add(this._gitHubService.createPullRequestCIModelReference(identity.owner, identity.repo, identity.number, pullRequest.headSha));
					ciReference.object.refresh();
					statusReader.store.add(ciReference.object.startPolling());

					const reviewThreadsReference = statusReader.store.add(this._gitHubService.createPullRequestReviewThreadsModelReference(identity.owner, identity.repo, identity.number));
					reviewThreadsReference.object.refresh();
					statusReader.store.add(reviewThreadsReference.object.startPolling());
				}));
			}
		}));

		this._register(autorun(reader => {
			const pullRequests = this._pullRequestsObs.read(reader);
			this._pullRequestList.value?.update(this._getPullRequestListEntries(pullRequests));
			this.updateLabel();
			this.updateTooltip();
		}));
	}

	protected override hasOpenDropdown(): boolean {
		return !!this._pullRequestList.value;
	}

	protected override onDidClickButton(): void {
		if (this.hasOpenDropdown()) {
			this._hoverService.hideHover(true);
			return;
		}

		const pullRequests = this._pullRequestsObs.get();
		if (pullRequests.length > 1) {
			this._showPullRequestPicker(pullRequests);
			return;
		}

		super.onDidClickButton();
	}

	protected override getIconElement(): HTMLElement | undefined {
		const icon = getHighestPriorityPullRequestIcon(this._pullRequestsObs.get().map(pullRequest => pullRequest.icon)) ?? Codicon.gitPullRequest;
		const iconElement = $(`span.chat-pill-icon${ThemeIcon.asCSSSelector(icon)}`, { 'aria-hidden': 'true' });
		if (icon.color) {
			// Inline `!important` wins over `button.css`'s `.monaco-text-button .codicon
			// { color: inherit !important }`, so the glyph reflects the live PR state color.
			iconElement.style.setProperty('color', asCssVariable(icon.color.id), 'important');
		}
		return iconElement;
	}

	protected override getLabelText(): string {
		const pullRequests = this._pullRequestsObs.get();
		if (pullRequests.length === 0) {
			return '';
		}
		return pullRequests.length === 1
			? `#${pullRequests[0].ref.number}`
			: localize('agentSessions.openPullRequest.count', "{0} Pull Requests", pullRequests.length);
	}

	protected override getHoverContents(): IManagedHoverContent | undefined {
		const pullRequests = this._pullRequestsObs.get();
		if (pullRequests.length !== 1) {
			return this.getTooltip();
		}

		const { ref, pullRequest } = pullRequests[0];
		return {
			element: () => createPullRequestHoverElement({
				owner: ref.owner,
				repo: ref.repo,
				number: ref.number,
				repositoryHref: this._getRepositoryUri(ref).toString(true),
				pullRequest,
				onDidClickRepository: () => this._openerService.open(this._getRepositoryUri(ref), { openExternal: true }),
			}),
		};
	}

	protected override getHoverOptions(): IManagedHoverOptions | undefined {
		const pullRequests = this._pullRequestsObs.get();
		if (pullRequests.length !== 1) {
			return undefined;
		}

		const ref = pullRequests[0].ref;
		return {
			actions: [{
				commandId: CopyPullRequestUrlAction.ID,
				label: localize('agentSessions.pullRequestHover.copyLink', "Copy Link"),
				iconClass: ThemeIcon.asClassName(Codicon.copy),
				run: () => this._copyPullRequestLink(ref),
			}],
		};
	}

	protected override getTooltip(): string {
		const pullRequests = this._pullRequestsObs.get();
		if (pullRequests.length > 1) {
			return localize('agentSessions.openPullRequest.tooltipMany', "Show the {0} Pull Requests Associated with This Session", pullRequests.length);
		}
		const number = pullRequests[0]?.ref.number;
		return number !== undefined
			? localize('agentSessions.openPullRequest.tooltipWithNumber', "Open Pull Request #{0}", number)
			: localize('agentSessions.openPullRequest.tooltip', "Open Pull Request");
	}

	private _copyPullRequestLink(ref: IGitHubPullRequestRef): void {
		this._commandService.executeCommand(CopyPullRequestUrlAction.ID, new PullRequestActionContext(ref));
	}

	private _showPullRequestPicker(pullRequests: readonly IResolvedSessionPullRequest[]): void {
		const target = this.button?.element;
		if (!target) {
			return;
		}

		const list = this._pullRequestList.value = new GitHubReferenceList(this._getPullRequestListEntries(pullRequests), entry => {
			this._hoverService.hideHover();
			this.actionRunner.run(this._action, new PullRequestActionContext(entry));
		});
		list.element.onkeydown = event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				this._hoverService.hideHover();
			}
		};

		const hover = this._hoverService.showInstantHover({
			content: list.element,
			target,
			position: { hoverPosition: HoverPosition.BELOW },
			persistence: { sticky: true, hideOnKeyDown: false },
			appearance: { showPointer: false, skipFadeInAnimation: true },
			trapFocus: true,
			onDidHide: () => {
				if (this._pullRequestList.value === list) {
					this._pullRequestList.clear();
				}
			},
		}, true);
		if (!hover) {
			this._pullRequestList.clear();
		}
	}

	private _getRepositoryUri(ref: { readonly owner: string; readonly repo: string }): URI {
		return URI.parse(`https://github.com/${ref.owner}/${ref.repo}`);
	}

	private _getPullRequestListEntries(pullRequests: readonly IResolvedSessionPullRequest[]): readonly IPullRequestListEntry[] {
		return pullRequests.map(({ ref, pullRequest, icon, status }) => ({
			owner: ref.owner,
			repo: ref.repo,
			number: ref.number,
			title: pullRequest?.title,
			icon: icon ?? Codicon.gitPullRequest,
			uri: ref.uri,
			ariaLabel: getPullRequestAriaLabel(ref, pullRequest, status),
			toolbarActions: [toAction({
				id: CopyPullRequestUrlAction.ID,
				label: localize('agentSessions.pullRequestList.copyLink', "Copy Pull Request Link"),
				class: ThemeIcon.asClassName(Codicon.copy),
				run: () => this._copyPullRequestLink(ref),
			})],
		}));
	}
}

function getPullRequestAriaLabel(ref: IGitHubPullRequestRef, pullRequest: IGitHubPullRequest | undefined, status: IPullRequestIconStatus): string {
	let kind: string;
	if (pullRequest?.isDraft) {
		kind = localize('agentSessions.pullRequestList.draft', "Draft Pull Request");
	} else {
		switch (pullRequest?.state) {
			case GitHubPullRequestState.Open:
				kind = localize('agentSessions.pullRequestList.open', "Open Pull Request");
				break;
			case GitHubPullRequestState.Merged:
				kind = localize('agentSessions.pullRequestList.merged', "Merged Pull Request");
				break;
			case GitHubPullRequestState.Closed:
				kind = localize('agentSessions.pullRequestList.closed', "Closed Pull Request");
				break;
			default:
				kind = localize('agentSessions.pullRequestList.pullRequest', "Pull Request");
		}
	}

	const baseLabel = pullRequest?.title
		? localize('agentSessions.pullRequestList.labelWithTitle', "{0} #{1}: {2}", kind, ref.number, pullRequest.title)
		: localize('agentSessions.pullRequestList.label', "{0} #{1}", kind, ref.number);

	let attention: string | undefined;
	if (status.hasFailingChecks && status.hasUnresolvedComments) {
		attention = localize('agentSessions.pullRequestList.failingChecksAndUnresolvedComments', "failing checks and unresolved comments");
	} else if (status.hasFailingChecks) {
		attention = localize('agentSessions.pullRequestList.failingChecks', "failing checks");
	} else if (status.hasUnresolvedComments) {
		attention = localize('agentSessions.pullRequestList.unresolvedComments', "unresolved comments");
	}

	return attention
		? localize('agentSessions.pullRequestList.labelWithAttention', "{0}, {1}", baseLabel, attention)
		: baseLabel;
}

/**
 * Registers the {@link OpenPullRequestActionViewItem} for the pull-request metadata pill.
 */
class OpenPullRequestActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openPullRequestActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// Announce the factory after registration so existing metadata pills re-render.
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(Menus.SessionHeaderMeta, OpenPullRequestAction.ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(OpenPullRequestActionViewItem, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}

registerWorkbenchContribution2(OpenPullRequestActionViewItemContribution.ID, OpenPullRequestActionViewItemContribution, WorkbenchPhase.AfterRestored);
