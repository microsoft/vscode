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
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { type ISessionCustomizationGroup, type ISessionCustomizationItem, SessionCustomizationSection, type SessionCustomizationStatus, SessionCustomizationsModel } from './sessionCustomizationsModel.js';

const sectionOrder = [
	SessionCustomizationSection.Plugins,
	SessionCustomizationSection.Agents,
	SessionCustomizationSection.Skills,
	SessionCustomizationSection.Instructions,
	SessionCustomizationSection.Hooks,
	SessionCustomizationSection.McpServers,
] as const;

export class SessionCustomizationsView extends Disposable {

	readonly element: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly content: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly expandedSections = new Set<SessionCustomizationSection>(sectionOrder);

	constructor(
		parent: HTMLElement,
		private readonly model: SessionCustomizationsModel,
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
			lines.push(`${sectionLabel(group.section)}: ${group.items.length}`);
			for (const item of group.items) {
				lines.push(`  ${item.name}: ${statusLabel(item.status)}`);
			}
		}
		return lines.join('\n');
	}

	private render(): void {
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
		const header = this.renderDisposables.add(new Button(section, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		header.element.classList.add('agent-diagnostics-customization-section-header');
		const label = localize('agentDiagnostics.customizations.section', "{0} ({1})", sectionLabel(group.section), group.items.length);
		header.label = `$(${expanded ? Codicon.chevronDown.id : Codicon.chevronRight.id}) ${label}`;
		header.setAriaLabel(label);
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
		for (const item of group.items) {
			this.renderItem(body, item);
		}
	}

	private renderItem(parent: HTMLElement, item: ISessionCustomizationItem): void {
		const row = DOM.append(parent, DOM.$('.agent-diagnostics-customization-item'));
		row.setAttribute('role', 'listitem');
		const title = DOM.append(row, DOM.$('.agent-diagnostics-customization-item-title'));
		const name = DOM.append(title, DOM.$('.agent-diagnostics-customization-name'));
		name.textContent = item.name;
		const status = DOM.append(title, DOM.$(`.agent-diagnostics-customization-status.${item.status}`));
		status.textContent = statusLabel(item.status);

		const metadata = DOM.append(row, DOM.$('.agent-diagnostics-customization-metadata'));
		if (item.parentName) {
			const parentName = DOM.append(metadata, DOM.$('span'));
			parentName.textContent = localize('agentDiagnostics.customizations.parent', "From {0}", item.parentName);
		}
		const source = DOM.append(metadata, DOM.$('span.agent-diagnostics-customization-source'));
		source.textContent = basename(URI.parse(item.uri));
		if (item.description) {
			const description = DOM.append(row, DOM.$('.agent-diagnostics-customization-description'));
			description.textContent = item.description;
		}
		if (item.detail && item.detail !== 'ready') {
			const detail = DOM.append(row, DOM.$('.agent-diagnostics-customization-detail'));
			detail.textContent = item.detail;
		}
		row.setAttribute('aria-label', localize('agentDiagnostics.customizations.itemAriaLabel', "{0}, {1}", item.name, statusLabel(item.status)));
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
		case 'loaded':
			return localize('agentDiagnostics.customizations.status.loaded', "Loaded");
		case 'disabled':
			return localize('agentDiagnostics.customizations.status.disabled', "Disabled");
		case 'loading':
			return localize('agentDiagnostics.customizations.status.loading', "Loading");
		case 'degraded':
			return localize('agentDiagnostics.customizations.status.degraded', "Degraded");
		case 'failed':
			return localize('agentDiagnostics.customizations.status.failed', "Failed");
	}
}
