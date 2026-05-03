/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/routingPanel.css';
import { $, EventType, addDisposableListener, append, clearNode } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../nls.js';
import {
	AgentRole,
	ProviderCatalogueEntry,
	ProviderModelChoice,
	RoutingConfig,
	defaultRoutingConfig,
} from '../common/routingConfig.js';

export interface AgentRoleDescriptor {
	readonly id: AgentRole;
	readonly displayName: string;
	readonly description: string;
	readonly icon: Codicon;
}

export interface RoutingPanelHandlers {
	/**
	 * Apply a primary provider/model change for an agent.
	 * Implementations are expected to persist the change (e.g. to
	 * `.son-of-anton/routing.json`) and then re-emit via `setConfig`.
	 */
	updatePrimary(role: AgentRole, choice: ProviderModelChoice): Promise<void>;

	/**
	 * Reset all routes to the workspace default. The handler is responsible
	 * for deleting `.son-of-anton/routing.json` (or rewriting with defaults).
	 */
	resetToDefaults(): Promise<void>;
}

export type PanelEvent =
	| { type: 'updatePrimary'; role: AgentRole; choice: ProviderModelChoice }
	| { type: 'resetToDefaults' };

interface RowState {
	readonly el: HTMLElement;
	readonly providerSelect: HTMLSelectElement;
	readonly modelSelect: HTMLSelectElement;
	readonly badge: HTMLElement;
	readonly disposables: DisposableStore;
}

/**
 * Per-agent provider selection panel.
 *
 * Renders one row per registered agent role; each row exposes a provider and
 * model dropdown plus a small badge that mirrors what the chat UI shows next
 * to the agent's avatar (e.g. `Sonnet · Copilot`).
 *
 * The component is passive: state changes flow in via `setConfig()`; user
 * edits are forwarded to the injected handlers.
 */
export class RoutingPanel extends Disposable {

	private readonly _onDidAction = this._register(new Emitter<PanelEvent>());
	readonly onDidAction: Event<PanelEvent> = this._onDidAction.event;

	private readonly rowStates = new Map<AgentRole, RowState>();

	private listEl: HTMLElement | undefined;
	private statusEl: HTMLElement | undefined;
	private resetButton: Button | undefined;

	private currentConfig: RoutingConfig = defaultRoutingConfig();
	private agents: ReadonlyArray<AgentRoleDescriptor> = [];
	private catalogue: ReadonlyArray<ProviderCatalogueEntry> = [];

	constructor(
		private readonly container: HTMLElement,
		private readonly handlers: RoutingPanelHandlers,
	) {
		super();
		this.renderShell();
	}

	/**
	 * Replace the displayed agent list. Existing rows whose role is not in
	 * the new list are removed; new rows are appended; existing rows are
	 * updated in place.
	 */
	setAgents(agents: ReadonlyArray<AgentRoleDescriptor>): void {
		this.agents = agents;
		this.rebuildRows();
	}

	/** Replace the provider catalogue used to populate the dropdowns. */
	setCatalogue(catalogue: ReadonlyArray<ProviderCatalogueEntry>): void {
		this.catalogue = catalogue;
		this.rebuildRows();
	}

	/** Update the currently-applied routing config and refresh selections. */
	setConfig(config: RoutingConfig): void {
		this.currentConfig = config;
		for (const [role, state] of this.rowStates) {
			this.refreshRow(role, state);
		}
	}

	/** Display a transient status banner above the list (errors, save state). */
	setStatus(message: string | undefined, kind: 'info' | 'error' = 'info'): void {
		if (!this.statusEl) {
			return;
		}
		this.statusEl.classList.toggle('hidden', !message);
		this.statusEl.classList.toggle('routing-panel-status-error', kind === 'error');
		this.statusEl.textContent = message ?? '';
	}

	private renderShell(): void {
		clearNode(this.container);
		this.container.classList.add('routing-panel');

		const header = append(this.container, $('.routing-panel-header'));
		append(header, $('h2', undefined, localize('routing.title', "Per-Agent Provider Routing")));
		append(header, $('p.routing-panel-subtitle', undefined,
			localize('routing.subtitle', "Choose which provider and model each agent should use. Saved to .son-of-anton/routing.json.")));

		this.statusEl = append(this.container, $('.routing-panel-status.hidden'));

		this.listEl = append(this.container, $('.routing-panel-list'));

		const footer = append(this.container, $('.routing-panel-footer'));
		const resetContainer = append(footer, $('.routing-panel-reset'));
		this.resetButton = this._register(new Button(resetContainer, { ...defaultButtonStyles, secondary: true }));
		this.resetButton.label = localize('routing.reset', "Reset to defaults");
		this._register(this.resetButton.onDidClick(() => this.handleResetClick()));
	}

	private rebuildRows(): void {
		if (!this.listEl) {
			return;
		}

		const incoming = new Set(this.agents.map(a => a.id));

		for (const [role, state] of this.rowStates) {
			if (!incoming.has(role)) {
				state.disposables.dispose();
				state.el.remove();
				this.rowStates.delete(role);
			}
		}

		for (const agent of this.agents) {
			if (!this.rowStates.has(agent.id)) {
				this.renderRow(agent);
			}
			const state = this.rowStates.get(agent.id);
			if (state) {
				this.refreshRow(agent.id, state);
			}
		}
	}

	private renderRow(agent: AgentRoleDescriptor): void {
		if (!this.listEl) {
			return;
		}

		const el = append(this.listEl, $('.routing-panel-row'));
		el.setAttribute('data-agent', agent.id);

		const iconEl = append(el, $('span.routing-panel-row-icon'));
		iconEl.appendChild(renderIcon(agent.icon));

		const body = append(el, $('.routing-panel-row-body'));

		const titleRow = append(body, $('.routing-panel-row-title-row'));
		append(titleRow, $('span.routing-panel-row-title', undefined, agent.displayName));
		const badge = append(titleRow, $('span.routing-panel-row-badge'));
		badge.setAttribute('data-badge', '');

		append(body, $('span.routing-panel-row-description', undefined, agent.description));

		const controls = append(body, $('.routing-panel-row-controls'));

		const providerLabel = append(controls, $('label.routing-panel-row-control'));
		append(providerLabel, $('span.routing-panel-row-control-label', undefined, localize('routing.providerLabel', "Provider")));
		const providerSelect = document.createElement('select');
		providerSelect.classList.add('routing-panel-select');
		providerSelect.setAttribute('aria-label', localize('routing.providerAria', "Provider for {0}", agent.displayName));
		providerLabel.appendChild(providerSelect);

		const modelLabel = append(controls, $('label.routing-panel-row-control'));
		append(modelLabel, $('span.routing-panel-row-control-label', undefined, localize('routing.modelLabel', "Model")));
		const modelSelect = document.createElement('select');
		modelSelect.classList.add('routing-panel-select');
		modelSelect.setAttribute('aria-label', localize('routing.modelAria', "Model for {0}", agent.displayName));
		modelLabel.appendChild(modelSelect);

		const disposables = new DisposableStore();
		disposables.add(addDisposableListener(providerSelect, EventType.CHANGE, () => this.handleProviderChange(agent.id)));
		disposables.add(addDisposableListener(modelSelect, EventType.CHANGE, () => this.handleModelChange(agent.id)));

		this.rowStates.set(agent.id, {
			el,
			providerSelect,
			modelSelect,
			badge,
			disposables,
		});
	}

	private refreshRow(role: AgentRole, state: RowState): void {
		const route = this.currentConfig.agents[role];
		const choice = route?.primary;

		this.populateProviderOptions(state.providerSelect, choice?.provider);
		const provider = state.providerSelect.value || (choice?.provider ?? '');
		this.populateModelOptions(state.modelSelect, provider, choice?.model);

		state.badge.textContent = this.formatBadge(state.modelSelect.value, provider);
	}

	private populateProviderOptions(select: HTMLSelectElement, selectedProvider: string | undefined): void {
		clearNode(select);
		const known = new Set<string>();
		for (const entry of this.catalogue) {
			known.add(entry.id);
			const opt = document.createElement('option');
			opt.value = entry.id;
			opt.textContent = entry.displayName;
			select.appendChild(opt);
		}
		if (selectedProvider && !known.has(selectedProvider)) {
			const opt = document.createElement('option');
			opt.value = selectedProvider;
			opt.textContent = localize('routing.unknownProvider', "{0} (unknown)", selectedProvider);
			select.appendChild(opt);
		}
		select.value = selectedProvider ?? select.options[0]?.value ?? '';
	}

	private populateModelOptions(select: HTMLSelectElement, providerId: string, selectedModel: string | undefined): void {
		clearNode(select);
		const entry = this.catalogue.find(c => c.id === providerId);
		const known = new Set<string>();
		if (entry) {
			for (const model of entry.models) {
				known.add(model.id);
				const opt = document.createElement('option');
				opt.value = model.id;
				opt.textContent = model.displayName;
				select.appendChild(opt);
			}
		}
		if (selectedModel && !known.has(selectedModel)) {
			const opt = document.createElement('option');
			opt.value = selectedModel;
			opt.textContent = localize('routing.unknownModel', "{0} (unknown)", selectedModel);
			select.appendChild(opt);
		}
		select.value = selectedModel ?? select.options[0]?.value ?? '';
	}

	private formatBadge(model: string, provider: string): string {
		if (!model && !provider) {
			return '';
		}
		const modelDisplay = this.lookupModelDisplay(provider, model) ?? model;
		const providerDisplay = this.lookupProviderDisplay(provider) ?? provider;
		return `${modelDisplay} · ${providerDisplay}`;
	}

	private lookupProviderDisplay(providerId: string): string | undefined {
		return this.catalogue.find(c => c.id === providerId)?.displayName;
	}

	private lookupModelDisplay(providerId: string, modelId: string): string | undefined {
		return this.catalogue.find(c => c.id === providerId)?.models.find(m => m.id === modelId)?.displayName;
	}

	private handleProviderChange(role: AgentRole): void {
		const state = this.rowStates.get(role);
		if (!state) {
			return;
		}
		const provider = state.providerSelect.value;
		this.populateModelOptions(state.modelSelect, provider, undefined);
		void this.applyChoice(role, { provider, model: state.modelSelect.value });
	}

	private handleModelChange(role: AgentRole): void {
		const state = this.rowStates.get(role);
		if (!state) {
			return;
		}
		void this.applyChoice(role, { provider: state.providerSelect.value, model: state.modelSelect.value });
	}

	private async applyChoice(role: AgentRole, choice: ProviderModelChoice): Promise<void> {
		const state = this.rowStates.get(role);
		if (state) {
			state.badge.textContent = this.formatBadge(choice.model, choice.provider);
		}
		this._onDidAction.fire({ type: 'updatePrimary', role, choice });
		try {
			this.setStatus(undefined);
			await this.handlers.updatePrimary(role, choice);
		} catch (err) {
			const message = err instanceof Error ? err.message : localize('routing.saveFailed', "Failed to save routing choice");
			this.setStatus(message, 'error');
		}
	}

	private async handleResetClick(): Promise<void> {
		this._onDidAction.fire({ type: 'resetToDefaults' });
		try {
			this.setStatus(undefined);
			await this.handlers.resetToDefaults();
		} catch (err) {
			const message = err instanceof Error ? err.message : localize('routing.resetFailed', "Failed to reset routing");
			this.setStatus(message, 'error');
		}
	}

	override dispose(): void {
		for (const state of this.rowStates.values()) {
			state.disposables.dispose();
		}
		this.rowStates.clear();
		super.dispose();
	}
}

/**
 * Default agent registry mirrored from `extensions/son-of-anton/src/agents/AgentParticipants.ts`.
 * Keep in sync when new specialists are registered there.
 */
export const KNOWN_AGENTS: ReadonlyArray<AgentRoleDescriptor> = [
	{
		id: 'orchestrator',
		displayName: localize('routing.agent.orchestrator', "Orchestrator"),
		description: localize('routing.agent.orchestratorDesc', "Plans and routes work to specialist agents."),
		icon: Codicon.organization,
	},
	{
		id: 'coder',
		displayName: localize('routing.agent.coder', "Code Generator"),
		description: localize('routing.agent.coderDesc', "Writes and refactors source code."),
		icon: Codicon.code,
	},
	{
		id: 'reviewer',
		displayName: localize('routing.agent.reviewer', "Reviewer"),
		description: localize('routing.agent.reviewerDesc', "Reviews diffs for correctness, style, and risk."),
		icon: Codicon.gitPullRequest,
	},
	{
		id: 'tester',
		displayName: localize('routing.agent.tester', "Test Writer"),
		description: localize('routing.agent.testerDesc', "Generates and updates unit and integration tests."),
		icon: Codicon.beaker,
	},
	{
		id: 'explorer',
		displayName: localize('routing.agent.explorer', "Explorer"),
		description: localize('routing.agent.explorerDesc', "Performs quick lookups and summaries across the codebase."),
		icon: Codicon.search,
	},
];
