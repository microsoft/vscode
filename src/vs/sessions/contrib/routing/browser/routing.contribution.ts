/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewDescriptor, IViewsRegistry, Extensions as ViewContainerExtensions, IViewContainersRegistry } from '../../../../workbench/common/views.js';
import { localize, localize2 } from '../../../../nls.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService, FileOperationError, FileOperationResult } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { RoutingPanel, KNOWN_AGENTS } from './routingPanel.js';
import {
	AgentRole,
	DEFAULT_PROVIDER_CATALOGUE,
	ProviderModelChoice,
	RoutingConfig,
	defaultRoutingConfig,
	parseRoutingConfig,
	serializeRoutingConfig,
	setAgentRoute,
} from '../common/routingConfig.js';

const ROUTING_VIEW_ID = 'agentic.workbench.view.routing';
const ROUTING_VIEW_TITLE = localize2('routing.viewTitle', "Agent Routing");
const SESSIONS_CONTAINER_ID = 'agentic.workbench.view.sessionsContainer';
const ROUTING_FILE_PATH = '.son-of-anton/routing.json';

/**
 * View pane that hosts the per-agent provider selection panel and persists
 * edits to `.son-of-anton/routing.json` in the workspace root.
 */
export class RoutingViewPane extends ViewPane {

	private panel: RoutingPanel | undefined;
	private currentConfig: RoutingConfig = defaultRoutingConfig();

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
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);

		this.panel = this._register(new RoutingPanel(parent, {
			updatePrimary: (role, choice) => this.handleUpdatePrimary(role, choice),
			resetToDefaults: () => this.handleResetToDefaults(),
		}));

		this.panel.setAgents(KNOWN_AGENTS);
		this.panel.setCatalogue(DEFAULT_PROVIDER_CATALOGUE);
		this.panel.setConfig(this.currentConfig);

		void this.reloadConfig();
		this.watchRoutingFile();
	}

	private getRoutingFileUri(): URI | undefined {
		const folder = this.workspaceContextService.getWorkspace().folders[0];
		if (!folder) {
			return undefined;
		}
		return URI.joinPath(folder.uri, ROUTING_FILE_PATH);
	}

	private async reloadConfig(): Promise<void> {
		const uri = this.getRoutingFileUri();
		if (!uri) {
			return;
		}

		try {
			const content = await this.fileService.readFile(uri);
			const result = parseRoutingConfig(content.value.toString());
			if (!result.ok) {
				this.logService.warn(`[RoutingViewPane] Failed to parse ${ROUTING_FILE_PATH}: ${result.error}`);
				this.panel?.setStatus(result.error, 'error');
				return;
			}
			this.currentConfig = mergeWithDefaults(result.config);
			this.panel?.setConfig(this.currentConfig);
			this.panel?.setStatus(undefined);
		} catch (err) {
			if (err instanceof FileOperationError && err.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				this.currentConfig = defaultRoutingConfig();
				this.panel?.setConfig(this.currentConfig);
				return;
			}
			this.logService.error(`[RoutingViewPane] Failed to read ${ROUTING_FILE_PATH}:`, err);
		}
	}

	private watchRoutingFile(): void {
		const uri = this.getRoutingFileUri();
		if (!uri) {
			return;
		}
		const watcher = this._register(this.fileService.createWatcher(uri, { recursive: false, excludes: [] }));
		this._register(watcher.onDidChange(() => void this.reloadConfig()));
	}

	private async handleUpdatePrimary(role: AgentRole, choice: ProviderModelChoice): Promise<void> {
		const existing = this.currentConfig.agents[role];
		const nextRoute = {
			primary: choice,
			...(existing?.fallback ? { fallback: existing.fallback } : {}),
		};
		const next = setAgentRoute(this.currentConfig, role, nextRoute);
		await this.writeConfig(next);
	}

	private async handleResetToDefaults(): Promise<void> {
		const uri = this.getRoutingFileUri();
		if (!uri) {
			throw new Error(localize('routing.noWorkspace', "No workspace folder is open"));
		}
		try {
			await this.fileService.del(uri);
		} catch (err) {
			if (!(err instanceof FileOperationError && err.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
				throw err;
			}
		}
		this.currentConfig = defaultRoutingConfig();
		this.panel?.setConfig(this.currentConfig);
	}

	private async writeConfig(config: RoutingConfig): Promise<void> {
		const uri = this.getRoutingFileUri();
		if (!uri) {
			throw new Error(localize('routing.noWorkspace', "No workspace folder is open"));
		}
		const serialized = serializeRoutingConfig(config);
		await this.fileService.writeFile(uri, VSBuffer.fromString(serialized));
		this.currentConfig = config;
		this.panel?.setConfig(config);
	}
}

function mergeWithDefaults(loaded: RoutingConfig): RoutingConfig {
	const defaults = defaultRoutingConfig();
	return {
		version: loaded.version,
		agents: { ...defaults.agents, ...loaded.agents },
	};
}

// ── View registration ─────────────────────────────────────────────────────────

const routingViewDescriptor: IViewDescriptor = {
	id: ROUTING_VIEW_ID,
	name: ROUTING_VIEW_TITLE,
	ctorDescriptor: new SyncDescriptor(RoutingViewPane),
	canToggleVisibility: true,
	canMoveView: false,
	collapsed: true,
	order: 110,
};

const sessionsContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry)
	.get(SESSIONS_CONTAINER_ID);

if (sessionsContainer) {
	Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry)
		.registerViews([routingViewDescriptor], sessionsContainer);
}
