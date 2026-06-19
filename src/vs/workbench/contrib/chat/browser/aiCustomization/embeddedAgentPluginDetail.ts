/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { IMarketplacePlugin, PluginSourceKind } from '../../common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { isContributionEnabled } from '../../common/enablement.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { UninstallPluginAction, createDisablePluginDropDown, createEnablePluginDropDown, createPolicyBlockedEnableAction, isPluginPolicyBlocked } from '../agentPluginActions.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename } from '../../../../../base/common/resources.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';

const $ = DOM.$;

/**
 * Compact detail view for an agent plugin inside the AI Customizations management editor's
 * split-pane host. Renders identity, provenance, contribution summary, and description while
 * keeping management actions in the list/context-menu surfaces.
 */
export class EmbeddedAgentPluginDetail extends Disposable {

	private readonly _onDidRequestOpenSkill = this._register(new Emitter<URI>());
	readonly onDidRequestOpenSkill = this._onDidRequestOpenSkill.event;
	private readonly _onDidRequestOpenAgent = this._register(new Emitter<URI>());
	readonly onDidRequestOpenAgent = this._onDidRequestOpenAgent.event;
	private readonly _onDidRequestOpenSection = this._register(new Emitter<AICustomizationManagementSection>());
	readonly onDidRequestOpenSection = this._onDidRequestOpenSection.event;
	private readonly _onDidUninstall = this._register(new Emitter<void>());
	readonly onDidUninstall = this._onDidUninstall.event;

	private readonly root: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly nameRowEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly statusBadgeEl: HTMLElement;
	private readonly sourceEl: HTMLElement;
	private readonly titleActionsEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly factsEl: HTMLElement;
	private readonly contributionsEl: HTMLElement;
	private readonly contributionsListEl: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly copyStateReset = this._register(new MutableDisposable());

	private current: IAgentPluginItem | undefined;

	constructor(
		parent: HTMLElement,
		@ILabelService private readonly labelService: ILabelService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		this.root = DOM.append(parent, $('.ai-customization-embedded-detail.embedded-plugin-detail'));

		this.headerEl = DOM.append(this.root, $('.embedded-detail-header'));
		// Slot at the start of the header for callers to append leading chrome
		// (e.g. a back button) without reaching into private DOM structure.
		this.leadingSlotEl = DOM.append(this.headerEl, $('.embedded-detail-leading-slot'));
		const headerText = DOM.append(this.headerEl, $('.embedded-detail-header-text'));
		this.nameRowEl = DOM.append(headerText, $('.embedded-detail-name-row'));
		this.nameEl = DOM.append(this.nameRowEl, $('h2.embedded-detail-name'));
		this.nameEl.setAttribute('role', 'heading');
		this.statusBadgeEl = DOM.append(this.nameRowEl, $('.inline-badge.embedded-detail-status-badge'));
		this.sourceEl = DOM.append(headerText, $('.embedded-detail-scope'));
		this.titleActionsEl = DOM.append(this.headerEl, $('.embedded-detail-title-actions'));

		this.descriptionEl = DOM.append(this.root, $('.embedded-detail-description'));
		this.factsEl = DOM.append(this.root, $('.embedded-detail-facts'));
		this.contributionsEl = DOM.append(this.root, $('.embedded-detail-section.plugin-detail-contributions'));
		this.contributionsListEl = DOM.append(this.contributionsEl, $('.embedded-detail-chip-list'));

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('pluginDetailEmpty', "No plugin selected.");

		this.renderItem();
	}

	get element(): HTMLElement {
		return this.root;
	}

	get headerElement(): HTMLElement {
		return this.headerEl;
	}

	/**
	 * Header slot reserved for leading chrome (e.g. a back button).
	 * Prefer this over reaching into the header element directly.
	 */
	get leadingSlot(): HTMLElement {
		return this.leadingSlotEl;
	}

	setInput(item: IAgentPluginItem): void {
		this.current = item;
		this.renderItem();
	}

	clearInput(): void {
		this.current = undefined;
		this.renderItem();
	}

	private renderItem(): void {
		this.renderDisposables.clear();
		const item = this.current;
		const hasItem = !!item;
		this.emptyEl.style.display = hasItem ? 'none' : '';
		this.root.classList.toggle('is-empty', !hasItem);
		if (!item) {
			this.nameEl.textContent = '';
			this.statusBadgeEl.textContent = '';
			this.statusBadgeEl.style.display = 'none';
			this.sourceEl.textContent = '';
			DOM.clearNode(this.titleActionsEl);
			this.descriptionEl.textContent = '';
			DOM.clearNode(this.factsEl);
			DOM.clearNode(this.contributionsListEl);
			this.contributionsEl.style.display = 'none';
			return;
		}

		this.nameEl.textContent = item.name;
		if (item.kind === AgentPluginItemKind.Installed && !isContributionEnabled(item.plugin.enablement.get())) {
			this.statusBadgeEl.textContent = localize('pluginDetailDisabledBadge', "Disabled");
			this.statusBadgeEl.style.display = '';
		} else {
			this.statusBadgeEl.textContent = '';
			this.statusBadgeEl.style.display = 'none';
		}
		DOM.clearNode(this.titleActionsEl);
		DOM.clearNode(this.factsEl);
		DOM.clearNode(this.contributionsListEl);

		const isMarketplace = item.kind === AgentPluginItemKind.Marketplace;

		const sourceLabel = item.marketplace
			? (isMarketplace
				? localize('pluginSourceMarketplace', "From {0}", item.marketplace)
				: localize('pluginSourceInstalled', "Installed from {0}", item.marketplace))
			: (isMarketplace
				? localize('pluginSourceMarketplaceUnknown', "Marketplace plugin")
				: localize('pluginSourceLocal', "Installed plugin"));
		this.sourceEl.textContent = sourceLabel;
		this.renderTitleActions(item);
		this.renderFacts(item);
		this.renderContributions(item);

		const description = (item.description || '').trim();
		this.descriptionEl.textContent = description || localize('pluginNoDescription', "No description provided.");
		this.descriptionEl.style.display = '';
	}

	private renderTitleActions(item: IAgentPluginItem): void {
		if (item.kind === AgentPluginItemKind.Marketplace) {
			const installButton = this.renderDisposables.add(new Button(this.titleActionsEl, { ...defaultButtonStyles, supportIcons: true, ariaLabel: localize('installPluginAria', "Install {0}", item.name) }));
			installButton.label = localize('install', "Install");
			this.renderDisposables.add(installButton.onDidClick(async () => {
				installButton.label = localize('installing', "Installing...");
				installButton.enabled = false;
				try {
					await this.pluginInstallService.installPlugin({
						name: item.name,
						description: item.description,
						version: '',
						source: item.source,
						sourceDescriptor: item.sourceDescriptor,
						marketplace: item.marketplace,
						marketplaceReference: item.marketplaceReference,
						marketplaceType: item.marketplaceType,
						readmeUri: item.readmeUri,
					});
					const installed = this.getInstalledPluginForMarketplaceItem(item);
					if (installed) {
						this.current = installed;
						this.renderItem();
					}
					installButton.label = localize('installed', "Installed");
				} catch {
					installButton.label = localize('install', "Install");
					installButton.enabled = true;
				}
			}));
			return;
		}

		const enablementAction = isPluginPolicyBlocked(item.plugin)
			? createPolicyBlockedEnableAction(item.plugin, this.notificationService)
			: isContributionEnabled(item.plugin.enablement.get())
				? createDisablePluginDropDown(item.plugin, this.agentPluginService.enablementModel, this.workspaceContextService)
				: createEnablePluginDropDown(item.plugin, this.agentPluginService.enablementModel, this.workspaceContextService);
		const enablementButton = this.renderDisposables.add(new Button(this.titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: enablementAction.label }));
		enablementButton.element.classList.add(isContributionEnabled(item.plugin.enablement.get()) ? 'embedded-detail-disable-button' : 'embedded-detail-enable-button');
		enablementButton.label = enablementAction.label;
		enablementButton.enabled = enablementAction.enabled;
		this.renderDisposables.add(enablementButton.onDidClick(async () => {
			await enablementAction.run();
			this.renderItem();
		}));
		this.renderDisposables.add(enablementAction);

		if (item.plugin.remove) {
			const uninstallAction = this.renderDisposables.add(new UninstallPluginAction(item.plugin));
			const uninstallButton = this.renderDisposables.add(new Button(this.titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: uninstallAction.label }));
			uninstallButton.element.classList.add('embedded-detail-uninstall-button');
			uninstallButton.label = uninstallAction.label;
			uninstallButton.enabled = uninstallAction.enabled;
			this.renderDisposables.add(uninstallButton.onDidClick(async () => {
				await uninstallAction.run();
				this._onDidUninstall.fire();
			}));
		}
	}

	private getInstalledPluginForMarketplaceItem(item: Extract<IAgentPluginItem, { kind: AgentPluginItemKind.Marketplace }>): IAgentPluginItem | undefined {
		const expectedUri = this.pluginInstallService.getPluginInstallUri({
			name: item.name,
			description: item.description,
			version: '',
			source: item.source,
			sourceDescriptor: item.sourceDescriptor,
			marketplace: item.marketplace,
			marketplaceReference: item.marketplaceReference,
			marketplaceType: item.marketplaceType,
			readmeUri: item.readmeUri,
		});
		const plugin = this.agentPluginService.plugins.get().find(plugin => plugin.uri.toString() === expectedUri.toString());
		if (!plugin) {
			return undefined;
		}
		return {
			kind: AgentPluginItemKind.Installed,
			name: plugin.label || basename(plugin.uri),
			description: plugin.fromMarketplace?.description ?? this.labelService.getUriLabel(plugin.uri, { relative: true }),
			marketplace: plugin.fromMarketplace?.marketplace,
			plugin,
		};
	}

	private renderMarketplaceLink(label: string, uri: URI | undefined): HTMLElement {
		if (uri) {
			const link = $('a.embedded-detail-fact-link') as HTMLAnchorElement;
			link.href = uri.toString();
			link.textContent = label;
			this.renderDisposables.add(DOM.addDisposableListener(link, 'click', e => {
				e.preventDefault();
				this.openerService.open(uri);
			}));
			return link;
		} else {
			const value = $('span');
			value.textContent = label;
			return value;
		}
	}

	private renderFacts(item: IAgentPluginItem): void {
		if (item.kind === AgentPluginItemKind.Marketplace) {
			this.appendFact(localize('pluginDetailSource', "Source"), formatSourceKind(item.sourceDescriptor.kind));
			this.appendFact(localize('pluginDetailMarketplace', "Marketplace"), this.renderMarketplaceLink(item.marketplace, getMarketplaceUri(item)));
			return;
		}

		if (item.plugin.fromMarketplace) {
			this.appendFact(localize('pluginDetailSource', "Source"), formatSourceKind(item.plugin.fromMarketplace.sourceDescriptor.kind));
		} else {
			this.appendFact(localize('pluginDetailSource', "Source"), localize('pluginDetailSourceLocal', "Local"));
		}
		if (item.marketplace) {
			this.appendFact(localize('pluginDetailMarketplace', "Marketplace"), this.renderMarketplaceLink(item.marketplace, item.plugin.fromMarketplace ? getMarketplaceUri(item.plugin.fromMarketplace) : undefined));
		}
		this.appendFact(localize('pluginDetailLocation', "Location"), this.createLocationValue(item.plugin.uri));
	}

	private appendFact(label: string, value: string | HTMLElement): void {
		const row = DOM.append(this.factsEl, $('.embedded-detail-fact-row'));
		const labelEl = DOM.append(row, $('.embedded-detail-fact-label'));
		labelEl.textContent = label;
		const valueEl = DOM.append(row, $('.embedded-detail-fact-value'));
		if (typeof value === 'string') {
			valueEl.textContent = value;
		} else {
			valueEl.appendChild(value);
		}
	}

	private createLocationValue(uri: URI): HTMLElement {
		const container = $('.embedded-detail-location-value');
		const label = DOM.append(container, $('span.embedded-detail-location-label'));
		label.textContent = this.labelService.getUriLabel(uri, { relative: true });
		label.title = uri.fsPath || uri.toString();
		const copyButton = this.renderDisposables.add(new Button(container, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: localize('copyPluginPath', "Copy Plugin Path") }));
		copyButton.element.classList.add('embedded-detail-copy-button');
		copyButton.label = `$(${Codicon.copy.id})`;
		this.renderDisposables.add(copyButton.onDidClick(async () => {
			await this.clipboardService.writeText(uri.fsPath || uri.toString());
			copyButton.label = `$(${Codicon.check.id})`;
			copyButton.setTitle(localize('copiedPluginPath', "Copied"));
			status(localize('copiedPluginPathStatus', "Copied plugin path to clipboard"));
			this.copyStateReset.value = disposableTimeout(() => {
				copyButton.label = `$(${Codicon.copy.id})`;
				copyButton.setTitle(localize('copyPluginPath', "Copy Plugin Path"));
			}, 1200);
		}));
		return container;
	}

	private renderContributions(item: IAgentPluginItem): void {
		if (item.kind === AgentPluginItemKind.Marketplace) {
			this.contributionsEl.style.display = '';
			const empty = DOM.append(this.contributionsListEl, $('.plugin-detail-contribution-empty'));
			empty.textContent = localize('pluginMarketplaceContributionsUnavailable', "Contribution details are available after install when the plugin can be inspected locally.");
			return;
		}

		const entries = getInstalledPluginContributionEntries(item);

		this.contributionsEl.style.display = entries.length > 0 ? '' : 'none';
		for (const entry of entries) {
			const section = DOM.append(this.contributionsListEl, $('.plugin-detail-contribution-section'));
			const header = DOM.append(section, $('.plugin-detail-contribution-group-title'));
			header.textContent = entry.label;
			const group = DOM.append(section, $('.plugin-detail-contribution-group'));
			const list = DOM.append(group, $('.plugin-detail-contribution-list'));
			for (const contribution of entry.items) {
				const row = DOM.append(list, $('.plugin-detail-contribution-row'));
				if (entry.kind === 'skills' && contribution.uri) {
					const button = DOM.append(row, $('button.plugin-detail-contribution-name.plugin-detail-contribution-link')) as HTMLButtonElement;
					button.type = 'button';
					button.textContent = contribution.name;
					button.setAttribute('aria-label', localize('openSkillContribution', "Open skill {0}", contribution.name));
					this.renderDisposables.add(DOM.addDisposableListener(button, 'click', () => this._onDidRequestOpenSkill.fire(contribution.uri!)));
				} else if (entry.kind === 'agents' && contribution.uri) {
					const button = DOM.append(row, $('button.plugin-detail-contribution-name.plugin-detail-contribution-link')) as HTMLButtonElement;
					button.type = 'button';
					button.textContent = contribution.name;
					button.setAttribute('aria-label', localize('openAgentContribution', "Open agent {0}", contribution.name));
					this.renderDisposables.add(DOM.addDisposableListener(button, 'click', () => this._onDidRequestOpenAgent.fire(contribution.uri!)));
				} else if (entry.kind === 'mcp') {
					const button = DOM.append(row, $('button.plugin-detail-contribution-name.plugin-detail-contribution-link')) as HTMLButtonElement;
					button.type = 'button';
					button.textContent = contribution.name;
					button.setAttribute('aria-label', localize('openMcpSectionForContribution', "Open MCP Servers"));
					this.renderDisposables.add(DOM.addDisposableListener(button, 'click', () => this._onDidRequestOpenSection.fire(AICustomizationManagementSection.McpServers)));
				} else {
					const name = DOM.append(row, $('.plugin-detail-contribution-name'));
					name.textContent = contribution.name;
				}
				if (contribution.description && entry.kind !== 'skills') {
					const description = DOM.append(row, $('.plugin-detail-contribution-description'));
					description.textContent = contribution.description;
				}
			}
		}
	}
}

interface IPluginContributionEntry {
	readonly kind: string;
	readonly label: string;
	readonly items: readonly { name: string; description?: string; uri?: URI }[];
}

function getInstalledPluginContributionEntries(item: Extract<IAgentPluginItem, { kind: AgentPluginItemKind.Installed }>): IPluginContributionEntry[] {
	const plugin = item.plugin;
	const entries: IPluginContributionEntry[] = [];
	appendContributionEntry(entries, 'agents', localize('pluginDetailAgents', "Agents {0}", plugin.agents.get().length), plugin.agents.get());
	appendContributionEntry(entries, 'skills', localize('pluginDetailSkills', "Skills {0}", plugin.skills.get().length), plugin.skills.get());
	appendContributionEntry(entries, 'commands', localize('pluginDetailCommands', "Commands {0}", plugin.commands.get().length), plugin.commands.get());
	appendContributionEntry(entries, 'instructions', localize('pluginDetailInstructions', "Instructions {0}", plugin.instructions.get().length), plugin.instructions.get());
	appendContributionEntry(entries, 'mcp', localize('pluginDetailMcpServers', "MCP Servers {0}", plugin.mcpServerDefinitions.get().length), plugin.mcpServerDefinitions.get().map(server => ({ name: server.name })));
	appendContributionEntry(entries, 'hooks', localize('pluginDetailHooks', "Hooks {0}", plugin.hooks.get().length), plugin.hooks.get().map(hook => ({ name: hook.originalId, description: localize('pluginDetailHookCommands', "{0} commands", hook.hooks.length) })));
	return entries;
}

function appendContributionEntry(entries: IPluginContributionEntry[], kind: string, label: string | undefined, items: readonly { name: string; description?: string; uri?: URI }[]): void {
	if (label && items.length > 0) {
		entries.push({ kind, label, items });
	}
}

function formatSourceKind(sourceKind: PluginSourceKind): string {
	switch (sourceKind) {
		case PluginSourceKind.GitHub:
			return localize('pluginDetailSourceGitHub', "GitHub");
		case PluginSourceKind.GitUrl:
			return localize('pluginDetailSourceGitUrl', "Git URL");
		case PluginSourceKind.Npm:
			return localize('pluginDetailSourceNpm', "npm");
		case PluginSourceKind.Pip:
			return localize('pluginDetailSourcePip', "pip");
		case PluginSourceKind.RelativePath:
			return localize('pluginDetailSourceRelativePath', "Marketplace repository");
	}
}

function getMarketplaceUri(item: Pick<IMarketplacePlugin | Extract<IAgentPluginItem, { kind: AgentPluginItemKind.Marketplace }>, 'marketplaceReference'>): URI | undefined {
	if (item.marketplaceReference.githubRepo) {
		return URI.parse(`https://github.com/${item.marketplaceReference.githubRepo}`);
	}
	if (item.marketplaceReference.cloneUrl) {
		return URI.parse(item.marketplaceReference.cloneUrl.replace(/\.git$/, ''));
	}
	return undefined;
}
