/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { AgentState, IAgentDefinition, IAgentInstance, IAgentLaneService } from '../common/agentLaneService.js';
import { IMultiAgentProviderService } from '../common/multiAgentProviderService.js';
import * as dom from '../../../../base/browser/dom.js';

export class AgentLanesViewPane extends ViewPane {

	static readonly ID = 'workbench.views.multiAgent.agentLanes';

	private _bodyContainer: HTMLElement | undefined;
	private readonly _bodyDisposables = this._register(new DisposableStore());

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
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IAgentLaneService private readonly _agentLaneService: IAgentLaneService,
		@IMultiAgentProviderService private readonly _providerService: IMultiAgentProviderService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this._bodyContainer = container;
		container.classList.add('multi-agent-lanes-view');
		this._renderContent();

		this._bodyDisposables.add(this._agentLaneService.onDidChangeInstances(() => this._renderContent()));
		this._bodyDisposables.add(this._agentLaneService.onDidChangeState(() => this._renderTrackingBoard()));
		this._bodyDisposables.add(this._agentLaneService.onDidChangeDefinitions(() => this._renderContent()));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	private _renderContent(): void {
		if (!this._bodyContainer) {
			return;
		}
		dom.clearNode(this._bodyContainer);

		const wrapper = dom.append(this._bodyContainer, dom.$('.agent-lanes-content'));

		// Active agents tracking board
		this._renderTrackingBoard(wrapper);

		// Available agent definitions
		this._renderAvailableAgents(wrapper);
	}

	private _renderTrackingBoard(container?: HTMLElement): void {
		const target = container ?? this._bodyContainer?.querySelector('.tracking-board');
		if (!target) {
			return;
		}

		const existing = target.querySelector('.tracking-board');
		if (existing) {
			existing.remove();
		}

		const instances = this._agentLaneService.getAgentInstances();
		const board = dom.append(target, dom.$('.tracking-board'));

		// Header with count
		const header = dom.append(board, dom.$('.tracking-board-header'));
		const activeCount = instances.filter(i => i.state !== AgentState.Idle && i.state !== AgentState.Done).length;
		header.textContent = `Active Agents (${activeCount}/${instances.length})`;

		if (instances.length === 0) {
			const empty = dom.append(board, dom.$('.tracking-board-empty'));
			empty.textContent = 'No agents spawned. Click + to create one.';
			return;
		}

		// Agent cards grid
		const grid = dom.append(board, dom.$('.agent-cards-grid'));
		for (const instance of instances) {
			const definition = this._agentLaneService.getAgentDefinition(instance.definitionId);
			if (definition) {
				this._renderAgentCard(grid, instance, definition);
			}
		}
	}

	private _renderAgentCard(container: HTMLElement, instance: IAgentInstance, definition: IAgentDefinition): void {
		const card = dom.append(container, dom.$('.agent-card'));

		// State-colored border
		const stateClass = this._getStateClass(instance.state);
		card.classList.add(`agent-card-${stateClass}`);

		// Header: icon + name + state indicator
		const cardHeader = dom.append(card, dom.$('.agent-card-header'));

		const stateIcon = dom.append(cardHeader, dom.$('.agent-state-icon'));
		stateIcon.classList.add(`state-${stateClass}`);
		stateIcon.textContent = this._getStateSymbol(instance.state);

		const nameEl = dom.append(cardHeader, dom.$('.agent-card-name'));
		nameEl.textContent = definition.name;

		const roleEl = dom.append(cardHeader, dom.$('.agent-card-role'));
		roleEl.textContent = definition.role;

		// Model + Provider
		const modelRow = dom.append(card, dom.$('.agent-card-model'));
		modelRow.textContent = definition.modelId;

		if (instance.activeProviderId) {
			const provider = this._providerService.getProvider(instance.activeProviderId);
			const providerEl = dom.append(card, dom.$('.agent-card-provider'));
			providerEl.textContent = provider?.name ?? instance.activeProviderId;
		}

		// Current task
		if (instance.currentTaskDescription) {
			const taskEl = dom.append(card, dom.$('.agent-card-task'));
			taskEl.textContent = instance.currentTaskDescription;
			taskEl.title = instance.currentTaskDescription;
		}

		// Token usage
		const totalTokens = instance.tokenUsage.input + instance.tokenUsage.output;
		if (totalTokens > 0) {
			const tokensEl = dom.append(card, dom.$('.agent-card-tokens'));
			tokensEl.textContent = this._formatTokenCount(totalTokens);
		}

		// Error display
		if (instance.error) {
			const errorEl = dom.append(card, dom.$('.agent-card-error'));
			errorEl.textContent = instance.error.message;
			errorEl.title = `Retry count: ${instance.error.retryCount}`;
		}
	}

	private _renderAvailableAgents(container: HTMLElement): void {
		const section = dom.append(container, dom.$('.available-agents'));
		const header = dom.append(section, dom.$('.available-agents-header'));

		const definitions = this._agentLaneService.getAgentDefinitions();
		const instances = this._agentLaneService.getAgentInstances();
		const spawnedDefIds = new Set(instances.map(i => i.definitionId));
		const available = definitions.filter(d => !spawnedDefIds.has(d.id));

		header.textContent = `Available Agents (${available.length})`;

		if (available.length === 0) {
			const empty = dom.append(section, dom.$('.available-agents-empty'));
			empty.textContent = 'All agents are active';
			return;
		}

		const list = dom.append(section, dom.$('.available-agents-list'));
		for (const def of available) {
			const item = dom.append(list, dom.$('.available-agent-item'));
			item.textContent = `${def.name} · ${def.role}`;
			item.title = def.description;
		}
	}

	private _getStateClass(state: AgentState): string {
		switch (state) {
			case AgentState.Running: return 'running';
			case AgentState.Queued: return 'queued';
			case AgentState.Blocked:
			case AgentState.Waiting: return 'blocked';
			case AgentState.Error: return 'error';
			case AgentState.Done: return 'done';
			case AgentState.Idle:
			default: return 'idle';
		}
	}

	private _getStateSymbol(state: AgentState): string {
		switch (state) {
			case AgentState.Running: return '>>';
			case AgentState.Queued: return '..';
			case AgentState.Blocked:
			case AgentState.Waiting: return '||';
			case AgentState.Error: return '!!';
			case AgentState.Done: return 'OK';
			case AgentState.Idle:
			default: return '--';
		}
	}

	private _formatTokenCount(tokens: number): string {
		if (tokens >= 1_000_000) {
			return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
		}
		if (tokens >= 1_000) {
			return `${(tokens / 1_000).toFixed(1)}k tokens`;
		}
		return `${tokens} tokens`;
	}
}
