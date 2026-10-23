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
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { IObjectTreeElement, ObjectTreeElementCollapseState } from '../../../../base/browser/ui/tree/tree.js';
import { Delayer } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { IMatch, matchesContiguousSubString } from '../../../../base/common/filters.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchObjectTree } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IAICustomizationManagementSectionWidget } from '../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementSectionRegistry.js';
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, ICustomizationGroupHeaderEntry } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationGroupHeaderRenderer.js';
import { CustomizationToggle } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationToggle.js';
import { asTreeRenderer, customizationTreeStyles } from '../../../../workbench/contrib/chat/browser/aiCustomization/customizationTree.js';
import { ExtensionIconWidget } from '../../../../workbench/contrib/extensions/browser/extensionsWidgets.js';
import { ExtensionRuntimeActionType, ExtensionState, IExtension, IExtensionsWorkbenchService } from '../../../../workbench/contrib/extensions/common/extensions.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../../workbench/services/extensionManagement/common/extensionManagement.js';
import { IExtensionManifestPropertiesService } from '../../../../workbench/services/extensions/common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { IAgentsWindowExtensionSuggestionsService } from './agentsWindowExtensionSuggestions.js';

const $ = DOM.$;

const EXTENSION_ROW_HEIGHT = 52;
const GROUP_HEADER_TEMPLATE_ID = 'agentsWindowExtensionsGroupHeader';
const EXTENSION_ROW_TEMPLATE_ID = 'agentsWindowExtensionRow';

export const enum AgentsWindowExtensionGroup {
	Suggested = 'suggested',
	Supported = 'supported',
	Other = 'other',
}

export interface IAgentsWindowExtensionEntry {
	readonly type: 'extension';
	readonly extension: IExtension;
	readonly nameMatches: IMatch[] | undefined;
}

export interface IAgentsWindowExtensionsGroup {
	readonly group: AgentsWindowExtensionGroup;
	readonly entries: readonly IAgentsWindowExtensionEntry[];
}

interface IAgentsWindowExtensionsGroupEntry extends ICustomizationGroupHeaderEntry {
	readonly group: AgentsWindowExtensionGroup;
}

type AgentsWindowExtensionsTreeEntry = IAgentsWindowExtensionsGroupEntry | IAgentsWindowExtensionEntry;

/**
 * Returns the installed, non built-in extensions matching `query`, grouped into suggested extensions, extensions
 * that support the Agents window, and other extensions, each sorted by display name. Built-in extensions are
 * curated by the product and cannot be enabled or disabled for the Agents window, so they are not listed.
 */
export function groupAgentsWindowExtensions(extensions: readonly IExtension[], query: string, supportsAgentsWindow: (extension: IExtension) => boolean, isSuggested: (extension: IExtension) => boolean): IAgentsWindowExtensionsGroup[] {
	const trimmedQuery = query.trim();
	const suggested: IAgentsWindowExtensionEntry[] = [];
	const supported: IAgentsWindowExtensionEntry[] = [];
	const other: IAgentsWindowExtensionEntry[] = [];
	for (const extension of extensions) {
		if (extension.isBuiltin || !extension.local || extension.state !== ExtensionState.Installed) {
			continue;
		}
		const nameMatches = trimmedQuery ? matchesContiguousSubString(trimmedQuery, extension.displayName) ?? undefined : undefined;
		if (trimmedQuery && !nameMatches && ![extension.identifier.id, extension.publisherDisplayName, extension.description].some(text => !!text && !!matchesContiguousSubString(trimmedQuery, text))) {
			continue;
		}
		const group = isSuggested(extension) ? suggested : supportsAgentsWindow(extension) ? supported : other;
		group.push({ type: 'extension', extension, nameMatches });
	}
	const compare = (a: IAgentsWindowExtensionEntry, b: IAgentsWindowExtensionEntry) => a.extension.displayName.localeCompare(b.extension.displayName);
	return [
		{ group: AgentsWindowExtensionGroup.Suggested, entries: suggested.sort(compare) },
		{ group: AgentsWindowExtensionGroup.Supported, entries: supported.sort(compare) },
		{ group: AgentsWindowExtensionGroup.Other, entries: other.sort(compare) },
	];
}

function getGroupLabel(group: AgentsWindowExtensionGroup): string {
	switch (group) {
		case AgentsWindowExtensionGroup.Suggested:
			return localize('agentsWindowExtensions.suggestedGroup', "Suggested");
		case AgentsWindowExtensionGroup.Supported:
			return localize('agentsWindowExtensions.supportedGroup', "Supported");
		case AgentsWindowExtensionGroup.Other:
			return localize('agentsWindowExtensions.otherGroup', "Other Extensions");
	}
}

function getGroupDescription(group: AgentsWindowExtensionGroup): string {
	switch (group) {
		case AgentsWindowExtensionGroup.Suggested:
			return localize('agentsWindowExtensions.suggestedGroupDescription', "Extensions that could be useful in the Agents window, for example because they add tools, MCP servers, or syntax highlighting. They haven't declared support for the Agents window, so they are disabled by default and might not work as expected.");
		case AgentsWindowExtensionGroup.Supported:
			return localize('agentsWindowExtensions.supportedGroupDescription', "Extensions that support the Agents window. They are enabled by default.");
		case AgentsWindowExtensionGroup.Other:
			return localize('agentsWindowExtensions.otherGroupDescription', "Extensions that haven't declared support for the Agents window. They are disabled by default and might not work as expected.");
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

class AgentsWindowExtensionsDelegate implements IListVirtualDelegate<AgentsWindowExtensionsTreeEntry> {
	getHeight(entry: AgentsWindowExtensionsTreeEntry): number {
		return entry.type === 'group-header' ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : EXTENSION_ROW_HEIGHT;
	}

	getTemplateId(entry: AgentsWindowExtensionsTreeEntry): string {
		return entry.type === 'group-header' ? GROUP_HEADER_TEMPLATE_ID : EXTENSION_ROW_TEMPLATE_ID;
	}
}

interface IExtensionRowTemplateData {
	readonly container: HTMLElement;
	readonly icon: ExtensionIconWidget;
	readonly name: HighlightedLabel;
	readonly publisher: HTMLElement;
	readonly description: HTMLElement;
	readonly runtimeState: HTMLElement;
	readonly toggle: CustomizationToggle;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class ExtensionRowRenderer implements IListRenderer<IAgentsWindowExtensionEntry, IExtensionRowTemplateData> {
	readonly templateId = EXTENSION_ROW_TEMPLATE_ID;

	constructor(
		private readonly isEnabled: (extension: IExtension) => boolean,
		private readonly canChangeEnablement: (extension: IExtension) => boolean,
		private readonly setEnabled: (extension: IExtension, enabled: boolean) => void,
	) { }

	renderTemplate(container: HTMLElement): IExtensionRowTemplateData {
		container.classList.add('agents-window-extension-row');
		const templateDisposables = new DisposableStore();

		const icon = templateDisposables.add(new ExtensionIconWidget(DOM.append(container, $('.agents-window-extension-icon'))));
		const details = DOM.append(container, $('.agents-window-extension-details'));
		const nameRow = DOM.append(details, $('.agents-window-extension-name-row'));
		const name = templateDisposables.add(new HighlightedLabel(DOM.append(nameRow, $('span.agents-window-extension-name'))));
		const publisher = DOM.append(nameRow, $('span.agents-window-extension-publisher'));
		const description = DOM.append(details, $('span.agents-window-extension-description'));
		const runtimeState = DOM.append(container, $('span.agents-window-extension-runtime-state.inline-badge'));

		// Rows are activated with Space or Enter, so the switch stays out of the tab order and must not steal tree focus.
		const toggle = templateDisposables.add(new CustomizationToggle({ ariaLabel: '' }));
		toggle.setTabIndex(-1);
		container.appendChild(toggle.domNode);
		templateDisposables.add(DOM.addDisposableGenericMouseDownListener(toggle.domNode, event => DOM.EventHelper.stop(event, true)));

		return { container, icon, name, publisher, description, runtimeState, toggle, templateDisposables, elementDisposables: new DisposableStore() };
	}

	renderElement(entry: IAgentsWindowExtensionEntry, _index: number, templateData: IExtensionRowTemplateData): void {
		templateData.elementDisposables.clear();
		const { extension } = entry;
		const enabled = this.isEnabled(extension);
		const canChange = this.canChangeEnablement(extension);

		templateData.icon.extension = extension;
		templateData.name.set(extension.displayName, entry.nameMatches);
		templateData.publisher.textContent = extension.publisherDisplayName;
		templateData.description.textContent = extension.description;
		templateData.description.style.display = extension.description ? '' : 'none';

		const runtimeStateLabel = getRuntimeStateLabel(extension);
		templateData.runtimeState.textContent = runtimeStateLabel ?? '';
		templateData.runtimeState.title = extension.runtimeState?.reason ?? '';
		templateData.runtimeState.style.display = runtimeStateLabel ? '' : 'none';

		templateData.container.classList.toggle('disabled', !enabled);
		templateData.toggle.checked = enabled;
		templateData.toggle.disabled = !canChange;
		templateData.toggle.setAriaLabel(canChange
			? localize('agentsWindowExtensions.toggle', "Run {0} in the Agents window", extension.displayName)
			: localize('agentsWindowExtensions.toggleUnavailable', "{0} cannot be enabled or disabled in the Agents window", extension.displayName));
		templateData.elementDisposables.add(templateData.toggle.onChange(checked => this.setEnabled(extension, checked)));
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
	private readonly searchInput: InputBox;
	private readonly treeContainer: HTMLElement;
	private readonly tree: WorkbenchObjectTree<AgentsWindowExtensionsTreeEntry>;
	private readonly emptyState: HTMLElement;
	private readonly emptyStateText: HTMLElement;
	private readonly emptyStateSubtext: HTMLElement;
	private readonly collapsedGroups = new Set<AgentsWindowExtensionGroup>();
	private readonly delayedSearch = this._register(new Delayer<void>(200));
	private searchQuery = '';
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
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService hoverService: IHoverService,
		@IExtensionService extensionService: IExtensionService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.element = DOM.append(container, $('.agents-window-extensions'));

		const header = DOM.append(this.element, $('.agents-window-extensions-header'));
		const titleRow = DOM.append(header, $('.agents-window-extensions-title-row'));
		DOM.append(titleRow, $('h2.agents-window-extensions-title')).textContent = localize('agentsWindowExtensions.title', "Extensions");
		this.runtimeActionButton = this._register(new Button(titleRow, { ...defaultButtonStyles, secondary: true, small: true }));
		this._register(this.runtimeActionButton.onDidClick(() => this.runRuntimeAction()));
		DOM.append(header, $('p.agents-window-extensions-description')).textContent = localize('agentsWindowExtensions.description', "Choose which installed extensions run in the Agents window. Extensions that haven't declared support for the Agents window are disabled by default and might not work as expected. Changes only apply to the Agents window.");

		const searchContainer = DOM.append(this.element, $('.agents-window-extensions-search'));
		this.searchInput = this._register(new InputBox(searchContainer, contextViewService, {
			placeholder: localize('agentsWindowExtensions.searchPlaceholder', "Type to search..."),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this.updateSearchAriaLabel();
		this._register(this.searchInput.onDidChange(value => {
			this.delayedSearch.trigger(() => {
				this.searchQuery = value;
				this.render();
			}).catch(() => { /* delayer disposed */ });
		}));

		this.treeContainer = DOM.append(this.element, $('.agents-window-extensions-tree.customization-tree-container'));
		this.tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<AgentsWindowExtensionsTreeEntry>,
			'AgentsWindowExtensionsTree',
			this.treeContainer,
			new AgentsWindowExtensionsDelegate(),
			[
				asTreeRenderer(new CustomizationGroupHeaderRenderer<IAgentsWindowExtensionsGroupEntry>(GROUP_HEADER_TEMPLATE_ID, hoverService)),
				asTreeRenderer(new ExtensionRowRenderer(
					extension => this.isEnabled(extension),
					extension => this.canChangeEnablement(extension),
					(extension, enabled) => this.setEnabled(extension, enabled),
				)),
			],
			{
				indent: 8,
				renderIndentGuides: RenderIndentGuides.None,
				overrideStyles: customizationTreeStyles,
				multipleSelectionSupport: false,
				horizontalScrolling: false,
				identityProvider: { getId: entry => entry.type === 'group-header' ? entry.id : entry.extension.identifier.id.toLowerCase() },
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('agentsWindowExtensions.treeAriaLabel', "Extensions"),
					getAriaLabel: entry => this.getAriaLabel(entry),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: entry => entry.type === 'group-header' ? entry.label : entry.extension.displayName,
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
			const entry = this.tree.getFocus()[0];
			if (entry?.type === 'extension' && (event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter)) {
				event.preventDefault();
				event.stopPropagation();
				if (this.canChangeEnablement(entry.extension)) {
					this.setEnabled(entry.extension, !this.isEnabled(entry.extension));
				}
			}
		}));

		this.emptyState = DOM.append(this.element, $('.agents-window-extensions-empty'));
		this.emptyState.style.display = 'none';
		this.emptyStateText = DOM.append(this.emptyState, $('.agents-window-extensions-empty-text'));
		this.emptyStateSubtext = DOM.append(this.emptyState, $('.agents-window-extensions-empty-subtext'));

		const resizeObserver = this._register(new DOM.DisposableResizeObserver('AgentsWindowExtensionsWidget', () => this.layoutTree(), DOM.getWindow(container)));
		this._register(resizeObserver.observe(this.treeContainer));

		this._register(this.extensionsWorkbenchService.onChange(() => this.scheduleRender()));
		// Runtime states are derived from the running extensions, which change without an extensions workbench event.
		this._register(extensionService.onDidChangeExtensions(() => this.scheduleRender()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.AgentsWindowExtensions)) {
				this.updateSearchAriaLabel();
			}
		}));
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateSearchAriaLabel()));
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
		this.updateRuntimeAction(installed.flatMap(group => group.entries.map(entry => entry.extension)));

		const groups = this.searchQuery.trim()
			? groupAgentsWindowExtensions(this.extensionsWorkbenchService.local, this.searchQuery, extension => this.supportsAgentsWindow(extension), isSuggested)
			: installed;
		const visibleGroups = groups.filter(group => group.entries.length > 0);
		if (visibleGroups.length === 0) {
			this.tree.setChildren(null, []);
			this.treeContainer.style.display = 'none';
			this.emptyState.style.display = '';
			if (this.searchQuery.trim()) {
				this.emptyStateText.textContent = localize('agentsWindowExtensions.noMatches', "No extensions match '{0}'", this.searchQuery.trim());
				this.emptyStateSubtext.textContent = localize('agentsWindowExtensions.noMatchesHint', "Try a different search term.");
			} else {
				this.emptyStateText.textContent = localize('agentsWindowExtensions.empty', "No extensions installed");
				this.emptyStateSubtext.textContent = localize('agentsWindowExtensions.emptyHint', "Extensions you install in VS Code appear here.");
			}
			return;
		}

		this.emptyState.style.display = 'none';
		this.treeContainer.style.display = '';
		const children: IObjectTreeElement<AgentsWindowExtensionsTreeEntry>[] = visibleGroups.map(group => {
			const collapsed = this.collapsedGroups.has(group.group);
			const element: IAgentsWindowExtensionsGroupEntry = {
				type: 'group-header',
				id: `agents-window-extensions-group-${group.group}`,
				group: group.group,
				label: getGroupLabel(group.group),
				description: getGroupDescription(group.group),
				icon: Codicon.extensions,
				count: group.entries.length,
				isFirst: false,
				collapsed,
			};
			return {
				element,
				collapsible: true,
				collapsed: collapsed ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded,
				children: group.entries.map(entry => ({ element: entry })),
			};
		});
		this.tree.setChildren(null, children);
		this.layoutTree();
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

	private isEnabled(extension: IExtension): boolean {
		return this.extensionEnablementService.isEnabledEnablementState(extension.enablementState);
	}

	private canChangeEnablement(extension: IExtension): boolean {
		return !!extension.local && this.extensionEnablementService.canChangeWorkspaceEnablement(extension.local);
	}

	private async setEnabled(extension: IExtension, enabled: boolean): Promise<void> {
		try {
			// The Agents window has a dedicated workspace, so workspace enablement only applies to the Agents window.
			await this.extensionsWorkbenchService.setEnablement(extension, enabled ? EnablementState.EnabledWorkspace : EnablementState.DisabledWorkspace);
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

	private updateRuntimeAction(extensions: readonly IExtension[]): void {
		const actions = new Set(extensions.map(extension => extension.runtimeState?.action));
		this.runtimeAction = actions.has(ExtensionRuntimeActionType.ReloadWindow) ? ExtensionRuntimeActionType.ReloadWindow
			: actions.has(ExtensionRuntimeActionType.RestartExtensions) ? ExtensionRuntimeActionType.RestartExtensions
				: undefined;
		this.runtimeActionButton.label = this.runtimeAction === ExtensionRuntimeActionType.ReloadWindow
			? localize('agentsWindowExtensions.reloadWindow', "Reload Window")
			: localize('agentsWindowExtensions.restartExtensions', "Restart Extensions");
		this.runtimeActionButton.element.style.display = this.runtimeAction ? '' : 'none';
	}

	private async runRuntimeAction(): Promise<void> {
		try {
			if (this.runtimeAction === ExtensionRuntimeActionType.ReloadWindow) {
				await this.hostService.reload();
			} else if (this.runtimeAction === ExtensionRuntimeActionType.RestartExtensions) {
				await this.extensionsWorkbenchService.updateRunningExtensions();
			}
		} catch (error) {
			this.notificationService.error(error);
		}
	}

	private updateSearchAriaLabel(): void {
		const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
		this.searchInput.setAriaLabel(this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.AgentsWindowExtensions) && keybinding
			? localize('agentsWindowExtensions.searchAriaLabelWithHelp', "Search extensions. Use {0} for accessibility help.", keybinding)
			: localize('agentsWindowExtensions.searchAriaLabel', "Search extensions"));
	}

	private getAriaLabel(entry: AgentsWindowExtensionsTreeEntry): string {
		if (entry.type === 'group-header') {
			return localize('agentsWindowExtensions.groupAriaLabel', "{0}, {1} extensions. {2}", entry.label, entry.count, entry.description);
		}
		const { extension } = entry;
		const state = this.isEnabled(extension)
			? localize('agentsWindowExtensions.enabled', "Enabled")
			: localize('agentsWindowExtensions.disabled', "Disabled");
		const runtimeStateLabel = getRuntimeStateLabel(extension);
		return runtimeStateLabel
			? localize('agentsWindowExtensions.rowAriaLabelWithRuntimeState', "{0}, {1}, {2}, {3}", extension.displayName, extension.publisherDisplayName, state, runtimeStateLabel)
			: localize('agentsWindowExtensions.rowAriaLabel', "{0}, {1}, {2}", extension.displayName, extension.publisherDisplayName, state);
	}
}
