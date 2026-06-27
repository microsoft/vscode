/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { $ } from '../../../../base/browser/dom.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Menus } from '../../../browser/menus.js';
import { SessionHeaderMetaActionViewItem } from '../../../browser/parts/sessionHeaderMetaActionViewItem.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { SessionHasPullRequestContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubPullRequest } from '../common/types.js';
import { IGitHubService } from './githubService.js';
import { createPullRequestHoverElement } from './pullRequestHover.js';

// --- Open Pull Request action

class OpenPullRequestAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.openPullRequest';

	constructor() {
		super({
			id: OpenPullRequestAction.ID,
			title: localize2('agentSessions.openPullRequest', 'Open Pull Request'),
			icon: Codicon.gitPullRequest,
			f1: false,
			// Pull request pill shown in the session header meta row
			// (vs/sessions/browser/parts/sessionHeader.ts). Rendered with a
			// custom action view item that shows the PR icon + live `#<number>` label.
			menu: {
				id: Menus.SessionHeaderMeta,
				group: 'navigation',
				order: 1,
				when: SessionHasPullRequestContext
			},
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const sessionsService = accessor.get(ISessionsService);

		// The clicked session is forwarded as the argument by the session header,
		// which has already promoted it to be the active session. Fall back to the
		// active session when invoked without an explicit argument.
		const targetSession = session ?? sessionsService.activeSession.get();
		const pullRequestUri = getPullRequestUri(targetSession);
		if (!pullRequestUri) {
			return;
		}

		await openerService.open(pullRequestUri, { openExternal: true });
	}
}
registerAction2(OpenPullRequestAction);

function getPullRequestUri(session: IActiveSession | undefined): URI | undefined {
	return session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.pullRequest?.uri;
}

// --- Open Pull Request action view item (session header pull request pill)

/**
 * Renders the session's associated pull request as a PR icon + `#<number>` pill, the
 * {@link OpenPullRequestAction} menu item contributed into {@link Menus.SessionHeaderMeta}
 * (the session header meta row). It extends the generic {@link SessionHeaderMetaActionViewItem}
 * (so it renders consistently with other meta actions) and shows the live `#<number>` as its label.
 * Activating the item runs the action, which opens the pull request on GitHub.
 *
 * The pull request number is read from the {@link ISessionContext} so the correct per-session
 * pull request is shown even when several session views are visible at once.
 */
export class OpenPullRequestActionViewItem extends SessionHeaderMetaActionViewItem {

	private readonly _pullRequestIdentityObs: IObservable<{ readonly owner: string; readonly repo: string; readonly number: number; readonly icon: ThemeIcon | undefined } | undefined>;
	private readonly _pullRequestObs: IObservable<IGitHubPullRequest | undefined>;

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@ISessionContext sessionContext: ISessionContext,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super(undefined, action, options);

		this._pullRequestIdentityObs = derivedOpts<{ readonly owner: string; readonly repo: string; readonly number: number; readonly icon: ThemeIcon | undefined } | undefined>({ owner: this, equalsFn: structuralEquals }, reader => {
			const session = sessionContext.session.read(reader);
			const workspace = session?.workspace.read(reader);
			const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
			if (!gitHubInfo?.pullRequest) {
				return undefined;
			}
			return { owner: gitHubInfo.owner, repo: gitHubInfo.repo, number: gitHubInfo.pullRequest.number, icon: gitHubInfo.pullRequest.icon };
		});

		this._pullRequestObs = derived(reader => {
			const identity = this._pullRequestIdentityObs.read(reader);
			if (!identity) {
				return undefined;
			}

			const reference = reader.store.add(this._gitHubService.createPullRequestModelReference(identity.owner, identity.repo, identity.number));
			return reference.object.pullRequest.read(reader);
		});

		this._register(autorun(reader => {
			this._pullRequestIdentityObs.read(reader);
			this._pullRequestObs.read(reader);
			this.updateLabel();
			this.updateTooltip();
		}));
	}

	protected override getIconElement(): HTMLElement | undefined {
		const icon = this._pullRequestIdentityObs.get()?.icon ?? Codicon.gitPullRequest;
		const iconElement = $(`span.chat-composite-bar-meta-item-icon${ThemeIcon.asCSSSelector(icon)}`);
		if (icon.color) {
			// Inline `!important` wins over `button.css`'s `.monaco-text-button .codicon
			// { color: inherit !important }`, so the glyph reflects the live PR state color.
			iconElement.style.setProperty('color', asCssVariable(icon.color.id), 'important');
		}
		return iconElement;
	}

	protected override getLabelText(): string {
		const number = this._pullRequestIdentityObs.get()?.number;
		return number !== undefined ? `#${number}` : '';
	}

	protected override getHoverContents(): IManagedHoverContent | undefined {
		const identity = this._pullRequestIdentityObs.get();
		if (!identity) {
			return this.getTooltip();
		}

		return {
			element: () => createPullRequestHoverElement({
				owner: identity.owner,
				repo: identity.repo,
				number: identity.number,
				repositoryHref: this._getRepositoryUri(identity).toString(true),
				pullRequest: this._pullRequestObs.get(),
				onDidClickRepository: () => this._openerService.open(this._getRepositoryUri(identity), { openExternal: true }),
			}),
		};
	}

	protected override getTooltip(): string {
		const number = this._pullRequestIdentityObs.get()?.number;
		return number !== undefined
			? localize('agentSessions.openPullRequest.tooltipWithNumber', "Open Pull Request #{0}", number)
			: localize('agentSessions.openPullRequest.tooltip', "Open Pull Request");
	}

	private _getRepositoryUri(identity: { readonly owner: string; readonly repo: string }): URI {
		return URI.parse(`https://github.com/${identity.owner}/${identity.repo}`);
	}
}

/**
 * Registers the {@link OpenPullRequestActionViewItem} for the open-pull-request action in the
 * session header meta toolbar. Registering it here (rather than in the core session header)
 * keeps the rendering of the GitHub-owned action co-located with the action itself.
 */
class OpenPullRequestActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openPullRequestActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// The action view item service only notifies toolbars of a factory via
		// the event passed to register(), not on registration itself. A session
		// header restored with an existing pull request may create its meta
		// toolbar before this contribution runs, so announce the factory once
		// right after registering to make those toolbars re-render and pick it up.
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
