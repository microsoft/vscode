/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentGlobalConfigurationSettings.css';
import * as DOM from '../../base/browser/dom.js';
import { Button } from '../../base/browser/ui/button/button.js';
import { SelectBox } from '../../base/browser/ui/selectBox/selectBox.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../base/common/lifecycle.js';
import { autorun, type IObservable } from '../../base/common/observable.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import { IAgentHostService } from '../../platform/agentHost/common/agentService.js';
import { readAgentCustomizationSettings, type IAgentCustomizationSettingsDescriptor } from '../../platform/agentHost/common/agentCustomizationSettings.js';
import type { ConfigPropertySchema, RootState } from '../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../platform/agentHost/common/state/sessionActions.js';
import { IContextViewService } from '../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { Link } from '../../platform/opener/browser/link.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultSelectBoxStyles } from '../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../workbench/services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../workbench/services/environment/common/environmentService.js';
import { isAgentHostProvider } from '../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../services/sessions/browser/sessionsProvidersService.js';

interface ITarget {
	readonly onDidChange: (listener: () => void) => { dispose(): void };
	getState(): RootState | undefined;
	setValue(key: string, value: unknown): Promise<void>;
	mapResource(uri: URI): URI;
}

export class AHPAgentSettingsWidget extends Disposable {
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly targetListener = this._register(new MutableDisposable());
	private readonly container: HTMLElement;
	private target: ITarget | undefined;
	private focusTarget: (() => void) | undefined;

	constructor(parent: HTMLElement, private readonly agentProvider: string, private readonly sessionsProviderId: IObservable<string | undefined> | undefined,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService private readonly editorService: IEditorService,
		@IHoverService private readonly hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		this.container = DOM.append(parent, DOM.$('.agent-global-configuration-settings'));
		this._register(autorun(reader => this.connect(this.getTarget(this.sessionsProviderId?.read(reader)))));
	}

	layout(): void { this.container.classList.toggle('narrow', this.container.clientWidth < 560); }
	focus(): void { this.focusTarget?.(); }

	private getTarget(providerId: string | undefined): ITarget | undefined {
		if (!this.environmentService.isSessionsWindow) {
			return { onDidChange: this.agentHostService.rootState.onDidChange, getState: () => this.agentHostService.rootState.value instanceof Error ? undefined : this.agentHostService.rootState.value, setValue: async (key, value) => this.agentHostService.dispatch('ahp-root://', { type: ActionType.RootConfigChanged, config: { [key]: value } }), mapResource: uri => uri };
		}
		const provider = providerId ? this.sessionsProvidersService.getProvider(providerId) : undefined;
		if (!provider || !isAgentHostProvider(provider)) { return undefined; }
		return { onDidChange: provider.onDidChangeRootConfig, getState: () => provider.getRootState(), setValue: (key, value) => provider.setRootConfigValue(key, value), mapResource: uri => provider.mapAgentHostResource(uri) };
	}

	private connect(target: ITarget | undefined): void {
		if (this.target === target && target) { return; }
		this.target = target;
		this.targetListener.value = target?.onDidChange(() => this.render());
		this.render();
	}

	private render(): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.container);
		this.focusTarget = undefined;
		const state = this.target?.getState();
		const descriptor = readAgentCustomizationSettings(state, this.agentProvider);
		if (!state?.config || !descriptor) {
			DOM.append(this.container, DOM.$('.agent-global-configuration-settings-status')).textContent = localize('agentSettings.unavailable', "These harness settings are not available from the connected agent host.");
			return;
		}
		DOM.append(this.container, DOM.$('h2')).textContent = descriptor.title;
		DOM.append(this.container, DOM.$('p.agent-global-configuration-settings-intro')).textContent = descriptor.description;
		for (const group of new Set(descriptor.settings.map(setting => setting.group))) {
			const card = DOM.append(this.container, DOM.$('.agent-global-configuration-settings-section'));
			DOM.append(card, DOM.$('h3')).textContent = group;
			for (const setting of descriptor.settings.filter(setting => setting.group === group)) {
				const schema = state.config.schema.properties[setting.key];
				if (schema) { this.renderSetting(card, descriptor, setting.key, setting.kind, setting.saveLabel, schema, state.config.values[setting.key]); }
			}
		}
		this.renderConfigurationFile(descriptor);
	}

	private renderSetting(parent: HTMLElement, _descriptor: IAgentCustomizationSettingsDescriptor, key: string, kind: 'multiline' | undefined, saveLabel: string | undefined, schema: ConfigPropertySchema, value: unknown): void {
		const row = DOM.append(parent, DOM.$('.agent-global-configuration-settings-row'));
		const labels = DOM.append(row, DOM.$('.agent-global-configuration-settings-labels'));
		DOM.append(labels, DOM.$('.agent-global-configuration-settings-label')).textContent = schema.title;
		if (schema.description) { DOM.append(labels, DOM.$('.agent-global-configuration-settings-description')).textContent = schema.description; }
		if (kind === 'multiline') {
			const input = DOM.append(row, DOM.$('textarea.agent-global-configuration-settings-textarea')) as HTMLTextAreaElement;
			input.value = typeof value === 'string' ? value : '';
			this.focusTarget ??= () => input.focus();
			const button = this.renderDisposables.add(new Button(row, { ...defaultButtonStyles, secondary: true }));
			button.label = saveLabel ?? localize('agentSettings.save', "Save");
			this.renderDisposables.add(button.onDidClick(() => void this.save(key, input.value.trim())));
			return;
		}
		const options = schema.enum?.map((option, index) => ({ text: schema.enumLabels?.[index] ?? String(option) })) ?? [];
		const selected = Math.max(0, schema.enum?.findIndex(option => option === value) ?? 0);
		const select = this.renderDisposables.add(new SelectBox(options, selected, this.contextViewService, { ...defaultSelectBoxStyles }));
		select.render(row);
		this.focusTarget ??= () => select.focus();
		this.renderDisposables.add(select.onDidSelect(event => void this.save(key, schema.enum?.[event.index])));
	}

	private async save(key: string, value: unknown): Promise<void> {
		try { await this.target?.setValue(key, value); } catch (error) { this.notificationService.error(error); }
	}

	private renderConfigurationFile(descriptor: IAgentCustomizationSettingsDescriptor): void {
		const file = descriptor.configurationFile;
		if (!file) { return; }
		const card = DOM.append(this.container, DOM.$('.agent-global-configuration-settings-section'));
		DOM.append(card, DOM.$('h3')).textContent = file.title;
		DOM.append(card, DOM.$('p.agent-global-configuration-settings-description')).textContent = file.description;
		if (file.documentationUrl && file.documentationLabel) { this.renderDisposables.add(new Link(card, { label: file.documentationLabel, href: file.documentationUrl }, {}, this.hoverService, this.openerService)); }
		const button = this.renderDisposables.add(new Button(card, { ...defaultButtonStyles, secondary: true }));
		button.label = file.openLabel;
		this.renderDisposables.add(button.onDidClick(() => this.editorService.openEditor({ resource: this.target?.mapResource(URI.parse(file.resource)) ?? URI.parse(file.resource), options: { pinned: true } })));
	}
}
