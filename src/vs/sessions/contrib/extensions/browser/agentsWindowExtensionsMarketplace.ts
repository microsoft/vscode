/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { ActionRunner, IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { Delayer } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ExtensionGalleryManifestStatus, IExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ButtonWithDropDownExtensionAction, ButtonWithDropdownExtensionActionViewItem, ExtensionAction, InstallDropdownAction, InstallingLabelAction } from '../../../../workbench/contrib/extensions/browser/extensionsActions.js';
import { ExtensionIconWidget, InstallCountWidget, PublisherWidget, RatingsWidget } from '../../../../workbench/contrib/extensions/browser/extensionsWidgets.js';
import { ExtensionContainers, ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../workbench/contrib/extensions/common/extensions.js';

const $ = DOM.$;

/** The Extensions view truncates search text to the same length. */
const MAX_SEARCH_TEXT_LENGTH = 350;

/** Searching the Marketplace waits longer than filtering installed extensions, so it doesn't query on every keystroke. */
const MARKETPLACE_SEARCH_DELAY = 300;

/** Identifies Marketplace searches from the Agents window in the Marketplace's telemetry, and in the telemetry of installs from their results. */
export const AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE = 'agentsWindowSearchText';

export const MARKETPLACE_ROW_TEMPLATE_ID = 'agentsWindowMarketplaceExtensionRow';
export const MARKETPLACE_MESSAGE_TEMPLATE_ID = 'agentsWindowMarketplaceMessage';

export const enum MarketplaceSearchStatus {
	/** There is no search text, or the Marketplace is unavailable. */
	Idle,
	Searching,
	Done,
	Failed,
}

export interface IMarketplaceSearchResult {
	/** The trimmed search text that the result is for. */
	readonly query: string;
	readonly status: MarketplaceSearchStatus;
	/** The first page of extensions that match, in the Marketplace's order. */
	readonly extensions: readonly IExtension[];
}

/**
 * Searches the Marketplace like the Extensions view does for plain search text, keeping only the result of the latest search.
 */
export class AgentsWindowMarketplaceSearch extends Disposable {

	private readonly _result = observableValue<IMarketplaceSearchResult>(this, { query: '', status: MarketplaceSearchStatus.Idle, extensions: [] });
	readonly result: IObservable<IMarketplaceSearchResult> = this._result;

	/**
	 * Whether the Marketplace can be searched. The product or policy can leave it unavailable, and a private Marketplace can
	 * require users to sign in. On desktop, it is unavailable until it is resolved after the window opens.
	 */
	readonly status: IObservable<ExtensionGalleryManifestStatus>;

	private readonly delayer = this._register(new Delayer<void>(MARKETPLACE_SEARCH_DELAY));
	private cancellation: CancellationTokenSource | undefined;
	private text = '';

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionGalleryManifestService private readonly extensionGalleryManifestService: IExtensionGalleryManifestService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.status = observableFromEvent(this, extensionGalleryManifestService.onDidChangeExtensionGalleryManifestStatus, () => extensionGalleryManifestService.extensionGalleryManifestStatus);
		// Searches for the current search text once the Marketplace can be searched, and stops once it can't.
		this._register(extensionGalleryManifestService.onDidChangeExtensionGalleryManifestStatus(() => this.search(this.text)));
		this._register(toDisposable(() => this.cancellation?.dispose(true)));
	}

	get isAvailable(): boolean {
		// Reads the service, as `status` might not be updated yet while listeners of the change run.
		return this.extensionGalleryManifestService.extensionGalleryManifestStatus === ExtensionGalleryManifestStatus.Available;
	}

	search(text: string): void {
		this.text = text;
		const query = text.trim();
		this.cancellation?.dispose(true);
		this.cancellation = undefined;
		if (!query || !this.isAvailable) {
			this.delayer.cancel();
			this._result.set({ query, status: MarketplaceSearchStatus.Idle, extensions: [] }, undefined);
			return;
		}

		const cancellation = this.cancellation = new CancellationTokenSource();
		this._result.set({ query, status: MarketplaceSearchStatus.Searching, extensions: [] }, undefined);
		this.delayer.trigger(async () => {
			try {
				const pager = await this.extensionsWorkbenchService.queryGallery({ text: query.substring(0, MAX_SEARCH_TEXT_LENGTH), source: AGENTS_WINDOW_MARKETPLACE_QUERY_SOURCE }, cancellation.token);
				if (!cancellation.token.isCancellationRequested) {
					this._result.set({ query, status: MarketplaceSearchStatus.Done, extensions: pager.firstPage }, undefined);
				}
			} catch (error) {
				if (!cancellation.token.isCancellationRequested) {
					this.logService.warn('[Agents window extensions] Searching the Marketplace failed', error);
					this._result.set({ query, status: MarketplaceSearchStatus.Failed, extensions: [] }, undefined);
				}
			}
		}).catch(() => { /* superseded by a newer search, or disposed */ });
	}
}

export interface IAgentsWindowMarketplaceEntry {
	readonly type: 'marketplace';
	readonly extension: IExtension;
}

export interface IAgentsWindowMarketplaceMessageEntry {
	readonly type: 'message';
	readonly id: string;
	readonly text: string;
	readonly loading: boolean;
}

/**
 * Describes the install count and rating that the Marketplace reports for an extension, as its row shows them.
 */
export function getMarketplaceStatisticsLabels(extension: IExtension): string[] {
	const labels: string[] = [];
	const installCount = InstallCountWidget.getInstallLabel(extension, false);
	if (installCount) {
		labels.push(localize('agentsWindowExtensions.marketplace.installCount', "{0} installs", installCount));
	}
	if (extension.rating !== undefined && extension.ratingCount) {
		labels.push(localize('agentsWindowExtensions.marketplace.rating', "Rated {0} out of 5", Math.round(extension.rating * 2) / 2));
	}
	return labels;
}

/**
 * Describes a Marketplace extension like its row: its name, publisher, install count, and rating, and whether it is
 * being installed, or why it can't be installed.
 */
export function getMarketplaceExtensionAriaLabel(extension: IExtension, installBlocker: IMarkdownString | undefined): string {
	const details = [extension.displayName, extension.publisherDisplayName];
	if (extension.publisherDomain?.verified) {
		details.push(localize('agentsWindowExtensions.marketplace.verifiedPublisher', "Verified publisher"));
	}
	details.push(...getMarketplaceStatisticsLabels(extension));
	details.push(extension.state === ExtensionState.Installing
		? localize('agentsWindowExtensions.marketplace.installing', "Installing")
		: installBlocker
			? localize('agentsWindowExtensions.marketplace.cannotInstall', "Can't be installed: {0}", renderAsPlaintext(installBlocker))
			: localize('agentsWindowExtensions.marketplace.notInstalled', "Not installed"));
	return details.join(', ');
}

/**
 * Reports each finished run of an install action with the extension it installed, which a recycled row can't tell once the run finishes.
 */
class MarketplaceInstallActionRunner extends ActionRunner {

	constructor(
		private readonly onDidInstall: (extension: IExtension) => void,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		// The Install button, or a version from its menu.
		const extension = action instanceof ExtensionAction ? action.extension : null;
		await super.runAction(action, context);
		if (extension) {
			this.onDidInstall(extension);
		}
	}
}

interface IMarketplaceRowTemplateData {
	readonly name: HTMLElement;
	readonly warning: HTMLElement;
	readonly description: HTMLElement;
	readonly actionBar: ActionBar;
	readonly installAction: InstallDropdownAction;
	readonly extensionContainers: ExtensionContainers;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	/** The key of the rendered extension. */
	key: string | undefined;
}

/**
 * Renders a Marketplace extension with the Extensions view's widgets and actions, which keep it up to date while it is installed.
 */
export class MarketplaceExtensionRowRenderer implements IListRenderer<IAgentsWindowMarketplaceEntry, IMarketplaceRowTemplateData> {

	readonly templateId = MARKETPLACE_ROW_TEMPLATE_ID;

	private readonly renderedTemplates = new Map<string, IMarketplaceRowTemplateData>();
	/** The key of the focused extension, as each search returns new objects for the same extensions. */
	private focusedKey: string | undefined;

	constructor(
		private readonly getInstallBlocker: (extension: IExtension) => IMarkdownString | undefined,
		private readonly onDidInstall: (extension: IExtension) => void,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
	) { }

	renderTemplate(container: HTMLElement): IMarketplaceRowTemplateData {
		container.classList.add('agents-window-extension-row', 'agents-window-marketplace-extension-row');
		const templateDisposables = new DisposableStore();

		const icon = templateDisposables.add(new ExtensionIconWidget(DOM.append(container, $('.agents-window-extension-icon'))));
		const details = DOM.append(container, $('.agents-window-extension-details'));
		const nameRow = DOM.append(details, $('.agents-window-extension-name-row'));
		const name = DOM.append(nameRow, $('span.agents-window-extension-name'));
		// The row's accessible name includes the publisher, install count, rating, and why it can't be installed.
		const publisher = templateDisposables.add(this.instantiationService.createInstance(PublisherWidget, DOM.append(nameRow, $('span.agents-window-extension-publisher', { 'aria-hidden': 'true' })), true));
		const installCount = templateDisposables.add(this.instantiationService.createInstance(InstallCountWidget, DOM.append(nameRow, $('span.agents-window-extension-install-count', { 'aria-hidden': 'true' })), true));
		const ratings = templateDisposables.add(this.instantiationService.createInstance(RatingsWidget, DOM.append(nameRow, $('span.agents-window-extension-rating', { 'aria-hidden': 'true' })), true));
		const warning = DOM.append(nameRow, $('span.agents-window-extension-warning', { 'aria-hidden': 'true' }));
		warning.classList.add(...ThemeIcon.asClassNameArray(Codicon.warningCompact));
		const description = DOM.append(details, $('span.agents-window-extension-description'));

		const actionsContainer = DOM.append(container, $('.agents-window-extension-marketplace-actions'));
		const actionRunner = templateDisposables.add(new MarketplaceInstallActionRunner(this.onDidInstall));
		const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
			actionRunner,
			// Renders the Install button like the Extensions view does, with a menu of the other versions it can install.
			actionViewItemProvider: (action, options) => action instanceof ButtonWithDropDownExtensionAction
				? new ButtonWithDropdownExtensionActionViewItem(action, {
					...options,
					icon: true,
					label: true,
					// The menu doesn't run its actions with the row's action runner, so its versions are run with it here.
					menuActionsOrProvider: {
						getActions: () => action.menuActions.map(menuAction => menuAction instanceof Separator ? menuAction : toAction({
							id: menuAction.id,
							label: menuAction.label,
							enabled: menuAction.enabled,
							run: () => actionRunner.run(menuAction),
						})),
					},
					menuActionClassNames: action.menuActionClassNames,
				}, this.contextMenuService)
				: undefined,
			focusOnlyEnabledItems: true,
		}));
		// Like the Extensions view, only the focused row's actions are in the tab order, and they must not steal tree focus when clicked.
		actionBar.setFocusable(false);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(actionsContainer, event => DOM.EventHelper.stop(event, true)));
		templateDisposables.add(actionBar.onDidRun(({ error }) => error && this.notificationService.error(error)));

		// Installs the preferred version that the extension has, and offers the other version in a menu.
		const installAction = templateDisposables.add(this.instantiationService.createInstance(InstallDropdownAction));
		// The Agents window has no Extensions editor, so the extension stays in the Extensions section of Agent Customizations.
		installAction.opensExtensionEditor = false;
		// Users install extensions here to use them here, and extensions that don't support the Agents window are disabled
		// there by default. The extensions service enables them as it installs them, even if the section closes meanwhile.
		installAction.enablesExtension = true;
		const installingAction = templateDisposables.add(this.instantiationService.createInstance(InstallingLabelAction));
		actionBar.push([installAction, installingAction], { icon: true, label: true });

		const extensionContainers = templateDisposables.add(this.instantiationService.createInstance(ExtensionContainers, [installAction, installingAction, icon, publisher, installCount, ratings]));

		const templateData: IMarketplaceRowTemplateData = { name, warning, description, actionBar, installAction, extensionContainers, templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()), key: undefined };
		// Only enabled actions can be in the tab order, and the Install action is enabled once the extension is known to be installable.
		templateDisposables.add(installAction.onDidChange(e => {
			if (e.enabled !== undefined) {
				this.updateFocusable(templateData);
			}
		}));
		return templateData;
	}

	renderElement(entry: IAgentsWindowMarketplaceEntry, _index: number, templateData: IMarketplaceRowTemplateData): void {
		templateData.elementDisposables.clear();
		const { extension } = entry;
		const key = ExtensionIdentifier.toKey(extension.identifier.id);
		templateData.key = key;
		templateData.extensionContainers.extension = extension;
		templateData.name.textContent = extension.displayName;
		templateData.description.textContent = extension.description;
		templateData.description.style.display = extension.description ? '' : 'none';

		// Explains why the Install action is disabled, such as when policy doesn't allow the extension.
		const installBlocker = extension.state === ExtensionState.Uninstalled ? this.getInstallBlocker(extension) : undefined;
		if (installBlocker) {
			templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.warning, { content: installBlocker }));
		}
		templateData.warning.style.display = installBlocker ? '' : 'none';

		this.updateFocusable(templateData);
		this.renderedTemplates.set(key, templateData);
	}

	disposeElement(entry: IAgentsWindowMarketplaceEntry, _index: number, templateData: IMarketplaceRowTemplateData): void {
		templateData.elementDisposables.clear();
		const key = ExtensionIdentifier.toKey(entry.extension.identifier.id);
		if (this.renderedTemplates.get(key) === templateData) {
			this.renderedTemplates.delete(key);
		}
		templateData.key = undefined;
	}

	disposeTemplate(templateData: IMarketplaceRowTemplateData): void {
		templateData.templateDisposables.dispose();
	}

	/**
	 * Puts the actions of the focused Marketplace extension's row in the tab order, so keyboard users can reach the menu of other versions.
	 */
	setFocused(extension: IExtension | undefined): void {
		this.focusedKey = extension && ExtensionIdentifier.toKey(extension.identifier.id);
		for (const templateData of this.renderedTemplates.values()) {
			this.updateFocusable(templateData);
		}
	}

	/**
	 * Installs a rendered extension like its Install button does when clicked, if it can be installed.
	 */
	install(extension: IExtension): void {
		const templateData = this.renderedTemplates.get(ExtensionIdentifier.toKey(extension.identifier.id));
		if (templateData?.installAction.enabled) {
			templateData.actionBar.actionRunner.run(templateData.installAction);
		}
	}

	private updateFocusable(templateData: IMarketplaceRowTemplateData): void {
		// Takes actions that were disabled meanwhile out of the tab order, as the action bar only adds enabled ones.
		templateData.actionBar.setFocusable(false);
		if (templateData.key !== undefined && templateData.key === this.focusedKey) {
			templateData.actionBar.setFocusable(true);
		}
	}
}

interface IMarketplaceMessageTemplateData {
	readonly icon: HTMLElement;
	readonly text: HTMLElement;
}

/**
 * Renders a message in place of Marketplace extensions, such as while searching.
 */
export class MarketplaceMessageRenderer implements IListRenderer<IAgentsWindowMarketplaceMessageEntry, IMarketplaceMessageTemplateData> {

	readonly templateId = MARKETPLACE_MESSAGE_TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IMarketplaceMessageTemplateData {
		container.classList.add('agents-window-marketplace-message');
		const icon = DOM.append(container, $('span', { 'aria-hidden': 'true' }));
		icon.classList.add(...ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.loading, 'spin')));
		const text = DOM.append(container, $('span.agents-window-marketplace-message-text'));
		return { icon, text };
	}

	renderElement(entry: IAgentsWindowMarketplaceMessageEntry, _index: number, templateData: IMarketplaceMessageTemplateData): void {
		templateData.icon.style.display = entry.loading ? '' : 'none';
		templateData.text.textContent = entry.text;
	}

	disposeTemplate(): void { }
}
