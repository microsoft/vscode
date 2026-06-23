/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, reset } from '../../../../base/browser/dom.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { Menus } from '../../../browser/menus.js';
import { SessionHasPullRequestContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

// --- Open Pull Request action

class OpenPullRequestAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.openPullRequest';

	constructor() {
		super({
			id: OpenPullRequestAction.ID,
			title: localize2('agentSessions.openPullRequest', 'Open Pull Request'),
			f1: false,
			// Pull request pill shown in the session header meta row
			// (vs/sessions/browser/parts/sessionHeader.ts). Rendered with a
			// custom action view item that shows the live `#<number>` label.
			menu: {
				id: Menus.SessionHeaderMeta,
				group: 'navigation',
				order: 0,
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
 * Renders the session's associated pull request as a `#<number>` pill, the label of the
 * {@link OpenPullRequestAction} menu item contributed into {@link Menus.SessionHeaderMeta}
 * (the session header meta row). Activating the item runs the action, which opens the pull
 * request on GitHub.
 *
 * The pull request number is read from the {@link ISessionContext} so the correct per-session
 * pull request is shown even when several session views are visible at once.
 */
export class OpenPullRequestActionViewItem extends ActionViewItem {

	private readonly _pullRequestNumberObs: IObservable<number | undefined>;

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@ISessionContext sessionContext: ISessionContext,
	) {
		super(undefined, action, { ...options, icon: false, label: true });

		this._pullRequestNumberObs = derivedOpts<number | undefined>({ owner: this, equalsFn: structuralEquals }, reader => {
			const session = sessionContext.session.read(reader);
			const workspace = session?.workspace.read(reader);
			return workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader)?.pullRequest?.number;
		});

		this._register(autorun(reader => {
			this._pullRequestNumberObs.read(reader);
			this.updateLabel();
			this.updateTooltip();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-composite-bar-meta-pr');
	}

	protected override updateLabel(): void {
		if (!this.label) {
			return;
		}
		const number = this._pullRequestNumberObs.get();
		reset(
			this.label,
			$('span.chat-composite-bar-meta-pr-label', undefined, number !== undefined ? `#${number}` : ''),
		);
	}

	protected override getTooltip(): string {
		const number = this._pullRequestNumberObs.get();
		return number !== undefined
			? localize('agentSessions.openPullRequest.tooltipWithNumber', "Open Pull Request #{0}", number)
			: localize('agentSessions.openPullRequest.tooltip', "Open Pull Request");
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
