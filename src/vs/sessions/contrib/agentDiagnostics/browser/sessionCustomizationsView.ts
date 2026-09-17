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
import { type ISessionCustomizationGroup, type ISessionCustomizationItem, type ISessionCustomizationMetadata, SessionCustomizationMetadataKind, SessionCustomizationSection, type SessionCustomizationStatus, SessionCustomizationsModel } from './sessionCustomizationsModel.js';

export class SessionCustomizationsView extends Disposable {

	readonly element: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly content: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly expandedSections = new Set<SessionCustomizationSection>();
	private readonly expandedItems = new Set<string>();

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
				for (const evidence of item.evidence) {
					lines.push(localize('agentDiagnostics.customizations.accessibleEvidence', "{0}: {1}, turn {2}", evidenceLabel(evidence.kind), evidence.chatTitle, evidence.turnId));
				}
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
		const failedCount = group.items.filter(item => item.status === 'failed').length;
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
