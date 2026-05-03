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
import { QuotaPanel } from './quotaPanel.js';
import { QuotaCostData, ModelUsageEntry, ProviderQuotaInfo, SpendCapConfig, TokenUsage, ToolUsageEntry, emptyUsage } from '../common/quotaModel.js';

const QUOTA_VIEW_ID = 'agentic.workbench.view.quota';
const QUOTA_VIEW_TITLE = localize2('quota.viewTitle', "Session Cost & Quota");
const SESSIONS_CONTAINER_ID = 'agentic.workbench.view.sessionsContainer';

/** Polling interval (ms) for refreshing cost/quota data from the extension. */
const REFRESH_INTERVAL_MS = 30_000;

const EMPTY_DATA: QuotaCostData = {
	summary: {
		totalUsage: emptyUsage(),
		estimatedCost: { usd: 0 },
		byModel: [],
		byTool: [],
	},
	providerQuota: [],
	spendCap: { limitUsd: undefined, currentTotalUsd: 0 },
};

/**
 * Wire shape returned by `sotaQuota.getSessionSummary`.
 *
 * The son-of-anton extension registers this command and aggregates usage events
 * from the model-router across all active sessions. The view pane polls it on a
 * 30-second interval and after each user action.
 */
interface RemoteQuotaData {
	readonly estimatedCostUsd: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheCreationInputTokens: number;
	readonly cacheReadInputTokens: number;
	readonly byModel: ReadonlyArray<{
		readonly modelId: string;
		readonly providerId: string;
		readonly displayLabel: string;
		readonly inputTokens: number;
		readonly outputTokens: number;
		readonly cacheCreationInputTokens: number;
		readonly cacheReadInputTokens: number;
		readonly costUsd: number;
	}>;
	readonly byTool: ReadonlyArray<{
		readonly toolName: string;
		readonly callCount: number;
	}>;
	readonly providerQuota: ReadonlyArray<{
		readonly providerId: string;
		readonly displayName: string;
		readonly kind: 'api-key' | 'subscription';
		readonly requestsUsed?: number;
		readonly requestsLimit?: number;
		readonly windowFractionUsed?: number;
		readonly windowRemainingSeconds?: number;
		readonly windowResetsAt?: number;
		readonly tokenExpiresAt?: number;
	}>;
	readonly spendCapLimitUsd?: number;
}

/**
 * View pane that hosts the QuotaPanel and polls the son-of-anton extension for
 * live cost/quota data via the `sotaQuota.getSessionSummary` command.
 *
 * Gracefully degrades to an empty state when the extension is not yet active or
 * the command is not registered — the panel renders "No activity yet." and the
 * pane remains visible but silent.
 */
export class QuotaViewPane extends ViewPane {

	private panel: QuotaPanel | undefined;
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

		this.panel = this._register(new QuotaPanel(parent));
		this.panel.setData(EMPTY_DATA);
		void this.refresh();

		this.refreshTimer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
		this._register({ dispose: () => clearInterval(this.refreshTimer) });
	}

	override dispose(): void {
		clearInterval(this.refreshTimer);
		super.dispose();
	}

	private async refresh(): Promise<void> {
		if (!this.panel) {
			return;
		}

		let raw: RemoteQuotaData | undefined;
		try {
			raw = await this.commandService.executeCommand<RemoteQuotaData>('sotaQuota.getSessionSummary');
		} catch (err) {
			this.logService.trace('[QuotaViewPane] sotaQuota.getSessionSummary not available:', err);
			return;
		}

		if (!raw) {
			return;
		}

		this.panel.setData(this.buildData(raw));
	}

	private buildData(raw: RemoteQuotaData): QuotaCostData {
		const totalUsage: TokenUsage = {
			inputTokens: raw.inputTokens,
			outputTokens: raw.outputTokens,
			cacheCreationInputTokens: raw.cacheCreationInputTokens,
			cacheReadInputTokens: raw.cacheReadInputTokens,
		};

		const byModel: ModelUsageEntry[] = raw.byModel.map(m => ({
			modelId: m.modelId,
			providerId: m.providerId,
			displayLabel: m.displayLabel,
			usage: {
				inputTokens: m.inputTokens,
				outputTokens: m.outputTokens,
				cacheCreationInputTokens: m.cacheCreationInputTokens,
				cacheReadInputTokens: m.cacheReadInputTokens,
			},
			estimatedCost: { usd: m.costUsd },
		}));

		const byTool: ToolUsageEntry[] = raw.byTool.map(t => ({
			toolName: t.toolName,
			callCount: t.callCount,
		}));

		const providerQuota: ProviderQuotaInfo[] = raw.providerQuota.map(q => ({ ...q }));

		const spendCap: SpendCapConfig = {
			limitUsd: raw.spendCapLimitUsd,
			currentTotalUsd: raw.estimatedCostUsd,
		};

		return {
			summary: { totalUsage, estimatedCost: { usd: raw.estimatedCostUsd }, byModel, byTool },
			providerQuota,
			spendCap,
		};
	}
}

// ── View registration ─────────────────────────────────────────────────────────

const quotaViewDescriptor: IViewDescriptor = {
	id: QUOTA_VIEW_ID,
	name: QUOTA_VIEW_TITLE,
	ctorDescriptor: new SyncDescriptor(QuotaViewPane),
	canToggleVisibility: true,
	canMoveView: false,
	collapsed: true,
	order: 120,
};

const sessionsContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry)
	.get(SESSIONS_CONTAINER_ID);

if (sessionsContainer) {
	Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry)
		.registerViews([quotaViewDescriptor], sessionsContainer);
}
