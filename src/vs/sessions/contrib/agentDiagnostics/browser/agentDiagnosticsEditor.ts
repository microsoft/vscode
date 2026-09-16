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
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun } from '../../../../base/common/observable.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { ChatDebugFilterState } from '../../../../workbench/contrib/chat/browser/chatDebug/chatDebugFilters.js';
import { isChatDebugLoggingEnabledForSession, renderChatDebugLoggingDisabledMessage } from '../../../../workbench/contrib/chat/browser/chatDebug/chatDebugEnablement.js';
import { ChatDebugSessionView, ChatDebugSessionViews } from '../../../../workbench/contrib/chat/browser/chatDebug/chatDebugSessionViews.js';
import { IChatDebugService } from '../../../../workbench/contrib/chat/common/chatDebugService.js';
import { AgentHostAgentDebugLogEnabledSettingId, AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { AgentDiagnosticsEditorInput } from './agentDiagnosticsEditorInput.js';
import '../../../../workbench/contrib/chat/browser/chatDebug/media/chatDebug.css';

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
	private debugEmptyState: HTMLElement | undefined;
	private debugTabList: HTMLElement | undefined;
	private debugViewsContainer: HTMLElement | undefined;
	private debugSessionViews: ChatDebugSessionViews | undefined;
	private debugDisabledOverlay: HTMLElement | undefined;
	private readonly debugDisabledOverlayDisposables = this._register(new DisposableStore());
	private readonly debugTabs = new Map<ChatDebugSessionView, Button>();
	private selectedDebugView = ChatDebugSessionView.Logs;
	private currentChatResource: URI | undefined;

	override get scopedContextKeyService(): IContextKeyService | undefined {
		return this._scopedContextKeyService;
	}

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super(AgentDiagnosticsEditor.ID, group, telemetryService, themeService, storageService);
		this._register(this.chatDebugService.registerSessionResourceResolver(sessionResource => {
			const activeSession = this.sessionsService.activeSession.get();
			if (!activeSession || !isEqual(activeSession.activeChat.get().resource, sessionResource)) {
				return undefined;
			}
			const provider = this.sessionsProvidersService.getProvider(activeSession.providerId);
			return provider && isAgentHostProvider(provider)
				? provider.getBackendChatResource(sessionResource)
				: undefined;
		}));
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
		const debugPanel = this.createPanel(
			content,
			DiagnosticsTab.AgentDebug,
			'agent-diagnostics-agent-debug',
			localize('agentDiagnostics.agentDebug', "Agent Debug"),
			localize('agentDiagnostics.agentDebugPlaceholder', "Focused-chat debug events will appear here.")
		);
		debugPanel.panel.classList.add('agent-diagnostics-agent-debug-panel');
		this.debugEmptyState = debugPanel.emptyState;

		this.debugTabList = DOM.append(debugPanel.panel, DOM.$('.agent-diagnostics-debug-tabs'));
		this.debugTabList.setAttribute('role', 'tablist');
		this.debugTabList.setAttribute('aria-label', localize('agentDiagnostics.debugTabsAriaLabel', "Agent Debug views"));
		this.createDebugTab(ChatDebugSessionView.Logs, localize('agentDiagnostics.debug.logs', "Logs"));
		this.createDebugTab(ChatDebugSessionView.Flow, localize('agentDiagnostics.debug.flow', "Flow"));
		this.createDebugTab(ChatDebugSessionView.Cache, localize('agentDiagnostics.debug.cache', "Cache"));
		this.createDebugTab(ChatDebugSessionView.Wire, localize('agentDiagnostics.debug.ahp', "AHP"));
		this._register(DOM.addDisposableListener(this.debugTabList, DOM.EventType.KEY_DOWN, event => this.handleDebugTabKeyDown(event)));

		this.debugViewsContainer = DOM.append(debugPanel.panel, DOM.$('.agent-diagnostics-debug-views'));
		this.debugViewsContainer.id = 'agent-diagnostics-debug-view';
		this.debugViewsContainer.setAttribute('role', 'tabpanel');
		const filterState = this._register(new ChatDebugFilterState());
		this.debugSessionViews = this._register(this.instantiationService.createInstance(ChatDebugSessionViews, this.debugViewsContainer, filterState));
		this.debugDisabledOverlay = DOM.append(debugPanel.panel, DOM.$('.chat-debug-disabled-overlay'));
		DOM.hide(this.debugDisabledOverlay);
		this._register(autorun(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			this.setDebugSession(activeSession?.activeChat.read(reader).resource);
		}));
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AgentHostAgentDebugLogEnabledSettingId)
				|| event.affectsConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING)) {
				if (this.currentChatResource) {
					void this.chatDebugService.invokeProviders(this.currentChatResource);
				}
				this.updateDebugView();
			}
		}));

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

	private createDebugTab(view: ChatDebugSessionView, label: string): void {
		if (!this.debugTabList) {
			return;
		}
		const button = this._register(new Button(this.debugTabList, { ...defaultButtonStyles, secondary: true }));
		button.label = label;
		button.element.classList.add('agent-diagnostics-debug-tab');
		button.element.setAttribute('role', 'tab');
		button.element.setAttribute('aria-controls', 'agent-diagnostics-debug-view');
		this._register(button.onDidClick(() => this.selectDebugView(view, true)));
		this.debugTabs.set(view, button);
	}

	private createPanel(parent: HTMLElement, tab: DiagnosticsTab, id: string, title: string, placeholder: string): { panel: HTMLElement; emptyState: HTMLElement } {
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
		return { panel, emptyState };
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

	private handleDebugTabKeyDown(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		const views = [ChatDebugSessionView.Logs, ChatDebugSessionView.Flow, ChatDebugSessionView.Cache, ChatDebugSessionView.Wire];
		const currentIndex = views.indexOf(this.selectedDebugView);
		let targetIndex: number | undefined;
		switch (keyboardEvent.keyCode) {
			case KeyCode.LeftArrow:
			case KeyCode.UpArrow:
				targetIndex = (currentIndex + views.length - 1) % views.length;
				break;
			case KeyCode.RightArrow:
			case KeyCode.DownArrow:
				targetIndex = (currentIndex + 1) % views.length;
				break;
			case KeyCode.Home:
				targetIndex = 0;
				break;
			case KeyCode.End:
				targetIndex = views.length - 1;
				break;
		}
		if (targetIndex !== undefined) {
			event.preventDefault();
			event.stopPropagation();
			this.selectDebugView(views[targetIndex], true);
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
		this.updateDebugView();
	}

	private selectDebugView(view: ChatDebugSessionView, focus: boolean): void {
		this.selectedDebugView = view;
		for (const [candidate, button] of this.debugTabs) {
			const selected = candidate === view;
			button.element.classList.toggle('selected', selected);
			button.element.setAttribute('aria-selected', String(selected));
			button.element.tabIndex = selected ? 0 : -1;
		}
		this.updateDebugView();
		if (focus) {
			this.debugTabs.get(view)?.focus();
		}
	}

	private setDebugSession(chatResource: URI | undefined): void {
		if (isEqual(this.currentChatResource, chatResource)) {
			return;
		}
		if (this.currentChatResource) {
			this.chatDebugService.endSession(this.currentChatResource);
		}
		this.currentChatResource = chatResource;
		this.chatDebugService.activeSessionResource = chatResource;
		if (chatResource) {
			this.debugSessionViews?.setSession(chatResource);
			void this.chatDebugService.invokeProviders(chatResource);
		}
		this.updateDebugView();
	}

	private updateDebugView(): void {
		const dataViewSelected = this.selectedDebugView !== ChatDebugSessionView.Wire;
		const dataViewDisabled = dataViewSelected && !isChatDebugLoggingEnabledForSession(this.configurationService, this.currentChatResource);
		const visible = this.selectedTab === DiagnosticsTab.AgentDebug && !!this.currentChatResource && !dataViewDisabled;
		this.debugEmptyState?.toggleAttribute('hidden', !!this.currentChatResource);
		this.debugTabList?.toggleAttribute('hidden', !this.currentChatResource);
		this.debugViewsContainer?.toggleAttribute('hidden', !this.currentChatResource);
		this.updateDebugDisabledOverlay(dataViewDisabled);
		if (visible) {
			this.debugSessionViews?.showView(this.selectedDebugView);
			this.layoutDebugView();
		} else {
			this.debugSessionViews?.showView(undefined);
		}
	}

	private updateDebugDisabledOverlay(disabled: boolean): void {
		if (!this.debugDisabledOverlay) {
			return;
		}
		this.debugDisabledOverlayDisposables.clear();
		DOM.clearNode(this.debugDisabledOverlay);
		if (disabled && this.selectedTab === DiagnosticsTab.AgentDebug && this.currentChatResource) {
			renderChatDebugLoggingDisabledMessage(this.debugDisabledOverlay, this.currentChatResource, this.preferencesService, this.debugDisabledOverlayDisposables);
			DOM.show(this.debugDisabledOverlay);
		} else {
			DOM.hide(this.debugDisabledOverlay);
		}
	}

	private layoutDebugView(): void {
		if (this.debugViewsContainer && !this.debugViewsContainer.hidden) {
			this.debugSessionViews?.layout(new Dimension(this.debugViewsContainer.clientWidth, this.debugViewsContainer.clientHeight));
		}
	}

	getAccessibleContent(): string {
		return this.selectedTab === DiagnosticsTab.SessionInsights
			? [
				localize('agentDiagnostics.accessible.sessionInsights', "Session Insights"),
				localize('agentDiagnostics.sessionInsightsPlaceholder', "Focused-session insights will appear here."),
			].join('\n')
			: [
				localize('agentDiagnostics.accessible.agentDebugView', "Agent Debug: {0}", this.getDebugViewLabel(this.selectedDebugView)),
				this.currentChatResource
					? localize('agentDiagnostics.accessible.agentDebugEvents', "{0} debug events for {1}.", this.chatDebugService.getEvents(this.currentChatResource).length, this.currentChatResource.toString())
					: localize('agentDiagnostics.agentDebugPlaceholder', "Focused-chat debug events will appear here."),
			].join('\n');
	}

	private getDebugViewLabel(view: ChatDebugSessionView): string {
		switch (view) {
			case ChatDebugSessionView.Logs:
				return localize('agentDiagnostics.debug.logs', "Logs");
			case ChatDebugSessionView.Flow:
				return localize('agentDiagnostics.debug.flow', "Flow");
			case ChatDebugSessionView.Cache:
				return localize('agentDiagnostics.debug.cache', "Cache");
			case ChatDebugSessionView.Wire:
				return localize('agentDiagnostics.debug.ahp', "AHP");
		}
	}

	override focus(): void {
		this.tabs.get(this.selectedTab)?.focus();
	}

	override layout(_dimension: Dimension): void {
		this.layoutDebugView();
	}
}
