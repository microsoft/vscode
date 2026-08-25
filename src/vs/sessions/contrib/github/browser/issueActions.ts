/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { $ } from '../../../../base/browser/dom.js';
import { arrayEquals } from '../../../../base/common/equals.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
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
import { SessionHasIssuesContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubIssueRef, ISession } from '../../../services/sessions/common/session.js';
import { computeAggregateIssueIcon, computeIssueIcon, GitHubIssueState, IGitHubIssue, OPEN_ISSUE_ACTION_ID } from '../common/types.js';
import { IGitHubService } from './githubService.js';
import { createIssueHoverElement } from './issueHover.js';
import { createGitHubReferenceListElement } from './githubReferenceList.js';

/** A session issue paired with its live details, once they have been fetched. */
interface IResolvedSessionIssue {
	readonly ref: IGitHubIssueRef;
	readonly issue: IGitHubIssue | undefined;
}

// --- Open Issue action

const githubPullRequestsExtensionId = 'github.vscode-pull-request-github';
const openIssueWebviewPath = '/open-issue-webview';

class IssueActionContext {
	constructor(readonly issue: IGitHubIssueRef) { }
}

class OpenIssueAction extends Action2 {
	static readonly ID = OPEN_ISSUE_ACTION_ID;

	constructor() {
		super({
			id: OpenIssueAction.ID,
			title: localize2('agentSessions.openIssue', 'Open Issue'),
			icon: Codicon.issues,
			f1: false,
			// Metadata pill shown after pull requests.
			menu: [{
				id: Menus.SessionHeaderMeta,
				group: 'navigation',
				order: 2,
				when: SessionHasIssuesContext
			}],
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: IActiveSession | ISession | ISession[] | IssueActionContext): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const sessionsService = accessor.get(ISessionsService);
		const extensionService = accessor.get(IExtensionService);
		const urlService = accessor.get(IURLService);

		const target = (Array.isArray(sessionOrContext) ? sessionOrContext[0] : sessionOrContext) ?? sessionsService.activeSession.get();
		const issue = target instanceof IssueActionContext ? target.issue : getSessionIssues(target)[0];
		if (!issue) {
			return;
		}

		if (await extensionService.getExtension(githubPullRequestsExtensionId)) {
			const uri = urlService.create({
				authority: githubPullRequestsExtensionId,
				path: openIssueWebviewPath,
				query: JSON.stringify({
					owner: issue.owner,
					repo: issue.repo,
					issueNumber: issue.number,
				}),
			});
			if (await urlService.open(uri, { trusted: true })) {
				return;
			}
		}

		await openerService.open(issue.uri, { openExternal: true });
	}
}
registerAction2(OpenIssueAction);

function getSessionIssues(session: ISession | undefined): readonly IGitHubIssueRef[] {
	return session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.issues ?? [];
}

// --- Open Issue action view item

/**
 * Renders the GitHub issues a session references as a single metadata pill.
 *
 * A session that references one issue shows `#<number>` and hovers to the issue's details.
 * A session that references several shows `<n> issues` and opens a picker on click, since the
 * pill then stands for a set rather than a single target. Either way the icon reflects the
 * aggregate live state: open wins over closed, and closed-as-completed wins over
 * closed as not planned.
 *
 * The issues are read from the {@link ISessionContext} so the correct per-session issues are
 * shown even when several session views are visible at once.
 */
export class OpenIssueActionViewItem extends ChatPillActionViewItem {

	private readonly _issueRefsObs: IObservable<readonly IGitHubIssueRef[]>;
	private readonly _issuesObs: IObservable<readonly IResolvedSessionIssue[]>;
	private _issuePickerVisible = false;

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@ISessionContext sessionContext: ISessionContext,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super(undefined, action, options);

		this._issueRefsObs = derivedOpts<readonly IGitHubIssueRef[]>({
			owner: this,
			equalsFn: (a, b) => arrayEquals(a, b, (x, y) => x.owner === y.owner && x.repo === y.repo && x.number === y.number)
		}, reader => {
			const session = sessionContext.session.read(reader);
			const workspace = session?.workspace.read(reader);
			return workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader)?.issues ?? [];
		});

		this._issuesObs = derived(reader => this._issueRefsObs.read(reader).map(ref => {
			const reference = reader.store.add(this._gitHubService.createIssueModelReference(ref.owner, ref.repo, ref.number));
			return { ref, issue: reference.object.issue.read(reader) };
		}));

		// Keep the issue models warm for as long as the pill is rendered so the icon
		// reflects the live state. This autorun depends only on the issue *identities*,
		// so a state change does not release and re-acquire every model.
		this._register(autorun(reader => {
			for (const ref of this._issueRefsObs.read(reader)) {
				const reference = reader.store.add(this._gitHubService.createIssueModelReference(ref.owner, ref.repo, ref.number));
				const model = reference.object;
				model.refresh();

				// A closed issue is effectively final, so it is only fetched once. Gate the
				// repeating loop on a stable boolean so poll results don't toggle it.
				const shouldPoll = derived(this, pollReader => model.issue.read(pollReader)?.state !== GitHubIssueState.Closed);
				reader.store.add(autorun(pollReader => {
					if (shouldPoll.read(pollReader)) {
						pollReader.store.add(model.startPolling());
					}
				}));
			}
		}));

		this._register(autorun(reader => {
			this._issuesObs.read(reader);
			this.updateLabel();
			this.updateTooltip();
		}));
	}

	protected override hasOpenDropdown(): boolean {
		return this._issuePickerVisible;
	}

	protected override onDidClickButton(): void {
		if (this.hasOpenDropdown()) {
			this._hoverService.hideHover(true);
			return;
		}

		const issues = this._issuesObs.get();
		if (issues.length > 1) {
			this._showIssuePicker(issues);
			return;
		}

		super.onDidClickButton();
	}

	protected override getIconElement(): HTMLElement | undefined {
		const icon = this._computeIcon();
		const iconElement = $(`span.chat-pill-icon${ThemeIcon.asCSSSelector(icon)}`, { 'aria-hidden': 'true' });
		if (icon.color) {
			// Inline `!important` wins over `button.css`'s `.monaco-text-button .codicon
			// { color: inherit !important }`, so the glyph reflects the live issue state color.
			iconElement.style.setProperty('color', asCssVariable(icon.color.id), 'important');
		}
		return iconElement;
	}

	protected override getLabelText(): string {
		const issues = this._issuesObs.get();
		if (issues.length === 0) {
			return '';
		}
		return issues.length === 1
			? `#${issues[0].ref.number}`
			: localize('agentSessions.openIssue.count', "{0} issues", issues.length);
	}

	protected override getHoverContents(): IManagedHoverContent | undefined {
		const issues = this._issuesObs.get();
		if (issues.length !== 1) {
			return this.getTooltip();
		}

		const { ref, issue } = issues[0];
		return {
			element: () => createIssueHoverElement({
				owner: ref.owner,
				repo: ref.repo,
				number: ref.number,
				repositoryHref: this._getRepositoryUri(ref).toString(true),
				issue,
				onDidClickRepository: () => this._openerService.open(this._getRepositoryUri(ref), { openExternal: true }),
			}),
		};
	}

	protected override getTooltip(): string {
		const issues = this._issuesObs.get();
		if (issues.length > 1) {
			return localize('agentSessions.openIssue.tooltipMany', "Show the {0} Issues Referenced by This Session", issues.length);
		}
		const number = issues[0]?.ref.number;
		return number !== undefined
			? localize('agentSessions.openIssue.tooltipWithNumber', "Open Issue #{0}", number)
			: localize('agentSessions.openIssue.tooltip', "Open Issue");
	}

	private _computeIcon(): ThemeIcon {
		const issues = this._issuesObs.get();
		if (issues.length === 1) {
			const issue = issues[0].issue;
			return issue ? computeIssueIcon(issue.state, issue.stateReason) : computeIssueIcon(GitHubIssueState.Open, undefined);
		}
		return computeAggregateIssueIcon(issues.map(({ issue }) => issue));
	}

	/**
	 * Shows the referenced issues below the pill. A sticky hover is used rather than a
	 * context menu because menu items render their icon on the label element, which would
	 * lose the per-issue state color.
	 */
	private _showIssuePicker(issues: readonly IResolvedSessionIssue[]): void {
		const target = this.button?.element;
		if (!target) {
			return;
		}

		const entries = issues.map(({ ref, issue }) => ({
			owner: ref.owner,
			repo: ref.repo,
			number: ref.number,
			title: issue?.title,
			icon: issue ? computeIssueIcon(issue.state, issue.stateReason) : computeIssueIcon(GitHubIssueState.Open, undefined),
			uri: ref.uri,
		}));

		this._issuePickerVisible = true;
		const hover = this._hoverService.showInstantHover({
			content: createGitHubReferenceListElement(entries, entry => {
				this._hoverService.hideHover();
				this.actionRunner.run(this._action, new IssueActionContext(entry));
			}),
			target,
			position: { hoverPosition: HoverPosition.BELOW },
			persistence: { sticky: true, hideOnKeyDown: true },
			appearance: { showPointer: false, skipFadeInAnimation: true },
			trapFocus: true,
			onDidHide: () => this._issuePickerVisible = false,
		}, true);
		if (!hover) {
			this._issuePickerVisible = false;
		}
	}

	private _getRepositoryUri(ref: IGitHubIssueRef): URI {
		return URI.parse(`https://github.com/${ref.owner}/${ref.repo}`);
	}
}

/**
 * Registers the {@link OpenIssueActionViewItem} for the issue metadata pill.
 */
class OpenIssueActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openIssueActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// Announce the factory after registration so existing metadata pills re-render.
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(Menus.SessionHeaderMeta, OpenIssueAction.ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(OpenIssueActionViewItem, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}

registerWorkbenchContribution2(OpenIssueActionViewItemContribution.ID, OpenIssueActionViewItemContribution, WorkbenchPhase.AfterRestored);
