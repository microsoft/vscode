/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IRemoteExplorerService } from '../../../../workbench/services/remote/common/remoteExplorerService.js';
import { Tunnel } from '../../../../workbench/services/remote/common/tunnelModel.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { HasForwardedPortContext, IsActiveSessionBackgroundProviderContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { logSessionsInteraction } from '../../../common/sessionsTelemetry.js';

const OPEN_FORWARDED_PORT_ACTION_ID = 'workbench.action.agentSessions.openForwardedPort';

/**
 * Web-only replacement for the desktop "Run" split button in the agents
 * titlebar. When the active session's terminal output reveals a
 * `localhost:<port>` reference, core's `UrlFinder` +
 * `OutputAutomaticPortForwarding` pipeline routes the port through the
 * embedder-supplied `tunnelProvider.tunnelFactory` (set on
 * `IWorkbenchConstructionOptions` by `vscode-dev/agents`), producing a
 * publicly addressable URL on the active Dev Tunnel. This action surfaces a
 * globe button in the titlebar that lights up as soon as a port is
 * forwarded; clicking it picks one of the forwarded URLs and opens it in a
 * new tab via `IOpenerService`.
 *
 * The original task-running Run split button still ships in the same slot
 * for non-web embedders — see `runScriptAction.ts` for that registration.
 *
 * Mobile is automatically excluded: `mobileTitlebarPart` only mounts the
 * `MobileTitleBarCenter` menu and never `Menus.TitleBarSessionMenu`. Web vs
 * desktop is gated via `IsWebContext` in each menu item's `when` clause.
 *
 * The contribution itself runs everywhere so the {@link HasForwardedPortContext}
 * key always reflects reality (a no-op on desktop, where no menu consumes it).
 */
export class OpenForwardedPortContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessions.openForwardedPort';

	constructor(
		@IRemoteExplorerService remoteExplorerService: IRemoteExplorerService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const tunnelModel = remoteExplorerService.tunnelModel;
		const hasPort = HasForwardedPortContext.bindTo(contextKeyService);

		const update = () => hasPort.set(tunnelModel.forwarded.size > 0);
		update();
		this._register(tunnelModel.onForwardPort(update));
		this._register(tunnelModel.onClosePort(update));
		// `TunnelModel`'s constructor restores entries from
		// `tunnelService.tunnels` *without* firing `onForwardPort`, so the
		// initial `update()` above can miss restored ports. Re-evaluate on
		// the next macrotask once the restore promise has settled. Today
		// agents sessions never start with pre-existing tunnels, but
		// anything that pre-populates the tunnel service in the future
		// would otherwise leave the globe button hidden until the next
		// open/close event.
		this._register(disposableTimeout(update, 0));
	}
}

interface IForwardedPortPickItem extends IQuickPickItem {
	readonly tunnel: Tunnel;
}

class OpenForwardedPortAction extends Action2 {
	constructor() {
		super({
			id: OPEN_FORWARDED_PORT_ACTION_ID,
			title: localize2('openForwardedPort', "Open Forwarded Port"),
			tooltip: localize('openForwardedPortTooltip', "Open a port forwarded from the active session"),
			icon: Codicon.globe,
			category: SessionsCategories.Sessions,
			f1: true,
			// `IsWebContext` is included in the precondition so the command
			// is hidden from the desktop command palette (where there is no
			// menu host for it and no embedder tunnel-factory to populate
			// the forwarded ports list).
			precondition: ContextKeyExpr.and(IsWebContext, HasForwardedPortContext),
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 8,
				when: ContextKeyExpr.and(
					IsWebContext,
					IsAuxiliaryWindowContext.toNegated(),
					SessionsWelcomeVisibleContext.toNegated(),
					IsActiveSessionBackgroundProviderContext,
				),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const remoteExplorerService = accessor.get(IRemoteExplorerService);
		const openerService = accessor.get(IOpenerService);
		const quickInputService = accessor.get(IQuickInputService);
		const telemetryService = accessor.get(ITelemetryService);

		const tunnels = [...remoteExplorerService.tunnelModel.forwarded.values()];
		if (tunnels.length === 0) {
			return;
		}

		logSessionsInteraction(telemetryService, 'openForwardedPort');

		let target: Tunnel | undefined;
		if (tunnels.length === 1) {
			target = tunnels[0];
		} else {
			const items: IForwardedPortPickItem[] = tunnels.map(tunnel => ({
				label: `$(globe) ${tunnel.remoteHost}:${tunnel.remotePort}`,
				description: tunnel.localAddress,
				detail: tunnel.name,
				tunnel,
			}));
			const picked = await quickInputService.pick(items, {
				placeHolder: localize('pickForwardedPort', "Open forwarded port"),
				matchOnDescription: true,
			});
			target = picked?.tunnel;
		}

		if (target) {
			await openerService.open(target.localUri, { openExternal: true });
		}
	}
}

// Disabled placeholder shown in the titlebar slot when the active session
// does not support port forwarding (e.g. local agent host or a non-web
// embedder that nevertheless lands on this contribution). Mirrors the
// pattern used by RunScriptNotAvailableAction in runScriptAction.ts.
class OpenForwardedPortNotAvailableAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.agentSessions.openForwardedPort.notAvailable',
			title: localize2('openForwardedPort', "Open Forwarded Port"),
			tooltip: localize('openForwardedPortNotAvailableTooltip', "Forwarded ports are not available for this session type"),
			icon: Codicon.globe,
			precondition: ContextKeyExpr.false(),
			menu: [{
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 8,
				when: ContextKeyExpr.and(
					IsWebContext,
					IsAuxiliaryWindowContext.toNegated(),
					SessionsWelcomeVisibleContext.toNegated(),
					IsActiveSessionBackgroundProviderContext.toNegated(),
				),
			}],
		});
	}

	override run(): void { }
}

registerAction2(OpenForwardedPortAction);
registerAction2(OpenForwardedPortNotAvailableAction);
