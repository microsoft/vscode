/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button, ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
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
import { createPolicyBlockedEnableAction, createUninstallPluginAction, isPluginPolicyBlocked } from '../agentPluginActions.js';
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

const $ = DOM.$;
const INSTALL_REGISTRATION_TIMEOUT = 10_000;

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

	private readonly root: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly nameRowEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly statusBadgeEl: HTMLElement;
	private readonly titleActionsEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly sourceFactsEl: HTMLElement;
	private readonly factsEl: HTMLElement;
	private readonly contributionsEl: HTMLElement;
	private readonly contributionsListEl: HTMLElement;
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
	private pluginVersionRowEl: HTMLElement | undefined;
	private pluginVersionValueEl: HTMLElement | undefined;
	private renderedPolicyBlocked = false;

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
		this.factsEl = DOM.append(this.sourceFactsEl, $('.embedded-detail-facts.plugin-detail-flat-list'));

		this.contributionsEl = DOM.append(this.root, $('.embedded-detail-section.plugin-detail-contributions'));
		const contributionsTitle = DOM.append(this.contributionsEl, $('h3.embedded-detail-section-title'));
		contributionsTitle.textContent = localize('pluginContributionsTitle', "Contains");
		this.contributionsListEl = DOM.append(this.contributionsEl, $('.embedded-detail-chip-list.plugin-detail-flat-list'));
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
			this.renderedPolicyBlocked = isPluginPolicyBlocked(item.plugin);
			this.inputStateAutorun.value = autorun(reader => {
				item.plugin.enablement.read(reader);
				item.plugin.policyBlocked?.read(reader);
				item.plugin.version?.read(reader);
				if (this._store.isDisposed || this.current !== item) {
					return;
				}
				const policyBlocked = isPluginPolicyBlocked(item.plugin);
				if (policyBlocked !== this.renderedPolicyBlocked) {
					this.renderedPolicyBlocked = policyBlocked;
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
		this.pluginVersionRowEl = undefined;
		this.pluginVersionValueEl = undefined;
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
			DOM.clearNode(this.factsEl);
			this.sourceFactsEl.style.display = 'none';
			DOM.clearNode(this.contributionsListEl);
			this.contributionsEl.style.display = 'none';
			DOM.clearNode(this.readmeContentEl);
			this.readmeEl.style.display = 'none';
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
		DOM.clearNode(this.factsEl);
		DOM.clearNode(this.contributionsListEl);

		this.renderTitleActions(item);
		this.renderFacts(item);
		this.renderContributions(item);
		this.renderReadme(item, readmeRenderGeneration);

		const description = (item.description || '').trim();
		this.descriptionEl.textContent = description || localize('pluginNoDescription', "No description provided.");
		this.descriptionEl.style.display = '';
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
		this.updatePluginVersionFact(item);
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
		if (isPluginPolicyBlocked(item.plugin)) {
			const action = createPolicyBlockedEnableAction(item.plugin, this.notificationService);
			const policyLabel = localize('pluginManagedByOrganization', "Managed by Organization");
			const button = this.renderDisposables.add(new Button(this.titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true, ariaLabel: policyLabel }));
			button.label = policyLabel;
			this.renderDisposables.add(button.onDidClick(() => action.run()));
			this.renderDisposables.add(action);
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
		this.sourceFactsEl.style.display = '';
		if (item.kind === AgentPluginItemKind.Marketplace) {
			this.appendPluginVersionFact(item);
			this.appendFact(this.factsEl, localize('pluginDetailMarketplace', "Marketplace"), this.renderMarketplaceLink(item.marketplace, getMarketplaceUri(item)));
			return;
		}

		this.appendPluginVersionFact(item);
		if (item.marketplace) {
			this.appendFact(this.factsEl, localize('pluginDetailMarketplace', "Marketplace"), this.renderMarketplaceLink(item.marketplace, item.plugin.fromMarketplace ? getMarketplaceUri(item.plugin.fromMarketplace) : undefined));
		}
		this.appendFact(this.factsEl, localize('pluginDetailLocation', "Location"), this.createLocationValue(item.plugin.uri));
	}

	private appendPluginVersionFact(item: IAgentPluginItem): void {
		const row = DOM.append(this.factsEl, $('.embedded-detail-fact-row'));
		DOM.append(row, $('.embedded-detail-fact-label')).textContent = localize('pluginDetailVersion', "Version");
		this.pluginVersionValueEl = DOM.append(row, $('.embedded-detail-fact-value'));
		this.pluginVersionRowEl = row;
		this.updatePluginVersionFact(item);
	}

	private updatePluginVersionFact(item: IAgentPluginItem): void {
		const version = getPluginVersion(item);
		if (this.pluginVersionRowEl && this.pluginVersionValueEl) {
			this.pluginVersionRowEl.style.display = version ? '' : 'none';
			this.pluginVersionValueEl.textContent = version ?? '';
		}
	}

	private appendFact(parent: HTMLElement, label: string, value: string | HTMLElement): void {
		const row = DOM.append(parent, $('.embedded-detail-fact-row'));
		const labelEl = DOM.append(row, $('.embedded-detail-fact-label'));
		labelEl.textContent = label;
		const valueEl = DOM.append(row, $('.embedded-detail-fact-value'));
		if (typeof value === 'string') {
			valueEl.textContent = value;
		} else {
			valueEl.classList.add('has-actions');
			valueEl.appendChild(value);
		}
	}

	private createLocationValue(uri: URI): HTMLElement {
		const container = $('.embedded-detail-location-value');
		const label = DOM.append(container, $('span.embedded-detail-location-label'));
		label.textContent = this.labelService.getUriLabel(uri, { relative: true });
		label.title = uri.fsPath || uri.toString();
		const copyPluginPathLabel = localize('copyPluginPath', "Copy Plugin Path");
		let copyPluginPathTooltip = copyPluginPathLabel;
		const inlineButtonStyles = getButtonStyles({
			buttonSecondaryBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryBorder: undefined,
		});
		const copyButton = this.renderDisposables.add(new Button(container, { ...inlineButtonStyles, secondary: true, supportIcons: true, title: copyPluginPathLabel, ariaLabel: copyPluginPathLabel }));
		copyButton.element.classList.add('embedded-detail-copy-button');
		copyButton.label = `$(${Codicon.copy.id})`;
		this.renderDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), copyButton.element, () => copyPluginPathTooltip));
		this.renderDisposables.add(copyButton.onDidClick(async () => {
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
		const openButton = this.renderDisposables.add(new Button(container, { ...inlineButtonStyles, secondary: true, supportIcons: true, title: openPluginFolderLabel, ariaLabel: openPluginFolderLabel }));
		openButton.element.classList.add('embedded-detail-copy-button');
		openButton.label = `$(${Codicon.folderOpened.id})`;
		this.renderDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), openButton.element, openPluginFolderLabel));
		this.renderDisposables.add(openButton.onDidClick(async () => {
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
			}
			return;
		}
		if (this._store.isDisposed || this.current !== item || !this.readmeRenderGuard.isCurrent(renderGeneration)) {
			return;
		}
		if (readme === undefined) {
			const message = DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message'));
			message.textContent = localize('pluginReadmeMissing', "No README was provided for this plugin.");
			return;
		}
		if (!readme.content.trim()) {
			const message = DOM.append(this.readmeContentEl, $('.plugin-detail-readme-message'));
			message.textContent = localize('pluginReadmeEmpty', "The plugin README is empty.");
			return;
		}
		const markdown = new MarkdownString(readme.content, { supportHtml: false });
		markdown.baseUri = readme.baseUri;
		const rendered = this.renderDisposables.add(this.markdownRendererService.render(markdown));
		this.readmeContentEl.appendChild(rendered.element);
	}

	override dispose(): void {
		this.current = undefined;
		this.readmeRenderGuard.begin();
		super.dispose();
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
			const label = DOM.append(header, $('span.plugin-detail-contribution-title-label'));
			label.textContent = entry.label;
			const count = DOM.append(header, $('span.plugin-detail-contribution-title-count'));
			count.textContent = String(entry.items.length);
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
	appendContributionEntry(entries, 'agents', localize('pluginDetailAgents', "Agents"), plugin.agents.get());
	appendContributionEntry(entries, 'skills', localize('pluginDetailSkills', "Skills"), plugin.skills.get());
	appendContributionEntry(entries, 'commands', localize('pluginDetailCommands', "Commands"), plugin.commands.get());
	appendContributionEntry(entries, 'instructions', localize('pluginDetailInstructions', "Instructions"), plugin.instructions.get());
	appendContributionEntry(entries, 'mcp', localize('pluginDetailMcpServers', "MCP Servers"), plugin.mcpServerDefinitions.get().map(server => ({ name: server.name })));
	appendContributionEntry(entries, 'hooks', localize('pluginDetailHooks', "Hooks"), plugin.hooks.get().map(hook => ({ name: hook.originalId, description: localize('pluginDetailHookCommands', "{0} commands", hook.hooks.length) })));
	return entries;
}

function appendContributionEntry(entries: IPluginContributionEntry[], kind: string, label: string | undefined, items: readonly { name: string; description?: string; uri?: URI }[]): void {
	if (label && items.length > 0) {
		entries.push({ kind, label, items });
	}
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
