/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewContainerExtensions, IViewContainersRegistry } from '../../../../workbench/common/views.js';
import { localize2 } from '../../../../nls.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ConnectedAccountsPanel, AccountRow, KNOWN_PROVIDERS } from './connectedAccountsPanel.js';

const ACCOUNTS_VIEW_ID = 'agentic.workbench.view.connectedAccounts';
const ACCOUNTS_VIEW_TITLE = localize2('accounts.viewTitle', "Connected Accounts");
const SESSIONS_CONTAINER_ID = 'agentic.workbench.view.sessionsContainer';

/** Interval (ms) between automatic broker status polls. */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Wire shape for the value returned by `sotaAuth.status`.
 * Mirrors ProviderStatus from extensions/son-of-anton/src/auth/types.ts.
 */
interface RemoteProviderStatus {
	id: string;
	connected: boolean;
	expiresAt?: number;
	displayName: string;
}

/**
 * View pane that renders the Connected Accounts panel and keeps it in sync
 * with the credential broker via the `sotaAuth.*` commands registered by the
 * son-of-anton extension.
 */
export class ConnectedAccountsViewPane extends ViewPane {

	private panel: ConnectedAccountsPanel | undefined;
	private refreshTimer: ReturnType<typeof setInterval> | undefined;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		this.panel = this._register(new ConnectedAccountsPanel(parent, {
			connect: providerId => this.connectProvider(providerId),
			disconnect: providerId => this.disconnectProvider(providerId),
		}));

		this.renderKnownProviders();
		void this.refreshStatus();

		this.refreshTimer = setInterval(() => void this.refreshStatus(), REFRESH_INTERVAL_MS);
		this._register({ dispose: () => clearInterval(this.refreshTimer) });
	}

	override dispose(): void {
		clearInterval(this.refreshTimer);
		super.dispose();
	}

	/** Seed the panel with known providers in the default disconnected state. */
	private renderKnownProviders(): void {
		if (!this.panel) {
			return;
		}
		const rows: AccountRow[] = KNOWN_PROVIDERS.map(p => ({
			...p,
			status: { kind: 'disconnected' as const },
		}));
		this.panel.setRows(rows);
	}

	private async refreshStatus(): Promise<void> {
		if (!this.panel) {
			return;
		}

		let result: { providers: RemoteProviderStatus[] } | undefined;
		try {
			result = await this.commandService.executeCommand<{ providers: RemoteProviderStatus[] }>('sotaAuth.status');
		} catch (err) {
			this.logService.trace('[ConnectedAccountsViewPane] sotaAuth.status not available:', err);
			return;
		}

		if (!result?.providers) {
			return;
		}

		const rows = this.buildRows(result.providers);
		this.panel.setRows(rows);
	}

	private buildRows(remoteProviders: RemoteProviderStatus[]): AccountRow[] {
		const byId = new Map(remoteProviders.map(p => [p.id, p]));

		const rows: AccountRow[] = KNOWN_PROVIDERS.map(meta => {
			const remote = byId.get(meta.id);
			return {
				...meta,
				status: remote?.connected ? { kind: 'connected' as const } : { kind: 'disconnected' as const },
				expiresAt: remote?.expiresAt,
			};
		});

		// Append any providers the broker reports that aren't in KNOWN_PROVIDERS.
		for (const remote of remoteProviders) {
			if (!KNOWN_PROVIDERS.find(k => k.id === remote.id)) {
				rows.push({
					id: remote.id,
					displayName: remote.displayName,
					icon: Codicon.account,
					status: remote.connected ? { kind: 'connected' as const } : { kind: 'disconnected' as const },
					expiresAt: remote.expiresAt,
				});
			}
		}

		return rows;
	}

	private async connectProvider(providerId: string): Promise<void> {
		try {
			await this.commandService.executeCommand('sotaAuth.connect', providerId);
		} catch (err) {
			this.logService.error(`[ConnectedAccountsViewPane] Connect ${providerId} failed:`, err);
			throw err;
		} finally {
			void this.refreshStatus();
		}
	}

	private async disconnectProvider(providerId: string): Promise<void> {
		try {
			await this.commandService.executeCommand('sotaAuth.disconnect', providerId);
		} catch (err) {
			this.logService.error(`[ConnectedAccountsViewPane] Disconnect ${providerId} failed:`, err);
			throw err;
		} finally {
			void this.refreshStatus();
		}
	}
}

// ── View registration ─────────────────────────────────────────────────────────

const accountsViewDescriptor: IViewDescriptor = {
	id: ACCOUNTS_VIEW_ID,
	name: ACCOUNTS_VIEW_TITLE,
	ctorDescriptor: new SyncDescriptor(ConnectedAccountsViewPane),
	canToggleVisibility: true,
	canMoveView: false,
	collapsed: true,
	order: 100,
};

const sessionsContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry)
	.get(SESSIONS_CONTAINER_ID);

if (sessionsContainer) {
	Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry)
		.registerViews([accountsViewDescriptor], sessionsContainer);
}
