/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatModelsWidget.css';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Button, IButtonOptions } from '../../../../../base/browser/ui/button/button.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { localize } from '../../../../../nls.js';
import { defaultCheckboxStyles, defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { ITableVirtualDelegate, ITableRenderer } from '../../../../../base/browser/ui/table/table.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IAction, toAction, Action, Separator } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ChatModelsViewModel, IModelEntry, IModelItemEntry, SEARCH_SUGGESTIONS } from './chatModelsViewModel.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { SuggestEnabledInput } from '../../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { Delayer } from '../../../../../base/common/async.js';
import { settingsTextInputBorder } from '../../../preferences/common/settingsEditorColorRegistry.js';
import { IChatEntitlementService, ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { DropdownMenuActionViewItem } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { AnchorAlignment } from '../../../../../base/browser/ui/contextview/contextview.js';
import { ToolBar } from '../../../../../base/browser/ui/toolbar/toolbar.js';
import { preferencesClearInputIcon } from '../../../preferences/browser/preferencesIcons.js';

const $ = DOM.$;

const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 26;

export function getModelHoverContent(model: IModelEntry): MarkdownString {
	const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
	markdown.appendMarkdown(`**${model.metadata.name}**`);
	if (model.metadata.id !== model.metadata.version) {
		markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}@${model.metadata.version}_&nbsp;</span>`);
	} else {
		markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}_&nbsp;</span>`);
	}
	markdown.appendText(`\n`);

	if (model.metadata.statusIcon && model.metadata.tooltip) {
		if (model.metadata.statusIcon) {
			markdown.appendMarkdown(`$(${model.metadata.statusIcon.id})&nbsp;`);
		}
		markdown.appendMarkdown(`${model.metadata.tooltip}`);
		markdown.appendText(`\n`);
	}

	if (model.metadata.detail) {
		markdown.appendMarkdown(`${localize('models.cost', 'Multiplier')}: `);
		markdown.appendMarkdown(model.metadata.detail);
		markdown.appendText(`\n`);
	}

	if (model.metadata.maxInputTokens || model.metadata.maxOutputTokens) {
		markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
		let addSeparator = false;
		if (model.metadata.maxInputTokens) {
			markdown.appendMarkdown(`$(arrow-down) ${formatTokenCount(model.metadata.maxInputTokens)} (${localize('models.input', 'Input')})`);
			addSeparator = true;
		}
		if (model.metadata.maxOutputTokens) {
			if (addSeparator) {
				markdown.appendText(`  |  `);
			}
			markdown.appendMarkdown(`$(arrow-up) ${formatTokenCount(model.metadata.maxOutputTokens)} (${localize('models.output', 'Output')})`);
		}
		markdown.appendText(`\n`);
	}

	if (model.metadata.capabilities) {
		markdown.appendMarkdown(`${localize('models.capabilities', 'Capabilities')}: `);
		if (model.metadata.capabilities?.toolCalling) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.toolCalling', 'Tools')}_&nbsp;</span>`);
		}
		if (model.metadata.capabilities?.vision) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.vision', 'Vision')}_&nbsp;</span>`);
		}
		if (model.metadata.capabilities?.agentMode) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.agentMode', 'Agent Mode')}_&nbsp;</span>`);
		}
		for (const editTool of model.metadata.capabilities.editTools ?? []) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${editTool}_&nbsp;</span>`);
		}
		markdown.appendText(`\n`);
	}

	return markdown;
}

class ModelsFilterAction extends Action {
	constructor() {
		super('workbench.models.filter', localize('filter', "Filter"), ThemeIcon.asClassName(Codicon.filter));
	}

	override async run(): Promise<void> {
		// Action is handled by the dropdown
	}
}

class ModelsSearchFilterDropdownMenuActionViewItem extends DropdownMenuActionViewItem {

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly searchWidget: SuggestEnabledInput,
		private readonly getVendors: () => { vendor: string; displayName: string }[],
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(action,
			{ getActions: () => this.getActions() },
			contextMenuService,
			{
				...options,
				classNames: action.class,
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
				menuAsChild: true
			}
		);
	}

	private doSearchWidgetAction(queryToAppend: string): void {
		const currentValue = this.searchWidget.getValue().trim();
		const newValue = currentValue ? `${currentValue} ${queryToAppend}` : queryToAppend;
		this.searchWidget.setValue(newValue);
		this.searchWidget.focus();
	}

	private createProviderAction(vendor: string, displayName: string): IAction {
		const query = `@provider:"${displayName}"`;
		const currentQuery = this.searchWidget.getValue();
		const isChecked = currentQuery.includes(query) || currentQuery.includes(`@provider:${vendor}`);

		return {
			id: `provider-${vendor}`,
			label: displayName,
			tooltip: localize('filterByProvider', "Filter by {0}", displayName),
			class: undefined,
			enabled: true,
			checked: isChecked,
			run: () => {
				if (!isChecked) {
					this.doSearchWidgetAction(query);
				} else {
					// Remove the filter
					const queryWithRemovedFilter = currentQuery
						.replace(query, '')
						.replace(`@provider:${vendor}`, '')
						.replace(/\s+/g, ' ')
						.trim();
					this.searchWidget.setValue(queryWithRemovedFilter);
				}
				this.searchWidget.focus();
			}
		};
	}

	private createCapabilityAction(capability: string, label: string): IAction {
		const query = `@capability:${capability}`;
		const currentQuery = this.searchWidget.getValue();
		const isChecked = currentQuery.includes(query);

		return {
			id: `capability-${capability}`,
			label,
			tooltip: localize('filterByCapability', "Filter by {0}", label),
			class: undefined,
			enabled: true,
			checked: isChecked,
			run: () => {
				if (!isChecked) {
					this.doSearchWidgetAction(query);
				} else {
					// Remove the filter
					const queryWithRemovedFilter = currentQuery
						.replace(query, '')
						.replace(/\s+/g, ' ')
						.trim();
					this.searchWidget.setValue(queryWithRemovedFilter);
				}
				this.searchWidget.focus();
			}
		};
	}

	private createVisibleAction(visible: boolean, label: string): IAction {
		const query = `@visible:${visible}`;
		const currentQuery = this.searchWidget.getValue();
		const isChecked = currentQuery.includes(query);

		return {
			id: `visible-${visible}`,
			label,
			tooltip: localize('filterByVisible', "Filter by {0}", label),
			class: undefined,
			enabled: true,
			checked: isChecked,
			run: () => {
				if (!isChecked) {
					// Remove opposite filter if present
					const oppositeQuery = `@visible:${!visible}`;
					const newQuery = currentQuery.replace(oppositeQuery, '').replace(/\s+/g, ' ').trim();
					// Add the new filter
					const finalQuery = newQuery ? `${newQuery} ${query}` : query;
					this.searchWidget.setValue(finalQuery);
				} else {
					// Remove the filter
					const queryWithRemovedFilter = currentQuery
						.replace(query, '')
						.replace(/\s+/g, ' ')
						.trim();
					this.searchWidget.setValue(queryWithRemovedFilter);
				}
				this.searchWidget.focus();
			}
		};
	}

	private getActions(): IAction[] {
		const vendors = this.getVendors();
		const actions: IAction[] = [];

		// Add visible filter at the top
		actions.push(
			this.createVisibleAction(true, localize('filter.visible', 'Visible'))
		);

		if (vendors.length > 0) {
			actions.push(new Separator());
			actions.push(...vendors.map(vendor =>
				this.createProviderAction(vendor.vendor, vendor.displayName)
			));
		}

		if (actions.length > 1) {
			actions.push(new Separator());
		}

		// Add capability filters
		actions.push(
			this.createCapabilityAction('tools', localize('capability.tools', 'Tools')),
			this.createCapabilityAction('vision', localize('capability.vision', 'Vision')),
			this.createCapabilityAction('agent', localize('capability.agent', 'Agent Mode'))
		);

		return actions;
	}
}

class Delegate implements ITableVirtualDelegate<IModelItemEntry> {
	readonly headerRowHeight = HEADER_HEIGHT;

	getHeight(element: IModelItemEntry): number {
		return ROW_HEIGHT;
	}
}

interface IActionsColumnTemplateData {
	readonly actionBar: ActionBar;
}

class ActionsColumnRenderer implements ITableRenderer<IModelItemEntry, IActionsColumnTemplateData> {

	static readonly TEMPLATE_ID = 'actions';

	readonly templateId: string = ActionsColumnRenderer.TEMPLATE_ID;

	private readonly _onDidExecuteCommand = new Emitter<void>();
	readonly onDidExecuteCommand = this._onDidExecuteCommand.event;

	constructor(
		@ICommandService private readonly commandService: ICommandService
	) {
	}

	renderTemplate(container: HTMLElement): IActionsColumnTemplateData {
		const element = DOM.append(container, $('.actions'));
		const actionBar = new ActionBar(element);
		return { actionBar };
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: IActionsColumnTemplateData): void {
		templateData.actionBar.clear();
		const actions: IAction[] = [];
		if (modelItemEntry.modelEntry.managementCommand) {
			actions.push(this.createManageAction(modelItemEntry));
		}
		templateData.actionBar.push(actions, { icon: true });
	}

	private createManageAction(modelItemEntry: IModelItemEntry): IAction {
		return {
			label: localize('manageModel', "Manage {0}", modelItemEntry.modelEntry.vendorDisplayName),
			tooltip: localize('manageModel', "Manage {0}", modelItemEntry.modelEntry.vendorDisplayName),
			class: ThemeIcon.asClassName(Codicon.gear),
			enabled: true,
			id: 'manageModel',
			run: async () => {
				await this.commandService.executeCommand(modelItemEntry.modelEntry.managementCommand!, modelItemEntry.modelEntry.vendor);
				this._onDidExecuteCommand.fire();
			}
		};
	}

	disposeTemplate(templateData: IActionsColumnTemplateData): void {
		templateData.actionBar.dispose();
	}
}

interface IProviderColumnTemplateData {
	providerLabel: HighlightedLabel;
}

class ProviderColumnRenderer implements ITableRenderer<IModelItemEntry, IProviderColumnTemplateData> {
	static readonly TEMPLATE_ID = 'provider';

	readonly templateId: string = ProviderColumnRenderer.TEMPLATE_ID;

	constructor() { }

	renderTemplate(container: HTMLElement): IProviderColumnTemplateData {
		const providerLabel = new HighlightedLabel(container);
		return { providerLabel };
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: IProviderColumnTemplateData): void {
		const { modelEntry, providerMatches, vendorMatches } = modelItemEntry;
		const matches = providerMatches || vendorMatches;
		templateData.providerLabel.set(modelEntry.vendorDisplayName, matches);
	}

	disposeTemplate(templateData: IProviderColumnTemplateData): void {
		templateData.providerLabel.dispose();
	}
}

interface IModelNameColumnTemplateData {
	container: HTMLElement;
	statusIcon: HTMLElement;
	nameLabel: HighlightedLabel;
	disposables: DisposableStore;
}

class ModelNameColumnRenderer implements ITableRenderer<IModelItemEntry, IModelNameColumnTemplateData> {
	static readonly TEMPLATE_ID = 'modelName';

	readonly templateId: string = ModelNameColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly hoverService: IHoverService
	) { }

	renderTemplate(container: HTMLElement): IModelNameColumnTemplateData {
		const nameContainer = DOM.append(container, $('.model-name-container'));
		const statusIcon = DOM.append(nameContainer, $('.model-status-icon'));
		const nameLabel = new HighlightedLabel(DOM.append(nameContainer, $('.model-name')));

		return {
			container,
			statusIcon,
			nameLabel,
			disposables: new DisposableStore(),
		};
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: IModelNameColumnTemplateData): void {
		const { modelEntry, modelNameMatches } = modelItemEntry;
		// Clear previous disposables
		templateData.disposables.clear();

		DOM.clearNode(templateData.statusIcon);
		templateData.statusIcon.className = 'model-status-icon';
		if (modelEntry.metadata.statusIcon) {
			templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(modelEntry.metadata.statusIcon));
			templateData.statusIcon.style.display = '';
		} else {
			templateData.statusIcon.style.display = 'none';
		}

		templateData.nameLabel.set(modelEntry.metadata.name, modelNameMatches);

		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		markdown.appendMarkdown(`**${modelItemEntry.modelEntry.metadata.name}**`);
		if (modelItemEntry.modelEntry.metadata.id !== modelItemEntry.modelEntry.metadata.version) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${modelItemEntry.modelEntry.metadata.id}@${modelItemEntry.modelEntry.metadata.version}_&nbsp;</span>`);
		} else {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${modelItemEntry.modelEntry.metadata.id}_&nbsp;</span>`);
		}
		markdown.appendText(`\n`);

		if (modelItemEntry.modelEntry.metadata.statusIcon && modelItemEntry.modelEntry.metadata.tooltip) {
			if (modelItemEntry.modelEntry.metadata.statusIcon) {
				markdown.appendMarkdown(`$(${modelItemEntry.modelEntry.metadata.statusIcon.id})&nbsp;`);
			}
			markdown.appendMarkdown(`${modelItemEntry.modelEntry.metadata.tooltip}`);
			markdown.appendText(`\n`);
		}

		templateData.disposables.add(this.hoverService.setupDelayedHover(templateData.container!, () => ({
			content: markdown,
			appearance: {
				showPointer: true,
				skipFadeInAnimation: true,
			},
			position: {
				hoverPosition: HoverPosition.BELOW
			}
		})));
	}

	disposeTemplate(templateData: IModelNameColumnTemplateData): void {
		templateData.disposables.dispose();
		templateData.nameLabel.dispose();
	}
}

interface ICostColumnTemplateData {
	multiplierElement: HTMLElement;
}

class MultiplierColumnRenderer implements ITableRenderer<IModelItemEntry, ICostColumnTemplateData> {
	static readonly TEMPLATE_ID = 'multiplier';

	readonly templateId: string = MultiplierColumnRenderer.TEMPLATE_ID;

	constructor() { }

	renderTemplate(container: HTMLElement): ICostColumnTemplateData {
		const multiplierElement = DOM.append(container, $('.model-multiplier'));
		return { multiplierElement };
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: ICostColumnTemplateData): void {
		templateData.multiplierElement.textContent = (modelItemEntry.modelEntry.metadata.detail && modelItemEntry.modelEntry.metadata.detail.trim().toLowerCase() !== modelItemEntry.modelEntry.vendor.trim().toLowerCase()) ? modelItemEntry.modelEntry.metadata.detail : '-';
	}

	disposeTemplate(templateData: ICostColumnTemplateData): void { }
}

interface ITokenLimitsColumnTemplateData {
	container: HTMLElement;
	tokenLimitsElement: HTMLElement;
	disposables: DisposableStore;
}

class TokenLimitsColumnRenderer implements ITableRenderer<IModelItemEntry, ITokenLimitsColumnTemplateData> {
	static readonly TEMPLATE_ID = 'tokenLimits';

	readonly templateId: string = TokenLimitsColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly hoverService: IHoverService
	) { }

	renderTemplate(container: HTMLElement): ITokenLimitsColumnTemplateData {
		const tokenLimitsElement = DOM.append(container, $('.model-token-limits'));
		return { container, tokenLimitsElement, disposables: new DisposableStore() };
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: ITokenLimitsColumnTemplateData): void {
		const { modelEntry } = modelItemEntry;
		DOM.clearNode(templateData.tokenLimitsElement);
		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		if (modelEntry.metadata.maxInputTokens || modelEntry.metadata.maxOutputTokens) {
			let addSeparator = false;
			markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
			if (modelEntry.metadata.maxInputTokens) {
				const inputDiv = DOM.append(templateData.tokenLimitsElement, $('.token-limit-item'));
				DOM.append(inputDiv, $('span.codicon.codicon-arrow-down'));
				const inputText = DOM.append(inputDiv, $('span'));
				inputText.textContent = formatTokenCount(modelEntry.metadata.maxInputTokens);

				markdown.appendMarkdown(`$(arrow-down) ${formatTokenCount(modelEntry.metadata.maxInputTokens)} (${localize('models.input', 'Input')})`);
				addSeparator = true;
			}
			if (modelEntry.metadata.maxOutputTokens) {
				const outputDiv = DOM.append(templateData.tokenLimitsElement, $('.token-limit-item'));
				DOM.append(outputDiv, $('span.codicon.codicon-arrow-up'));
				const outputText = DOM.append(outputDiv, $('span'));
				outputText.textContent = formatTokenCount(modelEntry.metadata.maxOutputTokens);
				if (addSeparator) {
					markdown.appendText(`  |  `);
				}
				markdown.appendMarkdown(`$(arrow-up) ${formatTokenCount(modelEntry.metadata.maxOutputTokens)} (${localize('models.output', 'Output')})`);
			}
		}

		templateData.disposables.add(this.hoverService.setupDelayedHover(templateData.container, () => ({
			content: markdown,
			appearance: {
				showPointer: true,
				skipFadeInAnimation: true,
			},
			position: {
				hoverPosition: HoverPosition.BELOW
			}
		})));
	}

	disposeTemplate(templateData: ITokenLimitsColumnTemplateData): void { }
}

interface ICapabilitiesColumnTemplateData {
	metadataRow: HTMLElement;
}

class CapabilitiesColumnRenderer implements ITableRenderer<IModelItemEntry, ICapabilitiesColumnTemplateData> {
	static readonly TEMPLATE_ID = 'capabilities';

	readonly templateId: string = CapabilitiesColumnRenderer.TEMPLATE_ID;

	constructor() { }

	renderTemplate(container: HTMLElement): ICapabilitiesColumnTemplateData {
		const metadataRow = DOM.append(container, $('.model-metadata'));
		return { metadataRow };
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: ICapabilitiesColumnTemplateData): void {
		const { modelEntry } = modelItemEntry;
		DOM.clearNode(templateData.metadataRow);

		if (modelEntry.metadata.isDefault) {
			const defaultBadge = DOM.append(templateData.metadataRow, $('.model-badge.badge'));
			defaultBadge.textContent = localize('models.default', 'Default');
		}

		if (modelEntry.metadata.capabilities?.toolCalling) {
			const toolsBadge = DOM.append(templateData.metadataRow, $('.model-badge.badge'));
			toolsBadge.textContent = localize('models.tools', 'Tools');
		}

		if (modelEntry.metadata.capabilities?.vision) {
			const visionBadge = DOM.append(templateData.metadataRow, $('.model-badge.badge'));
			visionBadge.textContent = localize('models.vision', 'Vision');
		}
	}

	disposeTemplate(templateData: ICapabilitiesColumnTemplateData): void { }
}

interface IVisibilityColumnTemplateData {
	checkbox: Checkbox;
	disposables: IDisposable[];
}

class VisibilityColumnRenderer implements ITableRenderer<IModelItemEntry, IVisibilityColumnTemplateData> {
	static readonly TEMPLATE_ID = 'visibility';

	readonly templateId: string = VisibilityColumnRenderer.TEMPLATE_ID;

	private readonly _onDidChangeModel = new Emitter<{ modelId: string; visible: boolean }>();
	readonly onDidChangeModel = this._onDidChangeModel.event;

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService
	) { }

	renderTemplate(container: HTMLElement): IVisibilityColumnTemplateData {
		const parent = DOM.append(container, $('.visibility-column'));
		const checkbox = new Checkbox('', false, defaultCheckboxStyles);
		parent.appendChild(checkbox.domNode);

		return {
			checkbox,
			disposables: [],
		};
	}

	renderElement(modelItemEntry: IModelItemEntry, index: number, templateData: IVisibilityColumnTemplateData): void {
		const { modelEntry } = modelItemEntry;
		templateData.disposables.forEach(d => d.dispose());
		templateData.disposables = [];

		const isVisible = modelEntry.metadata.isUserSelectable ?? false;
		templateData.checkbox.checked = isVisible;
		templateData.checkbox.setTitle(isVisible ? localize('models.visible', 'Visible') : localize('models.hidden', 'Hidden'));

		const checkboxListener = templateData.checkbox.onChange(() => {
			const newVisibility = templateData.checkbox.checked;
			templateData.checkbox.setTitle(newVisibility ? localize('models.visible', 'Visible') : localize('models.hidden', 'Hidden'));

			this.languageModelsService.updateModelPickerPreference(modelEntry.identifier, newVisibility);
			this._onDidChangeModel.fire({ modelId: modelEntry.identifier, visible: newVisibility });
		});
		templateData.disposables.push(checkboxListener);
	}

	disposeTemplate(templateData: IVisibilityColumnTemplateData): void {
		templateData.disposables.forEach(d => d.dispose());
		templateData.checkbox.dispose();
	}
}

function formatTokenCount(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	} else if (count >= 1000) {
		return `${(count / 1000).toFixed(0)}K`;
	}
	return count.toString();
}

export class ChatModelsWidget extends Disposable {

	private readonly _onDidChangeModel = new Emitter<{ modelId: string; visible: boolean }>();
	readonly onDidChangeModel = this._onDidChangeModel.event;

	private readonly _onDidChangeContentHeight = new Emitter<number>();
	readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	readonly element: HTMLElement;
	private searchWidget!: SuggestEnabledInput;
	private searchActionsContainer!: HTMLElement;
	private table!: WorkbenchTable<IModelItemEntry>;
	private tableContainer!: HTMLElement;
	private addButton!: Button;
	private dropdownActions: IAction[] = [];
	private viewModel: ChatModelsViewModel;
	private delayedFiltering: Delayer<void>;

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService extensionService: IExtensionService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this.delayedFiltering = new Delayer<void>(300);
		this.viewModel = this._register(this.instantiationService.createInstance(ChatModelsViewModel));
		this.element = DOM.$('.models-widget');
		this.create(this.element);
		extensionService.whenInstalledExtensionsRegistered().then(async () => {
			await this.viewModel.resolve();
			this.refreshTable();
		});

		// Refresh when model entries change (e.g., due to entitlement changes)
		this._register(this.viewModel.onDidChangeModelEntries(() => {
			this.refreshTable();
		}));
	}

	private create(container: HTMLElement): void {
		// Search and button container
		const searchAndButtonContainer = DOM.append(container, $('.models-search-and-button-container'));

		const placeholder = localize('Search.FullTextSearchPlaceholder', "Type to search...");
		const searchContainer = DOM.append(searchAndButtonContainer, $('.models-search-container'));
		this.searchWidget = this._register(this.instantiationService.createInstance(
			SuggestEnabledInput,
			'chatModelsWidget.searchbox',
			searchContainer,
			{
				triggerCharacters: ['@', ':'],
				provideResults: (query: string) => {
					const queryParts = query.split(/\s/g);
					const lastPart = queryParts[queryParts.length - 1];

					if (lastPart.startsWith('@provider:')) {
						// Suggest provider names
						const vendors = this.languageModelsService.getVendors();
						return vendors.map(v => `@provider:"${v.displayName}"`);
					} else if (lastPart.startsWith('@capability:')) {
						// Suggest capabilities
						return SEARCH_SUGGESTIONS.CAPABILITIES;
					} else if (lastPart.startsWith('@visible:')) {
						// Suggest visibility filters
						return SEARCH_SUGGESTIONS.VISIBILITY;
					} else if (lastPart.startsWith('@')) {
						// Suggest filter types
						return SEARCH_SUGGESTIONS.FILTER_TYPES;
					}
					return [];
				}
			},
			placeholder,
			'chatModelsWidget:searchinput',
			{
				placeholderText: placeholder,
				styleOverrides: {
					inputBorder: settingsTextInputBorder
				}
			}
		));
		this._register(this.searchWidget.onInputDidChange(() => this.filterModels()));

		// Create actions
		const filterAction = new ModelsFilterAction();
		const refreshAction = this._register(new Action(
			'workbench.models.refresh',
			localize('refresh', "Refresh"),
			ThemeIcon.asClassName(Codicon.refresh),
			true,
			async () => {
				await this.refresh();
			}
		));
		const clearSearchAction = this._register(new Action(
			'workbench.models.clearSearch',
			localize('clearSearch', "Clear Search"),
			ThemeIcon.asClassName(preferencesClearInputIcon),
			false,
			async () => {
				this.searchWidget.setValue('');
				this.searchWidget.focus();
			}
		));

		// Update clear action state when search text changes
		this._register(this.searchWidget.onInputDidChange(() => {
			clearSearchAction.enabled = !!this.searchWidget.getValue();
		}));

		// Handle ESC key to clear search
		this._register(this.searchWidget.inputWidget.onKeyDown((e) => {
			if (e.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				if (this.searchWidget.getValue()) {
					this.searchWidget.setValue('');
					this.searchWidget.focus();
				}
			}
		}));

		// Add toolbar with all actions
		this.searchActionsContainer = DOM.append(searchContainer, $('.models-search-actions'));
		const actions = [clearSearchAction, refreshAction, filterAction];
		const toolBar = this._register(new ToolBar(this.searchActionsContainer, this.contextMenuService, {
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action.id === filterAction.id) {
					return this.instantiationService.createInstance(
						ModelsSearchFilterDropdownMenuActionViewItem,
						action,
						options,
						this.searchWidget,
						() => this.languageModelsService.getVendors()
					);
				}
				return undefined;
			},
			getKeyBinding: () => undefined
		}));
		toolBar.setActions(actions);

		// Add padding to input box for toolbar
		this.searchWidget.inputWidget.getContainerDomNode().style.paddingRight = `${DOM.getTotalWidth(this.searchActionsContainer) + 12}px`;

		// Enable Model Provider button next to search
		const buttonContainer = DOM.append(searchAndButtonContainer, $('.section-title-actions'));
		const buttonOptions: IButtonOptions = {
			...defaultButtonStyles,
			supportIcons: true,
		};
		this.addButton = this._register(new Button(buttonContainer, buttonOptions));
		this.addButton.label = `$(${Codicon.add.id}) ${localize('models.enableModelProvider', 'Add Model')}`;
		this.addButton.element.classList.add('models-add-model-button');
		this.addButton.enabled = false;
		this._register(this.addButton.onDidClick((e) => {
			if (this.dropdownActions.length > 0) {
				this.contextMenuService.showContextMenu({
					getAnchor: () => this.addButton.element,
					getActions: () => this.dropdownActions,
				});
			}
		}));

		// Table container
		this.tableContainer = DOM.append(container, $('.models-table-container'));

		// Create table
		const actionsColumnRenderer = this.instantiationService.createInstance(ActionsColumnRenderer);
		const providerColumnRenderer = this.instantiationService.createInstance(ProviderColumnRenderer);
		const modelNameColumnRenderer = this.instantiationService.createInstance(ModelNameColumnRenderer);
		const costColumnRenderer = this.instantiationService.createInstance(MultiplierColumnRenderer);
		const tokenLimitsColumnRenderer = this.instantiationService.createInstance(TokenLimitsColumnRenderer);
		const capabilitiesColumnRenderer = this.instantiationService.createInstance(CapabilitiesColumnRenderer);
		const visibilityColumnRenderer = this.instantiationService.createInstance(VisibilityColumnRenderer);

		this._register(visibilityColumnRenderer.onDidChangeModel(e => {
			this._onDidChangeModel.fire(e);
			// Refresh the view model to get updated data
			this.viewModel.resolve().then(() => {
				this.refreshTable();
			});
		}));

		this._register(actionsColumnRenderer.onDidExecuteCommand(() => {
			// Refresh the view model after manage command execution
			this.viewModel.resolve().then(() => {
				this.refreshTable();
			});
		}));

		this.table = this._register(this.instantiationService.createInstance(
			WorkbenchTable,
			'ModelsWidget',
			this.tableContainer,
			new Delegate(),
			[
				{
					label: '',
					tooltip: '',
					weight: 0,
					minimumWidth: 40,
					maximumWidth: 40,
					templateId: ActionsColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				},
				{
					label: localize('modelName', 'Name'),
					tooltip: '',
					weight: 0.28,
					minimumWidth: 200,
					templateId: ModelNameColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				},
				{
					label: localize('provider', 'Provider'),
					tooltip: '',
					weight: 0.12,
					minimumWidth: 100,
					templateId: ProviderColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				},
				{
					label: localize('capabilities', 'Capabilities'),
					tooltip: '',
					weight: 0.24,
					minimumWidth: 180,
					templateId: CapabilitiesColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				},
				{
					label: localize('tokenLimits', 'Context Size'),
					tooltip: '',
					weight: 0.18,
					minimumWidth: 140,
					templateId: TokenLimitsColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				},
				{
					label: localize('cost', 'Multiplier'),
					tooltip: '',
					weight: 0.08,
					minimumWidth: 60,
					templateId: MultiplierColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				},
				{
					label: localize('visibility', 'Visible'),
					tooltip: '',
					weight: 0.1,
					minimumWidth: 64,
					maximumWidth: 64,
					templateId: VisibilityColumnRenderer.TEMPLATE_ID,
					project(row: IModelItemEntry): IModelItemEntry { return row; }
				},
			],
			[
				actionsColumnRenderer,
				providerColumnRenderer,
				modelNameColumnRenderer,
				costColumnRenderer,
				tokenLimitsColumnRenderer,
				capabilitiesColumnRenderer,
				visibilityColumnRenderer,
			],
			{
				identityProvider: { getId: (e: IModelItemEntry) => e.id },
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (e: IModelItemEntry) => localize('model.ariaLabel', '{0} from {1}', e.modelEntry.metadata.name, e.modelEntry.vendorDisplayName),
					getWidgetAriaLabel: () => localize('modelsTable.ariaLabel', 'Language Models')
				},
				multipleSelectionSupport: false,
				setRowLineHeight: false,
				openOnSingleClick: false,
				alwaysConsumeMouseWheel: false,
			}
		)) as WorkbenchTable<IModelItemEntry>;
	}

	private filterModels(): void {
		this.delayedFiltering.trigger(() => this.refreshTable());
	}

	private async refreshTable(): Promise<void> {
		// Get all models from the view model with current search value
		const searchValue = this.searchWidget.getValue();
		const modelItems = this.viewModel.fetch(searchValue);

		// Get vendors without models for the add button
		const vendors = this.languageModelsService.getVendors();
		const vendorsWithModels = new Set(modelItems.map(item => item.modelEntry.vendor));
		const vendorsWithoutModels = vendors.filter(v => !vendorsWithModels.has(v.vendor));

		this.table.splice(0, this.table.length, modelItems);

		this._onDidChangeContentHeight.fire(this.getContentHeight());

		// Check if user has a plan assigned (not Unknown or Available)
		const hasPlan = this.chatEntitlementService.entitlement !== ChatEntitlement.Unknown &&
			this.chatEntitlementService.entitlement !== ChatEntitlement.Available;
		this.addButton.enabled = hasPlan && vendorsWithoutModels.length > 0;

		// Update dropdown actions with provider names
		this.dropdownActions = vendorsWithoutModels.map(vendor => toAction({
			id: `enable-${vendor.vendor}`,
			label: vendor.displayName,
			run: async () => {
				await this.enableProvider(vendor.vendor);
			}
		}));
	}

	private async enableProvider(vendorId: string): Promise<void> {
		await this.languageModelsService.selectLanguageModels({ vendor: vendorId }, true);
		await this.viewModel.resolve();
		this.refreshTable();
	}

	private getContentHeight(): number {
		return HEADER_HEIGHT + (this.table.length * ROW_HEIGHT) + 40;
	}

	public layout(height: number, width: number): void {
		this.searchWidget.layout(new DOM.Dimension(width - 100 - 20, 22));
		this.table.layout(height - 40);
	}

	public focusSearch(): void {
		this.searchWidget.focus();
	}

	public search(filter: string): void {
		this.focusSearch();
		this.searchWidget.setValue(filter);
	}

	public clearSearch(): void {
		this.searchWidget.setValue('');
	}

	public async refresh(): Promise<void> {
		await this.viewModel.resolve();
		this.refreshTable();
	}
}
