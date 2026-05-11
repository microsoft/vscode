/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from '../../../../base/common/platform.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { IDebugService } from '../../../../workbench/contrib/debug/common/debug.js';
import { UrlFinder } from '../../../../workbench/contrib/remote/browser/urlFinder.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../../workbench/services/environment/browser/environmentService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import {
	IRemoteExplorerService,
	PORT_AUTO_FORWARD_SETTING,
	PortsEnablement,
} from '../../../../workbench/services/remote/common/remoteExplorerService.js';
import {
	AutoTunnelSource,
	mapHasAddressLocalhostOrAllInterfaces,
	OnPortForward,
} from '../../../../workbench/services/remote/common/tunnelModel.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

/**
 * Drives auto port-forwarding for the agents workbench on the web
 * (`vscode.dev/agents`).
 *
 * The agents-web embedder installs a `tunnelProvider.tunnelFactory` on
 * `IWorkbenchConstructionOptions` to forward ports through a Dev Tunnel.
 * Core's stock {@link AutomaticPortForwarding} however gates itself on the
 * presence of a remote authority — which agents-web does not have — so it
 * never starts the URL-finder pipeline that scrapes the agent host's
 * terminal output for `localhost:<port>` references.
 *
 * Rather than loosen that gate in core (which would couple core to an
 * embedder concern and risk affecting other webviews like the regular
 * vscode.dev workbench), this contribution duplicates the minimal slice of
 * the URL-finder → forward pipeline that agents-web needs. It activates only
 * when:
 *
 *   1. We are running in a browser (`isWeb`).
 *   2. There is no remote authority (the agents-web embedder doesn't use one).
 *   3. The embedder has supplied a `tunnelProvider.tunnelFactory`.
 *
 * Note that we deliberately skip the `OnAutoForwardedAction` toast that
 * core's `OutputAutomaticPortForwarding` would normally show — that toast
 * links to the `tunnelView.focus` command, and the agents-web workbench
 * does not host the Ports panel. Forwarded ports surface through the globe
 * action contributed by `openForwardedPortAction.ts` instead.
 */
export class AgentsWebPortForwardingContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentSessions.agentsWebPortForwarding';

	private readonly urlFinder = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IDebugService private readonly debugService: IDebugService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		if (!isWeb) {
			return;
		}
		if (environmentService.remoteAuthority) {
			return;
		}
		if (!environmentService.options?.tunnelProvider?.tunnelFactory) {
			return;
		}

		// Re-evaluate whenever ports features flip, the auto-forward setting
		// changes, or — once already running — to pick up renewed settings.
		this._register(this.remoteExplorerService.onEnabledPortsFeatures(() => this.tryStart()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING)) {
				this.tryStart();
			}
		}));
		this.tryStart();
	}

	private tryStart(): void {
		if (!this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
			this.urlFinder.clear();
			return;
		}
		if (this.remoteExplorerService.portsFeaturesEnabled !== PortsEnablement.AdditionalFeatures) {
			// Ports features get enabled by `TunnelFactoryContribution` /
			// `ForwardedPortsView` once the tunnel factory is registered;
			// `onEnabledPortsFeatures` will bring us back here.
			return;
		}
		if (this.urlFinder.value) {
			return;
		}

		const store = new DisposableStore();
		const finder = store.add(new UrlFinder(this.terminalService, this.debugService));
		store.add(finder.onDidMatchLocalUrl(async (localUrl) => {
			const tunnelModel = this.remoteExplorerService.tunnelModel;
			if (mapHasAddressLocalhostOrAllInterfaces(tunnelModel.detected, localUrl.host, localUrl.port)) {
				return;
			}
			const attributes = (await tunnelModel.getAttributes([localUrl]))?.get(localUrl.port);
			if (attributes?.onAutoForward === OnPortForward.Ignore) {
				return;
			}
			await this.remoteExplorerService.forward({ remote: localUrl, source: AutoTunnelSource }, attributes ?? null);
		}));
		this.urlFinder.value = store;
	}
}
