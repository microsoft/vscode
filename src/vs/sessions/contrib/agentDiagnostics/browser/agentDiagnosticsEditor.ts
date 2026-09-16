/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentDiagnostics.css';
import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { AgentDiagnosticsEditorInput } from './agentDiagnosticsEditorInput.js';

export const AgentDiagnosticsFocusedContext = new RawContextKey<boolean>('agentDiagnosticsFocused', false, localize('agentDiagnosticsFocused', "Whether the Agents Diagnostics editor is focused"));

const enum DiagnosticsTab {
	SessionInsights,
	AgentDebug,
}

export class AgentDiagnosticsEditor extends EditorPane {

	static readonly ID = AgentDiagnosticsEditorInput.EDITOR_ID;

	private readonly tabs = new Map<DiagnosticsTab, Button>();
	private readonly panels = new Map<DiagnosticsTab, HTMLElement>();
	private selectedTab = DiagnosticsTab.SessionInsights;
	private root: HTMLElement | undefined;
	private _scopedContextKeyService: IContextKeyService | undefined;

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._scopedContextKeyService;
	}

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(AgentDiagnosticsEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.root = DOM.append(parent, DOM.$('.agent-diagnostics-editor'));
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.root));
		this._scopedContextKeyService = scopedContextKeyService;
		AgentDiagnosticsFocusedContext.bindTo(scopedContextKeyService).set(true);

		const tabList = DOM.append(this.root, DOM.$('.agent-diagnostics-tabs'));
		tabList.setAttribute('role', 'tablist');
		tabList.setAttribute('aria-label', localize('agentDiagnostics.tabsAriaLabel', "Diagnostics views"));

		this.createTab(tabList, DiagnosticsTab.SessionInsights, localize('agentDiagnostics.sessionInsights', "Session Insights"), 'agent-diagnostics-session-insights');
		this.createTab(tabList, DiagnosticsTab.AgentDebug, localize('agentDiagnostics.agentDebug', "Agent Debug"), 'agent-diagnostics-agent-debug');

		const content = DOM.append(this.root, DOM.$('.agent-diagnostics-content'));
		this.createPanel(
			content,
			DiagnosticsTab.SessionInsights,
			'agent-diagnostics-session-insights',
			localize('agentDiagnostics.sessionInsights', "Session Insights"),
			localize('agentDiagnostics.sessionInsightsPlaceholder', "Focused-session insights will appear here.")
		);
		this.createPanel(
			content,
			DiagnosticsTab.AgentDebug,
			'agent-diagnostics-agent-debug',
			localize('agentDiagnostics.agentDebug', "Agent Debug"),
			localize('agentDiagnostics.agentDebugPlaceholder', "Focused-chat debug events will appear here.")
		);

		this._register(DOM.addDisposableListener(tabList, DOM.EventType.KEY_DOWN, event => this.handleTabKeyDown(event)));
		this.selectTab(this.selectedTab, false);
	}

	private createTab(parent: HTMLElement, tab: DiagnosticsTab, label: string, panelId: string): void {
		const button = this._register(new Button(parent, { ...defaultButtonStyles, secondary: true }));
		button.label = label;
		button.element.classList.add('agent-diagnostics-tab');
		button.element.setAttribute('role', 'tab');
		button.element.setAttribute('aria-controls', panelId);
		this._register(button.onDidClick(() => this.selectTab(tab, true)));
		this.tabs.set(tab, button);
	}

	private createPanel(parent: HTMLElement, tab: DiagnosticsTab, id: string, title: string, placeholder: string): void {
		const panel = DOM.append(parent, DOM.$('.agent-diagnostics-panel'));
		panel.id = id;
		panel.setAttribute('role', 'tabpanel');
		panel.tabIndex = 0;

		const emptyState = DOM.append(panel, DOM.$('.agent-diagnostics-empty-state'));
		const heading = DOM.append(emptyState, DOM.$('h2.agent-diagnostics-heading'));
		heading.textContent = title;
		const description = DOM.append(emptyState, DOM.$('p.agent-diagnostics-description'));
		description.textContent = placeholder;
		this.panels.set(tab, panel);
	}

	private handleTabKeyDown(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		let target: DiagnosticsTab | undefined;
		switch (keyboardEvent.keyCode) {
			case KeyCode.LeftArrow:
			case KeyCode.UpArrow:
				target = this.selectedTab === DiagnosticsTab.SessionInsights ? DiagnosticsTab.AgentDebug : DiagnosticsTab.SessionInsights;
				break;
			case KeyCode.RightArrow:
			case KeyCode.DownArrow:
				target = this.selectedTab === DiagnosticsTab.AgentDebug ? DiagnosticsTab.SessionInsights : DiagnosticsTab.AgentDebug;
				break;
			case KeyCode.Home:
				target = DiagnosticsTab.SessionInsights;
				break;
			case KeyCode.End:
				target = DiagnosticsTab.AgentDebug;
				break;
		}
		if (target !== undefined) {
			event.preventDefault();
			event.stopPropagation();
			this.selectTab(target, true);
		}
	}

	private selectTab(tab: DiagnosticsTab, focus: boolean): void {
		this.selectedTab = tab;
		for (const [candidate, button] of this.tabs) {
			const selected = candidate === tab;
			button.element.classList.toggle('selected', selected);
			button.element.setAttribute('aria-selected', String(selected));
			button.element.tabIndex = selected ? 0 : -1;
			this.panels.get(candidate)?.toggleAttribute('hidden', !selected);
		}
		if (focus) {
			this.tabs.get(tab)?.focus();
		}
	}

	getAccessibleContent(): string {
		return this.selectedTab === DiagnosticsTab.SessionInsights
			? [
				localize('agentDiagnostics.accessible.sessionInsights', "Session Insights"),
				localize('agentDiagnostics.sessionInsightsPlaceholder', "Focused-session insights will appear here."),
			].join('\n')
			: [
				localize('agentDiagnostics.accessible.agentDebug', "Agent Debug"),
				localize('agentDiagnostics.agentDebugPlaceholder', "Focused-chat debug events will appear here."),
			].join('\n');
	}

	override focus(): void {
		this.tabs.get(this.selectedTab)?.focus();
	}

	override layout(_dimension: Dimension): void { }
}
