/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, getWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { TERMINAL_VIEW_ID } from '../../../../workbench/contrib/terminal/common/terminal.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { IPathService } from '../../../../workbench/services/path/common/pathService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionHeaderMetaActionViewItem } from '../../../browser/parts/sessionHeaderMetaActionViewItem.js';
import { SessionHasTerminalsContext } from '../../../common/contextkeys.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { EMPTY_SESSION_TERMINAL_COUNTS, ISessionTerminalCounts, ISessionTerminalsService } from '../../../services/sessions/browser/sessionTerminalsService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { getSessionTerminalInfo, SessionsTerminalContribution } from './sessionsTerminalContribution.js';

// --- Open Terminals action

class OpenSessionTerminalsAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.openTerminals';

	constructor() {
		super({
			id: OpenSessionTerminalsAction.ID,
			title: localize2('agentSessions.terminals', 'Terminals'),
			icon: Codicon.terminal,
			f1: false,
			// Active-terminals pill shown in the session header meta row
			// (vs/sessions/browser/parts/sessionHeader.ts). Rendered with a
			// custom action view item that shows the live terminal count.
			menu: {
				id: Menus.SessionHeaderMeta,
				group: 'navigation',
				order: 2,
				when: SessionHasTerminalsContext
			},
		});
	}

	override async run(accessor: ServicesAccessor, session?: IActiveSession): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const viewsService = accessor.get(IViewsService);
		const pathService = accessor.get(IPathService);

		// The clicked session is forwarded as the argument by the session header,
		// which has already promoted it to be the active session. Fall back to the
		// active session when invoked without an explicit argument.
		const targetSession = session ?? sessionsService.activeSession.get();

		// Ensure the session's terminal is present and shown (the active-session
		// change in the terminal contribution surfaces background terminals), then
		// reveal the terminal view.
		const contribution = getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID);
		const info = getSessionTerminalInfo(targetSession);
		const cwd = info?.cwd ?? await pathService.userHome();
		await contribution.ensureTerminal(cwd, true, targetSession);
		await viewsService.openView(TERMINAL_VIEW_ID);
	}
}
registerAction2(OpenSessionTerminalsAction);

// --- Open Terminals action view item (session header active-terminal count)

/**
 * Renders the {@link OpenSessionTerminalsAction} menu item contributed into
 * {@link Menus.SessionHeaderMeta} (the session header meta row) as a
 * `<terminal-icon> {n} terminals` pill. It extends the generic
 * {@link SessionHeaderMetaActionViewItem} (so the icon and label render consistently
 * with the other meta actions). The label shows the number of the session's terminals
 * that have had a command sent in them; the hover additionally reports how many of
 * those are currently running something (active). Activating the item reveals the
 * terminal view.
 *
 * The counts are read for the per-surface session published via {@link ISessionContext}
 * so the correct session's terminals are reflected even when several session views are
 * visible at once.
 */
export class OpenSessionTerminalsActionViewItem extends SessionHeaderMetaActionViewItem {

	private readonly _countsObs: IObservable<ISessionTerminalCounts>;

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@ISessionContext sessionContext: ISessionContext,
		@ISessionTerminalsService sessionTerminalsService: ISessionTerminalsService,
	) {
		super(undefined, action, options);

		const changeSignal = observableSignalFromEvent(this, sessionTerminalsService.onDidChangeTerminals);
		this._countsObs = derivedOpts({ owner: this, equalsFn: structuralEquals }, reader => {
			changeSignal.read(reader);
			const sessionId = sessionContext.session.read(reader)?.sessionId;
			return sessionId ? sessionTerminalsService.getTerminalCounts(sessionId) : EMPTY_SESSION_TERMINAL_COUNTS;
		});

		this._register(autorun(reader => {
			this._countsObs.read(reader);
			this.updateLabel();
			this.updateTooltip();
			this.updateAriaLabel();
		}));
	}

	protected override getLabelText(): string {
		const { total } = this._countsObs.get();
		return total === 1
			? localize('agentSessions.terminals.one', "{0} terminal", total)
			: localize('agentSessions.terminals.many', "{0} terminals", total);
	}

	protected override getTooltip(): string {
		const { active } = this._countsObs.get();
		return active === 1
			? localize('agentSessions.terminals.tooltip.one', "{0} active terminal", active)
			: localize('agentSessions.terminals.tooltip.many', "{0} active terminals", active);
	}

	protected override getAriaLabel(): string {
		const { total, active } = this._countsObs.get();
		const totalLabel = total === 1
			? localize('agentSessions.terminals.one', "{0} terminal", total)
			: localize('agentSessions.terminals.many', "{0} terminals", total);
		const activeLabel = active === 1
			? localize('agentSessions.terminals.tooltip.one', "{0} active terminal", active)
			: localize('agentSessions.terminals.tooltip.many', "{0} active terminals", active);
		// e.g. "Open Terminals: 3 terminals, 1 active terminal"
		return localize('agentSessions.terminals.ariaLabel', "Open Terminals: {0}, {1}", totalLabel, activeLabel);
	}
}

/**
 * Registers the {@link OpenSessionTerminalsActionViewItem} for the active-terminals
 * action in the session header meta toolbar. Registering it here (rather than in the
 * core session header) keeps the rendering of the terminal-owned action co-located
 * with the action itself.
 */
class OpenSessionTerminalsActionViewItemContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.openSessionTerminalsActionViewItem';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		// The action view item service only notifies toolbars of a factory via
		// the event passed to register(), not on registration itself. A session
		// header restored with existing terminals may create its meta toolbar
		// before this contribution runs, so announce the factory once right
		// after registering to make those toolbars re-render and pick it up.
		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(Menus.SessionHeaderMeta, OpenSessionTerminalsAction.ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(OpenSessionTerminalsActionViewItem, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();
	}
}

registerWorkbenchContribution2(OpenSessionTerminalsActionViewItemContribution.ID, OpenSessionTerminalsActionViewItemContribution, WorkbenchPhase.AfterRestored);
