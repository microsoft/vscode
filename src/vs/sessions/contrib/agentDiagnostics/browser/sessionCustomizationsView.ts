/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CustomizationType } from '../../../../platform/agentHost/common/state/sessionState.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { type ISessionCustomizationGroup, type ISessionCustomizationItem, type ISessionCustomizationLifecycleEntry, type ISessionCustomizationMetadata, type ISessionMcpLifecycleAttempt, SessionCustomizationMetadataKind, SessionCustomizationSection, type SessionCustomizationStatus, SessionCustomizationsModel, summarizeMcpLifecycle } from './sessionCustomizationsModel.js';

export class SessionCustomizationsView extends Disposable {

	readonly element: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly content: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly expandedSections = new Set<SessionCustomizationSection>();
	private readonly expandedItems = new Set<string>();
	private readonly expandedLifecycleAttempts = new Set<string>();
	private readonly expandedLifecycleEntries = new Set<string>();

	constructor(
		parent: HTMLElement,
		private readonly model: SessionCustomizationsModel,
		@IEditorService private readonly editorService: IEditorService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super();
		this.content = DOM.$('.agent-diagnostics-customizations-scroll');
		this.scrollable = this._register(new DomScrollableElement(this.content, {
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto,
			consumeMouseWheelIfScrollbarIsNeeded: true,
		}));
		this.element = this.scrollable.getDomNode();
		this.element.classList.add('agent-diagnostics-customizations');
		DOM.append(parent, this.element);
		const resizeObserver = this._register(new DOM.DisposableResizeObserver('SessionCustomizationsView.scrollable', () => this.scrollable.scanDomNode()));
		this._register(resizeObserver.observe(this.element));
		this._register(this.model.onDidChange(() => this.render()));
		this.render();
	}

	layout(): void {
		const parent = this.element.parentElement;
		if (parent) {
			this.element.style.height = `${parent.clientHeight}px`;
		}
		this.scrollable.scanDomNode();
	}

	getAccessibleContent(): string {
		const state = this.model.state;
		if (!state) {
			return localize('agentDiagnostics.customizations.placeholder', "Focused-session customizations will appear here.");
		}
		if (!state.supported) {
			return localize('agentDiagnostics.customizations.unsupported', "Customizations are available for Agent Host sessions.");
		}
		const lines: string[] = [];
		for (const group of state.groups) {
			lines.push(localize('agentDiagnostics.customizations.accessibleSection', "{0}: {1}", sectionLabel(group.section), group.items.length));
			for (const item of group.items) {
				lines.push(localize('agentDiagnostics.customizations.accessibleItem', "{0}: {1}; source {2}", item.name, statusLabel(item.status), item.uri));
				for (const lifecycle of item.lifecycle) {
					lines.push(localize('agentDiagnostics.customizations.accessibleLifecycle', "{0}: {1}", new Date(lifecycle.timestamp).toLocaleTimeString(), lifecycleLabel(lifecycle)));
				}
				for (const evidence of item.evidence) {
					lines.push(localize('agentDiagnostics.customizations.accessibleEvidence', "{0}: {1}, turn {2}", evidenceLabel(evidence.kind), evidence.chatTitle, evidence.turnId));
				}
			}
			for (const lifecycle of group.lifecycle) {
				lines.push(localize('agentDiagnostics.customizations.accessibleLifecycle', "{0}: {1}", new Date(lifecycle.timestamp).toLocaleTimeString(), lifecycleLabel(lifecycle)));
			}
		}
		return lines.join('\n');
	}

	private render(): void {
		const scrollTop = this.scrollable.getScrollPosition().scrollTop;
		this.renderDisposables.clear();
		DOM.clearNode(this.content);
		const state = this.model.state;
		if (!state) {
			this.renderMessage(localize('agentDiagnostics.customizations.placeholder', "Focused-session customizations will appear here."));
			return;
		}
		if (!state.supported) {
			this.renderMessage(localize('agentDiagnostics.customizations.unsupported', "Customizations are available for Agent Host sessions."));
			return;
		}

		const total = state.groups.reduce((count, group) => count + group.items.length, 0);
		const summary = DOM.append(this.content, DOM.$('p.agent-diagnostics-customizations-summary'));
		summary.textContent = localize('agentDiagnostics.customizations.summary', "{0} customizations loaded for the focused session.", total);
		for (const group of state.groups) {
			this.renderGroup(group);
		}
		this.scrollable.scanDomNode();
		this.scrollable.setScrollPosition({ scrollTop });
	}

	private renderMessage(message: string): void {
		const empty = DOM.append(this.content, DOM.$('.agent-diagnostics-empty-state'));
		const heading = DOM.append(empty, DOM.$('h2.agent-diagnostics-heading'));
		heading.textContent = localize('agentDiagnostics.customizations', "Customizations");
		const description = DOM.append(empty, DOM.$('p.agent-diagnostics-description'));
		description.textContent = message;
		this.scrollable.scanDomNode();
	}

	private renderGroup(group: ISessionCustomizationGroup): void {
		const section = DOM.append(this.content, DOM.$('section.agent-diagnostics-customization-section'));
		const expanded = this.expandedSections.has(group.section);
		const failedCount = group.items.filter(item => item.status === 'failed').length
			+ group.lifecycle.filter(entry => entry.kind === 'hookFailed').length;
		const header = this.renderDisposables.add(new Button(section, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		header.element.classList.add('agent-diagnostics-customization-section-header');
		const label = localize('agentDiagnostics.customizations.section', "{0} ({1})", sectionLabel(group.section), group.items.length);
		header.label = `$(${expanded ? Codicon.chevronDown.id : Codicon.chevronRight.id}) ${label}${failedCount > 0 ? ` $(${Codicon.error.id})` : ''}`;
		header.setAriaLabel(failedCount > 0
			? localize('agentDiagnostics.customizations.sectionWithErrors', "{0}, {1} failed", label, failedCount)
			: label);
		header.element.classList.toggle('has-error', failedCount > 0);
		header.element.setAttribute('aria-expanded', String(expanded));
		this.renderDisposables.add(header.onDidClick(() => {
			if (expanded) {
				this.expandedSections.delete(group.section);
			} else {
				this.expandedSections.add(group.section);
			}
			this.render();
		}));

		const body = DOM.append(section, DOM.$('.agent-diagnostics-customization-section-body'));
		body.toggleAttribute('hidden', !expanded);
		if (!expanded) {
			return;
		}
		if (group.items.length === 0) {
			const empty = DOM.append(body, DOM.$('.agent-diagnostics-customization-empty'));
			empty.textContent = localize('agentDiagnostics.customizations.none', "No customizations in this category.");
			return;
		}
		body.setAttribute('role', 'list');
		body.setAttribute('aria-label', sectionLabel(group.section));
		if (group.lifecycle.length > 0) {
			this.renderHookLifecycle(body, group.lifecycle);
		}
		for (const item of group.items) {
			this.renderItem(body, item);
		}
	}

	private renderItem(parent: HTMLElement, item: ISessionCustomizationItem): void {
		const row = DOM.append(parent, DOM.$('.agent-diagnostics-customization-item'));
		row.setAttribute('role', 'listitem');
		const title = DOM.append(row, DOM.$('.agent-diagnostics-customization-item-title'));
		const expanded = this.expandedItems.has(item.id);
		row.classList.toggle('expanded', expanded);
		const button = this.renderDisposables.add(new Button(title, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		button.element.classList.add('agent-diagnostics-customization-item-button');
		button.label = `$(${expanded ? Codicon.chevronDown.id : Codicon.chevronRight.id}) ${item.name}`;
		button.setAriaLabel(item.name);
		button.element.setAttribute('aria-expanded', String(expanded));
		this.renderDisposables.add(button.onDidClick(() => {
			if (expanded) {
				this.expandedItems.delete(item.id);
			} else {
				this.expandedItems.add(item.id);
			}
			this.render();
		}));
		const status = DOM.append(title, DOM.$(`.agent-diagnostics-customization-status.${item.status}`));
		status.textContent = statusLabel(item.status);

		const detailContainer = DOM.append(row, DOM.$('.agent-diagnostics-customization-item-detail'));
		detailContainer.toggleAttribute('hidden', !expanded);
		if (!expanded) {
			row.setAttribute('aria-label', localize('agentDiagnostics.customizations.itemAriaLabel', "{0}, {1}", item.name, statusLabel(item.status)));
			return;
		}
		const metadata = DOM.append(detailContainer, DOM.$('.agent-diagnostics-customization-metadata'));
		metadata.textContent = item.parentName
			? localize('agentDiagnostics.customizations.typeAndParent', "{0} from {1}", customizationTypeLabel(item), item.parentName)
			: customizationTypeLabel(item);
		const sourceRow = DOM.append(detailContainer, DOM.$('.agent-diagnostics-customization-source-row'));
		const sourceLabel = DOM.append(sourceRow, DOM.$('span.agent-diagnostics-customization-source-label'));
		sourceLabel.textContent = localize('agentDiagnostics.customizations.source', "Source");
		const source = DOM.append(sourceRow, DOM.$('span.agent-diagnostics-customization-source'));
		source.textContent = basename(URI.parse(item.uri));
		const isPlugin = item.type === CustomizationType.Plugin;
		const openUri = item.openUri;
		if (openUri) {
			const openSource = this.renderDisposables.add(new Button(sourceRow, { ...defaultButtonStyles, secondary: true }));
			openSource.element.classList.add('agent-diagnostics-customization-open-source');
			openSource.label = isPlugin
				? localize('agentDiagnostics.customizations.openFolder', "Open Folder")
				: localize('agentDiagnostics.customizations.openSource', "Open");
			openSource.setAriaLabel(isPlugin
				? localize('agentDiagnostics.customizations.openFolderAriaLabel', "Open folder for {0}", item.name)
				: localize('agentDiagnostics.customizations.openSourceAriaLabel', "Open source for {0}", item.name));
			this.renderDisposables.add(openSource.onDidClick(async () => {
				const resource = URI.parse(openUri);
				if (isPlugin) {
					await this.nativeHostService.showItemInFolder(resource.fsPath);
				} else {
					await this.editorService.openEditor({ resource, options: { pinned: true } });
				}
			}));
		}
		if (item.description) {
			const description = DOM.append(detailContainer, DOM.$('.agent-diagnostics-customization-description'));
			description.textContent = item.description;
		}
		if (item.metadata.length > 0) {
			const properties = DOM.append(detailContainer, DOM.$('.agent-diagnostics-customization-properties'));
			for (const property of item.metadata) {
				const propertyElement = DOM.append(properties, DOM.$('.agent-diagnostics-customization-property'));
				const label = DOM.append(propertyElement, DOM.$('.agent-diagnostics-customization-property-label'));
				label.textContent = metadataLabel(property);
				const value = DOM.append(propertyElement, DOM.$('.agent-diagnostics-customization-property-value'));
				value.textContent = metadataValue(property);
			}
		}
		if (item.detail && item.detail !== 'ready') {
			const detail = DOM.append(detailContainer, DOM.$('.agent-diagnostics-customization-detail'));
			detail.textContent = item.detail;
		}
		if (item.lifecycle.length > 0) {
			if (item.type === CustomizationType.McpServer) {
				this.renderMcpLifecycle(detailContainer, item);
			} else {
				this.renderLifecycle(
					detailContainer,
					localize('agentDiagnostics.customizations.lifecycle', "Lifecycle"),
					item.lifecycle
				);
			}
		}
		if (item.evidence.length > 0) {
			const evidenceHeading = DOM.append(detailContainer, DOM.$('.agent-diagnostics-customization-evidence-heading'));
			evidenceHeading.textContent = localize('agentDiagnostics.customizations.evidenceHeading', "Use Evidence");
			const evidenceList = DOM.append(detailContainer, DOM.$('.agent-diagnostics-customization-evidence-list'));
			evidenceList.setAttribute('role', 'list');
			for (const entry of item.evidence) {
				const evidence = DOM.append(evidenceList, DOM.$('.agent-diagnostics-customization-evidence'));
				evidence.setAttribute('role', 'listitem');
				evidence.textContent = localize('agentDiagnostics.customizations.evidence', "{0} in {1}, turn {2}", evidenceLabel(entry.kind), entry.chatTitle, entry.turnId);
			}
		}
		row.setAttribute('aria-label', localize('agentDiagnostics.customizations.itemAriaLabel', "{0}, {1}", item.name, statusLabel(item.status)));
	}

	private renderLifecycle(parent: HTMLElement, title: string, entries: readonly ISessionCustomizationLifecycleEntry[]): void {
		const container = DOM.append(parent, DOM.$('.agent-diagnostics-customization-lifecycle'));
		const heading = DOM.append(container, DOM.$('h4.agent-diagnostics-customization-lifecycle-heading'));
		heading.textContent = title;
		const list = DOM.append(container, DOM.$('.agent-diagnostics-customization-lifecycle-list'));
		list.setAttribute('role', 'list');
		list.setAttribute('aria-label', title);
		this.renderLifecycleEntries(list, entries);
	}

	private renderMcpLifecycle(parent: HTMLElement, item: ISessionCustomizationItem): void {
		const summary = summarizeMcpLifecycle(item.lifecycle);
		const container = DOM.append(parent, DOM.$('.agent-diagnostics-customization-lifecycle'));
		const heading = DOM.append(container, DOM.$('h4.agent-diagnostics-customization-lifecycle-heading'));
		heading.textContent = localize('agentDiagnostics.customizations.connectionHealth', "Connection Health");
		const health = DOM.append(container, DOM.$('.agent-diagnostics-customization-health'));
		this.renderHealthFact(health, localize('agentDiagnostics.customizations.currentState', "Current"), lifecycleKindLabel(summary.currentState));
		this.renderHealthFact(health, localize('agentDiagnostics.customizations.attempts', "Attempts"), String(summary.attempts.length));
		this.renderHealthFact(health, localize('agentDiagnostics.customizations.successfulAttempts', "Successful"), String(summary.successfulAttempts));
		this.renderHealthFact(health, localize('agentDiagnostics.customizations.failedAttempts', "Failed"), String(summary.failedAttempts));
		if (summary.lastStartupDuration !== undefined) {
			this.renderHealthFact(health, localize('agentDiagnostics.customizations.lastStartup', "Last Startup"), formatDuration(summary.lastStartupDuration));
		}
		if (summary.readySince !== undefined) {
			this.renderHealthFact(health, localize('agentDiagnostics.customizations.readyFor', "Ready For"), formatDuration(Date.now() - summary.readySince));
		}
		if (summary.currentProblem) {
			const problem = DOM.append(container, DOM.$(`.agent-diagnostics-customization-health-problem.${lifecycleSeverity(summary.currentProblem)}`));
			const problemTitle = DOM.append(problem, DOM.$('.agent-diagnostics-customization-health-problem-title'));
			problemTitle.textContent = lifecycleKindLabel(summary.currentProblem.kind);
			if (summary.currentProblem.detail) {
				const problemDetail = DOM.append(problem, DOM.$('.agent-diagnostics-customization-health-problem-detail'));
				problemDetail.textContent = summary.currentProblem.detail;
			}
			if (summary.currentProblem.resource) {
				const resource = DOM.append(problem, DOM.$('.agent-diagnostics-customization-health-problem-detail'));
				resource.textContent = localize('agentDiagnostics.customizations.authResource', "Resource: {0}", summary.currentProblem.resource);
			}
			if (summary.currentProblem.scopes.length > 0) {
				const scopes = DOM.append(problem, DOM.$('.agent-diagnostics-customization-health-problem-detail'));
				scopes.textContent = localize('agentDiagnostics.customizations.authScopes', "Required scopes: {0}", summary.currentProblem.scopes.join(', '));
			}
		}

		const attemptsHeading = DOM.append(container, DOM.$('h4.agent-diagnostics-customization-attempts-heading'));
		attemptsHeading.textContent = localize('agentDiagnostics.customizations.connectionAttempts', "Connection Attempts");
		const attempts = DOM.append(container, DOM.$('.agent-diagnostics-customization-attempts'));
		for (const [index, attempt] of summary.attempts.entries()) {
			this.renderMcpAttempt(attempts, item.id, attempt, index + 1);
		}
	}

	private renderHookLifecycle(parent: HTMLElement, entries: readonly ISessionCustomizationLifecycleEntry[]): void {
		const container = DOM.append(parent, DOM.$('.agent-diagnostics-customization-lifecycle'));
		const heading = DOM.append(container, DOM.$('h4.agent-diagnostics-customization-lifecycle-heading'));
		heading.textContent = localize('agentDiagnostics.customizations.hookHealth', "Hook Health");
		const health = DOM.append(container, DOM.$('.agent-diagnostics-customization-health'));
		this.renderHealthFact(health, localize('agentDiagnostics.customizations.executions', "Executions"), String(entries.length));
		this.renderHealthFact(health, localize('agentDiagnostics.customizations.succeeded', "Succeeded"), String(entries.filter(entry => entry.kind === 'hookSucceeded').length));
		this.renderHealthFact(health, localize('agentDiagnostics.customizations.warnings', "Warnings"), String(entries.filter(entry => entry.kind === 'hookWarning').length));
		this.renderHealthFact(health, localize('agentDiagnostics.customizations.failed', "Failed"), String(entries.filter(entry => entry.kind === 'hookFailed').length));
		const durations = entries.flatMap(entry => entry.duration === undefined ? [] : [entry.duration]);
		if (durations.length > 0) {
			this.renderHealthFact(
				health,
				localize('agentDiagnostics.customizations.averageDuration', "Average Duration"),
				formatDuration(durations.reduce((total, duration) => total + duration, 0) / durations.length)
			);
		}
		const activityHeading = DOM.append(container, DOM.$('h4.agent-diagnostics-customization-attempts-heading'));
		activityHeading.textContent = localize('agentDiagnostics.customizations.hookActivity', "Recent Hook Activity");
		const list = DOM.append(container, DOM.$('.agent-diagnostics-customization-lifecycle-list'));
		list.setAttribute('role', 'list');
		list.setAttribute('aria-label', localize('agentDiagnostics.customizations.hookActivity', "Recent Hook Activity"));
		this.renderLifecycleEntries(list, entries);
	}

	private renderHealthFact(parent: HTMLElement, label: string, value: string): void {
		const fact = DOM.append(parent, DOM.$('.agent-diagnostics-customization-health-fact'));
		const factLabel = DOM.append(fact, DOM.$('.agent-diagnostics-customization-health-label'));
		factLabel.textContent = label;
		const factValue = DOM.append(fact, DOM.$('.agent-diagnostics-customization-health-value'));
		factValue.textContent = value;
	}

	private renderMcpAttempt(parent: HTMLElement, customizationId: string, attempt: ISessionMcpLifecycleAttempt, attemptNumber: number): void {
		const lastEvent = attempt.events.at(-1);
		const attemptElement = DOM.append(parent, DOM.$(`.agent-diagnostics-customization-attempt.${lastEvent ? lifecycleSeverity(lastEvent) : 'neutral'}`));
		const key = `${customizationId}:${attempt.id}`;
		const expanded = this.expandedLifecycleAttempts.has(key);
		const header = this.renderDisposables.add(new Button(attemptElement, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		header.element.classList.add('agent-diagnostics-customization-attempt-header');
		const duration = attempt.duration === undefined ? '' : localize('agentDiagnostics.customizations.attemptDuration', " · {0}", formatDuration(attempt.duration));
		const label = localize('agentDiagnostics.customizations.attemptLabel', "Attempt {0} · {1}{2}", attemptNumber, lifecycleKindLabel(attempt.state), duration);
		header.label = `$(${expanded ? Codicon.chevronDown.id : Codicon.chevronRight.id}) ${label}`;
		header.setAriaLabel(label);
		header.element.setAttribute('aria-expanded', String(expanded));
		this.renderDisposables.add(header.onDidClick(() => {
			if (expanded) {
				this.expandedLifecycleAttempts.delete(key);
			} else {
				this.expandedLifecycleAttempts.add(key);
			}
			this.render();
		}));
		if (attempt.problem?.detail) {
			const problem = DOM.append(attemptElement, DOM.$('.agent-diagnostics-customization-attempt-problem'));
			problem.textContent = attempt.problem.detail;
		}
		const events = DOM.append(attemptElement, DOM.$('.agent-diagnostics-customization-attempt-events'));
		events.toggleAttribute('hidden', !expanded);
		if (expanded) {
			events.setAttribute('role', 'list');
			events.setAttribute('aria-label', localize('agentDiagnostics.customizations.rawEvents', "Raw lifecycle events"));
			this.renderLifecycleEntries(events, attempt.events);
		}
	}

	private renderLifecycleEntries(parent: HTMLElement, entries: readonly ISessionCustomizationLifecycleEntry[]): void {
		for (const entry of entries.slice(-30)) {
			const row = DOM.append(parent, DOM.$(`.agent-diagnostics-customization-lifecycle-entry.${lifecycleSeverity(entry)}`));
			row.setAttribute('role', 'listitem');
			const header = DOM.append(row, DOM.$('.agent-diagnostics-customization-lifecycle-header'));
			const time = DOM.append(header, DOM.$<HTMLTimeElement>('time.agent-diagnostics-customization-lifecycle-time'));
			time.dateTime = new Date(entry.timestamp).toISOString();
			time.textContent = new Date(entry.timestamp).toLocaleTimeString();
			const state = DOM.append(header, DOM.$('.agent-diagnostics-customization-lifecycle-state'));
			state.textContent = lifecycleKindLabel(entry.kind);
			if (entry.title) {
				const entryTitle = DOM.append(header, DOM.$('.agent-diagnostics-customization-lifecycle-title'));
				entryTitle.textContent = entry.title;
			}
			const hasDetails = entry.duration !== undefined
				|| entry.exitCode !== undefined
				|| entry.resource !== undefined
				|| entry.scopes.length > 0
				|| entry.command !== undefined
				|| entry.detail !== undefined
				|| entry.input !== undefined
				|| entry.output !== undefined;
			const expanded = this.expandedLifecycleEntries.has(entry.id);
			if (hasDetails) {
				const details = this.renderDisposables.add(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
				details.element.classList.add('agent-diagnostics-customization-lifecycle-details');
				details.label = `$(${expanded ? Codicon.chevronDown.id : Codicon.chevronRight.id}) ${localize('agentDiagnostics.customizations.lifecycleDetails', "Details")}`;
				details.element.setAttribute('aria-expanded', String(expanded));
				this.renderDisposables.add(details.onDidClick(() => {
					if (expanded) {
						this.expandedLifecycleEntries.delete(entry.id);
					} else {
						this.expandedLifecycleEntries.add(entry.id);
					}
					this.render();
				}));
			}
			if (!expanded) {
				row.setAttribute('aria-label', lifecycleLabel(entry));
				continue;
			}
			if (entry.duration !== undefined || entry.exitCode !== undefined) {
				const facts = DOM.append(row, DOM.$('.agent-diagnostics-customization-lifecycle-facts'));
				if (entry.duration !== undefined) {
					const duration = DOM.append(facts, DOM.$('span'));
					duration.textContent = localize('agentDiagnostics.customizations.duration', "{0}ms", Math.round(entry.duration));
				}
				if (entry.exitCode !== undefined) {
					const exitCode = DOM.append(facts, DOM.$('span'));
					exitCode.textContent = localize('agentDiagnostics.customizations.exitCode', "Exit code {0}", entry.exitCode);
				}
			}
			if (entry.resource) {
				const resource = DOM.append(row, DOM.$('.agent-diagnostics-customization-lifecycle-detail'));
				resource.textContent = localize('agentDiagnostics.customizations.authResource', "Resource: {0}", entry.resource);
			}
			if (entry.scopes.length > 0) {
				const scopes = DOM.append(row, DOM.$('.agent-diagnostics-customization-lifecycle-detail'));
				scopes.textContent = localize('agentDiagnostics.customizations.authScopes', "Required scopes: {0}", entry.scopes.join(', '));
			}
			if (entry.command) {
				const command = DOM.append(row, DOM.$('.agent-diagnostics-customization-lifecycle-detail'));
				command.textContent = localize('agentDiagnostics.customizations.hookCommand', "Command: {0}", entry.command);
			}
			if (entry.detail) {
				const detail = DOM.append(row, DOM.$('.agent-diagnostics-customization-lifecycle-detail'));
				detail.textContent = entry.detail;
			}
			this.renderLifecyclePayload(row, localize('agentDiagnostics.customizations.hookInput', "Input"), entry.input);
			this.renderLifecyclePayload(row, localize('agentDiagnostics.customizations.hookOutput', "Output"), entry.output);
			row.setAttribute('aria-label', lifecycleLabel(entry));
		}
	}

	private renderLifecyclePayload(parent: HTMLElement, label: string, value: string | undefined): void {
		if (!value) {
			return;
		}
		const field = DOM.append(parent, DOM.$('.agent-diagnostics-customization-lifecycle-field'));
		const heading = DOM.append(field, DOM.$('.agent-diagnostics-customization-lifecycle-field-label'));
		heading.textContent = label;
		const content = DOM.append(field, DOM.$('pre.agent-diagnostics-customization-lifecycle-field-value'));
		content.textContent = value;
	}
}

function sectionLabel(section: SessionCustomizationSection): string {
	switch (section) {
		case SessionCustomizationSection.Plugins:
			return localize('agentDiagnostics.customizations.plugins', "Plugins");
		case SessionCustomizationSection.Agents:
			return localize('agentDiagnostics.customizations.agents', "Agents");
		case SessionCustomizationSection.Skills:
			return localize('agentDiagnostics.customizations.skills', "Skills");
		case SessionCustomizationSection.Instructions:
			return localize('agentDiagnostics.customizations.instructions', "Instructions");
		case SessionCustomizationSection.Hooks:
			return localize('agentDiagnostics.customizations.hooks', "Hooks");
		case SessionCustomizationSection.McpServers:
			return localize('agentDiagnostics.customizations.mcpServers', "MCP Servers");
	}
}

function statusLabel(status: SessionCustomizationStatus): string {
	switch (status) {
		case 'used':
			return localize('agentDiagnostics.customizations.status.used', "Used");
		case 'loaded':
			return localize('agentDiagnostics.customizations.status.loaded', "Loaded");
		case 'disabled':
			return localize('agentDiagnostics.customizations.status.disabled', "Disabled");
		case 'loading':
			return localize('agentDiagnostics.customizations.status.loading', "Loading");
		case 'authenticationRequired':
			return localize('agentDiagnostics.customizations.status.authenticationRequired', "Authentication Required");
		case 'degraded':
			return localize('agentDiagnostics.customizations.status.degraded', "Degraded");
		case 'failed':
			return localize('agentDiagnostics.customizations.status.failed', "Failed");
	}
}

function customizationTypeLabel(item: ISessionCustomizationItem): string {
	switch (item.type) {
		case CustomizationType.Plugin:
			return localize('agentDiagnostics.customizations.type.plugin', "Plugin");
		case CustomizationType.Agent:
			return localize('agentDiagnostics.customizations.type.agent', "Agent");
		case CustomizationType.Skill:
			return localize('agentDiagnostics.customizations.type.skill', "Skill");
		case CustomizationType.Prompt:
			return localize('agentDiagnostics.customizations.type.prompt', "Prompt");
		case CustomizationType.Rule:
			return localize('agentDiagnostics.customizations.type.rule', "Instruction");
		case CustomizationType.Hook:
			return localize('agentDiagnostics.customizations.type.hook', "Hook");
		case CustomizationType.McpServer:
			return localize('agentDiagnostics.customizations.type.mcpServer', "MCP Server");
		case CustomizationType.Directory:
			return localize('agentDiagnostics.customizations.type.directory', "Directory");
	}
}

function evidenceLabel(kind: ISessionCustomizationItem['evidence'][number]['kind']): string {
	switch (kind) {
		case 'agent':
			return localize('agentDiagnostics.customizations.evidence.agent', "Selected agent");
		case 'skill':
			return localize('agentDiagnostics.customizations.evidence.skill', "Invoked skill");
		case 'mcp':
			return localize('agentDiagnostics.customizations.evidence.mcp', "Called MCP tool");
	}
}

function metadataLabel(metadata: ISessionCustomizationMetadata): string {
	switch (metadata.kind) {
		case SessionCustomizationMetadataKind.Version:
			return localize('agentDiagnostics.customizations.metadata.version', "Version");
		case SessionCustomizationMetadataKind.Model:
			return localize('agentDiagnostics.customizations.metadata.model', "Model");
		case SessionCustomizationMetadataKind.Tools:
			return localize('agentDiagnostics.customizations.metadata.tools', "Tools");
		case SessionCustomizationMetadataKind.ModelInvocation:
			return localize('agentDiagnostics.customizations.metadata.modelInvocation', "Model Invocation");
		case SessionCustomizationMetadataKind.UserInvocation:
			return localize('agentDiagnostics.customizations.metadata.userInvocation', "User Invocation");
		case SessionCustomizationMetadataKind.AlwaysApply:
			return localize('agentDiagnostics.customizations.metadata.alwaysApply', "Always Apply");
		case SessionCustomizationMetadataKind.Globs:
			return localize('agentDiagnostics.customizations.metadata.globs', "File Patterns");
		case SessionCustomizationMetadataKind.McpState:
			return localize('agentDiagnostics.customizations.metadata.mcpState', "Server State");
	}
}

function metadataValue(metadata: ISessionCustomizationMetadata): string {
	if (typeof metadata.value === 'boolean') {
		return metadata.value
			? localize('agentDiagnostics.customizations.metadata.enabled', "Enabled")
			: localize('agentDiagnostics.customizations.metadata.disabled', "Disabled");
	}
	return typeof metadata.value === 'string' ? metadata.value : metadata.value.join(', ');
}

function lifecycleKindLabel(kind: ISessionCustomizationLifecycleEntry['kind']): string {
	switch (kind) {
		case 'loaded':
			return localize('agentDiagnostics.customizations.lifecycle.loaded', "Loaded");
		case 'startRequested':
			return localize('agentDiagnostics.customizations.lifecycle.startRequested', "Start Requested");
		case 'starting':
			return localize('agentDiagnostics.customizations.lifecycle.starting', "Starting");
		case 'ready':
			return localize('agentDiagnostics.customizations.lifecycle.ready', "Ready");
		case 'authRequired':
			return localize('agentDiagnostics.customizations.lifecycle.authRequired', "Authentication Required");
		case 'failed':
			return localize('agentDiagnostics.customizations.lifecycle.failed', "Failed");
		case 'stopRequested':
			return localize('agentDiagnostics.customizations.lifecycle.stopRequested', "Stop Requested");
		case 'stopped':
			return localize('agentDiagnostics.customizations.lifecycle.stopped', "Stopped");
		case 'hookRunning':
			return localize('agentDiagnostics.customizations.lifecycle.hookRunning', "Running");
		case 'hookSucceeded':
			return localize('agentDiagnostics.customizations.lifecycle.hookSucceeded', "Succeeded");
		case 'hookWarning':
			return localize('agentDiagnostics.customizations.lifecycle.hookWarning', "Completed with Warning");
		case 'hookFailed':
			return localize('agentDiagnostics.customizations.lifecycle.hookFailed', "Failed");
	}
}

function lifecycleSeverity(entry: ISessionCustomizationLifecycleEntry): 'neutral' | 'pending' | 'success' | 'warning' | 'error' {
	switch (entry.kind) {
		case 'startRequested':
		case 'starting':
		case 'authRequired':
		case 'hookRunning':
			return 'pending';
		case 'ready':
		case 'hookSucceeded':
			return 'success';
		case 'stopRequested':
		case 'stopped':
		case 'hookWarning':
			return 'warning';
		case 'failed':
		case 'hookFailed':
			return 'error';
		case 'loaded':
			return 'neutral';
	}
}

function lifecycleLabel(entry: ISessionCustomizationLifecycleEntry): string {
	const kind = lifecycleKindLabel(entry.kind);
	return entry.title
		? localize('agentDiagnostics.customizations.lifecycleAriaLabelWithTitle', "{0}: {1}", kind, entry.title)
		: kind;
}

function formatDuration(duration: number): string {
	if (duration < 1000) {
		return localize('agentDiagnostics.customizations.durationMilliseconds', "{0}ms", Math.round(duration));
	}
	return localize('agentDiagnostics.customizations.durationSeconds', "{0}s", (duration / 1000).toFixed(1));
}
