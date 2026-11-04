/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../workbench/contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css';
import './media/agentsWindowExtensions.css';
import * as DOM from '../../../../base/browser/dom.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { HoverStyle, IHoverLifecycleOptions } from '../../../../base/browser/ui/hover/hover.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../base/browser/ui/tree/tree.js';
import { IMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { Delayer } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { IMatch, matchesContiguousSubString } from '../../../../base/common/filters.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionGalleryManifestStatus } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IAllowedExtensionsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier, EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, defaultInputBoxStyles, getButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IAICustomizationManagementSectionWidget } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, ICustomizationGroupHeaderEntry } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationGroupHeaderRenderer.js';
import { CustomizationToggle } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationToggle.js';
import { asTreeRenderer, customizationTreeStyles } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationTree.js';
import { UninstallAction } from '../../../../workbench/contrib/extensions/browser/extensionsActions.js';
import { ExtensionIconWidget, InstallCountWidget, RatingsWidget } from '../../../../workbench/contrib/extensions/browser/extensionsWidgets.js';
import { ExtensionRuntimeActionType, ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { getSessionsWindowMissingFeatures, getSessionsWindowSuggestedContributions, IExtensionManifestPropertiesService, SessionsWindowLLMContributionPoint, SessionsWindowMissingFeature } from '../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { AgentsWindowMarketplaceSearch, getMarketplaceExtensionAriaLabel, getMarketplaceStatisticsLabels, IAgentsWindowMarketplaceEntry, IAgentsWindowMarketplaceMessageEntry, IMarketplaceSearchResult, MARKETPLACE_MESSAGE_TEMPLATE_ID, MARKETPLACE_ROW_TEMPLATE_ID, MarketplaceExtensionRowRenderer, MarketplaceMessageRenderer, MarketplaceSearchStatus } from './agentsWindowExtensionsMarketplace.js';
import { IAgentsWindowExtensionSuggestionsService } from './agentsWindowExtensionSuggestions.js';

const $ = DOM.$;

const EXTENSION_ROW_HEIGHT = 52;
const MESSAGE_ROW_HEIGHT = 28;
const GROUP_HEADER_TEMPLATE_ID = 'agentsWindowExtensionsGroupHeader';
const EXTENSION_ROW_TEMPLATE_ID = 'agentsWindowExtensionRow';

/** Whether uninstalling an extension from the Extensions section of Agent Customizations asks for confirmation first. */
export const AGENTS_WINDOW_CONFIRM_UNINSTALL_SETTING = 'extensions.experimental.agentsWindowConfirmUninstall';

/**
 * How the user changed whether an extension runs in the Agents window: from its row, with its switch, Space or Enter, or its
 * menu, or by installing it from the Marketplace group, which enables it once it is installed.
 */
type AgentsWindowExtensionEnablementTrigger = 'toggle' | 'install';

type AgentsWindowExtensionEnablementChangedEvent = {
	extensionId: string;
	enabled: boolean;
	aiFeatures: string;
	trigger: AgentsWindowExtensionEnablementTrigger;
};

type AgentsWindowExtensionEnablementChangedClassification = {
	owner: 'alexr00';
	comment: 'Logged when the user enables or disables an extension in the Agents window from the Extensions section of Agent Customizations, to learn which extensions users choose to run there.';
	extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the extension.' };
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user enabled or disabled the extension.' };
	aiFeatures: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The comma-separated contribution points, from a fixed list, that add AI features to the Agents window, or empty when the extension has none.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'How the user changed it: toggle when the user changed it from the extension\'s row, or install when the user installed the extension from the Marketplace in the Agents window, which enables it.' };
};

export const enum AgentsWindowExtensionGroup {
	Suggested = 'suggested',
	Supported = 'supported',
	Other = 'other',
	/** Extensions in the Marketplace that match the search and aren't installed. */
	Marketplace = 'marketplace',
}

export interface IAgentsWindowExtensionEntry {
	readonly type: 'extension';
	readonly extension: IExtension;
	readonly nameMatches: IMatch[] | undefined;
	readonly group: AgentsWindowExtensionGroup;
}

export interface IAgentsWindowExtensionsGroup {
	readonly group: AgentsWindowExtensionGroup;
	readonly entries: readonly IAgentsWindowExtensionEntry[];
}

interface IAgentsWindowExtensionsGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly group: AgentsWindowExtensionGroup;
}

type AgentsWindowExtensionsTreeEntry = IAgentsWindowExtensionsGroupEntry | IAgentsWindowExtensionEntry | IAgentsWindowMarketplaceEntry | IAgentsWindowMarketplaceMessageEntry;

function getTreeEntryId(entry: AgentsWindowExtensionsTreeEntry): string {
	switch (entry.type) {
		case 'group-header':
		case 'message':
			return entry.id;
		case 'marketplace':
			return `marketplace/${ExtensionIdentifier.toKey(entry.extension.identifier.id)}`;
		case 'extension':
			return ExtensionIdentifier.toKey(entry.extension.identifier.id);
	}
}

/**
 * Returns the installed, non built-in extensions matching `query`, grouped into suggested extensions (the AI Features group), extensions
 * that support the Agents window, and other extensions, each sorted by display name. Built-in extensions are
 * curated by the product and cannot be enabled or disabled for the Agents window, so they are not listed.
 * Installed extensions that a Marketplace search for `query` found also match, as the Marketplace matches more than their names.
 */
export function groupAgentsWindowExtensions(extensions: readonly IExtension[], query: string, supportsAgentsWindow: (extension: IExtension) => boolean, isSuggested: (extension: IExtension) => boolean, marketplaceMatches: ReadonlySet<string> = new Set()): IAgentsWindowExtensionsGroup[] {
	const trimmedQuery = query.trim();
	const groups = new Map<AgentsWindowExtensionGroup, IAgentsWindowExtensionEntry[]>([
		[AgentsWindowExtensionGroup.Suggested, []],
		[AgentsWindowExtensionGroup.Supported, []],
		[AgentsWindowExtensionGroup.Other, []],
	]);
	for (const extension of extensions) {
		if (extension.isBuiltin || !extension.local || extension.state !== ExtensionState.Installed) {
			continue;
		}
		const nameMatches = trimmedQuery ? matchesContiguousSubString(trimmedQuery, extension.displayName) ?? undefined : undefined;
		if (trimmedQuery && !nameMatches && !marketplaceMatches.has(ExtensionIdentifier.toKey(extension.identifier.id)) && ![extension.identifier.id, extension.publisherDisplayName, extension.description].some(text => !!text && !!matchesContiguousSubString(trimmedQuery, text))) {
			continue;
		}
		const group = isSuggested(extension) ? AgentsWindowExtensionGroup.Suggested : supportsAgentsWindow(extension) ? AgentsWindowExtensionGroup.Supported : AgentsWindowExtensionGroup.Other;
		groups.get(group)!.push({ type: 'extension', extension, nameMatches, group });
	}
	const compare = (a: IAgentsWindowExtensionEntry, b: IAgentsWindowExtensionEntry) => a.extension.displayName.localeCompare(b.extension.displayName);
	return [...groups].map(([group, entries]) => ({ group, entries: entries.sort(compare) }));
}

function getGroupLabel(group: AgentsWindowExtensionGroup): string {
	switch (group) {
		case AgentsWindowExtensionGroup.Suggested:
			return localize('agentsWindowExtensions.aiFeaturesGroup', "AI Features");
		case AgentsWindowExtensionGroup.Supported:
			return localize('agentsWindowExtensions.supportedGroup', "Supported");
		case AgentsWindowExtensionGroup.Other:
			return localize('agentsWindowExtensions.otherGroup', "Other Extensions");
		case AgentsWindowExtensionGroup.Marketplace:
			return localize('agentsWindowExtensions.marketplaceGroup', "Marketplace");
	}
}

/**
 * Describes a group. Extensions in the AI Features and Other Extensions groups are disabled by default, unless they are
 * enabled automatically, which leaves their global state, either because they could be useful or because
 * {@link EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE} lists them.
 */
function getGroupDescription(group: IAgentsWindowExtensionsGroup, autoEnablesListed: boolean): string {
	const hasAutomaticallyEnabled = group.entries.some(entry => entry.extension.enablementState === EnablementState.EnabledGlobally);
	switch (group.group) {
		case AgentsWindowExtensionGroup.Suggested:
			return !hasAutomaticallyEnabled
				? localize('agentsWindowExtensions.aiFeaturesGroupDescription', "Extensions that add AI features, such as tools, MCP servers, or skills. They haven't declared support for the Agents window, so they are disabled by default and might not work as expected.")
				: autoEnablesListed
					? localize('agentsWindowExtensions.aiFeaturesGroupDescriptionAutoEnabledListed', "Extensions that add AI features, such as tools, MCP servers, or skills. They haven't declared support for the Agents window, so they might not work as expected. They are disabled by default, unless they are enabled automatically.")
					: localize('agentsWindowExtensions.aiFeaturesGroupDescriptionAutoEnabled', "Extensions that add AI features, such as tools, MCP servers, or skills. They haven't declared support for the Agents window, so they might not work as expected. Those that don't rely on views, debugging, or other features that are unavailable in the Agents window are enabled automatically.");
		case AgentsWindowExtensionGroup.Supported:
			return localize('agentsWindowExtensions.supportedGroupDescription', "Extensions that support the Agents window. They are enabled by default.");
		case AgentsWindowExtensionGroup.Other:
			return !hasAutomaticallyEnabled
				? localize('agentsWindowExtensions.otherGroupDescription', "Extensions that haven't declared support for the Agents window. They are disabled by default and might not work as expected.")
				: autoEnablesListed
					? localize('agentsWindowExtensions.otherGroupDescriptionAutoEnabledListed', "Extensions that haven't declared support for the Agents window. They might not work as expected. They are disabled by default, unless they are enabled automatically.")
					: localize('agentsWindowExtensions.otherGroupDescriptionAutoEnabled', "Extensions that haven't declared support for the Agents window. They might not work as expected. Those that add AI features and don't rely on views, debugging, or other features that are unavailable in the Agents window are enabled automatically. The others are disabled by default.");
		case AgentsWindowExtensionGroup.Marketplace:
			return localize('agentsWindowExtensions.marketplaceGroupDescription', "Extensions from the Marketplace that aren't installed. Installing one here also installs it in VS Code, and enables it in the Agents window.");
	}
}

function getRuntimeStateLabel(extension: IExtension): string | undefined {
	switch (extension.runtimeState?.action) {
		case ExtensionRuntimeActionType.RestartExtensions:
			return localize('agentsWindowExtensions.restartRequired', "Restart Required");
		case ExtensionRuntimeActionType.ReloadWindow:
			return localize('agentsWindowExtensions.reloadRequired', "Reload Required");
		default:
			return undefined;
	}
}

/**
 * Labels the button that applies a pending change: restarting extensions restarts the extension host.
 */
function getRuntimeActionLabel(action: ExtensionRuntimeActionType | undefined): string | undefined {
	switch (action) {
		case ExtensionRuntimeActionType.RestartExtensions:
			return localize('agentsWindowExtensions.restartExtensions', "Restart Extensions");
		case ExtensionRuntimeActionType.ReloadWindow:
			return localize('agentsWindowExtensions.reloadWindow', "Reload Window");
		default:
			return undefined;
	}
}

function getMissingFeatureLabel(feature: SessionsWindowMissingFeature): string {
	switch (feature) {
		case SessionsWindowMissingFeature.Views:
			return localize('agentsWindowExtensions.missingFeature.views', "views");
		case SessionsWindowMissingFeature.Debugging:
			return localize('agentsWindowExtensions.missingFeature.debugging', "debuggers");
		case SessionsWindowMissingFeature.StatusBar:
			return localize('agentsWindowExtensions.missingFeature.statusBar', "status bar items");
		case SessionsWindowMissingFeature.Walkthroughs:
			return localize('agentsWindowExtensions.missingFeature.walkthroughs', "walkthroughs");
	}
}

/**
 * Warns that an extension might not work as expected because it contributes things that the Agents window doesn't support.
 */
export function getMissingFeaturesWarning(features: readonly SessionsWindowMissingFeature[]): string | undefined {
	if (features.length === 0) {
		return undefined;
	}
	return localize('agentsWindowExtensions.missingFeaturesWarning', "Contributes {0}, which are not supported in the Agents window.", features.map(getMissingFeatureLabel).join(', '));
}

/**
 * Names a contribution point that makes an extension worth enabling in the Agents window, like the Agent Customizations section it adds to.
 */
function getSuggestedContributionLabel(point: SessionsWindowLLMContributionPoint): string {
	switch (point) {
		case 'languageModelTools':
		case 'languageModelToolSets':
			return localize('agentsWindowExtensions.contribution.tools', "Tools");
		case 'mcpServerDefinitionProviders':
			return localize('agentsWindowExtensions.contribution.mcpServers', "MCP Servers");
		case 'chatSkills':
			return localize('agentsWindowExtensions.contribution.skills', "Skills");
		case 'chatAgents':
			return localize('agentsWindowExtensions.contribution.agents', "Agents");
		case 'chatInstructions':
			return localize('agentsWindowExtensions.contribution.instructions', "Instructions");
		case 'chatPromptFiles':
			return localize('agentsWindowExtensions.contribution.prompts', "Prompts");
		case 'chatPlugins':
			return localize('agentsWindowExtensions.contribution.plugins', "Plugins");
	}
}

/**
 * Names what an extension contributes that makes it worth enabling in the Agents window, without duplicates.
 */
export function getSuggestedContributionLabels(manifest: IExtensionManifest): string[] {
	return [...new Set(getSessionsWindowSuggestedContributions(manifest).map(getSuggestedContributionLabel))];
}

/**
 * Extensions in the AI Features group show the AI features they add, so users know why they might want to enable them.
 */
function getEntryContributionLabels(entry: IAgentsWindowExtensionEntry): string[] {
	return entry.group === AgentsWindowExtensionGroup.Suggested && entry.extension.local ? getSuggestedContributionLabels(entry.extension.local.manifest) : [];
}

class AgentsWindowExtensionsDelegate implements IListVirtualDelegate<AgentsWindowExtensionsTreeEntry> {
	getHeight(entry: AgentsWindowExtensionsTreeEntry): number {
		switch (entry.type) {
			case 'group-header':
				return CUSTOMIZATION_GROUP_HEADER_HEIGHT;
			case 'message':
				return MESSAGE_ROW_HEIGHT;
			default:
				return EXTENSION_ROW_HEIGHT;
		}
	}

	getTemplateId(entry: AgentsWindowExtensionsTreeEntry): string {
		switch (entry.type) {
			case 'group-header':
				return GROUP_HEADER_TEMPLATE_ID;
			case 'marketplace':
				return MARKETPLACE_ROW_TEMPLATE_ID;
			case 'message':
				return MARKETPLACE_MESSAGE_TEMPLATE_ID;
			default:
				return EXTENSION_ROW_TEMPLATE_ID;
		}
	}
}

interface IExtensionRowTemplateData {
	readonly container: HTMLElement;
	readonly icon: ExtensionIconWidget;
	readonly name: HighlightedLabel;
	readonly publisher: HTMLElement;
	readonly installCount: InstallCountWidget;
	readonly ratings: RatingsWidget;
	readonly description: HTMLElement;
	readonly warning: HTMLElement;
	readonly contributions: HTMLElement;
	readonly runtimeAction: Button;
	readonly toggle: CustomizationToggle;
	readonly moreActions: Button;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class ExtensionRowRenderer implements IListRenderer<IAgentsWindowExtensionEntry, IExtensionRowTemplateData> {
	readonly templateId = EXTENSION_ROW_TEMPLATE_ID;

	// The buttons of neighboring rows show their hovers without delay once one is shown.
	private readonly buttonHoverLifecycleOptions: IHoverLifecycleOptions = { groupId: generateUuid() };

	constructor(
		private readonly isEnabled: (extension: IExtension) => boolean,
		private readonly canChangeEnablement: (extension: IExtension) => boolean,
		private readonly setEnabled: (extension: IExtension, enabled: boolean) => void,
		private readonly getWarning: (extension: IExtension) => string | undefined,
		private readonly runRuntimeAction: (action: ExtensionRuntimeActionType | undefined) => void,
		private readonly showActions: (extension: IExtension, anchor: HTMLElement) => void,
		private readonly showsMarketplaceStatistics: () => boolean,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): IExtensionRowTemplateData {
		container.classList.add('agents-window-extension-row');
		const templateDisposables = new DisposableStore();

		const icon = templateDisposables.add(new ExtensionIconWidget(DOM.append(container, $('.agents-window-extension-icon'))));
		const details = DOM.append(container, $('.agents-window-extension-details'));
		const nameRow = DOM.append(details, $('.agents-window-extension-name-row'));
		const name = templateDisposables.add(new HighlightedLabel(DOM.append(nameRow, $('span.agents-window-extension-name'))));
		const publisher = DOM.append(nameRow, $('span.agents-window-extension-publisher'));
		// The row's accessible name includes the install count, rating, warning, and contributions.
		const installCount = templateDisposables.add(this.instantiationService.createInstance(InstallCountWidget, DOM.append(nameRow, $('span.agents-window-extension-install-count', { 'aria-hidden': 'true' })), true));
		installCount.showsInstalledExtensions = true;
		const ratings = templateDisposables.add(this.instantiationService.createInstance(RatingsWidget, DOM.append(nameRow, $('span.agents-window-extension-rating', { 'aria-hidden': 'true' })), true));
		ratings.showsInstalledExtensions = true;
		const warning = DOM.append(nameRow, $('span.agents-window-extension-warning', { 'aria-hidden': 'true' }));
		warning.classList.add(...ThemeIcon.asClassNameArray(Codicon.warningCompact));
		const contributions = DOM.append(nameRow, $('span.agents-window-extension-contributions', { 'aria-hidden': 'true' }));
		const description = DOM.append(details, $('span.agents-window-extension-description'));

		// Rows are activated with Space or Enter, so the buttons and the switch stay out of the tab order and must not steal
		// tree focus. Keyboard users restart extensions with the same button next to the section title, open the row's
		// actions with Shift+F10, and the row's accessible name says that a restart is required.
		const runtimeAction = templateDisposables.add(new Button(container, { ...defaultButtonStyles, secondary: true, small: true }));
		runtimeAction.element.classList.add('agents-window-extension-runtime-action');
		runtimeAction.element.tabIndex = -1;
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(runtimeAction.element, event => DOM.EventHelper.stop(event, true)));

		const toggle = templateDisposables.add(new CustomizationToggle({ ariaLabel: '' }));
		toggle.setTabIndex(-1);
		container.appendChild(toggle.domNode);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(toggle.domNode, event => DOM.EventHelper.stop(event, true)));

		// Like the More Actions buttons of other Customizations sections.
		const moreActions = templateDisposables.add(new Button(container, {
			...getButtonStyles({ buttonSecondaryBackground: undefined, buttonSecondaryForeground: undefined, buttonSecondaryHoverBackground: undefined, buttonSecondaryBorder: undefined }),
			secondary: true,
		}));
		moreActions.icon = Codicon.ellipsis;
		moreActions.element.classList.add('agents-window-extension-more-actions');
		moreActions.element.tabIndex = -1;
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(moreActions.element, event => DOM.EventHelper.stop(event, true)));

		return { container, icon, name, publisher, installCount, ratings, description, warning, contributions, runtimeAction, toggle, moreActions, templateDisposables, elementDisposables: new DisposableStore() };
	}

	renderElement(entry: IAgentsWindowExtensionEntry, _index: number, templateData: IExtensionRowTemplateData): void {
		templateData.elementDisposables.clear();
		const { extension } = entry;
		const enabled = this.isEnabled(extension);
		const canChange = this.canChangeEnablement(extension);

		templateData.icon.extension = extension;
		templateData.name.set(extension.displayName, entry.nameMatches);
		templateData.publisher.textContent = extension.publisherDisplayName;
		// Like Marketplace extensions, shows how many users installed the extension and how they rate it.
		const statisticsExtension = this.showsMarketplaceStatistics() ? extension : null;
		templateData.installCount.extension = statisticsExtension;
		templateData.ratings.extension = statisticsExtension;
		templateData.description.textContent = extension.description;
		templateData.description.style.display = extension.description ? '' : 'none';

		const warning = this.getWarning(extension);
		if (warning) {
			templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.warning, { content: warning }));
		}
		templateData.warning.style.display = warning ? '' : 'none';

		const contributionLabels = getEntryContributionLabels(entry);
		DOM.reset(templateData.contributions, ...contributionLabels.map(label => $('span.inline-badge', undefined, label)));
		templateData.contributions.style.display = contributionLabels.length ? '' : 'none';

		const runtimeAction = extension.runtimeState?.action;
		const runtimeActionLabel = getRuntimeActionLabel(runtimeAction);
		templateData.runtimeAction.label = runtimeActionLabel ?? '';
		templateData.runtimeAction.element.style.display = runtimeActionLabel ? '' : 'none';
		if (runtimeActionLabel) {
			templateData.elementDisposables.add(templateData.runtimeAction.onDidClick(() => this.runRuntimeAction(runtimeAction)));
			if (extension.runtimeState?.reason) {
				templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.runtimeAction.element, { content: extension.runtimeState.reason, style: HoverStyle.Pointer }, this.buttonHoverLifecycleOptions));
			}
		}

		templateData.container.classList.toggle('disabled', !enabled);
		templateData.toggle.checked = enabled;
		templateData.toggle.disabled = !canChange;
		templateData.toggle.setAriaLabel(canChange
			? localize('agentsWindowExtensions.toggle', "Run {0} in the Agents window", extension.displayName)
			: localize('agentsWindowExtensions.toggleUnavailable', "{0} cannot be enabled or disabled in the Agents window", extension.displayName));
		templateData.elementDisposables.add(templateData.toggle.onChange(checked => this.setEnabled(extension, checked)));

		templateData.moreActions.setAriaLabel(localize('agentsWindowExtensions.moreActionsAriaLabel', "More Actions for {0}", extension.displayName));
		templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.moreActions.element, { content: localize('agentsWindowExtensions.moreActions', "More Actions..."), style: HoverStyle.Pointer }, this.buttonHoverLifecycleOptions));
		templateData.elementDisposables.add(templateData.moreActions.onDidClick(() => this.showActions(extension, templateData.moreActions.element)));
	}

	disposeTemplate(templateData: IExtensionRowTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

/**
 * Lists installed extensions in the Agent Customizations editor and lets users choose which run in
 * the Agents window. Changes are stored as enablement of the Agents window workspace, so they never
 * affect editor windows.
 */
export class AgentsWindowExtensionsWidget extends Disposable implements IAICustomizationManagementSectionWidget {

	private readonly element: HTMLElement;
	private readonly runtimeActionButton: Button;
	private readonly description: HTMLElement;
	private readonly searchInput: InputBox;
	private readonly treeContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<AgentsWindowExtensionsTreeEntry>;
	private readonly emptyState: HTMLElement;
	private readonly emptyStateText: HTMLElement;
	private readonly emptyStateSubtext: HTMLElement;
	private readonly marketplaceSearch: AgentsWindowMarketplaceSearch;
	private readonly marketplaceRowRenderer: MarketplaceExtensionRowRenderer;
	/** Keys of the extensions that users started to install from the Marketplace group, which are enabled once installed. */
	private readonly pendingInstalls = new Set<string>();
	/** Why the current Marketplace extensions can't be installed, resolved once they are rendered, or `undefined` while resolving or when they can be. */
	private readonly installBlockers = new Map<IExtension, IMarkdownString | undefined>();
	/** Extensions that users uninstalled from the section that keep running until extensions restart. */
	private readonly uninstalledExtensions = new Set<IExtension>();
	private readonly collapsedGroups = new Set<AgentsWindowExtensionGroup>();
	private readonly delayedSearch = this._register(new Delayer<void>(200));
	private searchQuery = '';
	/** Whether to expand the Marketplace group the next time it is rendered, as users search to find extensions there. */
	private expandMarketplace = false;
	private runtimeAction: ExtensionRuntimeActionType | undefined;
	private visible = false;
	private renderPending = true;

	constructor(
		container: HTMLElement,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IHostService private readonly hostService: IHostService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IAgentsWindowExtensionSuggestionsService private readonly extensionSuggestionsService: IAgentsWindowExtensionSuggestionsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IDialogService private readonly dialogService: IDialogService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAllowedExtensionsService allowedExtensionsService: IAllowedExtensionsService,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super();

		this.element = DOM.append(container, $('.agents-window-extensions'));

		const header = DOM.append(this.element, $('.agents-window-extensions-header'));
		const titleRow = DOM.append(header, $('.agents-window-extensions-title-row'));
		DOM.append(titleRow, $('h2.agents-window-extensions-title')).textContent = localize('agentsWindowExtensions.title', "Extensions");
		this.runtimeActionButton = this._register(new Button(titleRow, { ...defaultButtonStyles, secondary: true, small: true }));
		this._register(this.runtimeActionButton.onDidClick(() => this.runRuntimeAction(this.runtimeAction)));
		this.description = DOM.append(header, $('p.agents-window-extensions-description'));
		this.updateDescription();

		this.marketplaceSearch = this._register(instantiationService.createInstance(AgentsWindowMarketplaceSearch));

		const searchContainer = DOM.append(this.element, $('.agents-window-extensions-search'));
		// Its placeholder and accessible name depend on whether the Marketplace can be searched, which is tracked below.
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, { inputBoxStyles: defaultInputBoxStyles }));
		this._register(this.searchInput.onDidChange(value => {
			this.delayedSearch.trigger(() => {
				if (value.trim() && value.trim() !== this.searchQuery.trim()) {
					this.collapsedGroups.delete(AgentsWindowExtensionGroup.Marketplace);
					this.expandMarketplace = true;
				}
				this.searchQuery = value;
				// Searching the Marketplace always updates its result, which renders the section.
				this.marketplaceSearch.search(value);
			}).catch(() => { /* delayer disposed */ });
		}));

		this.treeContainer = DOM.append(this.element, $('.agents-window-extensions-tree.customization-tree-container'));
		this.marketplaceRowRenderer = instantiationService.createInstance(MarketplaceExtensionRowRenderer,
			extension => this.getInstallBlocker(extension),
			extension => this.pendingInstalls.add(ExtensionIdentifier.toKey(extension.identifier.id)),
			extension => this.forgetPendingInstall(extension),
		);
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<AgentsWindowExtensionsTreeEntry>,
			'AgentsWindowExtensionsTree',
			this.treeContainer,
			new AgentsWindowExtensionsDelegate(),
			[
				asTreeRenderer(new CustomizationGroupHeaderRenderer<IAgentsWindowExtensionsGroupEntry>(GROUP_HEADER_TEMPLATE_ID, hoverService)),
				asTreeRenderer(instantiationService.createInstance(ExtensionRowRenderer,
					extension => this.isEnabled(extension),
					extension => this.canChangeEnablement(extension),
					(extension, enabled) => this.setEnabled(extension, enabled, 'toggle'),
					extension => this.getWarning(extension),
					action => this.runRuntimeAction(action),
					(extension, anchor) => this.showExtensionActions(extension, anchor),
					() => this.marketplaceSearch.isAvailable,
				)),
				asTreeRenderer(this.marketplaceRowRenderer),
				asTreeRenderer(new MarketplaceMessageRenderer()),
			],
			{
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				overrideStyles: customizationTreeStyles,
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				identityProvider: { getId: entry => getTreeEntryId(entry) },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('agentsWindowExtensions.treeAriaLabel', "Extensions"),
					getAriaLabel: entry => this.getAriaLabel(entry),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => entry.type === 'group-header' ? entry.label : entry.type === 'message' ? entry.text : entry.extension.displayName,
				},
			},
		));
		this._register(this.tree.onDidChangeCollapseState(event => {
			const entry = event.node.element;
			if (entry?.type === 'group-header') {
				if (event.node.collapsed) {
					this.collapsedGroups.add(entry.group);
				} else {
					this.collapsedGroups.delete(entry.group);
				}
			}
		}));
		this._register(DOM.addStandardDisposableListener(this.tree.getHTMLElement(), DOM.EventType.KEY_DOWN, event => {
			// The focused Marketplace row's actions handle their own keys.
			if (DOM.isHTMLElement(event.target) && event.target.closest('.agents-window-extension-marketplace-actions')) {
				return;
			}
			const entry = this.tree.getFocus()[0];
			if ((entry?.type === 'extension' || entry?.type === 'marketplace') && (event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter)) {
				event.preventDefault();
				event.stopPropagation();
				if (entry.type === 'marketplace') {
					this.marketplaceRowRenderer.install(entry.extension);
				} else if (this.canChangeEnablement(entry.extension)) {
					this.setEnabled(entry.extension, !this.isEnabled(entry.extension), 'toggle');
				}
			}
		}));
		this._register(this.tree.onContextMenu(event => {
			if (event.element?.type === 'extension') {
				this.showExtensionActions(event.element.extension, event.anchor);
			}
		}));
		this._register(this.tree.onDidChangeFocus(() => this.updateFocusedMarketplaceRow()));

		this.emptyState = DOM.append(this.element, $('.agents-window-extensions-empty'));
		this.emptyState.style.display = 'none';
		this.emptyStateText = DOM.append(this.emptyState, $('.agents-window-extensions-empty-text'));
		this.emptyStateSubtext = DOM.append(this.emptyState, $('.agents-window-extensions-empty-subtext'));

		const resizeObserver = this._register(new DOM.DisposableResizeObserver('AgentsWindowExtensionsWidget', () => this.layoutTree(), DOM.getWindow(container)));
		this._register(resizeObserver.observe(this.treeContainer));

		this._register(this.extensionsWorkbenchService.onChange(() => {
			this.enableInstalledExtensions();
			this.scheduleRender();
		}));
		// Runtime states are derived from the running extensions, which change without an extensions workbench event.
		this._register(extensionService.onDidChangeExtensions(() => this.scheduleRender()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.AgentsWindowExtensions)) {
				this.updateSearchAriaLabel();
			}
			if (e.affectsConfiguration(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE)) {
				this.updateDescription();
				// Group descriptions depend on how extensions are enabled automatically.
				this.scheduleRender();
			}
		}));
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateSearchAriaLabel()));
		this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => {
			this.installBlockers.clear();
			this.scheduleRender();
		}));
		this._register(autorun(reader => {
			const result = this.marketplaceSearch.result.read(reader);
			this.installBlockers.clear();
			// Whether the Marketplace can be searched also decides whether installed extensions show its install counts and ratings.
			this.updateMarketplaceMessage(result, this.marketplaceSearch.status.read(reader));
			this.scheduleRender();
		}));
		this._register(autorun(reader => {
			this.marketplaceSearch.status.read(reader);
			this.searchInput.setPlaceHolder(this.marketplaceSearch.isAvailable
				? localize('agentsWindowExtensions.searchMarketplacePlaceholder', "Search installed extensions and the Marketplace...")
				: localize('agentsWindowExtensions.searchPlaceholder', "Type to search..."));
			this.updateSearchAriaLabel();
		}));
	}

	setVisible(visible: boolean): void {
		this.visible = visible;
		if (visible) {
			// Navigating to the section dismisses the badge on its entry points.
			this.extensionSuggestionsService.dismissBadge();
			if (this.renderPending) {
				this.render();
			}
		}
		this.layoutTree();
	}

	layout(): void {
		this.layoutTree();
	}

	focus(): void {
		this.searchInput.focus();
	}

	setSearchQuery(query: string): void {
		this.searchInput.value = query;
	}

	private scheduleRender(): void {
		if (this.visible) {
			// Suggestions that appear while the section is visible don't need a badge either.
			this.extensionSuggestionsService.dismissBadge();
			this.render();
		} else {
			this.renderPending = true;
		}
	}

	private render(): void {
		this.renderPending = false;
		const suggested = new Set(this.extensionSuggestionsService.suggestedExtensions.get());
		const isSuggested = (extension: IExtension) => suggested.has(extension);
		const installed = groupAgentsWindowExtensions(this.extensionsWorkbenchService.local, '', extension => this.supportsAgentsWindow(extension), isSuggested);
		for (const extension of this.uninstalledExtensions) {
			if (extension.state !== ExtensionState.Uninstalled || !extension.runtimeState) {
				this.uninstalledExtensions.delete(extension);
			}
		}
		this.updateRuntimeAction([...installed.flatMap(group => group.entries.map(entry => entry.extension)), ...this.uninstalledExtensions]);

		const query = this.searchQuery.trim();
		const marketplace = this.getCurrentMarketplaceResult();
		const marketplaceMatches = new Set(marketplace?.extensions.map(extension => ExtensionIdentifier.toKey(extension.identifier.id)));
		const groups = query
			? groupAgentsWindowExtensions(this.extensionsWorkbenchService.local, this.searchQuery, extension => this.supportsAgentsWindow(extension), isSuggested, marketplaceMatches)
			: installed;
		const visibleGroups = groups.filter(group => group.entries.length > 0);
		const marketplaceEntries = this.getMarketplaceEntries(marketplace);
		if (visibleGroups.length === 0 && marketplaceEntries.length === 0) {
			this.tree.setChildren(null, []);
			this.updateFocusedMarketplaceRow();
			this.treeContainer.style.display = 'none';
			this.emptyState.style.display = '';
			if (query) {
				this.emptyStateText.textContent = localize('agentsWindowExtensions.noMatches', "No extensions match '{0}'", query);
				this.emptyStateSubtext.textContent = localize('agentsWindowExtensions.noMatchesHint', "Try a different search term.");
			} else {
				this.emptyStateText.textContent = localize('agentsWindowExtensions.empty', "No extensions installed");
				this.emptyStateSubtext.textContent = this.marketplaceSearch.isAvailable
					? localize('agentsWindowExtensions.emptyMarketplaceHint', "Search to install extensions from the Marketplace.")
					: localize('agentsWindowExtensions.emptyHint', "Extensions you install in VS Code appear here.");
			}
			return;
		}

		this.emptyState.style.display = 'none';
		this.treeContainer.style.display = '';
		const autoEnablesListed = Array.isArray(this.configurationService.getValue<unknown>(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE));
		const createGroup = (group: AgentsWindowExtensionGroup, description: string, icon: ThemeIcon, entries: readonly AgentsWindowExtensionsTreeEntry[]): IObjectTreeElement<AgentsWindowExtensionsTreeEntry> => {
			const expand = group === AgentsWindowExtensionGroup.Marketplace && this.expandMarketplace;
			const collapsed = !expand && this.collapsedGroups.has(group);
			const element: IAgentsWindowExtensionsGroupEntry = {
				type: 'group-header',
				id: `agents-window-extensions-group-${group}`,
				group,
				label: getGroupLabel(group),
				description,
				icon,
				count: entries.filter(entry => entry.type !== 'message').length,
				isFirst: false,
				collapsed,
			};
			return {
				element,
				collapsible: true,
				collapsed: expand ? ObjectTreeElementCollapseState.Expanded : collapsed ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded,
				children: entries.map(entry => ({ element: entry })),
			};
		};
		const children = visibleGroups.map(group => createGroup(
			group.group,
			// Describes all installed extensions in the group, so the description doesn't change while searching.
			getGroupDescription(installed.find(installedGroup => installedGroup.group === group.group) ?? group, autoEnablesListed),
			Codicon.extensions,
			group.entries,
		));
		if (marketplaceEntries.length) {
			children.push(createGroup(AgentsWindowExtensionGroup.Marketplace, getGroupDescription({ group: AgentsWindowExtensionGroup.Marketplace, entries: [] }, autoEnablesListed), Codicon.globe, marketplaceEntries));
			this.expandMarketplace = false;
		}
		this.tree.setChildren(null, children);
		this.updateFocusedMarketplaceRow();
		this.layoutTree();
	}

	/**
	 * Puts the focused Marketplace row's actions in the tab order. Replacing rows changes the tree's focus without an event,
	 * such as when a new search replaces the focused row while it searches, so this also runs after the rows change.
	 */
	private updateFocusedMarketplaceRow(): void {
		const [entry] = this.tree.getFocus();
		this.marketplaceRowRenderer.setFocused(entry?.type === 'marketplace' ? entry.extension : undefined);
	}

	/**
	 * Returns the result of the Marketplace search for the current search text, if any.
	 */
	private getCurrentMarketplaceResult(): IMarketplaceSearchResult | undefined {
		const query = this.searchQuery.trim();
		const result = this.marketplaceSearch.result.get();
		return query && result.query === query && result.status !== MarketplaceSearchStatus.Idle ? result : undefined;
	}

	/**
	 * Lists the extensions that a Marketplace search found and that aren't installed, in the Marketplace's order, or a
	 * message while searching. Installed extensions that it found are listed in their groups instead.
	 */
	private getMarketplaceEntries(result: IMarketplaceSearchResult | undefined): (IAgentsWindowMarketplaceEntry | IAgentsWindowMarketplaceMessageEntry)[] {
		if (result?.status === MarketplaceSearchStatus.Searching) {
			return [{ type: 'message', id: 'agents-window-extensions-marketplace-searching', text: localize('agentsWindowExtensions.searchingMarketplace', "Searching the Marketplace..."), loading: true }];
		}
		if (result?.status !== MarketplaceSearchStatus.Done) {
			return [];
		}
		// Installed extensions report that they are installing while they are updated, so they are excluded whatever their state.
		const installed = new Set(this.extensionsWorkbenchService.local.map(extension => ExtensionIdentifier.toKey(extension.identifier.id)));
		return result.extensions
			.filter(extension => !extension.isBuiltin && !extension.local && !installed.has(ExtensionIdentifier.toKey(extension.identifier.id))
				&& (extension.state === ExtensionState.Uninstalled || extension.state === ExtensionState.Installing))
			.map(extension => ({ type: 'marketplace', extension }));
	}

	/**
	 * Warns when the Marketplace can't be searched, and announces how many extensions a search found.
	 */
	private updateMarketplaceMessage(result: IMarketplaceSearchResult, marketplaceStatus: ExtensionGalleryManifestStatus): void {
		if (result.status === MarketplaceSearchStatus.Failed) {
			this.searchInput.showMessage({
				content: localize('agentsWindowExtensions.marketplaceUnavailable', "Marketplace results are unavailable. Showing installed extensions only."),
				type: MessageType.WARNING,
			});
			return;
		}
		// Like the Extensions view, explains why a private Marketplace can't be searched.
		if (result.query && marketplaceStatus === ExtensionGalleryManifestStatus.RequiresSignIn) {
			this.searchInput.showMessage({
				content: localize('agentsWindowExtensions.marketplaceRequiresSignIn', "Sign in to the Extensions Marketplace from the Extensions view in VS Code to search it. Showing installed extensions only."),
				type: MessageType.INFO,
			});
			return;
		}
		if (result.query && marketplaceStatus === ExtensionGalleryManifestStatus.AccessDenied) {
			this.searchInput.showMessage({
				content: localize('agentsWindowExtensions.marketplaceAccessDenied', "Your account does not have access to the Extensions Marketplace. Showing installed extensions only."),
				type: MessageType.WARNING,
			});
			return;
		}
		this.searchInput.hideMessage();
		if (result.status === MarketplaceSearchStatus.Done && this.visible) {
			const count = this.getMarketplaceEntries(result).length;
			status(count === 1
				? localize('agentsWindowExtensions.marketplaceResult', "1 extension found in the Marketplace")
				: localize('agentsWindowExtensions.marketplaceResults', "{0} extensions found in the Marketplace", count));
		}
	}

	/**
	 * Returns why a Marketplace extension can't be installed, like the Extensions view's status does. Resolves it the first
	 * time it is needed, which is when the extension is rendered, and renders again once it is known.
	 */
	private getInstallBlocker(extension: IExtension): IMarkdownString | undefined {
		if (!this.installBlockers.has(extension)) {
			this.installBlockers.set(extension, undefined);
			this.extensionsWorkbenchService.canInstall(extension).then(result => {
				if (result !== true && this.installBlockers.has(extension)) {
					this.installBlockers.set(extension, result);
					this.scheduleRender();
				}
			}, () => { /* the Install action stays disabled without an explanation */ });
		}
		return this.installBlockers.get(extension);
	}

	/**
	 * Enables the extensions that users installed from the Marketplace group in the Agents window, as users install them there to use them there.
	 */
	private enableInstalledExtensions(): void {
		for (const key of this.pendingInstalls) {
			const extension = this.extensionsWorkbenchService.local.find(local => local.state === ExtensionState.Installed && ExtensionIdentifier.toKey(local.identifier.id) === key);
			if (!extension) {
				continue;
			}
			this.pendingInstalls.delete(key);
			if (!this.isEnabled(extension) && this.canChangeEnablement(extension)) {
				this.setEnabled(extension, true, 'install');
			}
		}
	}

	/**
	 * Forgets an extension that users started to install once its Install action finished, unless it is installed, as users
	 * might have cancelled installing it, or installing it might have failed.
	 */
	private forgetPendingInstall(extension: IExtension): void {
		this.enableInstalledExtensions();
		this.pendingInstalls.delete(ExtensionIdentifier.toKey(extension.identifier.id));
	}

	private layoutTree(): void {
		const { clientHeight, clientWidth } = this.treeContainer;
		if (this.visible && clientHeight > 0 && clientWidth > 0) {
			this.tree.layout(clientHeight, clientWidth);
		}
		this.searchInput.layout();
	}

	private supportsAgentsWindow(extension: IExtension): boolean {
		return !!extension.local && this.extensionManifestPropertiesService.canExecuteOnSessionsWindow(extension.local.manifest, extension.isBuiltin);
	}

	/**
	 * Warns about extensions that haven't declared support for the Agents window and contribute things that it doesn't support.
	 */
	private getWarning(extension: IExtension): string | undefined {
		return extension.local && !this.supportsAgentsWindow(extension)
			? getMissingFeaturesWarning(getSessionsWindowMissingFeatures(extension.local.manifest))
			: undefined;
	}

	private isEnabled(extension: IExtension): boolean {
		return this.extensionEnablementService.isEnabledEnablementState(extension.enablementState);
	}

	private canChangeEnablement(extension: IExtension): boolean {
		return !!extension.local && this.extensionEnablementService.canChangeWorkspaceEnablement(extension.local);
	}

	private async setEnabled(extension: IExtension, enabled: boolean, trigger: AgentsWindowExtensionEnablementTrigger): Promise<void> {
		try {
			// The Agents window has a dedicated workspace, so workspace enablement only applies to the Agents window.
			await this.extensionsWorkbenchService.setEnablement(extension, enabled ? EnablementState.EnabledWorkspace : EnablementState.DisabledWorkspace);
			this.telemetryService.publicLog2<AgentsWindowExtensionEnablementChangedEvent, AgentsWindowExtensionEnablementChangedClassification>('agentsWindowExtensionEnablementChanged', {
				extensionId: ExtensionIdentifier.toKey(extension.identifier.id),
				enabled,
				// Sorted like the suggested contributions of agentsWindowAutoEnableCandidateEnabled, so the events can be joined.
				aiFeatures: extension.local ? getSessionsWindowSuggestedContributions(extension.local.manifest).sort().join(',') : '',
				trigger,
			});
			status(this.isEnabled(extension)
				? localize('agentsWindowExtensions.enabledStatus', "{0} enabled in the Agents window", extension.displayName)
				: localize('agentsWindowExtensions.disabledStatus', "{0} disabled in the Agents window", extension.displayName));
		} catch (error) {
			if (!isCancellationError(error)) {
				this.notificationService.error(error);
			}
		}
		// Re-render so a cancelled or failed change does not leave the switch in the requested state.
		this.scheduleRender();
	}

	private showExtensionActions(extension: IExtension, anchor: HTMLElement | IMouseEvent): void {
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.getExtensionActions(extension),
		});
	}

	/**
	 * Returns the actions of an installed extension's row: changing whether it runs in the Agents window, then uninstalling it.
	 */
	private getExtensionActions(extension: IExtension): IAction[] {
		const enabled = this.isEnabled(extension);
		const state: IAction[] = [toAction({
			id: enabled ? 'agentsWindowExtensions.disable' : 'agentsWindowExtensions.enable',
			label: enabled ? localize('agentsWindowExtensions.disableAction', "Disable") : localize('agentsWindowExtensions.enableAction', "Enable"),
			enabled: this.canChangeEnablement(extension),
			run: () => this.setEnabled(extension, !enabled, 'toggle'),
		})];
		const runtimeAction = extension.runtimeState?.action;
		const runtimeActionLabel = getRuntimeActionLabel(runtimeAction);
		if (runtimeActionLabel) {
			state.push(toAction({ id: 'agentsWindowExtensions.runtimeAction', label: runtimeActionLabel, run: () => this.runRuntimeAction(runtimeAction) }));
		}

		// Uses the Extensions view's action, which knows when an extension can be uninstalled.
		const uninstallAction = this.instantiationService.createInstance(UninstallAction);
		uninstallAction.extension = extension;
		const canUninstall = uninstallAction.enabled;
		uninstallAction.dispose();
		const manage: IAction[] = [toAction({
			id: 'agentsWindowExtensions.uninstall',
			// Ends with an ellipsis when uninstalling asks for confirmation.
			label: this.uninstallsFromAllProfiles(extension)
				? localize('agentsWindowExtensions.uninstallAllProfiles', "Uninstall (All Profiles)...")
				: this.confirmsUninstall()
					? localize('agentsWindowExtensions.uninstall', "Uninstall...")
					: localize('agentsWindowExtensions.uninstallWithoutConfirmation', "Uninstall"),
			enabled: canUninstall,
			run: () => this.uninstall(extension),
		})];

		return Separator.join(state, manage);
	}

	/**
	 * Whether uninstalling an extension also uninstalls it from the other profiles, like the Extensions view's Uninstall action labels it.
	 */
	private uninstallsFromAllProfiles(extension: IExtension): boolean {
		return !!extension.local?.isApplicationScoped && this.userDataProfilesService.profiles.length > 1;
	}

	private confirmsUninstall(): boolean {
		return this.configurationService.getValue<boolean>(AGENTS_WINDOW_CONFIRM_UNINSTALL_SETTING) !== false;
	}

	/**
	 * Uninstalls an extension like the Extensions view's Uninstall action, once users confirm, as it is also uninstalled from VS Code.
	 */
	private async uninstall(extension: IExtension): Promise<void> {
		// The Extensions service confirms uninstalling an extension from all profiles itself.
		if (!this.uninstallsFromAllProfiles(extension) && this.confirmsUninstall()) {
			const { confirmed, checkboxChecked } = await this.dialogService.confirm({
				type: 'question',
				message: localize('agentsWindowExtensions.confirmUninstall', "Do you want to uninstall '{0}'?", extension.displayName),
				detail: localize('agentsWindowExtensions.confirmUninstallDetail', "Uninstalling it here also uninstalls it from VS Code."),
				primaryButton: localize({ key: 'agentsWindowExtensions.uninstallButton', comment: ['&& denotes a mnemonic'] }, "&&Uninstall"),
				checkbox: { label: localize('agentsWindowExtensions.doNotAskAgain', "Do not ask me again") },
			});
			if (!confirmed) {
				return;
			}
			if (checkboxChecked) {
				await this.configurationService.updateValue(AGENTS_WINDOW_CONFIRM_UNINSTALL_SETTING, false);
			}
		}

		const uninstallAction = this.instantiationService.createInstance(UninstallAction);
		try {
			uninstallAction.extension = extension;
			await uninstallAction.run();
		} finally {
			uninstallAction.dispose();
		}
		// A running extension keeps running until extensions restart, which the section offers once it is no longer listed.
		if (extension.state === ExtensionState.Uninstalled && extension.runtimeState) {
			this.uninstalledExtensions.add(extension);
			this.scheduleRender();
		}
	}

	private updateRuntimeAction(extensions: readonly IExtension[]): void {
		const actions = new Set(extensions.map(extension => extension.runtimeState?.action));
		this.runtimeAction = actions.has(ExtensionRuntimeActionType.ReloadWindow) ? ExtensionRuntimeActionType.ReloadWindow
			: actions.has(ExtensionRuntimeActionType.RestartExtensions) ? ExtensionRuntimeActionType.RestartExtensions
				: undefined;
		this.runtimeActionButton.label = getRuntimeActionLabel(this.runtimeAction) ?? '';
		this.runtimeActionButton.element.style.display = this.runtimeAction ? '' : 'none';
	}

	private async runRuntimeAction(action: ExtensionRuntimeActionType | undefined): Promise<void> {
		try {
			if (action === ExtensionRuntimeActionType.ReloadWindow) {
				await this.hostService.reload();
			} else if (action === ExtensionRuntimeActionType.RestartExtensions) {
				await this.extensionsWorkbenchService.updateRunningExtensions();
			}
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private updateDescription(): void {
		const autoEnable = this.configurationService.getValue<unknown>(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE);
		this.description.textContent = autoEnable === true
			? localize('agentsWindowExtensions.descriptionAutoEnabled', "Choose which installed extensions run in the Agents window. Extensions that haven't declared support for the Agents window might not work as expected. They are disabled by default, unless they could be useful there and don't rely on features that are unavailable in the Agents window. Changes only apply to the Agents window.")
			: Array.isArray(autoEnable) && autoEnable.length > 0
				? localize('agentsWindowExtensions.descriptionAutoEnabledListed', "Choose which installed extensions run in the Agents window. Extensions that haven't declared support for the Agents window might not work as expected. They are disabled by default, unless they are enabled automatically. Changes only apply to the Agents window.")
				: localize('agentsWindowExtensions.description', "Choose which installed extensions run in the Agents window. Extensions that haven't declared support for the Agents window are disabled by default and might not work as expected. Changes only apply to the Agents window.");
	}

	private updateSearchAriaLabel(): void {
		const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		const withHelp = this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.AgentsWindowExtensions) && keybinding;
		if (this.marketplaceSearch.isAvailable) {
			this.searchInput.setAriaLabel(withHelp
				? localize('agentsWindowExtensions.searchMarketplaceAriaLabelWithHelp', "Search installed extensions and the Marketplace. Use {0} for accessibility help.", keybinding)
				: localize('agentsWindowExtensions.searchMarketplaceAriaLabel', "Search installed extensions and the Marketplace"));
			return;
		}
		this.searchInput.setAriaLabel(withHelp
			? localize('agentsWindowExtensions.searchAriaLabelWithHelp', "Search extensions. Use {0} for accessibility help.", keybinding)
			: localize('agentsWindowExtensions.searchAriaLabel', "Search extensions"));
	}

	private getAriaLabel(entry: AgentsWindowExtensionsTreeEntry): string {
		if (entry.type === 'group-header') {
			return localize('agentsWindowExtensions.groupAriaLabel', "{0}, {1} extensions. {2}", entry.label, entry.count, entry.description);
		}
		if (entry.type === 'message') {
			return entry.text;
		}
		if (entry.type === 'marketplace') {
			return getMarketplaceExtensionAriaLabel(entry.extension, entry.extension.state === ExtensionState.Uninstalled ? this.getInstallBlocker(entry.extension) : undefined);
		}
		const { extension } = entry;
		const state = this.isEnabled(extension)
			? localize('agentsWindowExtensions.enabled', "Enabled")
			: localize('agentsWindowExtensions.disabled', "Disabled");
		// The publisher, followed by the install count and rating while the row shows them.
		const publisher = [extension.publisherDisplayName, ...(this.marketplaceSearch.isAvailable ? getMarketplaceStatisticsLabels(extension) : [])].join(', ');
		const runtimeStateLabel = getRuntimeStateLabel(extension);
		const label = runtimeStateLabel
			? localize('agentsWindowExtensions.rowAriaLabelWithRuntimeState', "{0}, {1}, {2}, {3}", extension.displayName, publisher, state, runtimeStateLabel)
			: localize('agentsWindowExtensions.rowAriaLabel', "{0}, {1}, {2}", extension.displayName, publisher, state);
		const warning = this.getWarning(extension);
		const labelWithWarning = warning ? localize('agentsWindowExtensions.rowAriaLabelWithWarning', "{0}. Warning: {1}", label, warning) : label;
		const contributionLabels = getEntryContributionLabels(entry);
		return contributionLabels.length
			? localize('agentsWindowExtensions.rowAriaLabelWithContributions', "{0}. Contributes {1}", labelWithWarning, contributionLabels.join(', '))
			: labelWithWarning;
	}
}
