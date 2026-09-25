/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ITableRenderer, ITableVirtualDelegate } from '../../../../../base/browser/ui/table/table.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { asTextOrError, IRequestService } from '../../../../../platform/request/common/request.js';
import { localize } from '../../../../../nls.js';
import { AgentPluginItemKind, IAgentPluginItem } from '../agentPluginEditor/agentPluginItems.js';
import { IMarketplacePlugin } from '../../common/plugins/pluginMarketplaceService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { ContributionEnablementState, isContributionEnabled } from '../../common/enablement.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { defaultButtonStyles, getButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { createPolicyManagedEnablementAction, createUninstallPluginAction, getPluginPolicyEnablement, isPluginPolicyBlocked } from '../agentPluginActions.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename, dirname, isEqual, joinPath } from '../../../../../base/common/resources.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { Action } from '../../../../../base/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import type { IContextMenuProvider } from '../../../../../base/browser/contextmenu.js';
import { AnchorAlignment } from '../../../../../base/browser/ui/contextview/contextview.js';
import { getPluginInclusionLabel } from './aiCustomizationPresentation.js';
import { autorun, waitForState } from '../../../../../base/common/observable.js';
import { WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

const $ = DOM.$;
const INSTALL_REGISTRATION_TIMEOUT = 10_000;
const PLUGIN_DETAIL_TABLE_HEADER_HEIGHT = 30;
const PLUGIN_DETAIL_TABLE_ROW_HEIGHT = 24;

export interface IPluginReadme {
	readonly content: string;
	readonly baseUri: URI;
}

export class PluginReadmeRenderGuard {

	private generation = 0;

	begin(): number {
		return ++this.generation;
	}

	isCurrent(generation: number): boolean {
		return this.generation === generation;
	}
}

export async function loadPluginReadme(
	item: IAgentPluginItem,
	fileService: Pick<IFileService, 'readFile'>,
	requestService: Pick<IRequestService, 'request'>,
): Promise<IPluginReadme | undefined> {
	const readmeUri = item.kind === AgentPluginItemKind.Installed
		? joinPath(item.plugin.uri, 'README.md')
		: item.readmeUri;
	if (!readmeUri) {
		return undefined;
	}
	if (readmeUri.scheme === Schemas.file || readmeUri.scheme === Schemas.vscodeRemote) {
		try {
			const content = await fileService.readFile(readmeUri);
			return { content: content.value.toString(), baseUri: readmeUri };
		} catch (error) {
			if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return undefined;
			}
			throw error;
		}
	}
	if (readmeUri.scheme === Schemas.https) {
		let fetchedUri = readmeUri;
		const githubBlobMatch = readmeUri.toString().match(/^https:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/blob\/(?<rest>.+)$/);
		if (githubBlobMatch?.groups) {
			fetchedUri = URI.parse(`https://raw.githubusercontent.com/${githubBlobMatch.groups['owner']}/${githubBlobMatch.groups['repo']}/${githubBlobMatch.groups['rest']}`);
		}
		const context = await requestService.request({ type: 'GET', url: fetchedUri.toString(), callSite: 'aiCustomizationPluginDetail.fetchReadme' }, CancellationToken.None);
		return { content: await asTextOrError(context) ?? '', baseUri: fetchedUri };
	}
	throw new Error(`Unsupported plugin README URI scheme: ${readmeUri.scheme}`);
}

export async function waitForInstalledPlugin(
	agentPluginService: Pick<IAgentPluginService, 'plugins'>,
	expectedUri: URI,
	token: CancellationToken,
): Promise<IAgentPlugin | undefined> {
	try {
		const plugins = await waitForState(
			agentPluginService.plugins,
			plugins => plugins.some(plugin => isEqual(plugin.uri, expectedUri)),
			undefined,
			token,
		);
		return plugins.find(plugin => isEqual(plugin.uri, expectedUri));
	} catch (error) {
		if (isCancellationError(error)) {
			return undefined;
		}
		throw error;
	}
}

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
	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly root: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly nameRowEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly statusBadgeEl: HTMLElement;
	private readonly titleActionsEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly sourceFactsEl: HTMLElement;
	private readonly factsTableContainer: HTMLElement;
	private readonly factsTable: WorkbenchTable<IPluginFactRow>;
	private readonly contributionsEl: HTMLElement;
	private readonly contributionsTableContainer: HTMLElement;
	private readonly contributionsTable: WorkbenchTable<IPluginContributionRow>;
	private readonly contributionsEmptyEl: HTMLElement;
	private readonly readmeEl: HTMLElement;
	private readonly readmeContentEl: HTMLElement;
	private readonly emptyEl: HTMLElement;
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly copyStateReset = this._register(new MutableDisposable());
	private readonly narrowLayoutUpdate = this._register(new MutableDisposable());
	private readonly inputStateAutorun = this._register(new MutableDisposable());
	private readonly installWaitDisposables = this._register(new MutableDisposable<DisposableStore>());

	private current: IAgentPluginItem | undefined;
	private narrowLayout = false;
	private readonly readmeRenderGuard = new PluginReadmeRenderGuard();
	private updateEnablementAction: (() => void) | undefined;
	private renderedPolicyEnablement: boolean | undefined;

	constructor(
		parent: HTMLElement,
		@ILabelService private readonly labelService: ILabelService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@IPluginInstallService private readonly pluginInstallService: IPluginInstallService,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ICommandService private readonly commandService: ICommandService,
		@IHoverService private readonly hoverService: IHoverService,
		@IFileService private readonly fileService: IFileService,
		@IRequestService private readonly requestService: IRequestService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.root = DOM.append(parent, $('.ai-customization-embedded-detail.embedded-plugin-detail'));
		const targetWindow = DOM.getWindow(this.root);
		const resizeObserver = this._register(new DOM.DisposableResizeObserver(
			'EmbeddedAgentPluginDetail',
			() => {
				const narrow = this.root.offsetWidth < 520;
				if (this.narrowLayout !== narrow) {
					this.narrowLayoutUpdate.value = DOM.scheduleAtNextAnimationFrame(targetWindow, () => this.updateNarrowLayout(narrow));
				}
				this.layoutTables();
			},
			targetWindow,
		));
		this._register(resizeObserver.observe(this.root));

		this.headerEl = DOM.append(this.root, $('.embedded-detail-header'));
		// Slot at the start of the header for callers to append leading chrome
		// (e.g. a back button) without reaching into private DOM structure.
		this.leadingSlotEl = DOM.append(this.headerEl, $('.embedded-detail-leading-slot'));
		const headerText = DOM.append(this.headerEl, $('.embedded-detail-header-text'));
		this.nameRowEl = DOM.append(headerText, $('.embedded-detail-name-row'));
		this.nameEl = DOM.append(this.nameRowEl, $('h2.embedded-detail-name'));
		this.nameEl.setAttribute('role', 'heading');
		this.statusBadgeEl = DOM.append(this.nameRowEl, $('.inline-badge.embedded-detail-status-badge'));
		this.titleActionsEl = DOM.append(this.headerEl, $('.embedded-detail-title-actions'));

		this.descriptionEl = DOM.append(this.root, $('.embedded-detail-description'));

		this.sourceFactsEl = DOM.append(this.root, $('.embedded-detail-section.plugin-detail-source-facts'));
		const sourceFactsTitle = DOM.append(this.sourceFactsEl, $('h3.embedded-detail-section-title'));
		sourceFactsTitle.textContent = localize('pluginSourceFactsTitle', "Details");
		this.factsTableContainer = DOM.append(this.sourceFactsEl, $('.plugin-detail-table.plugin-detail-facts-table'));
		this.factsTable = this.createFactsTable();

		this.contributionsEl = DOM.append(this.root, $('.embedded-detail-section.plugin-detail-contributions'));
		const contributionsTitle = DOM.append(this.contributionsEl, $('h3.embedded-detail-section-title'));
		contributionsTitle.textContent = localize('pluginContributionsTitle', "Contains");
		this.contributionsTableContainer = DOM.append(this.contributionsEl, $('.plugin-detail-table.plugin-detail-contributions-table'));
		this.contributionsTable = this.createContributionsTable();
		this.contributionsEmptyEl = DOM.append(this.contributionsEl, $('.plugin-detail-contribution-empty'));
		this.readmeEl = DOM.append(this.root, $('.embedded-detail-section.plugin-detail-readme'));
		const readmeTitle = DOM.append(this.readmeEl, $('h3.plugin-detail-contribution-group-title'));
		const readmeLabel = DOM.append(readmeTitle, $('span.plugin-detail-contribution-title-label'));
		readmeLabel.textContent = localize('pluginReadmeTitle', "Plugin README");
		this.readmeContentEl = DOM.append(this.readmeEl, $('.plugin-detail-readme-content'));

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('pluginDetailEmpty', "No plugin selected.");

	}

	private updateNarrowLayout(narrow: boolean): void {
		if (this.narrowLayout === narrow) {
			return;
		}
		this.narrowLayout = narrow;
		this.root.classList.toggle('narrow-layout', narrow);
		this._onDidChangeContent.fire();
	}

	private createFactsTable(): WorkbenchTable<IPluginFactRow> {
		const labelRenderer = new PluginDetailTextColumnRenderer<IPluginFactRow>(
			'plugin-detail-fact-label',
			'plugin-detail-table-label',
			row => row.label,
		);
		const valueRenderer = new PluginFactValueColumnRenderer((row, container, disposables) => this.renderFactValue(row, container, disposables));
		return this._register(this.instantiationService.createInstance(
			WorkbenchTable<IPluginFactRow>,
			'PluginDetails',
			this.factsTableContainer,
			new PluginDetailTableDelegate(),
			[
				{
					label: localize('pluginDetailPropertyColumn', "Property"),
					tooltip: '',
					weight: 0.3,
					minimumWidth: 100,
					templateId: labelRenderer.templateId,
					project: row => row,
				},
				{
					label: localize('pluginDetailValueColumn', "Value"),
					tooltip: '',
					weight: 0.7,
					minimumWidth: 140,
					templateId: valueRenderer.templateId,
					project: row => row,
				},
			],
			[labelRenderer, valueRenderer],
			{
				identityProvider: { getId: row => row.id },
				horizontalScrolling: false,
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('pluginDetailsTableAriaLabel', "Plugin details"),
					getAriaLabel: row => localize('pluginDetailTableRowAriaLabel', "{0}, {1}", row.label, row.value),
				},
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: row => `${row.label} ${row.value}` },
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				openOnSingleClick: false,
				alwaysConsumeMouseWheel: false,
			},
		));
	}

	private createContributionsTable(): WorkbenchTable<IPluginContributionRow> {
		const typeRenderer = new PluginDetailTextColumnRenderer<IPluginContributionRow>(
			'plugin-detail-contribution-type',
			'plugin-detail-table-type',
			row => row.type,
		);
		const nameRenderer = new PluginDetailTextColumnRenderer<IPluginContributionRow>(
			'plugin-detail-contribution-name',
			'plugin-detail-table-name',
			row => row.name,
			row => !!row.action,
		);
		const descriptionRenderer = new PluginDetailTextColumnRenderer<IPluginContributionRow>(
			'plugin-detail-contribution-description',
			'plugin-detail-table-description',
			row => row.description ?? '',
		);
		const table = this._register(this.instantiationService.createInstance(
			WorkbenchTable<IPluginContributionRow>,
			'PluginContents',
			this.contributionsTableContainer,
			new PluginDetailTableDelegate(),
			[
				{
					label: localize('pluginDetailTypeColumn', "Type"),
					tooltip: '',
					weight: 0.2,
					minimumWidth: 80,
					templateId: typeRenderer.templateId,
					project: row => row,
				},
				{
					label: localize('pluginDetailNameColumn', "Name"),
					tooltip: '',
					weight: 0.3,
					minimumWidth: 100,
					templateId: nameRenderer.templateId,
					project: row => row,
				},
				{
					label: localize('pluginDetailDescriptionColumn', "Description"),
					tooltip: '',
					weight: 0.5,
					minimumWidth: 100,
					templateId: descriptionRenderer.templateId,
					project: row => row,
				},
			],
			[typeRenderer, nameRenderer, descriptionRenderer],
			{
				identityProvider: { getId: row => row.id },
				horizontalScrolling: false,
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('pluginContentsTableAriaLabel', "Plugin contents"),
					getAriaLabel: row => row.description
						? localize('pluginContentTableRowWithDescriptionAriaLabel', "{0}, {1}, {2}", row.type, row.name, row.description)
						: localize('pluginContentTableRowAriaLabel', "{0}, {1}", row.type, row.name),
				},
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: row => `${row.type} ${row.name}` },
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				openOnSingleClick: true,
				alwaysConsumeMouseWheel: false,
			},
		));
		this._register(table.onDidOpen(event => {
			if (event.element) {
				this.openContribution(event.element);
			}
		}));
		return table;
	}

	private setTableRows<TRow>(container: HTMLElement, table: WorkbenchTable<TRow>, rows: readonly TRow[]): void {
		table.splice(0, Number.POSITIVE_INFINITY, rows);
		const height = PLUGIN_DETAIL_TABLE_HEADER_HEIGHT + rows.length * PLUGIN_DETAIL_TABLE_ROW_HEIGHT;
		container.style.height = `${height}px`;
		table.layout(height, container.clientWidth);
	}

	private layoutTables(): void {
		if (this.factsTableContainer?.offsetParent && this.factsTable) {
			this.factsTable.layout(this.factsTableContainer.clientHeight, this.factsTableContainer.clientWidth);
		}
		if (this.contributionsTableContainer?.offsetParent && this.contributionsTable) {
			this.contributionsTable.layout(this.contributionsTableContainer.clientHeight, this.contributionsTableContainer.clientWidth);
		}
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
		this.installWaitDisposables.clear();
		this.current = item;
		this.renderItem();
		if (item.kind === AgentPluginItemKind.Installed) {
			this.renderedPolicyEnablement = getPluginPolicyEnablement(item.plugin);
			this.inputStateAutorun.value = autorun(reader => {
				item.plugin.enablement.read(reader);
				const policyEnablement = getPluginPolicyEnablement(item.plugin, reader);
				item.plugin.version?.read(reader);
				if (this._store.isDisposed || this.current !== item) {
					return;
				}
				if (policyEnablement !== this.renderedPolicyEnablement) {
					this.renderedPolicyEnablement = policyEnablement;
					this.renderItem();
					return;
				}
				this.updateInstalledState(item);
			});
		} else {
			this.inputStateAutorun.clear();
		}
	}

	clearInput(): void {
		this.installWaitDisposables.clear();
		this.current = undefined;
		this.inputStateAutorun.clear();
		this.renderItem();
	}

	private renderItem(): void {
		const readmeRenderGeneration = this.readmeRenderGuard.begin();
		this.renderDisposables.clear();
		this.updateEnablementAction = undefined;
		const item = this.current;
		const hasItem = !!item;
		this.emptyEl.style.display = hasItem ? 'none' : '';
		this.root.classList.toggle('is-empty', !hasItem);
		if (!item) {
			this.nameEl.textContent = '';
			this.statusBadgeEl.textContent = '';
			this.statusBadgeEl.style.display = 'none';
			DOM.clearNode(this.titleActionsEl);
			this.descriptionEl.textContent = '';
			this.setTableRows(this.factsTableContainer, this.factsTable, []);
			this.sourceFactsEl.style.display = 'none';
			this.setTableRows(this.contributionsTableContainer, this.contributionsTable, []);
			this.contributionsEmptyEl.textContent = '';
			this.contributionsEl.style.display = 'none';
			DOM.clearNode(this.readmeContentEl);
			this.readmeEl.style.display = 'none';
			this._onDidChangeContent.fire();
			return;
		}

		this.nameEl.textContent = item.name;
		if (item.kind === AgentPluginItemKind.Installed && (!isContributionEnabled(item.plugin.enablement.get()) || isPluginPolicyBlocked(item.plugin))) {
			this.statusBadgeEl.textContent = getPluginInclusionLabel(item.plugin);
			this.statusBadgeEl.style.display = '';
		} else {
			this.statusBadgeEl.textContent = '';
			this.statusBadgeEl.style.display = 'none';
		}
		DOM.clearNode(this.titleActionsEl);

		this.renderTitleActions(item);
		this.renderFacts(item);
		this.renderContributions(item);
		this.renderReadme(item, readmeRenderGeneration);

		const description = (item.description || '').trim();
		this.descriptionEl.textContent = description || localize('pluginNoDescription', "No description provided.");
		this.descriptionEl.style.display = '';
		this._onDidChangeContent.fire();
	}

	private updateInstalledState(item: Extract<IAgentPluginItem, { kind: AgentPluginItemKind.Installed }>): void {
		if (!isContributionEnabled(item.plugin.enablement.get()) || isPluginPolicyBlocked(item.plugin)) {
			this.statusBadgeEl.textContent = getPluginInclusionLabel(item.plugin);
			this.statusBadgeEl.style.display = '';
		} else {
			this.statusBadgeEl.textContent = '';
			this.statusBadgeEl.style.display = 'none';
		}
		this.updateEnablementAction?.();
		this.renderFacts(item);
		this._onDidChangeContent.fire();
	}

	private renderTitleActions(item: IAgentPluginItem): void {
		if (item.kind === AgentPluginItemKind.Marketplace) {
			const installButton = this.renderDisposables.add(new Button(this.titleActionsEl, { ...defaultButtonStyles, ariaLabel: localize('installPluginAria', "Install {0}", item.name) }));
			installButton.label = localize('install', "Install");
			this.renderDisposables.add(installButton.onDidClick(async () => {
				installButton.label = localize('installing', "Installing...");
				installButton.enabled = false;
				const marketplacePlugin: IMarketplacePlugin = {
					name: item.name,
					description: item.description,
					version: item.version ?? '',
					source: item.source,
					sourceDescriptor: item.sourceDescriptor,
					marketplace: item.marketplace,
					marketplaceReference: item.marketplaceReference,
					marketplaceType: item.marketplaceType,
					readmeUri: item.readmeUri,
				};
				try {
					await this.pluginInstallService.installPlugin(marketplacePlugin);
					if (this._store.isDisposed || this.current !== item) {
						return;
					}
					const waitDisposables = new DisposableStore();
					this.installWaitDisposables.value = waitDisposables;
					const waitCts = new CancellationTokenSource();
					waitDisposables.add({ dispose: () => waitCts.dispose(true) });
					waitDisposables.add(disposableTimeout(() => waitCts.cancel(), INSTALL_REGISTRATION_TIMEOUT));
					const expectedUri = this.pluginInstallService.getPluginInstallUri(marketplacePlugin);
					const plugin = await waitForInstalledPlugin(this.agentPluginService, expectedUri, waitCts.token);
					if (this.installWaitDisposables.value === waitDisposables) {
						this.installWaitDisposables.clear();
					}
					if (this._store.isDisposed || this.current !== item) {
						return;
					}
					if (plugin) {
						installButton.label = localize('installed', "Installed");
						this.setInput(this.toInstalledPluginItem(plugin));
					} else {
						installButton.label = localize('install', "Install");
						installButton.enabled = true;
					}
				} catch (error) {
					this.installWaitDisposables.clear();
					if (this._store.isDisposed || this.current !== item) {
						return;
					}
					installButton.label = localize('install', "Install");
					installButton.enabled = true;
					this.notificationService.error(localize('pluginInstallFailed', "Unable to install plugin: {0}", getErrorMessage(error)));
				}
			}));
			return;
		}

		const uninstallAction = createUninstallPluginAction(item.plugin);
		if (uninstallAction) {
			this.renderDisposables.add(uninstallAction);
			const uninstallButton = this.renderDisposables.add(new Button(this.titleActionsEl, {
				...getButtonStyles({
					buttonSecondaryBackground: undefined,
					buttonSecondaryForeground: undefined,
					buttonSecondaryHoverBackground: undefined,
					buttonSecondaryBorder: undefined,
				}),
				secondary: true,
				supportIcons: true,
				ariaLabel: uninstallAction.label,
			}));
			uninstallButton.element.classList.add('embedded-detail-uninstall-button');
			uninstallButton.label = uninstallAction.label;
			uninstallButton.enabled = uninstallAction.enabled;
			this.renderDisposables.add(uninstallButton.onDidClick(async () => {
				try {
					const removed = await uninstallAction.runAndGetResult();
					if (removed && !this._store.isDisposed && this.current === item) {
						this._onDidUninstall.fire();
					}
				} catch (error) {
					if (!this._store.isDisposed && this.current === item) {
						this.notificationService.error(localize('pluginUninstallFailed', "Unable to uninstall plugin: {0}", getErrorMessage(error)));
					}
				}
			}));
		}

		this.renderEnablementSplitButton(item);
	}

	private renderEnablementSplitButton(item: Extract<IAgentPluginItem, { kind: AgentPluginItemKind.Installed }>): void {
		const policyAction = createPolicyManagedEnablementAction(item.plugin, this.notificationService);
		if (policyAction) {
			const policyLabel = localize('pluginManagedByOrganization', "Managed by Organization");
			const button = this.renderDisposables.add(new Button(this.titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: policyLabel }));
			button.label = policyLabel;
			this.renderDisposables.add(button.onDidClick(() => policyAction.run()));
			this.renderDisposables.add(policyAction);
			return;
		}

		const key = item.plugin.uri.toString();
		const setEnablement = (state: ContributionEnablementState) => {
			this.agentPluginService.enablementModel.setEnabled(key, state);
			status(localize('pluginInclusionChanged', "{0}. {1}.", item.name, getPluginInclusionLabel(item.plugin)));
		};
		const contextMenuProvider: IContextMenuProvider = {
			showContextMenu: delegate => this.contextMenuService.showContextMenu({
				...delegate,
				anchorAlignment: AnchorAlignment.RIGHT,
			}),
		};
		const alternateAction = this.renderDisposables.add(new Action('plugin.alternateScope', '', undefined, true, async () => {
			const state = getPluginEnablementActionState(item.plugin.enablement.get());
			setEnablement(state.alternateState);
		}));
		const splitButton = this.renderDisposables.add(new ButtonWithDropdown(this.titleActionsEl, {
			...defaultButtonStyles,
			secondary: true,
			supportIcons: true,
			contextMenuProvider,
			addPrimaryActionToDropdown: false,
			actions: {
				getActions: () => {
					const state = getPluginEnablementActionState(item.plugin.enablement.get());
					alternateAction.label = state.alternateLabel;
					return [alternateAction];
				},
			},
			ariaLabel: '',
		}));
		this.updateEnablementAction = () => {
			const state = getPluginEnablementActionState(item.plugin.enablement.get());
			splitButton.element.classList.toggle('embedded-detail-disable-button', state.isEnabled);
			splitButton.element.classList.toggle('embedded-detail-enable-button', !state.isEnabled);
			splitButton.label = state.primaryLabel;
			splitButton.element.setAttribute('aria-label', state.primaryLabel);
		};
		this.updateEnablementAction();
		this.renderDisposables.add(splitButton.onDidClick(() => setEnablement(getPluginEnablementActionState(item.plugin.enablement.get()).primaryState)));
	}

	private toInstalledPluginItem(plugin: IAgentPlugin): IAgentPluginItem {
		return {
			kind: AgentPluginItemKind.Installed,
			name: plugin.label || basename(plugin.uri),
			description: plugin.fromMarketplace?.description ?? this.labelService.getUriLabel(plugin.uri, { relative: true }),
			marketplace: plugin.fromMarketplace?.marketplace,
			plugin,
		};
	}

	private renderFacts(item: IAgentPluginItem): void {
		this.sourceFactsEl.style.display = '';
		const rows: IPluginFactRow[] = [];
		const version = getPluginVersion(item);
		if (version) {
			rows.push({
				id: 'version',
				label: localize('pluginDetailVersion', "Version"),
				value: version,
			});
		}
		if (item.kind === AgentPluginItemKind.Marketplace) {
			rows.push({
				id: 'marketplace',
				label: localize('pluginDetailMarketplace', "Marketplace"),
				value: item.marketplace,
				link: getMarketplaceUri(item),
			});
			this.setTableRows(this.factsTableContainer, this.factsTable, rows);
			return;
		}

		if (item.marketplace) {
			rows.push({
				id: 'marketplace',
				label: localize('pluginDetailMarketplace', "Marketplace"),
				value: item.marketplace,
				link: item.plugin.fromMarketplace ? getMarketplaceUri(item.plugin.fromMarketplace) : undefined,
			});
		}
		rows.push({
			id: 'location',
			label: localize('pluginDetailLocation', "Location"),
			value: this.labelService.getUriLabel(item.plugin.uri, { relative: true }),
			location: item.plugin.uri,
		});
		this.setTableRows(this.factsTableContainer, this.factsTable, rows);
	}

	private renderFactValue(row: IPluginFactRow, container: HTMLElement, disposables: DisposableStore): void {
		if (row.location) {
			container.appendChild(this.createLocationValue(row.location, row.value, disposables));
		} else if (row.link) {
			const link = DOM.append(container, $('a.plugin-detail-table-link')) as HTMLAnchorElement;
			link.href = row.link.toString();
			link.textContent = row.value;
			disposables.add(DOM.addDisposableListener(link, 'click', event => {
				event.preventDefault();
				this.openerService.open(row.link!);
			}));
		} else {
			container.textContent = row.value;
		}
	}

	private createLocationValue(uri: URI, text: string, disposables: DisposableStore): HTMLElement {
		const container = $('.embedded-detail-location-value');
		const label = DOM.append(container, $('span.embedded-detail-location-label'));
		label.textContent = text;
		label.title = uri.fsPath || uri.toString();
		const copyPluginPathLabel = localize('copyPluginPath', "Copy Plugin Path");
		let copyPluginPathTooltip = copyPluginPathLabel;
		const inlineButtonStyles = getButtonStyles({
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryBorder: undefined,
		});
		const copyButton = disposables.add(new Button(container, { ...inlineButtonStyles, secondary: true, supportIcons: true, title: copyPluginPathLabel, ariaLabel: copyPluginPathLabel }));
		copyButton.element.classList.add('embedded-detail-copy-button');
		copyButton.label = `$(${Codicon.copy.id})`;
		disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), copyButton.element, () => copyPluginPathTooltip));
		disposables.add(copyButton.onDidClick(async () => {
			await this.clipboardService.writeText(uri.fsPath || uri.toString());
			copyButton.label = `$(${Codicon.check.id})`;
			copyPluginPathTooltip = localize('copiedPluginPath', "Copied");
			copyButton.setTitle(copyPluginPathTooltip);
			status(localize('copiedPluginPathStatus', "Copied plugin path to clipboard"));
			this.copyStateReset.value = disposableTimeout(() => {
				copyButton.label = `$(${Codicon.copy.id})`;
				copyPluginPathTooltip = copyPluginPathLabel;
				copyButton.setTitle(copyPluginPathTooltip);
			}, 1200);
		}));
		const openPluginFolderLabel = localize('openPluginFolder', "Open Plugin Folder");
		const openButton = disposables.add(new Button(container, { ...inlineButtonStyles, secondary: true, supportIcons: true, title: openPluginFolderLabel, ariaLabel: openPluginFolderLabel }));
		openButton.element.classList.add('embedded-detail-copy-button');
		openButton.label = `$(${Codicon.folderOpened.id})`;
		disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), openButton.element, openPluginFolderLabel));
		disposables.add(openButton.onDidClick(async () => {
			try {
				await this.commandService.executeCommand('revealFileInOS', uri);
			} catch {
				await this.openerService.open(dirname(uri));
			}
		}));
		return container;
	}

	private async renderReadme(item: IAgentPluginItem, renderGeneration: number): Promise<void> {
		DOM.clearNode(this.readmeContentEl);
		this.readmeEl.style.display = '';
		let readme: IPluginReadme | undefined;
		try {
			readme = await loadPluginReadme(item, this.fileService, this.requestService);
		} catch {
			if (!this._store.isDisposed && this.current === item && this.readmeRenderGuard.isCurrent(renderGeneration)) {
				const message = DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message'));
				message.textContent = localize('pluginReadmeLoadError', "The plugin README could not be loaded.");
				this._onDidChangeContent.fire();
			}
			return;
		}
		if (this._store.isDisposed || this.current !== item || !this.readmeRenderGuard.isCurrent(renderGeneration)) {
			return;
		}
		if (readme === undefined) {
			const message = DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message'));
			message.textContent = localize('pluginReadmeMissing', "No README was provided for this plugin.");
			this._onDidChangeContent.fire();
			return;
		}
		if (!readme.content.trim()) {
			const message = DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message'));
			message.textContent = localize('pluginReadmeEmpty', "The plugin README is empty.");
			this._onDidChangeContent.fire();
			return;
		}
		const markdown = new MarkdownString(readme.content, { supportHtml: false });
		markdown.baseUri = readme.baseUri;
		const rendered = this.renderDisposables.add(this.markdownRendererService.render(markdown, {
			asyncRenderCallback: () => {
				if (!this._store.isDisposed && this.current === item && this.readmeRenderGuard.isCurrent(renderGeneration)) {
					this._onDidChangeContent.fire();
				}
			},
		}));
		this.readmeContentEl.appendChild(rendered.element);
		this._onDidChangeContent.fire();
	}

	override dispose(): void {
		this.current = undefined;
		this.readmeRenderGuard.begin();
		super.dispose();
	}

	private renderContributions(item: IAgentPluginItem): void {
		if (item.kind === AgentPluginItemKind.Marketplace) {
			this.contributionsEl.style.display = '';
			this.contributionsTableContainer.style.display = 'none';
			this.contributionsEmptyEl.style.display = '';
			this.contributionsEmptyEl.textContent = localize('pluginMarketplaceContributionsUnavailable', "Contribution details are available after install when the plugin can be inspected locally.");
			this.setTableRows(this.contributionsTableContainer, this.contributionsTable, []);
			return;
		}

		const entries = getInstalledPluginContributionEntries(item);
		const rows = entries.flatMap((entry, entryIndex) => entry.items.map((contribution, contributionIndex): IPluginContributionRow => ({
			id: `${entry.kind}:${entryIndex}:${contributionIndex}`,
			type: entry.label,
			name: contribution.name,
			description: contribution.description,
			action: getPluginContributionAction(entry.kind, contribution.uri),
		})));
		this.contributionsEl.style.display = rows.length > 0 ? '' : 'none';
		this.contributionsTableContainer.style.display = '';
		this.contributionsEmptyEl.style.display = 'none';
		this.contributionsEmptyEl.textContent = '';
		this.setTableRows(this.contributionsTableContainer, this.contributionsTable, rows);
	}

	private openContribution(row: IPluginContributionRow): void {
		if (!row.action) {
			return;
		}
		switch (row.action.kind) {
			case 'skill':
				this._onDidRequestOpenSkill.fire(row.action.uri);
				break;
			case 'agent':
				this._onDidRequestOpenAgent.fire(row.action.uri);
				break;
			case 'mcp':
				this._onDidRequestOpenSection.fire(AICustomizationManagementSection.McpServers);
				break;
		}
	}
}

class PluginDetailTableDelegate implements ITableVirtualDelegate<IPluginFactRow | IPluginContributionRow> {
	readonly headerRowHeight = PLUGIN_DETAIL_TABLE_HEADER_HEIGHT;

	getHeight(): number {
		return PLUGIN_DETAIL_TABLE_ROW_HEIGHT;
	}
}

interface IPluginDetailTextColumnTemplateData {
	readonly element: HTMLElement;
}

class PluginDetailTextColumnRenderer<TRow> implements ITableRenderer<TRow, IPluginDetailTextColumnTemplateData> {
	constructor(
		readonly templateId: string,
		private readonly className: string,
		private readonly getText: (row: TRow) => string,
		private readonly isLink?: (row: TRow) => boolean,
	) { }

	renderTemplate(container: HTMLElement): IPluginDetailTextColumnTemplateData {
		return { element: DOM.append(container, $(`.${this.className}`)) };
	}

	renderElement(row: TRow, index: number, templateData: IPluginDetailTextColumnTemplateData): void {
		const text = this.getText(row);
		templateData.element.textContent = text;
		templateData.element.title = text;
		templateData.element.classList.toggle('plugin-detail-table-link', this.isLink?.(row) ?? false);
	}

	disposeTemplate(): void { }
}

interface IPluginFactValueColumnTemplateData {
	readonly element: HTMLElement;
	readonly disposables: DisposableStore;
}

class PluginFactValueColumnRenderer implements ITableRenderer<IPluginFactRow, IPluginFactValueColumnTemplateData> {
	readonly templateId = 'plugin-detail-fact-value';

	constructor(private readonly renderValue: (row: IPluginFactRow, container: HTMLElement, disposables: DisposableStore) => void) { }

	renderTemplate(container: HTMLElement): IPluginFactValueColumnTemplateData {
		return {
			element: DOM.append(container, $('.plugin-detail-table-value')),
			disposables: new DisposableStore(),
		};
	}

	renderElement(row: IPluginFactRow, index: number, templateData: IPluginFactValueColumnTemplateData): void {
		templateData.disposables.clear();
		DOM.clearNode(templateData.element);
		templateData.element.title = row.location ? row.location.fsPath || row.location.toString() : row.value;
		this.renderValue(row, templateData.element, templateData.disposables);
	}

	disposeTemplate(templateData: IPluginFactValueColumnTemplateData): void {
		templateData.disposables.dispose();
	}
}

interface IPluginFactRow {
	readonly id: string;
	readonly label: string;
	readonly value: string;
	readonly link?: URI;
	readonly location?: URI;
}

type PluginContributionKind = 'agents' | 'skills' | 'commands' | 'instructions' | 'mcp' | 'hooks' | 'automations';

type PluginContributionAction =
	| { readonly kind: 'agent'; readonly uri: URI }
	| { readonly kind: 'skill'; readonly uri: URI }
	| { readonly kind: 'mcp' };

interface IPluginContributionRow {
	readonly id: string;
	readonly type: string;
	readonly name: string;
	readonly description?: string;
	readonly action?: PluginContributionAction;
}

interface IPluginContributionEntry {
	readonly kind: PluginContributionKind;
	readonly label: string;
	readonly items: readonly { name: string; description?: string; uri?: URI }[];
}

function getInstalledPluginContributionEntries(item: Extract<IAgentPluginItem, { kind: AgentPluginItemKind.Installed }>): IPluginContributionEntry[] {
	const plugin = item.plugin;
	const entries: IPluginContributionEntry[] = [];
	appendContributionEntry(entries, 'agents', localize('pluginDetailAgents', "Agents"), plugin.agents.get());
	appendContributionEntry(entries, 'skills', localize('pluginDetailSkills', "Skills"), plugin.skills.get());
	appendContributionEntry(entries, 'commands', localize('pluginDetailCommands', "Commands"), plugin.commands.get());
	appendContributionEntry(entries, 'instructions', localize('pluginDetailInstructions', "Instructions"), plugin.instructions.get());
	appendContributionEntry(entries, 'mcp', localize('pluginDetailMcpServers', "MCP Servers"), plugin.mcpServerDefinitions.get().map(server => ({ name: server.name })));
	appendContributionEntry(entries, 'hooks', localize('pluginDetailHooks', "Hooks"), plugin.hooks.get().map(hook => ({ name: hook.originalId, description: localize('pluginDetailHookCommands', "{0} commands", hook.hooks.length) })));
	appendContributionEntry(entries, 'automations', localize('pluginDetailAutomations', "Automations"), plugin.automations.get().map(automation => ({
		name: automation.blueprint.name,
		description: automation.blueprint.description,
	})));
	return entries;
}

function appendContributionEntry(entries: IPluginContributionEntry[], kind: PluginContributionKind, label: string | undefined, items: readonly { name: string; description?: string; uri?: URI }[]): void {
	if (label && items.length > 0) {
		entries.push({ kind, label, items });
	}
}

function getPluginContributionAction(kind: PluginContributionKind, uri: URI | undefined): PluginContributionAction | undefined {
	if (kind === 'skills' && uri) {
		return { kind: 'skill', uri };
	}
	if (kind === 'agents' && uri) {
		return { kind: 'agent', uri };
	}
	if (kind === 'mcp') {
		return { kind: 'mcp' };
	}
	return undefined;
}

export function getPluginVersion(item: IAgentPluginItem): string | undefined {
	const version = item.kind === AgentPluginItemKind.Marketplace
		? item.version
		: item.plugin.version?.get() ?? item.plugin.fromMarketplace?.version;
	return version?.trim() || undefined;
}

function getPluginEnablementActionState(current: ContributionEnablementState): {
	readonly isEnabled: boolean;
	readonly primaryLabel: string;
	readonly primaryState: ContributionEnablementState;
	readonly alternateLabel: string;
	readonly alternateState: ContributionEnablementState;
} {
	const isEnabled = isContributionEnabled(current);
	const isWorkspaceScope = current === ContributionEnablementState.EnabledWorkspace || current === ContributionEnablementState.DisabledWorkspace;
	const profileLabel = isEnabled ? localize('disablePlugin', "Disable") : localize('enablePlugin', "Enable");
	const workspaceLabel = isEnabled ? localize('disablePluginWorkspace', "Disable (Workspace)") : localize('enablePluginWorkspace', "Enable (Workspace)");
	const profileState = isEnabled ? ContributionEnablementState.DisabledProfile : ContributionEnablementState.EnabledProfile;
	const workspaceState = isEnabled ? ContributionEnablementState.DisabledWorkspace : ContributionEnablementState.EnabledWorkspace;
	return {
		isEnabled,
		primaryLabel: isWorkspaceScope ? workspaceLabel : profileLabel,
		primaryState: isWorkspaceScope ? workspaceState : profileState,
		alternateLabel: isWorkspaceScope ? profileLabel : workspaceLabel,
		alternateState: isWorkspaceScope ? profileState : workspaceState,
	};
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
