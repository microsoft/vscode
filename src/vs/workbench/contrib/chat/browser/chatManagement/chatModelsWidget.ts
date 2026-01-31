/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatModelsWidget.css';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button, IButtonOptions } from '../../../../../base/browser/ui/button/button.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ILanguageModelsService, ILanguageModelProviderDescriptor } from '../../../chat/common/languageModels.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { ITableVirtualDelegate, ITableRenderer } from '../../../../../base/browser/ui/table/table.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IAction, toAction, Action, Separator, SubmenuAction } from '../../../../../base/common/actions.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatModelsViewModel, ILanguageModel, ILanguageModelEntry, ILanguageModelProviderEntry, ILanguageModelGroupEntry, SEARCH_SUGGESTIONS, isLanguageModelProviderEntry, isLanguageModelGroupEntry, ChatModelGroup, IViewModelEntry, isStatusEntry, IStatusEntry } from './chatModelsViewModel.js';
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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { CONTEXT_MODELS_SEARCH_FOCUS } from '../../common/constants.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../../base/common/severity.js';

const $ = DOM.$;

const HEADER_HEIGHT = 30;
const VENDOR_ROW_HEIGHT = 30;
const MODEL_ROW_HEIGHT = 26;

export function getModelHoverContent(model: ILanguageModel): MarkdownString {
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

	if (model.metadata.multiplier) {
		markdown.appendMarkdown(`${localize('models.cost', 'Multiplier')}: `);
		markdown.appendMarkdown(model.metadata.multiplier);
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
	}
}

interface IFilterQuery {
	/** The primary filter query string */
	query: string;
	/** Alternative query strings that are treated as synonyms of the primary query */
	synonyms?: string[];
	/** Query strings that should be removed when adding this filter (mutually exclusive filters) */
	excludes?: string[];
}

function toggleFilter(currentQuery: string, filter: IFilterQuery): string {
	const { query, synonyms = [], excludes = [] } = filter;
	const allSynonyms = [query, ...synonyms];
	const isChecked = allSynonyms.some(q => currentQuery.includes(q));
	const hasExcludedQuery = excludes.some(q => currentQuery.includes(q));

	if (isChecked) {
		// Query or synonym is already set, remove all of them (toggle off)
		let queryWithRemovedFilter = currentQuery;
		for (const q of allSynonyms) {
			queryWithRemovedFilter = queryWithRemovedFilter.replace(q, '');
		}
		return queryWithRemovedFilter.replace(/\s+/g, ' ').trim();
	} else if (hasExcludedQuery) {
		// An excluded query is set, replace it with the new query
		let newQuery = currentQuery;
		for (const q of excludes) {
			newQuery = newQuery.replace(q, '');
		}
		newQuery = newQuery.replace(/\s+/g, ' ').trim();
		return newQuery ? `${newQuery} ${query}` : query;
	} else {
		// No filter is set, add the new query
		const trimmedQuery = currentQuery.trim();
		return trimmedQuery ? `${trimmedQuery} ${query}` : query;
	}
}

class ModelsSearchFilterDropdownMenuActionViewItem extends DropdownMenuActionViewItem {

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly search: {
			getValue(): string;
			setValue(newValue: string): void;
		},
		private readonly viewModel: ChatModelsViewModel,
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

	private createGroupByAction(grouping: ChatModelGroup, label: string): IAction {
		return {
			id: `groupBy.${grouping}`,
			label,
			class: undefined,
			enabled: true,
			tooltip: localize('groupByTooltip', "Group by {0}", label),
			checked: this.viewModel.groupBy === grouping,
			run: () => {
				this.viewModel.groupBy = grouping;
			}
		};
	}

	private createProviderAction(vendor: string, displayName: string): IAction {
		const query = `@provider:"${displayName}"`;
		const currentQuery = this.search.getValue();
		const isChecked = currentQuery.includes(query) || currentQuery.includes(`@provider:${vendor}`);

		return {
			id: `provider-${vendor}`,
			label: displayName,
			tooltip: localize('filterByProvider', "Filter by {0}", displayName),
			class: undefined,
			enabled: true,
			checked: isChecked,
			run: () => this.toggleFilterAndSearch({ query, synonyms: [`@provider:${vendor}`] })
		};
	}

	private createCapabilityAction(capability: string, label: string): IAction {
		const query = `@capability:${capability}`;
		const currentQuery = this.search.getValue();
		const isChecked = currentQuery.includes(query);

		return {
			id: `capability-${capability}`,
			label,
			tooltip: localize('filterByCapability', "Filter by {0}", label),
			class: undefined,
			enabled: true,
			checked: isChecked,
			run: () => this.toggleFilterAndSearch({ query })
		};
	}

	private createVisibleAction(visible: boolean, label: string): IAction {
		const query = `@visible:${visible}`;
		const currentQuery = this.search.getValue();
		const isChecked = currentQuery.includes(query);

		return {
			id: `visible-${visible}`,
			label,
			tooltip: localize('filterByVisible', "Filter by {0}", label),
			class: undefined,
			enabled: true,
			checked: isChecked,
			run: () => this.toggleFilterAndSearch({ query, excludes: [`@visible:${!visible}`] })
		};
	}

	private toggleFilterAndSearch(filter: IFilterQuery): void {
		const currentQuery = this.search.getValue();
		const newQuery = toggleFilter(currentQuery, filter);
		this.search.setValue(newQuery);
	}

	private getActions(): IAction[] {
		const actions: IAction[] = [];

		// Capability filters
		actions.push(
			this.createCapabilityAction('tools', localize('capability.tools', "Tools")),
			this.createCapabilityAction('vision', localize('capability.vision', "Vision")),
			this.createCapabilityAction('agent', localize('capability.agent', "Agent Mode"))
		);

		// Visibility filters
		actions.push(new Separator());
		actions.push(this.createVisibleAction(true, localize('filter.visible', "Visible in Chat Model Picker")));
		actions.push(this.createVisibleAction(false, localize('filter.hidden', "Hidden in Chat Model Picker")));

		// Provider filters - only show providers with configured models
		const configuredVendors = this.viewModel.getConfiguredVendors();
		if (configuredVendors.length > 1) {
			actions.push(new Separator());
			actions.push(...configuredVendors.map(vendor => this.createProviderAction(vendor.vendor.vendor, vendor.group.name)));
		}

		// Group By
		actions.push(new Separator());
		const groupByActions: IAction[] = [];
		groupByActions.push(this.createGroupByAction(ChatModelGroup.Vendor, localize('groupBy.provider', "Provider")));
		groupByActions.push(this.createGroupByAction(ChatModelGroup.Visibility, localize('groupBy.visibility', "Visibility (Chat Model Picker)")));
		actions.push(new SubmenuAction('groupBy', localize('groupBy', "Group By"), groupByActions));

		return actions;
	}
}

class Delegate implements ITableVirtualDelegate<IViewModelEntry> {
	readonly headerRowHeight = HEADER_HEIGHT;
	getHeight(element: IViewModelEntry): number {
		return isLanguageModelProviderEntry(element) || isLanguageModelGroupEntry(element) ? VENDOR_ROW_HEIGHT : MODEL_ROW_HEIGHT;
	}
}

interface IModelTableColumnTemplateData {
	readonly container: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

abstract class ModelsTableColumnRenderer<T extends IModelTableColumnTemplateData> implements ITableRenderer<IViewModelEntry, T> {
	abstract readonly templateId: string;
	abstract renderTemplate(container: HTMLElement): T;

	renderElement(element: IViewModelEntry, index: number, templateData: T): void {
		templateData.elementDisposables.clear();
		const isVendor = isLanguageModelProviderEntry(element);
		const isGroup = isLanguageModelGroupEntry(element);
		const isStatus = isStatusEntry(element);
		templateData.container.classList.add('models-table-column');
		templateData.container.parentElement!.classList.toggle('models-vendor-row', isVendor || isGroup);
		templateData.container.parentElement!.classList.toggle('models-model-row', !isVendor && !isGroup);
		templateData.container.parentElement!.classList.toggle('models-status-row', isStatus);
		templateData.container.parentElement!.classList.toggle('model-hidden', !isVendor && !isGroup && !isStatus && !element.model.visible);
		if (isVendor) {
			this.renderVendorElement(element, index, templateData);
		} else if (isGroup) {
			this.renderGroupElement(element, index, templateData);
		} else if (isStatus) {
			this.renderStatusElement(element, index, templateData);
		} else {
			this.renderModelElement(element, index, templateData);
		}
	}

	abstract renderVendorElement(element: ILanguageModelProviderEntry, index: number, templateData: T): void;
	abstract renderGroupElement(element: ILanguageModelGroupEntry, index: number, templateData: T): void;
	abstract renderModelElement(element: ILanguageModelEntry, index: number, templateData: T): void;

	protected renderStatusElement(element: IStatusEntry, index: number, templateData: T): void { }

	disposeTemplate(templateData: T): void {
		templateData.elementDisposables.dispose();
		templateData.disposables.dispose();
	}
}

interface IToggleCollapseColumnTemplateData extends IModelTableColumnTemplateData {
	readonly listRowElement: HTMLElement | null;
	readonly container: HTMLElement;
	readonly actionBar: ActionBar;
}

class GutterColumnRenderer extends ModelsTableColumnRenderer<IToggleCollapseColumnTemplateData> {

	static readonly TEMPLATE_ID = 'gutter';

	readonly templateId: string = GutterColumnRenderer.TEMPLATE_ID;

	constructor(
		private readonly viewModel: ChatModelsViewModel,
	) {
		super();
	}

	renderTemplate(container: HTMLElement): IToggleCollapseColumnTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('models-gutter-column');
		const actionBar = disposables.add(new ActionBar(container));
		return {
			listRowElement: container.parentElement?.parentElement ?? null,
			container,
			actionBar,
			disposables,
			elementDisposables
		};
	}

	override renderElement(entry: IViewModelEntry, index: number, templateData: IToggleCollapseColumnTemplateData): void {
		templateData.actionBar.clear();
		super.renderElement(entry, index, templateData);
	}

	override renderVendorElement(entry: ILanguageModelProviderEntry, index: number, templateData: IToggleCollapseColumnTemplateData): void {
		this.renderCollapsableElement(entry, templateData);
	}

	override renderGroupElement(entry: ILanguageModelGroupEntry, index: number, templateData: IToggleCollapseColumnTemplateData): void {
		this.renderCollapsableElement(entry, templateData);
	}

	private renderCollapsableElement(entry: ILanguageModelProviderEntry | ILanguageModelGroupEntry, templateData: IToggleCollapseColumnTemplateData): void {
		if (templateData.listRowElement) {
			templateData.listRowElement.setAttribute('aria-expanded', entry.collapsed ? 'false' : 'true');
		}

		const label = entry.collapsed ? localize('expand', 'Expand') : localize('collapse', 'Collapse');
		const toggleCollapseAction = {
			id: 'toggleCollapse',
			label,
			tooltip: label,
			enabled: true,
			class: ThemeIcon.asClassName(entry.collapsed ? Codicon.chevronRight : Codicon.chevronDown),
			run: () => this.viewModel.toggleCollapsed(entry)
		};
		templateData.actionBar.push(toggleCollapseAction, { icon: true, label: false });
	}

	override renderModelElement(entry: ILanguageModelEntry, index: number, templateData: IToggleCollapseColumnTemplateData): void {
		const { model: modelEntry } = entry;
		const isVisible = modelEntry.visible;
		const toggleVisibilityAction = toAction({
			id: 'toggleVisibility',
			label: isVisible ? localize('models.hide', 'Hide') : localize('models.show', 'Show'),
			class: `model-visibility-toggle ${isVisible ? `${ThemeIcon.asClassName(Codicon.eye)} model-visible` : `${ThemeIcon.asClassName(Codicon.eyeClosed)} model-hidden`}`,
			tooltip: isVisible ? localize('models.visible', 'Hide in the chat model picker') : localize('models.hidden', 'Show in the chat model picker'),
			checked: !isVisible,
			run: async () => this.viewModel.toggleVisibility(entry)
		});
		templateData.actionBar.push(toggleVisibilityAction, { icon: true, label: false });
	}
}

interface IModelNameColumnTemplateData extends IModelTableColumnTemplateData {
	readonly statusIcon: HTMLElement;
	readonly nameLabel: HighlightedLabel;
	readonly modelStatusIcon: HTMLElement;
	readonly actionBar: ActionBar;
}

class ModelNameColumnRenderer extends ModelsTableColumnRenderer<IModelNameColumnTemplateData> {
	static readonly TEMPLATE_ID = 'modelName';

	readonly templateId: string = ModelNameColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly hoverService: IHoverService
	) {
		super();
	}

	renderTemplate(container: HTMLElement): IModelNameColumnTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		const nameContainer = DOM.append(container, $('.model-name-container'));
		const statusIcon = DOM.append(nameContainer, $('.status-icon'));
		const nameLabel = disposables.add(new HighlightedLabel(DOM.append(nameContainer, $('.model-name'))));
		const modelStatusIcon = DOM.append(nameContainer, $('.model-status-icon'));
		const actionBar = disposables.add(new ActionBar(DOM.append(nameContainer, $('.model-name-actions'))));
		return {
			container,
			statusIcon,
			nameLabel,
			modelStatusIcon,
			actionBar,
			disposables,
			elementDisposables
		};
	}

	override renderElement(entry: IViewModelEntry, index: number, templateData: IModelNameColumnTemplateData): void {
		DOM.clearNode(templateData.modelStatusIcon);
		templateData.actionBar.clear();
		templateData.nameLabel.element.classList.remove('error-status', 'warning-status', 'info-status');
		super.renderElement(entry, index, templateData);
	}

	override renderVendorElement(entry: ILanguageModelProviderEntry, index: number, templateData: IModelNameColumnTemplateData): void {
		templateData.nameLabel.set(entry.vendorEntry.group.name, undefined);
	}

	override renderGroupElement(entry: ILanguageModelGroupEntry, index: number, templateData: IModelNameColumnTemplateData): void {
		templateData.nameLabel.set(entry.label, undefined);
	}

	override renderModelElement(entry: ILanguageModelEntry, index: number, templateData: IModelNameColumnTemplateData): void {
		const { model: modelEntry, modelNameMatches } = entry;

		templateData.statusIcon.style.display = 'none';
		templateData.modelStatusIcon.className = 'model-status-icon';
		if (modelEntry.metadata.statusIcon) {
			templateData.modelStatusIcon.classList.add(...ThemeIcon.asClassNameArray(modelEntry.metadata.statusIcon));
			templateData.modelStatusIcon.style.display = '';
		} else {
			templateData.modelStatusIcon.style.display = 'none';
		}

		templateData.nameLabel.set(modelEntry.metadata.name, modelNameMatches);

		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		markdown.appendMarkdown(`**${entry.model.metadata.name}**`);
		if (entry.model.metadata.id !== entry.model.metadata.version) {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${entry.model.metadata.id}@${entry.model.metadata.version}_&nbsp;</span>`);
		} else {
			markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${entry.model.metadata.id}_&nbsp;</span>`);
		}
		markdown.appendText(`\n`);

		if (entry.model.metadata.statusIcon && entry.model.metadata.tooltip) {
			if (entry.model.metadata.statusIcon) {
				markdown.appendMarkdown(`$(${entry.model.metadata.statusIcon.id})&nbsp;`);
			}
			markdown.appendMarkdown(`${entry.model.metadata.tooltip}`);
			markdown.appendText(`\n`);
		}

		if (!entry.model.visible) {
			markdown.appendMarkdown(`\n\n${localize('models.userSelectable', 'This model is hidden in the chat model picker')}`);
		}

		templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container!, () => ({
			content: markdown,
			appearance: {
				compact: true,
				skipFadeInAnimation: true,
			}
		})));
	}

	protected override renderStatusElement(entry: IStatusEntry, index: number, templateData: IModelNameColumnTemplateData): void {
		templateData.statusIcon.style.display = '';
		templateData.statusIcon.className = 'status-icon';
		switch (entry.severity) {
			case Severity.Error:
				templateData.nameLabel.element.classList.add('error-status');
				templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
				break;
			case Severity.Warning:
				templateData.nameLabel.element.classList.add('warning-status');
				templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
				break;
			case Severity.Info:
				templateData.nameLabel.element.classList.add('info-status');
				templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
				break;
		}
		templateData.nameLabel.set(entry.message, undefined, entry.message);
	}
}

interface IMultiplierColumnTemplateData extends IModelTableColumnTemplateData {
	readonly multiplierElement: HTMLElement;
}

class MultiplierColumnRenderer extends ModelsTableColumnRenderer<IMultiplierColumnTemplateData> {
	static readonly TEMPLATE_ID = 'multiplier';

	readonly templateId: string = MultiplierColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly hoverService: IHoverService
	) {
		super();
	}

	renderTemplate(container: HTMLElement): IMultiplierColumnTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		const multiplierElement = DOM.append(container, $('.model-multiplier'));
		return {
			container,
			multiplierElement,
			disposables,
			elementDisposables
		};
	}

	override renderElement(entry: IViewModelEntry, index: number, templateData: IMultiplierColumnTemplateData): void {
		templateData.multiplierElement.textContent = '';
		super.renderElement(entry, index, templateData);
	}

	override renderGroupElement(element: ILanguageModelGroupEntry, index: number, templateData: IMultiplierColumnTemplateData): void {
	}

	override renderVendorElement(element: ILanguageModelProviderEntry, index: number, templateData: IMultiplierColumnTemplateData): void {

	}

	override renderModelElement(entry: ILanguageModelEntry, index: number, templateData: IMultiplierColumnTemplateData): void {
		const multiplierText = entry.model.metadata.multiplier ?? '-';
		templateData.multiplierElement.textContent = multiplierText;

		if (multiplierText !== '-') {
			templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
				content: localize('multiplier.tooltip', "Every chat message counts {0} towards your premium model request quota", multiplierText),
				appearance: {
					compact: true,
					skipFadeInAnimation: true
				}
			})));
		}
	}
}

interface ITokenLimitsColumnTemplateData extends IModelTableColumnTemplateData {
	readonly tokenLimitsElement: HTMLElement;
}

class TokenLimitsColumnRenderer extends ModelsTableColumnRenderer<ITokenLimitsColumnTemplateData> {
	static readonly TEMPLATE_ID = 'tokenLimits';

	readonly templateId: string = TokenLimitsColumnRenderer.TEMPLATE_ID;

	constructor(
		@IHoverService private readonly hoverService: IHoverService
	) {
		super();
	}

	renderTemplate(container: HTMLElement): ITokenLimitsColumnTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		const tokenLimitsElement = DOM.append(container, $('.model-token-limits'));
		return {
			container,
			tokenLimitsElement,
			disposables,
			elementDisposables
		};
	}

	override renderElement(entry: IViewModelEntry, index: number, templateData: ITokenLimitsColumnTemplateData): void {
		DOM.clearNode(templateData.tokenLimitsElement);
		super.renderElement(entry, index, templateData);
	}

	override renderVendorElement(entry: ILanguageModelProviderEntry, index: number, templateData: ITokenLimitsColumnTemplateData): void {
	}

	override renderGroupElement(entry: ILanguageModelGroupEntry, index: number, templateData: ITokenLimitsColumnTemplateData): void {
	}

	override renderModelElement(entry: ILanguageModelEntry, index: number, templateData: ITokenLimitsColumnTemplateData): void {
		const { model: modelEntry } = entry;
		const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		if (modelEntry.metadata.maxInputTokens || modelEntry.metadata.maxOutputTokens) {
			let addSeparator = false;
			markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
			if (modelEntry.metadata.maxInputTokens) {
				const inputDiv = DOM.append(templateData.tokenLimitsElement, $('.token-limit-item'));
				DOM.append(inputDiv, $('span.codicon.codicon-arrow-down'));
				const inputText = DOM.append(inputDiv, $('span'));
				inputText.textContent = formatTokenCount(modelEntry.metadata.maxInputTokens);

				markdown.appendMarkdown(`$(arrow-down) ${modelEntry.metadata.maxInputTokens} (${localize('models.input', 'Input')})`);
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
				markdown.appendMarkdown(`$(arrow-up) ${modelEntry.metadata.maxOutputTokens} (${localize('models.output', 'Output')})`);
			}
		}

		templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
			content: markdown,
			appearance: {
				compact: true,
				skipFadeInAnimation: true,
			}
		})));
	}
}

interface ICapabilitiesColumnTemplateData extends IModelTableColumnTemplateData {
	readonly metadataRow: HTMLElement;
}

class CapabilitiesColumnRenderer extends ModelsTableColumnRenderer<ICapabilitiesColumnTemplateData> {
	static readonly TEMPLATE_ID = 'capabilities';

	readonly templateId: string = CapabilitiesColumnRenderer.TEMPLATE_ID;

	private readonly _onDidClickCapability = new Emitter<string>();
	readonly onDidClickCapability = this._onDidClickCapability.event;

	renderTemplate(container: HTMLElement): ICapabilitiesColumnTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('model-capability-column');
		const metadataRow = DOM.append(container, $('.model-capabilities'));
		return {
			container,
			metadataRow,
			disposables,
			elementDisposables
		};
	}

	override renderElement(entry: IViewModelEntry, index: number, templateData: ICapabilitiesColumnTemplateData): void {
		DOM.clearNode(templateData.metadataRow);
		super.renderElement(entry, index, templateData);
	}

	override renderVendorElement(entry: ILanguageModelProviderEntry, index: number, templateData: ICapabilitiesColumnTemplateData): void {
	}

	override renderGroupElement(entry: ILanguageModelGroupEntry, index: number, templateData: ICapabilitiesColumnTemplateData): void {
	}

	override renderModelElement(entry: ILanguageModelEntry, index: number, templateData: ICapabilitiesColumnTemplateData): void {
		const { model: modelEntry, capabilityMatches } = entry;

		if (modelEntry.metadata.capabilities?.toolCalling) {
			templateData.elementDisposables.add(this.createCapabilityButton(
				templateData.metadataRow,
				capabilityMatches?.includes('toolCalling') || false,
				localize('models.tools', 'Tools'),
				'tools'
			));
		}

		if (modelEntry.metadata.capabilities?.vision) {
			templateData.elementDisposables.add(this.createCapabilityButton(
				templateData.metadataRow,
				capabilityMatches?.includes('vision') || false,
				localize('models.vision', 'Vision'),
				'vision'
			));
		}
	}

	private createCapabilityButton(container: HTMLElement, isActive: boolean, label: string, capability: string): IDisposable {
		const disposables = new DisposableStore();
		const buttonContainer = DOM.append(container, $('.model-badge-container'));
		const button = disposables.add(new Button(buttonContainer, { secondary: true }));
		button.element.classList.add('model-capability');
		button.element.classList.toggle('active', isActive);
		button.label = label;
		disposables.add(button.onDidClick(() => this._onDidClickCapability.fire(capability)));
		return disposables;
	}
}

interface IActionsColumnTemplateData extends IModelTableColumnTemplateData {
	readonly actionBar: ToolBar;
}

class ActionsColumnRenderer extends ModelsTableColumnRenderer<IActionsColumnTemplateData> {
	static readonly TEMPLATE_ID = 'actions';

	readonly templateId: string = ActionsColumnRenderer.TEMPLATE_ID;

	constructor(
		private readonly viewModel: ChatModelsViewModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super();
	}

	renderTemplate(container: HTMLElement): IActionsColumnTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		container.classList.add('models-actions-column');
		const parent = DOM.append(container, $('.actions-container'));
		const actionBar = disposables.add(this.instantiationService.createInstance(ToolBar,
			parent,
			this.contextMenuService,
			{
				icon: true,
				label: false,
				moreIcon: Codicon.gear,
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT
			}
		));
		return {
			container,
			actionBar,
			disposables,
			elementDisposables
		};
	}

	override renderElement(entry: IViewModelEntry, index: number, templateData: IActionsColumnTemplateData): void {
		templateData.actionBar.setActions([]);
		super.renderElement(entry, index, templateData);
	}

	override renderVendorElement(entry: ILanguageModelProviderEntry, index: number, templateData: IActionsColumnTemplateData): void {
		const { vendorEntry } = entry;
		const primaryActions: IAction[] = [];
		const secondaryActions: IAction[] = [];
		if (vendorEntry.vendor.configuration) {
			secondaryActions.push(toAction({
				id: 'configureAction',
				label: localize('models.configure', 'Configure...'),
				run: () => this.languageModelsService.configureLanguageModelsProviderGroup(vendorEntry.vendor.vendor, vendorEntry.group.name)
			}));
			secondaryActions.push(toAction({
				id: 'deleteAction',
				label: localize('models.deleteAction', 'Delete'),
				class: ThemeIcon.asClassName(Codicon.trash),
				run: async () => {
					const result = await this.dialogService.confirm({
						type: 'info',
						message: localize('models.deleteConfirmation', "Would you like to delete {0}?", vendorEntry.group.name)
					});
					if (!result.confirmed) {
						return;
					}
					await this.languageModelsService.removeLanguageModelsProviderGroup(vendorEntry.vendor.vendor, vendorEntry.group.name);
				}
			}));
		} else if (vendorEntry.vendor.managementCommand) {
			primaryActions.push(toAction({
				id: 'manageVendor',
				label: localize('models.manageProvider', 'Manage {0}...', vendorEntry.group.name),
				class: ThemeIcon.asClassName(Codicon.gear),
				run: async () => {
					await this.commandService.executeCommand(vendorEntry.vendor.managementCommand!, vendorEntry.vendor.vendor);
					this.viewModel.refresh();
				}
			}));
		}
		templateData.actionBar.setActions(primaryActions, secondaryActions);
	}

	override renderGroupElement(entry: ILanguageModelGroupEntry, index: number, templateData: IActionsColumnTemplateData): void {
	}

	override renderModelElement(entry: ILanguageModelEntry, index: number, templateData: IActionsColumnTemplateData): void {
	}
}

interface IProviderColumnTemplateData extends IModelTableColumnTemplateData {
	readonly providerElement: HTMLElement;
}

class ProviderColumnRenderer extends ModelsTableColumnRenderer<IProviderColumnTemplateData> {
	static readonly TEMPLATE_ID = 'provider';

	readonly templateId: string = ProviderColumnRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IProviderColumnTemplateData {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		const providerElement = DOM.append(container, $('.model-provider'));
		return {
			container,
			providerElement,
			disposables,
			elementDisposables
		};
	}

	override renderVendorElement(entry: ILanguageModelProviderEntry, index: number, templateData: IProviderColumnTemplateData): void {
		templateData.providerElement.textContent = '';
	}

	override renderGroupElement(entry: ILanguageModelGroupEntry, index: number, templateData: IProviderColumnTemplateData): void {
		templateData.providerElement.textContent = '';
	}

	override renderModelElement(entry: ILanguageModelEntry, index: number, templateData: IProviderColumnTemplateData): void {
		templateData.providerElement.textContent = entry.model.provider.vendor.displayName;
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

	private static NUM_INSTANCES: number = 0;

	readonly element: HTMLElement;
	private searchWidget!: SuggestEnabledInput;
	private searchActionsContainer!: HTMLElement;
	private table!: WorkbenchTable<IViewModelEntry>;
	private tableContainer!: HTMLElement;
	private addButtonContainer!: HTMLElement;
	private addButton!: Button;
	private dropdownActions: IAction[] = [];
	private viewModel: ChatModelsViewModel;
	private delayedFiltering: Delayer<void>;

	private readonly searchFocusContextKey: IContextKey<boolean>;

	private tableDisposables = this._register(new DisposableStore());

	constructor(
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.searchFocusContextKey = CONTEXT_MODELS_SEARCH_FOCUS.bindTo(contextKeyService);
		this.delayedFiltering = new Delayer<void>(200);
		this.viewModel = this._register(this.instantiationService.createInstance(ChatModelsViewModel));
		this.element = DOM.$('.models-widget');
		this.create(this.element);

		const loadingPromise = this.extensionService.whenInstalledExtensionsRegistered().then(() => this.viewModel.refresh());
		this.editorProgressService.showWhile(loadingPromise, 300);
	}

	private create(container: HTMLElement): void {
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
					const providerSuggestions = this.viewModel.getVendors().map(v => `@provider:"${v.displayName}"`);
					const allSuggestions = [
						...providerSuggestions,
						...SEARCH_SUGGESTIONS.CAPABILITIES,
						...SEARCH_SUGGESTIONS.VISIBILITY,
					];
					if (!query.trim()) {
						return allSuggestions;
					}
					const queryParts = query.split(/\s/g);
					const lastPart = queryParts[queryParts.length - 1];
					if (lastPart.startsWith('@provider:')) {
						return providerSuggestions;
					} else if (lastPart.startsWith('@capability:')) {
						return SEARCH_SUGGESTIONS.CAPABILITIES;
					} else if (lastPart.startsWith('@visible:')) {
						return SEARCH_SUGGESTIONS.VISIBILITY;
					} else if (lastPart.startsWith('@')) {
						return allSuggestions;
					}
					return [];
				}
			},
			placeholder,
			`chatModelsWidget:searchinput:${ChatModelsWidget.NUM_INSTANCES++}`,
			{
				placeholderText: placeholder,
				styleOverrides: {
					inputBorder: settingsTextInputBorder
				},
				focusContextKey: this.searchFocusContextKey,
			},
		));

		const filterAction = this._register(new ModelsFilterAction());
		const clearSearchAction = this._register(new Action(
			'workbench.models.clearSearch',
			localize('clearSearch', "Clear Search"),
			ThemeIcon.asClassName(preferencesClearInputIcon),
			false,
			() => this.clearSearch()
		));
		const collapseAllAction = this._register(new Action(
			'workbench.models.collapseAll',
			localize('collapseAll', "Collapse All"),
			ThemeIcon.asClassName(Codicon.collapseAll),
			false,
			() => {
				this.viewModel.collapseAll();
			}
		));
		collapseAllAction.enabled = this.viewModel.viewModelEntries.some(e => isLanguageModelGroupEntry(e) || isLanguageModelProviderEntry(e));
		this._register(this.viewModel.onDidChange(() => collapseAllAction.enabled = this.viewModel.viewModelEntries.some(e => isLanguageModelProviderEntry(e) || isLanguageModelGroupEntry(e))));

		this._register(this.searchWidget.onInputDidChange(() => {
			clearSearchAction.enabled = !!this.searchWidget.getValue();
			this.filterModels();
		}));

		this.searchActionsContainer = DOM.append(searchContainer, $('.models-search-actions'));
		const actions = [clearSearchAction, collapseAllAction, filterAction];
		const toolBar = this._register(new ToolBar(this.searchActionsContainer, this.contextMenuService, {
			actionViewItemProvider: (action: IAction, options: IActionViewItemOptions) => {
				if (action.id === filterAction.id) {
					return this.instantiationService.createInstance(ModelsSearchFilterDropdownMenuActionViewItem, action, options, {
						getValue: () => this.searchWidget.getValue(),
						setValue: (searchValue) => this.search(searchValue)
					}, this.viewModel);
				}
				return undefined;
			},
			getKeyBinding: () => undefined
		}));
		toolBar.setActions(actions);

		// Add padding to input box for toolbar
		this.searchWidget.inputWidget.getContainerDomNode().style.paddingRight = `${DOM.getTotalWidth(this.searchActionsContainer) + 12}px`;

		this.addButtonContainer = DOM.append(searchAndButtonContainer, $('.section-title-actions'));
		const buttonOptions: IButtonOptions = {
			...defaultButtonStyles,
			supportIcons: true,
		};
		this.addButton = this._register(new Button(this.addButtonContainer, buttonOptions));
		this.addButton.label = `$(${Codicon.add.id}) ${localize('models.enableModelProvider', 'Add Models...')}`;
		this.addButton.element.classList.add('models-add-model-button');
		this.updateAddModelsButton();
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
		this.createTable();
		this._register(this.viewModel.onDidChangeGrouping(() => this.createTable()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.updateAddModelsButton()));
		this._register(this.languageModelsService.onDidChangeLanguageModelVendors(() => this.updateAddModelsButton()));
	}

	private createTable(): void {
		this.tableDisposables.clear();
		DOM.clearNode(this.tableContainer);

		const gutterColumnRenderer = this.instantiationService.createInstance(GutterColumnRenderer, this.viewModel);
		const modelNameColumnRenderer = this.instantiationService.createInstance(ModelNameColumnRenderer);
		const costColumnRenderer = this.instantiationService.createInstance(MultiplierColumnRenderer);
		const tokenLimitsColumnRenderer = this.instantiationService.createInstance(TokenLimitsColumnRenderer);
		const capabilitiesColumnRenderer = this.instantiationService.createInstance(CapabilitiesColumnRenderer);
		const actionsColumnRenderer = this.instantiationService.createInstance(ActionsColumnRenderer, this.viewModel);
		const providerColumnRenderer = this.instantiationService.createInstance(ProviderColumnRenderer);

		this.tableDisposables.add(capabilitiesColumnRenderer.onDidClickCapability(capability => {
			const currentQuery = this.searchWidget.getValue();
			const query = `@capability:${capability}`;
			const newQuery = toggleFilter(currentQuery, { query });
			this.search(newQuery);
		}));

		const columns = [
			{
				label: '',
				tooltip: '',
				weight: 0.05,
				minimumWidth: 40,
				maximumWidth: 40,
				templateId: GutterColumnRenderer.TEMPLATE_ID,
				project(row: IViewModelEntry): IViewModelEntry { return row; }
			},
			{
				label: localize('modelName', 'Name'),
				tooltip: '',
				weight: 0.35,
				minimumWidth: 200,
				templateId: ModelNameColumnRenderer.TEMPLATE_ID,
				project(row: IViewModelEntry): IViewModelEntry { return row; }
			}
		];

		if (this.viewModel.groupBy === ChatModelGroup.Visibility) {
			columns.push({
				label: localize('provider', 'Provider'),
				tooltip: '',
				weight: 0.15,
				minimumWidth: 100,
				templateId: ProviderColumnRenderer.TEMPLATE_ID,
				project(row: IViewModelEntry): IViewModelEntry { return row; }
			});
		}

		columns.push(
			{
				label: localize('tokenLimits', 'Context Size'),
				tooltip: '',
				weight: 0.1,
				minimumWidth: 140,
				templateId: TokenLimitsColumnRenderer.TEMPLATE_ID,
				project(row: IViewModelEntry): IViewModelEntry { return row; }
			},
			{
				label: localize('capabilities', 'Capabilities'),
				tooltip: '',
				weight: 0.2,
				minimumWidth: 180,
				templateId: CapabilitiesColumnRenderer.TEMPLATE_ID,
				project(row: IViewModelEntry): IViewModelEntry { return row; }
			},
			{
				label: localize('cost', 'Request Multiplier'),
				tooltip: '',
				weight: 0.1,
				minimumWidth: 60,
				templateId: MultiplierColumnRenderer.TEMPLATE_ID,
				project(row: IViewModelEntry): IViewModelEntry { return row; }
			},
			{
				label: '',
				tooltip: '',
				weight: 0.05,
				minimumWidth: 64,
				maximumWidth: 64,
				templateId: ActionsColumnRenderer.TEMPLATE_ID,
				project(row: IViewModelEntry): IViewModelEntry { return row; }
			}
		);

		this.table = this.tableDisposables.add(this.instantiationService.createInstance(
			WorkbenchTable,
			'ModelsWidget',
			this.tableContainer,
			new Delegate(),
			columns,
			[
				gutterColumnRenderer,
				modelNameColumnRenderer,
				costColumnRenderer,
				tokenLimitsColumnRenderer,
				capabilitiesColumnRenderer,
				actionsColumnRenderer,
				providerColumnRenderer
			],
			{
				identityProvider: { getId: (e: IViewModelEntry) => e.id },
				horizontalScrolling: false,
				accessibilityProvider: {
					getAriaLabel: (e: IViewModelEntry) => {
						if (isLanguageModelProviderEntry(e)) {
							return localize('vendor.ariaLabel', '{0} Models', e.vendorEntry.group.name);
						} else if (isLanguageModelGroupEntry(e)) {
							return e.id === 'visible' ? localize('visible.ariaLabel', 'Visible Models') : localize('hidden.ariaLabel', 'Hidden Models');
						} else if (isStatusEntry(e)) {
							return localize('status.ariaLabel', 'Status: {0}', e.message);
						}
						const ariaLabels = [];
						ariaLabels.push(localize('model.name', '{0} from {1}', e.model.metadata.name, e.model.provider.vendor.displayName));
						if (e.model.metadata.maxInputTokens && e.model.metadata.maxOutputTokens) {
							ariaLabels.push(localize('model.contextSize', 'Context size: {0} input tokens and {1} output tokens', formatTokenCount(e.model.metadata.maxInputTokens), formatTokenCount(e.model.metadata.maxOutputTokens)));
						}
						if (e.model.metadata.capabilities) {
							ariaLabels.push(localize('model.capabilities', 'Capabilities: {0}', Object.keys(e.model.metadata.capabilities).join(', ')));
						}
						const multiplierText = e.model.metadata.multiplier ?? '-';
						if (multiplierText !== '-') {
							ariaLabels.push(localize('multiplier.tooltip', "Every chat message counts {0} towards your premium model request quota", multiplierText));
						}
						if (e.model.visible) {
							ariaLabels.push(localize('model.visible', 'This model is visible in the chat model picker'));
						} else {
							ariaLabels.push(localize('model.hidden', 'This model is hidden in the chat model picker'));
						}
						return ariaLabels.join('. ');
					},
					getWidgetAriaLabel: () => localize('modelsTable.ariaLabel', 'Language Models')
				},
				multipleSelectionSupport: true,
				setRowLineHeight: false,
				openOnSingleClick: true,
				alwaysConsumeMouseWheel: false,
			}
		)) as WorkbenchTable<IViewModelEntry>;

		this.tableDisposables.add(this.table.onContextMenu(e => {
			if (!e.element) {
				return;
			}

			const selection = this.table.getSelection();
			const selectedEntries = selection.every(i => i !== e.index) ? [e.element] : selection.map(i => this.viewModel.viewModelEntries[i]).filter(e => !!e);

			// Get model entries from selection (filter out vendor/group/status entries)
			const selectedModelEntries = selectedEntries.filter((entry): entry is ILanguageModelEntry =>
				!isLanguageModelProviderEntry(entry) && !isLanguageModelGroupEntry(entry) && !isStatusEntry(entry)
			);

			const actions: IAction[] = [];
			let configureGroup: string | undefined;
			let configureVendor: ILanguageModelProviderDescriptor | undefined;

			if (selectedModelEntries.length) {
				const visibleModels = selectedModelEntries.filter(entry => entry.model.visible);
				const hiddenModels = selectedModelEntries.filter(entry => !entry.model.visible);

				actions.push(toAction({
					id: 'hideSelectedModels',
					label: localize('models.hideSelected', 'Hide in the Chat Model Picker'),
					enabled: visibleModels.length > 0,
					run: () => this.viewModel.setModelsVisibility(selectedModelEntries, false)
				}));

				actions.push(toAction({
					id: 'showSelectedModels',
					label: localize('models.showSelected', 'Show in the Chat Model Picker'),
					enabled: hiddenModels.length > 0,
					run: () => this.viewModel.setModelsVisibility(selectedModelEntries, true)
				}));

				// Show configure action if all models are from the same group
				configureGroup = selectedModelEntries[0].model.provider.group.name;
				configureVendor = selectedModelEntries[0].model.provider.vendor;
				if (selectedModelEntries.some(entry => entry.model.provider.vendor.isDefault || entry.model.provider.group.name !== configureGroup)) {
					configureGroup = undefined;
					configureVendor = undefined;
				}
			} else if (selectedEntries.length === 1) {
				const entry = e.element;
				if (isLanguageModelProviderEntry(entry)) {
					if (!entry.vendorEntry.vendor.isDefault) {
						actions.push(toAction({
							id: 'hideAllModels',
							label: localize('models.hideAll', 'Hide in the Chat Model Picker'),
							run: () => this.viewModel.setGroupVisibility(entry, false)
						}));
						actions.push(toAction({
							id: 'showAllModels',
							label: localize('models.showAll', 'Show in the Chat Model Picker'),
							run: () => this.viewModel.setGroupVisibility(entry, true)
						}));
					}
					configureGroup = entry.vendorEntry.group.name;
					configureVendor = entry.vendorEntry.vendor;
				}
			}

			if (configureGroup && configureVendor) {
				if (configureVendor.managementCommand || configureVendor.configuration) {
					if (actions.length) {
						actions.push(new Separator());
					}
					if (configureVendor.managementCommand) {
						actions.push(toAction({
							id: 'configureVendor',
							label: localize('models.configureContextMenu', 'Configure'),
							run: async () => {
								await this.commandService.executeCommand(configureVendor.managementCommand!, configureVendor.vendor);
								await this.viewModel.refresh();
							}
						}));
					} else {
						actions.push(toAction({
							id: 'configureVendor',
							label: localize('models.configureContextMenu', 'Configure'),
							run: () => this.languageModelsService.configureLanguageModelsProviderGroup(configureVendor.vendor, configureGroup!)
						}));
					}
				}
			}

			if (actions.length > 0) {
				this.contextMenuService.showContextMenu({
					getAnchor: () => e.anchor,
					getActions: () => actions
				});
			}
		}));

		this.table.splice(0, this.table.length, this.viewModel.viewModelEntries);
		this.tableDisposables.add(this.viewModel.onDidChange(({ at, removed, added }) => {
			this.table.splice(at, removed, added);
			if (this.viewModel.selectedEntry) {
				const selectedEntryIndex = this.viewModel.viewModelEntries.indexOf(this.viewModel.selectedEntry);
				this.table.setFocus([selectedEntryIndex]);
				this.table.setSelection([selectedEntryIndex]);
			}
		}));

		this.tableDisposables.add(this.table.onDidOpen(async ({ element, browserEvent }) => {
			if (!element) {
				return;
			}
			if (isStatusEntry(element)) {
				return;
			}
			if (isLanguageModelProviderEntry(element) || isLanguageModelGroupEntry(element)) {
				this.viewModel.toggleCollapsed(element);
			} else if (!DOM.isMouseEvent(browserEvent) || browserEvent.detail === 2) {
				this.viewModel.toggleVisibility(element);
			}
		}));

		this.tableDisposables.add(this.table.onDidChangeSelection(e => this.viewModel.selectedEntry = e.elements[0]));

		this.tableDisposables.add(this.table.onDidBlur(() => {
			if (this.viewModel.shouldRefilter()) {
				this.viewModel.filter(this.searchWidget.getValue());
			}
		}));

		this.layout(this.element.clientHeight, this.element.clientWidth);
	}

	private updateAddModelsButton(): void {
		const configurableVendors = this.languageModelsService.getVendors().filter(vendor => vendor.managementCommand || vendor.configuration);

		const entitlement = this.chatEntitlementService.entitlement;
		const isManagedEntitlement = entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
		const supportsAddingModels = this.chatEntitlementService.isInternal
			|| (entitlement !== ChatEntitlement.Unknown
				&& entitlement !== ChatEntitlement.Available
				&& !isManagedEntitlement);

		this.addButton.enabled = supportsAddingModels && configurableVendors.length > 0;
		this.addButton.setTitle(!supportsAddingModels && isManagedEntitlement ? localize('models.managedByOrganization', "Adding models is managed by your organization") : '');

		this.dropdownActions = configurableVendors.map(vendor => toAction({
			id: `enable-${vendor.vendor}`,
			label: vendor.displayName,
			run: async () => {
				await this.addModelsForVendor(vendor);
			}
		}));
	}

	private filterModels(): void {
		this.delayedFiltering.trigger(() => {
			this.viewModel.filter(this.searchWidget.getValue());
		});
	}

	private async addModelsForVendor(vendor: ILanguageModelProviderDescriptor): Promise<void> {
		this.languageModelsService.configureLanguageModelsProviderGroup(vendor.vendor);
	}

	public layout(height: number, width: number): void {
		width = width - 24;
		this.searchWidget.layout(new DOM.Dimension(width - this.searchActionsContainer.clientWidth - this.addButtonContainer.clientWidth - 8, 22));
		const tableHeight = height - 40;
		this.tableContainer.style.height = `${tableHeight}px`;
		this.table.layout(tableHeight, width);
	}

	public focusSearch(): void {
		this.searchWidget.focus();
	}

	public search(filter: string): void {
		this.focusSearch();
		this.searchWidget.setValue(filter);
		this.viewModel.filter(filter);
	}

	public clearSearch(): void {
		this.focusSearch();
		this.searchWidget.setValue('');
	}

	public render(): void {
		if (this.viewModel.shouldRefilter()) {
			this.viewModel.filter(this.searchWidget.getValue());
		}
	}

}
