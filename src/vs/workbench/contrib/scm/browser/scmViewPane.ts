/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scm';
import { Event, Emitter } from 'vs/base/common/event';
import { basename, dirname } from 'vs/base/common/resources';
import { IDisposable, Disposable, DisposableStore, combinedDisposable, dispose, toDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ViewPane, IViewPaneOptions, ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { append, $, Dimension, asCSSUrl, trackFocus, clearNode } from 'vs/base/browser/dom';
import { IListVirtualDelegate, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ISCMResourceGroup, ISCMResource, InputValidationType, ISCMRepository, ISCMInput, IInputValidation, ISCMViewService, ISCMViewVisibleRepositoryChangeEvent, ISCMService, SCMInputChangeReason, VIEW_PANE_ID, ISCMActionButton, ISCMActionButtonDescriptor, ISCMRepositorySortKey, REPOSITORIES_VIEW_PANE_ID } from 'vs/workbench/contrib/scm/common/scm';
import { ResourceLabels, IResourceLabel, IFileLabelOptions } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey, ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MenuItemAction, IMenuService, registerAction2, MenuId, IAction2Options, MenuRegistry, Action2 } from 'vs/platform/actions/common/actions';
import { IAction, ActionRunner, Action, Separator } from 'vs/base/common/actions';
import { ActionBar, IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, registerThemingParticipant, IFileIconTheme, ThemeIcon, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { isSCMResource, isSCMResourceGroup, connectPrimaryMenuToInlineActionBar, isSCMRepository, isSCMInput, collectContextMenuActions, getActionViewItemProvider, isSCMActionButton } from './util';
import { attachBadgeStyler, attachButtonStyler } from 'vs/platform/theme/common/styler';
import { WorkbenchCompressibleObjectTree, IOpenEvent } from 'vs/platform/list/browser/listService';
import { IConfigurationService, ConfigurationTarget, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { disposableTimeout, ThrottledDelayer } from 'vs/base/common/async';
import { ITreeNode, ITreeFilter, ITreeSorter, ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { ResourceTree, IResourceNode } from 'vs/base/common/resourceTree';
import { ISplice } from 'vs/base/common/sequence';
import { ICompressibleTreeRenderer, ICompressibleKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/tree/objectTree';
import { Iterable } from 'vs/base/common/iterator';
import { ICompressedTreeNode, ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { URI } from 'vs/base/common/uri';
import { FileKind } from 'vs/platform/files/common/files';
import { compareFileNames, comparePaths } from 'vs/base/common/comparers';
import { FuzzyScore, createMatches, IMatch } from 'vs/base/common/filters';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { coalesce, flatten } from 'vs/base/common/arrays';
import { memoize } from 'vs/base/common/decorators';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { EditorResourceAccessor, SideBySideEditor } from 'vs/workbench/common/editor';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_BORDER, PANEL_BACKGROUND, PANEL_INPUT_BORDER } from 'vs/workbench/common/theme';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IModelService } from 'vs/editor/common/services/model';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/browser/contextmenu';
import * as platform from 'vs/base/common/platform';
import { compare, format } from 'vs/base/common/strings';
import { inputPlaceholderForeground, inputValidationInfoBorder, inputValidationWarningBorder, inputValidationErrorBorder, inputValidationInfoBackground, inputValidationInfoForeground, inputValidationWarningBackground, inputValidationWarningForeground, inputValidationErrorBackground, inputValidationErrorForeground, inputBackground, inputForeground, inputBorder, focusBorder, registerColor, contrastBorder, editorSelectionBackground, selectionBackground, textLinkActiveForeground, textLinkForeground, buttonBorder } from 'vs/platform/theme/common/colorRegistry';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { Schemas } from 'vs/base/common/network';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ModesHoverController } from 'vs/editor/contrib/hover/browser/hover';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { LinkDetector } from 'vs/editor/contrib/links/browser/links';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ILabelService } from 'vs/platform/label/common/label';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { Codicon } from 'vs/base/common/codicons';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { RepositoryRenderer } from 'vs/workbench/contrib/scm/browser/scmRepositoryRenderer';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { LabelFuzzyScore } from 'vs/base/browser/ui/tree/abstractTree';
import { Selection } from 'vs/editor/common/core/selection';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { Button, ButtonWithDescription, ButtonWithDropdown } from 'vs/base/browser/ui/button/button';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { RepositoryContextKeys } from 'vs/workbench/contrib/scm/browser/scmViewService';
import { DragAndDropController } from 'vs/editor/contrib/dnd/browser/dnd';
import { DropIntoEditorController } from 'vs/editor/contrib/dropIntoEditor/browser/dropIntoEditorContribution';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';

type TreeElement = ISCMRepository | ISCMInput | ISCMActionButton | ISCMResourceGroup | IResourceNode<ISCMResource, ISCMResourceGroup> | ISCMResource;

interface ISCMLayout {
	height: number | undefined;
	width: number | undefined;
	readonly onDidChange: Event<void>;
}

interface ActionButtonTemplate {
	readonly actionButton: SCMActionButton;
	disposable: IDisposable;
	readonly templateDisposable: IDisposable;
}

class ActionButtonRenderer implements ICompressibleTreeRenderer<ISCMActionButton, FuzzyScore, ActionButtonTemplate> {
	static readonly DEFAULT_HEIGHT = 30;

	static readonly TEMPLATE_ID = 'actionButton';
	get templateId(): string { return ActionButtonRenderer.TEMPLATE_ID; }

	private actionButtons = new Map<ISCMActionButton, SCMActionButton>();

	constructor(
		@ICommandService private commandService: ICommandService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IThemeService private themeService: IThemeService,
		@INotificationService private notificationService: INotificationService,
	) { }

	renderTemplate(container: HTMLElement): ActionButtonTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		// Use default cursor & disable hover for list item
		container.parentElement!.parentElement!.classList.add('cursor-default', 'force-no-hover');

		const buttonContainer = append(container, $('.button-container'));
		const actionButton = new SCMActionButton(buttonContainer, this.contextMenuService, this.commandService, this.themeService, this.notificationService);

		return { actionButton, disposable: Disposable.None, templateDisposable: actionButton };
	}

	renderElement(node: ITreeNode<ISCMActionButton, FuzzyScore>, index: number, templateData: ActionButtonTemplate, height: number | undefined): void {
		templateData.disposable.dispose();

		const disposables = new DisposableStore();
		const actionButton = node.element;
		templateData.actionButton.setButton(node.element.button);

		// Remember action button
		this.actionButtons.set(actionButton, templateData.actionButton);
		disposables.add({ dispose: () => this.actionButtons.delete(actionButton) });

		templateData.disposable = disposables;
	}

	renderCompressedElements(): void {
		throw new Error('Should never happen since node is incompressible');
	}

	focusActionButton(actionButton: ISCMActionButton): void {
		this.actionButtons.get(actionButton)?.focus();
	}

	disposeElement(node: ITreeNode<ISCMActionButton, FuzzyScore>, index: number, template: ActionButtonTemplate): void {
		template.disposable.dispose();
	}

	disposeTemplate(templateData: ActionButtonTemplate): void {
		templateData.disposable.dispose();
		templateData.templateDisposable.dispose();
	}
}

interface InputTemplate {
	readonly inputWidget: SCMInputWidget;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposable: IDisposable;
}

class InputRenderer implements ICompressibleTreeRenderer<ISCMInput, FuzzyScore, InputTemplate> {

	static readonly DEFAULT_HEIGHT = 26;

	static readonly TEMPLATE_ID = 'input';
	get templateId(): string { return InputRenderer.TEMPLATE_ID; }

	private inputWidgets = new Map<ISCMInput, SCMInputWidget>();
	private contentHeights = new WeakMap<ISCMInput, number>();
	private editorSelections = new WeakMap<ISCMInput, Selection[]>();

	constructor(
		private outerLayout: ISCMLayout,
		private overflowWidgetsDomNode: HTMLElement,
		private updateHeight: (input: ISCMInput, height: number) => void,
		@IInstantiationService private instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): InputTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		// Disable hover for list item
		container.parentElement!.parentElement!.classList.add('force-no-hover');

		const templateDisposable = new DisposableStore();
		const inputElement = append(container, $('.scm-input'));
		const inputWidget = this.instantiationService.createInstance(SCMInputWidget, inputElement, this.overflowWidgetsDomNode);
		templateDisposable.add(inputWidget);

		return { inputWidget, elementDisposables: templateDisposable.add(new DisposableStore()), templateDisposable };
	}

	renderElement(node: ITreeNode<ISCMInput, FuzzyScore>, index: number, templateData: InputTemplate): void {
		const input = node.element;
		templateData.inputWidget.input = input;

		// Remember widget
		this.inputWidgets.set(input, templateData.inputWidget);
		templateData.elementDisposables.add({ dispose: () => this.inputWidgets.delete(input) });

		// Widget cursor selections
		const selections = this.editorSelections.get(input);

		if (selections) {
			templateData.inputWidget.selections = selections;
		}

		templateData.elementDisposables.add(toDisposable(() => {
			const selections = templateData.inputWidget.selections;

			if (selections) {
				this.editorSelections.set(input, selections);
			}
		}));

		// Rerender the element whenever the editor content height changes
		const onDidChangeContentHeight = () => {
			const contentHeight = templateData.inputWidget.getContentHeight();
			const lastContentHeight = this.contentHeights.get(input)!;
			this.contentHeights.set(input, contentHeight);

			if (lastContentHeight !== contentHeight) {
				this.updateHeight(input, contentHeight + 10);
				templateData.inputWidget.layout();
			}
		};

		const startListeningContentHeightChange = () => {
			templateData.elementDisposables.add(templateData.inputWidget.onDidChangeContentHeight(onDidChangeContentHeight));
			onDidChangeContentHeight();
		};

		// Setup height change listener on next tick
		const timeout = disposableTimeout(startListeningContentHeightChange, 0);
		templateData.elementDisposables.add(timeout);

		// Layout the editor whenever the outer layout happens
		const layoutEditor = () => templateData.inputWidget.layout();
		templateData.elementDisposables.add(this.outerLayout.onDidChange(layoutEditor));
		layoutEditor();
	}

	renderCompressedElements(): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(group: ITreeNode<ISCMInput, FuzzyScore>, index: number, template: InputTemplate): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(templateData: InputTemplate): void {
		templateData.templateDisposable.dispose();
	}

	getHeight(input: ISCMInput): number {
		return (this.contentHeights.get(input) ?? InputRenderer.DEFAULT_HEIGHT) + 10;
	}

	getRenderedInputWidget(input: ISCMInput): SCMInputWidget | undefined {
		return this.inputWidgets.get(input);
	}

	getFocusedInput(): ISCMInput | undefined {
		for (const [input, inputWidget] of this.inputWidgets) {
			if (inputWidget.hasFocus()) {
				return input;
			}
		}

		return undefined;
	}

	clearValidation(): void {
		for (const [, inputWidget] of this.inputWidgets) {
			inputWidget.clearValidation();
		}
	}
}

interface ResourceGroupTemplate {
	readonly name: HTMLElement;
	readonly count: CountBadge;
	readonly actionBar: ActionBar;
	readonly elementDisposables: DisposableStore;
	readonly disposables: IDisposable;
}

class ResourceGroupRenderer implements ICompressibleTreeRenderer<ISCMResourceGroup, FuzzyScore, ResourceGroupTemplate> {

	static readonly TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private actionViewItemProvider: IActionViewItemProvider,
		@ISCMViewService private scmViewService: ISCMViewService,
		@IThemeService private themeService: IThemeService,
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-twistie');

		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);
		const styler = attachBadgeStyler(count, this.themeService);
		const disposables = combinedDisposable(actionBar, styler);

		return { name, count, actionBar, elementDisposables: new DisposableStore(), disposables };
	}

	renderElement(node: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		const group = node.element;
		template.name.textContent = group.label;
		template.actionBar.clear();
		template.actionBar.context = group;
		template.count.setCount(group.elements.length);

		const menus = this.scmViewService.menus.getRepositoryMenus(group.provider);
		template.elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceGroupMenu(group), template.actionBar));
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResourceGroup>, FuzzyScore>, index: number, templateData: ResourceGroupTemplate, height: number | undefined): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(group: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ResourceGroupTemplate): void {
		template.elementDisposables.dispose();
		template.disposables.dispose();
	}
}

interface ResourceTemplate {
	element: HTMLElement;
	name: HTMLElement;
	fileLabel: IResourceLabel;
	decorationIcon: HTMLElement;
	actionBar: ActionBar;
	readonly elementDisposables: DisposableStore;
	readonly disposables: IDisposable;
}

interface RenderedResourceData {
	readonly tooltip: string;
	readonly uri: URI;
	readonly fileLabelOptions: Partial<IFileLabelOptions>;
	readonly iconResource: ISCMResource | undefined;
}

class RepositoryPaneActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => (ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>)[]) {
		super();
	}

	override async runAction(action: IAction, context: ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>): Promise<any> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const selection = this.getSelectedResources();
		const contextIsSelected = selection.some(s => s === context);
		const actualContext = contextIsSelected ? selection : [context];
		const args = flatten(actualContext.map(e => ResourceTree.isResourceNode(e) ? ResourceTree.collect(e) : [e]));
		await action.run(...args);
	}
}

class ResourceRenderer implements ICompressibleTreeRenderer<ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore | LabelFuzzyScore, ResourceTemplate> {

	static readonly TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	private disposables = new DisposableStore();
	private renderedResources = new Map<ResourceTemplate, RenderedResourceData>();

	constructor(
		private viewModelProvider: () => ViewModel,
		private labels: ResourceLabels,
		private actionViewItemProvider: IActionViewItemProvider,
		private actionRunner: ActionRunner,
		@ILabelService private labelService: ILabelService,
		@ISCMViewService private scmViewService: ISCMViewService,
		@IThemeService private themeService: IThemeService
	) {
		themeService.onDidColorThemeChange(this.onDidColorThemeChange, this, this.disposables);
	}

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const element = append(container, $('.resource'));
		const name = append(element, $('.name'));
		const fileLabel = this.labels.create(name, { supportDescriptionHighlights: true, supportHighlights: true });
		const actionsContainer = append(fileLabel.element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionViewItemProvider: this.actionViewItemProvider,
			actionRunner: this.actionRunner
		});

		const decorationIcon = append(element, $('.decoration-icon'));
		const disposables = combinedDisposable(actionBar, fileLabel);

		return { element, name, fileLabel, decorationIcon, actionBar, elementDisposables: new DisposableStore(), disposables };
	}

	renderElement(node: ITreeNode<ISCMResource, FuzzyScore | LabelFuzzyScore> | ITreeNode<ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore | LabelFuzzyScore>, index: number, template: ResourceTemplate): void {
		const resourceOrFolder = node.element;
		const iconResource = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.element : resourceOrFolder;
		const uri = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.uri : resourceOrFolder.sourceUri;
		const fileKind = ResourceTree.isResourceNode(resourceOrFolder) ? FileKind.FOLDER : FileKind.FILE;
		const viewModel = this.viewModelProvider();
		const tooltip = !ResourceTree.isResourceNode(resourceOrFolder) && resourceOrFolder.decorations.tooltip || '';

		template.actionBar.clear();
		template.actionBar.context = resourceOrFolder;

		let matches: IMatch[] | undefined;
		let descriptionMatches: IMatch[] | undefined;
		let strikethrough: boolean | undefined;

		if (ResourceTree.isResourceNode(resourceOrFolder)) {
			if (resourceOrFolder.element) {
				const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.element.resourceGroup.provider);
				template.elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceMenu(resourceOrFolder.element), template.actionBar));
				template.element.classList.toggle('faded', resourceOrFolder.element.decorations.faded);
				strikethrough = resourceOrFolder.element.decorations.strikeThrough;
			} else {
				matches = createMatches(node.filterData as FuzzyScore | undefined);
				const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.context.provider);
				template.elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceFolderMenu(resourceOrFolder.context), template.actionBar));
				template.element.classList.remove('faded');
			}
		} else {
			[matches, descriptionMatches] = this._processFilterData(uri, node.filterData);
			const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.resourceGroup.provider);
			template.elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceMenu(resourceOrFolder), template.actionBar));
			template.element.classList.toggle('faded', resourceOrFolder.decorations.faded);
			strikethrough = resourceOrFolder.decorations.strikeThrough;
		}

		const renderedData: RenderedResourceData = {
			tooltip,
			uri,
			fileLabelOptions: {
				hidePath: viewModel.mode === ViewModelMode.Tree,
				fileKind,
				matches,
				descriptionMatches,
				strikethrough
			},
			iconResource
		};

		this.renderIcon(template, renderedData);

		this.renderedResources.set(template, renderedData);
		template.elementDisposables.add(toDisposable(() => this.renderedResources.delete(template)));

		template.element.setAttribute('data-tooltip', tooltip);
	}

	disposeElement(resource: ITreeNode<ISCMResource, FuzzyScore | LabelFuzzyScore> | ITreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore | LabelFuzzyScore>, index: number, template: ResourceTemplate): void {
		template.elementDisposables.clear();
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResource> | ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>, FuzzyScore | LabelFuzzyScore>, index: number, template: ResourceTemplate, height: number | undefined): void {
		const compressed = node.element as ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>;
		const folder = compressed.elements[compressed.elements.length - 1];

		const label = compressed.elements.map(e => e.name);
		const fileKind = FileKind.FOLDER;

		const matches = createMatches(node.filterData as FuzzyScore | undefined);
		template.fileLabel.setResource({ resource: folder.uri, name: label }, {
			fileDecorations: { colors: false, badges: true },
			fileKind,
			matches,
			separator: this.labelService.getSeparator(folder.uri.scheme)
		});

		template.actionBar.clear();
		template.actionBar.context = folder;

		const menus = this.scmViewService.menus.getRepositoryMenus(folder.context.provider);
		template.elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceFolderMenu(folder.context), template.actionBar));

		template.name.classList.remove('strike-through');
		template.element.classList.remove('faded');
		template.decorationIcon.style.display = 'none';
		template.decorationIcon.style.backgroundImage = '';

		template.element.setAttribute('data-tooltip', '');
	}

	disposeCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResource> | ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>, FuzzyScore | LabelFuzzyScore>, index: number, template: ResourceTemplate, height: number | undefined): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(template: ResourceTemplate): void {
		template.elementDisposables.dispose();
		template.disposables.dispose();
	}

	private _processFilterData(uri: URI, filterData: FuzzyScore | LabelFuzzyScore | undefined): [IMatch[] | undefined, IMatch[] | undefined] {
		if (!filterData) {
			return [undefined, undefined];
		}

		if (!(filterData as LabelFuzzyScore).label) {
			const matches = createMatches(filterData as FuzzyScore);
			return [matches, undefined];
		}

		const fileName = basename(uri);
		const label = (filterData as LabelFuzzyScore).label;
		const pathLength = label.length - fileName.length;
		const matches = createMatches((filterData as LabelFuzzyScore).score);

		// FileName match
		if (label === fileName) {
			return [matches, undefined];
		}

		// FilePath match
		const labelMatches: IMatch[] = [];
		const descriptionMatches: IMatch[] = [];

		for (const match of matches) {
			if (match.start > pathLength) {
				// Label match
				labelMatches.push({
					start: match.start - pathLength,
					end: match.end - pathLength
				});
			} else if (match.end < pathLength) {
				// Description match
				descriptionMatches.push(match);
			} else {
				// Spanning match
				labelMatches.push({
					start: 0,
					end: match.end - pathLength
				});
				descriptionMatches.push({
					start: match.start,
					end: pathLength
				});
			}
		}

		return [labelMatches, descriptionMatches];
	}

	private onDidColorThemeChange(): void {
		for (const [template, data] of this.renderedResources) {
			this.renderIcon(template, data);
		}
	}

	private renderIcon(template: ResourceTemplate, data: RenderedResourceData): void {
		const theme = this.themeService.getColorTheme();
		const icon = theme.type === ColorScheme.LIGHT ? data.iconResource?.decorations.icon : data.iconResource?.decorations.iconDark;

		template.fileLabel.setFile(data.uri, {
			...data.fileLabelOptions,
			fileDecorations: { colors: false, badges: !icon },
		});

		if (icon) {
			if (ThemeIcon.isThemeIcon(icon)) {
				template.decorationIcon.className = `decoration-icon ${ThemeIcon.asClassName(icon)}`;
				if (icon.color) {
					template.decorationIcon.style.color = theme.getColor(icon.color.id)?.toString() ?? '';
				}
				template.decorationIcon.style.display = '';
				template.decorationIcon.style.backgroundImage = '';
			} else {
				template.decorationIcon.className = 'decoration-icon';
				template.decorationIcon.style.color = '';
				template.decorationIcon.style.display = '';
				template.decorationIcon.style.backgroundImage = asCSSUrl(icon);
			}
			template.decorationIcon.title = data.tooltip;
		} else {
			template.decorationIcon.className = 'decoration-icon';
			template.decorationIcon.style.color = '';
			template.decorationIcon.style.display = 'none';
			template.decorationIcon.style.backgroundImage = '';
			template.decorationIcon.title = '';
		}
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

class ListDelegate implements IListVirtualDelegate<TreeElement> {

	constructor(private readonly inputRenderer: InputRenderer) { }

	getHeight(element: TreeElement) {
		if (isSCMInput(element)) {
			return this.inputRenderer.getHeight(element);
		} else if (isSCMActionButton(element)) {
			return ActionButtonRenderer.DEFAULT_HEIGHT + 10;
		} else {
			return 22;
		}
	}

	getTemplateId(element: TreeElement) {
		if (isSCMRepository(element)) {
			return RepositoryRenderer.TEMPLATE_ID;
		} else if (isSCMInput(element)) {
			return InputRenderer.TEMPLATE_ID;
		} else if (isSCMActionButton(element)) {
			return ActionButtonRenderer.TEMPLATE_ID;
		} else if (ResourceTree.isResourceNode(element) || isSCMResource(element)) {
			return ResourceRenderer.TEMPLATE_ID;
		} else {
			return ResourceGroupRenderer.TEMPLATE_ID;
		}
	}
}

class SCMTreeFilter implements ITreeFilter<TreeElement> {

	filter(element: TreeElement): boolean {
		if (ResourceTree.isResourceNode(element)) {
			return true;
		} else if (isSCMResourceGroup(element)) {
			return element.elements.length > 0 || !element.hideWhenEmpty;
		} else {
			return true;
		}
	}
}

export class SCMTreeSorter implements ITreeSorter<TreeElement> {

	@memoize
	private get viewModel(): ViewModel { return this.viewModelProvider(); }

	constructor(private viewModelProvider: () => ViewModel) { }

	compare(one: TreeElement, other: TreeElement): number {
		if (isSCMRepository(one)) {
			if (!isSCMRepository(other)) {
				throw new Error('Invalid comparison');
			}

			return 0;
		}

		if (isSCMInput(one)) {
			return -1;
		} else if (isSCMInput(other)) {
			return 1;
		}

		if (isSCMActionButton(one)) {
			return -1;
		} else if (isSCMActionButton(other)) {
			return 1;
		}

		if (isSCMResourceGroup(one)) {
			if (!isSCMResourceGroup(other)) {
				throw new Error('Invalid comparison');
			}

			return 0;
		}

		// List
		if (this.viewModel.mode === ViewModelMode.List) {
			// FileName
			if (this.viewModel.sortKey === ViewModelSortKey.Name) {
				const oneName = basename((one as ISCMResource).sourceUri);
				const otherName = basename((other as ISCMResource).sourceUri);

				return compareFileNames(oneName, otherName);
			}

			// Status
			if (this.viewModel.sortKey === ViewModelSortKey.Status) {
				const oneTooltip = (one as ISCMResource).decorations.tooltip ?? '';
				const otherTooltip = (other as ISCMResource).decorations.tooltip ?? '';

				if (oneTooltip !== otherTooltip) {
					return compare(oneTooltip, otherTooltip);
				}
			}

			// Path (default)
			const onePath = (one as ISCMResource).sourceUri.fsPath;
			const otherPath = (other as ISCMResource).sourceUri.fsPath;

			return comparePaths(onePath, otherPath);
		}

		// Tree
		const oneIsDirectory = ResourceTree.isResourceNode(one);
		const otherIsDirectory = ResourceTree.isResourceNode(other);

		if (oneIsDirectory !== otherIsDirectory) {
			return oneIsDirectory ? -1 : 1;
		}

		const oneName = ResourceTree.isResourceNode(one) ? one.name : basename((one as ISCMResource).sourceUri);
		const otherName = ResourceTree.isResourceNode(other) ? other.name : basename((other as ISCMResource).sourceUri);

		return compareFileNames(oneName, otherName);
	}
}

export class SCMTreeKeyboardNavigationLabelProvider implements ICompressibleKeyboardNavigationLabelProvider<TreeElement> {

	constructor(
		private viewModelProvider: () => ViewModel,
		@ILabelService private readonly labelService: ILabelService,
	) { }

	getKeyboardNavigationLabel(element: TreeElement): { toString(): string } | { toString(): string }[] | undefined {
		if (ResourceTree.isResourceNode(element)) {
			return element.name;
		} else if (isSCMRepository(element) || isSCMInput(element) || isSCMActionButton(element)) {
			return undefined;
		} else if (isSCMResourceGroup(element)) {
			return element.label;
		} else {
			const viewModel = this.viewModelProvider();
			if (viewModel.mode === ViewModelMode.List) {
				// In List mode match using the file name and the path.
				// Since we want to match both on the file name and the
				// full path we return an array of labels. A match in the
				// file name takes precedence over a match in the path.
				const fileName = basename(element.sourceUri);
				const filePath = this.labelService.getUriLabel(element.sourceUri, { relative: true });

				return [fileName, filePath];
			} else {
				// In Tree mode only match using the file name
				return basename(element.sourceUri);
			}
		}
	}

	getCompressedNodeKeyboardNavigationLabel(elements: TreeElement[]): { toString(): string | undefined } | undefined {
		const folders = elements as IResourceNode<ISCMResource, ISCMResourceGroup>[];
		return folders.map(e => e.name).join('/');
	}
}

function getSCMResourceId(element: TreeElement): string {
	if (ResourceTree.isResourceNode(element)) {
		const group = element.context;
		return `folder:${group.provider.id}/${group.id}/$FOLDER/${element.uri.toString()}`;
	} else if (isSCMRepository(element)) {
		const provider = element.provider;
		return `repo:${provider.id}`;
	} else if (isSCMInput(element)) {
		const provider = element.repository.provider;
		return `input:${provider.id}`;
	} else if (isSCMActionButton(element)) {
		const provider = element.repository.provider;
		return `actionButton:${provider.id}`;
	} else if (isSCMResource(element)) {
		const group = element.resourceGroup;
		const provider = group.provider;
		return `resource:${provider.id}/${group.id}/${element.sourceUri.toString()}`;
	} else {
		const provider = element.provider;
		return `group:${provider.id}/${element.id}`;
	}
}

class SCMResourceIdentityProvider implements IIdentityProvider<TreeElement> {

	getId(element: TreeElement): string {
		return getSCMResourceId(element);
	}
}

export class SCMAccessibilityProvider implements IListAccessibilityProvider<TreeElement> {

	constructor(
		@ILabelService private readonly labelService: ILabelService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) { }

	getWidgetAriaLabel(): string {
		return localize('scm', "Source Control Management");
	}

	getAriaLabel(element: TreeElement): string {
		if (ResourceTree.isResourceNode(element)) {
			return this.labelService.getUriLabel(element.uri, { relative: true, noPrefix: true }) || element.name;
		} else if (isSCMRepository(element)) {
			let folderName = '';
			if (element.provider.rootUri) {
				const folder = this.workspaceContextService.getWorkspaceFolder(element.provider.rootUri);

				if (folder?.uri.toString() === element.provider.rootUri.toString()) {
					folderName = folder.name;
				} else {
					folderName = basename(element.provider.rootUri);
				}
			}
			return `${folderName} ${element.provider.label}`;
		} else if (isSCMInput(element)) {
			return localize('input', "Source Control Input");
		} else if (isSCMActionButton(element)) {
			return element.button?.command.title ?? '';
		} else if (isSCMResourceGroup(element)) {
			return element.label;
		} else {
			const result: string[] = [];

			result.push(basename(element.sourceUri));

			if (element.decorations.tooltip) {
				result.push(element.decorations.tooltip);
			}

			const path = this.labelService.getUriLabel(dirname(element.sourceUri), { relative: true, noPrefix: true });

			if (path) {
				result.push(path);
			}

			return result.join(', ');
		}
	}
}

interface IGroupItem {
	readonly element: ISCMResourceGroup;
	readonly resources: ISCMResource[];
	readonly tree: ResourceTree<ISCMResource, ISCMResourceGroup>;
	dispose(): void;
}

interface IRepositoryItem {
	readonly element: ISCMRepository;
	readonly groupItems: IGroupItem[];
	dispose(): void;
}

interface ITreeViewState {
	readonly collapsed: string[];
}

function isRepositoryItem(item: IRepositoryItem | IGroupItem): item is IRepositoryItem {
	return Array.isArray((item as IRepositoryItem).groupItems);
}

function asTreeElement(node: IResourceNode<ISCMResource, ISCMResourceGroup>, forceIncompressible: boolean, viewState?: ITreeViewState): ICompressedTreeElement<TreeElement> {
	const element = (node.childrenCount === 0 && node.element) ? node.element : node;
	const collapsed = viewState ? viewState.collapsed.indexOf(getSCMResourceId(element)) > -1 : false;

	return {
		element,
		children: Iterable.map(node.children, node => asTreeElement(node, false, viewState)),
		incompressible: !!node.element || forceIncompressible,
		collapsed,
		collapsible: node.childrenCount > 0
	};
}

const enum ViewModelMode {
	List = 'list',
	Tree = 'tree'
}

const enum ViewModelSortKey {
	Path = 'path',
	Name = 'name',
	Status = 'status'
}

const Menus = {
	ViewSort: new MenuId('SCMViewSort'),
	Repositories: new MenuId('SCMRepositories'),
};

const ContextKeys = {
	ViewModelMode: new RawContextKey<ViewModelMode>('scmViewModelMode', ViewModelMode.List),
	ViewModelSortKey: new RawContextKey<ViewModelSortKey>('scmViewModelSortKey', ViewModelSortKey.Path),
	ViewModelAreAllRepositoriesCollapsed: new RawContextKey<boolean>('scmViewModelAreAllRepositoriesCollapsed', false),
	ViewModelIsAnyRepositoryCollapsible: new RawContextKey<boolean>('scmViewModelIsAnyRepositoryCollapsible', false),
	SCMProvider: new RawContextKey<string | undefined>('scmProvider', undefined),
	SCMProviderRootUri: new RawContextKey<string | undefined>('scmProviderRootUri', undefined),
	SCMProviderHasRootUri: new RawContextKey<boolean>('scmProviderHasRootUri', undefined),
	RepositoryCount: new RawContextKey<number>('scmRepositoryCount', 0),
	RepositoryVisibilityCount: new RawContextKey<number>('scmRepositoryVisibleCount', 0),
	RepositoryVisibility(repository: ISCMRepository) {
		return new RawContextKey<boolean>(`scmRepositoryVisible:${repository.provider.id}`, false);
	}
};

MenuRegistry.appendMenuItem(MenuId.SCMTitle, {
	title: localize('sortAction', "View & Sort"),
	submenu: Menus.ViewSort,
	when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0)),
	group: '0_view&sort'
});

MenuRegistry.appendMenuItem(Menus.ViewSort, {
	title: localize('repositories', "Repositories"),
	submenu: Menus.Repositories,
	group: '0_repositories'
});

class RepositoryVisibilityAction extends Action2 {

	private repository: ISCMRepository;

	constructor(repository: ISCMRepository) {
		const title = repository.provider.rootUri ? basename(repository.provider.rootUri) : repository.provider.label;
		super({
			id: `workbench.scm.action.toggleRepositoryVisibility.${repository.provider.id}`,
			title,
			f1: false,
			precondition: ContextKeyExpr.or(ContextKeys.RepositoryVisibilityCount.notEqualsTo(1), ContextKeys.RepositoryVisibility(repository).isEqualTo(false)),
			toggled: ContextKeys.RepositoryVisibility(repository).isEqualTo(true),
			menu: { id: Menus.Repositories, group: '0_repositories' }
		});
		this.repository = repository;
	}

	run(accessor: ServicesAccessor) {
		const scmViewService = accessor.get(ISCMViewService);
		scmViewService.toggleVisibility(this.repository);
	}
}

interface RepositoryVisibilityItem {
	readonly contextKey: IContextKey<boolean>;
	dispose(): void;
}

class RepositoryVisibilityActionController {

	private items = new Map<ISCMRepository, RepositoryVisibilityItem>();
	private repositoryCountContextKey: IContextKey<number>;
	private repositoryVisibilityCountContextKey: IContextKey<number>;
	private disposables = new DisposableStore();

	constructor(
		@ISCMViewService private scmViewService: ISCMViewService,
		@ISCMService scmService: ISCMService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		this.repositoryCountContextKey = ContextKeys.RepositoryCount.bindTo(contextKeyService);
		this.repositoryVisibilityCountContextKey = ContextKeys.RepositoryVisibilityCount.bindTo(contextKeyService);

		scmViewService.onDidChangeVisibleRepositories(this.onDidChangeVisibleRepositories, this, this.disposables);
		scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
		scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);

		for (const repository of scmService.repositories) {
			this.onDidAddRepository(repository);
		}
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const action = registerAction2(class extends RepositoryVisibilityAction {
			constructor() {
				super(repository);
			}
		});

		const contextKey = ContextKeys.RepositoryVisibility(repository).bindTo(this.contextKeyService);
		contextKey.set(this.scmViewService.isVisible(repository));

		this.items.set(repository, {
			contextKey,
			dispose() {
				contextKey.reset();
				action.dispose();
			}
		});

		this.updateRepositoriesCounts();
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		this.items.get(repository)?.dispose();
		this.items.delete(repository);
		this.updateRepositoriesCounts();
	}

	private onDidChangeVisibleRepositories(): void {
		let count = 0;

		for (const [repository, item] of this.items) {
			const isVisible = this.scmViewService.isVisible(repository);
			item.contextKey.set(isVisible);

			if (isVisible) {
				count++;
			}
		}

		this.repositoryCountContextKey.set(this.items.size);
		this.repositoryVisibilityCountContextKey.set(count);
	}

	private updateRepositoriesCounts(): void {
		this.repositoryCountContextKey.set(this.items.size);
		this.repositoryVisibilityCountContextKey.set(Iterable.reduce(this.items.keys(), (r, repository) => r + (this.scmViewService.isVisible(repository) ? 1 : 0), 0));
	}

	dispose(): void {
		this.disposables.dispose();
		dispose(this.items.values());
		this.items.clear();
	}
}

class ViewModel {

	private readonly _onDidChangeMode = new Emitter<ViewModelMode>();
	readonly onDidChangeMode = this._onDidChangeMode.event;

	private readonly _onDidChangeSortKey = new Emitter<ViewModelSortKey>();
	readonly onDidChangeSortKey = this._onDidChangeSortKey.event;

	private visible: boolean = false;

	get mode(): ViewModelMode { return this._mode; }
	set mode(mode: ViewModelMode) {
		if (this._mode === mode) {
			return;
		}

		this._mode = mode;

		for (const [, item] of this.items) {
			for (const groupItem of item.groupItems) {
				groupItem.tree.clear();

				if (mode === ViewModelMode.Tree) {
					for (const resource of groupItem.resources) {
						groupItem.tree.add(resource.sourceUri, resource);
					}
				}
			}
		}

		// Update sort key based on view mode
		this.sortKey = this.getViewModelSortKey();

		this.refresh();
		this._onDidChangeMode.fire(mode);
		this.modeContextKey.set(mode);

		this.storageService.store(`scm.viewMode`, mode, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	get sortKey(): ViewModelSortKey { return this._sortKey; }
	set sortKey(sortKey: ViewModelSortKey) {
		if (this._sortKey === sortKey) {
			return;
		}

		this._sortKey = sortKey;

		this.refresh();
		this._onDidChangeSortKey.fire(sortKey);
		this.sortKeyContextKey.set(sortKey);

		if (this._mode === ViewModelMode.List) {
			this.storageService.store(`scm.viewSortKey`, sortKey, StorageScope.WORKSPACE, StorageTarget.USER);
		}
	}

	private _treeViewStateIsStale = false;
	get treeViewState(): ITreeViewState | undefined {
		if (this.visible && this._treeViewStateIsStale) {
			this.updateViewState();
			this._treeViewStateIsStale = false;
		}

		return this._treeViewState;
	}

	private items = new Map<ISCMRepository, IRepositoryItem>();
	private visibilityDisposables = new DisposableStore();
	private scrollTop: number | undefined;
	private alwaysShowRepositories = false;
	private showActionButton = false;
	private firstVisible = true;
	private disposables = new DisposableStore();

	private modeContextKey: IContextKey<ViewModelMode>;
	private sortKeyContextKey: IContextKey<ViewModelSortKey>;
	private areAllRepositoriesCollapsedContextKey: IContextKey<boolean>;
	private isAnyRepositoryCollapsibleContextKey: IContextKey<boolean>;
	private scmProviderContextKey: IContextKey<string | undefined>;
	private scmProviderRootUriContextKey: IContextKey<string | undefined>;
	private scmProviderHasRootUriContextKey: IContextKey<boolean>;

	private _mode: ViewModelMode;
	private _sortKey: ViewModelSortKey;
	private _treeViewState: ITreeViewState | undefined;

	constructor(
		private tree: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>,
		private inputRenderer: InputRenderer,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IEditorService protected editorService: IEditorService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@ISCMViewService private scmViewService: ISCMViewService,
		@IStorageService private storageService: IStorageService,
		@IUriIdentityService private uriIdentityService: IUriIdentityService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		// View mode and sort key
		this._mode = this.getViewModelMode();
		this._sortKey = this.getViewModelSortKey();

		// TreeView state
		const storageViewState = this.storageService.get(`scm.viewState`, StorageScope.WORKSPACE);
		if (storageViewState) {
			try {
				this._treeViewState = JSON.parse(storageViewState);
			} catch {/* noop */ }
		}

		this.modeContextKey = ContextKeys.ViewModelMode.bindTo(contextKeyService);
		this.modeContextKey.set(this._mode);
		this.sortKeyContextKey = ContextKeys.ViewModelSortKey.bindTo(contextKeyService);
		this.sortKeyContextKey.set(this._sortKey);
		this.areAllRepositoriesCollapsedContextKey = ContextKeys.ViewModelAreAllRepositoriesCollapsed.bindTo(contextKeyService);
		this.isAnyRepositoryCollapsibleContextKey = ContextKeys.ViewModelIsAnyRepositoryCollapsible.bindTo(contextKeyService);
		this.scmProviderContextKey = ContextKeys.SCMProvider.bindTo(contextKeyService);
		this.scmProviderRootUriContextKey = ContextKeys.SCMProviderRootUri.bindTo(contextKeyService);
		this.scmProviderHasRootUriContextKey = ContextKeys.SCMProviderHasRootUri.bindTo(contextKeyService);

		configurationService.onDidChangeConfiguration(this.onDidChangeConfiguration, this, this.disposables);
		this.onDidChangeConfiguration();

		Event.filter(this.tree.onDidChangeCollapseState, e => isSCMRepository(e.node.element), this.disposables)
			(this.updateRepositoryCollapseAllContextKeys, this, this.disposables);

		this.disposables.add(this.tree.onDidChangeCollapseState(() => this._treeViewStateIsStale = true));

		this.storageService.onWillSaveState(e => {
			if (e.reason === WillSaveStateReason.SHUTDOWN) {
				this.storageService.store(`scm.viewState`, JSON.stringify(this.treeViewState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}
		});
	}

	private onDidChangeConfiguration(e?: IConfigurationChangeEvent): void {
		if (!e || e.affectsConfiguration('scm.alwaysShowRepositories') || e.affectsConfiguration('scm.showActionButton')) {
			this.alwaysShowRepositories = this.configurationService.getValue<boolean>('scm.alwaysShowRepositories');
			this.showActionButton = this.configurationService.getValue<boolean>('scm.showActionButton');
			this.refresh();
		}
	}

	private _onDidChangeVisibleRepositories({ added, removed }: ISCMViewVisibleRepositoryChangeEvent): void {
		for (const repository of added) {
			const disposable = combinedDisposable(
				repository.provider.groups.onDidSplice(splice => this._onDidSpliceGroups(item, splice)),
				repository.input.onDidChangeVisibility(() => this.refresh(item)),
				repository.provider.onDidChange(() => {
					if (this.showActionButton) {
						this.refresh(item);
					}
				})
			);
			const groupItems = repository.provider.groups.elements.map(group => this.createGroupItem(group));
			const item: IRepositoryItem = {
				element: repository, groupItems, dispose() {
					dispose(this.groupItems);
					disposable.dispose();
				}
			};

			this.items.set(repository, item);
		}

		for (const repository of removed) {
			const item = this.items.get(repository)!;
			item.dispose();
			this.items.delete(repository);
		}

		this.refresh();
	}

	private _onDidSpliceGroups(item: IRepositoryItem, { start, deleteCount, toInsert }: ISplice<ISCMResourceGroup>): void {
		const itemsToInsert: IGroupItem[] = toInsert.map(group => this.createGroupItem(group));
		const itemsToDispose = item.groupItems.splice(start, deleteCount, ...itemsToInsert);

		for (const item of itemsToDispose) {
			item.dispose();
		}

		this.refresh();
	}

	private createGroupItem(group: ISCMResourceGroup): IGroupItem {
		const tree = new ResourceTree<ISCMResource, ISCMResourceGroup>(group, group.provider.rootUri || URI.file('/'), this.uriIdentityService.extUri);
		const resources: ISCMResource[] = [...group.elements];
		const disposable = combinedDisposable(
			group.onDidChange(() => this.tree.refilter()),
			group.onDidSplice(splice => this._onDidSpliceGroup(item, splice))
		);

		const item: IGroupItem = { element: group, resources, tree, dispose() { disposable.dispose(); } };

		if (this._mode === ViewModelMode.Tree) {
			for (const resource of resources) {
				item.tree.add(resource.sourceUri, resource);
			}
		}

		return item;
	}

	private _onDidSpliceGroup(item: IGroupItem, { start, deleteCount, toInsert }: ISplice<ISCMResource>): void {
		const before = item.resources.length;
		const deleted = item.resources.splice(start, deleteCount, ...toInsert);
		const after = item.resources.length;

		if (this._mode === ViewModelMode.Tree) {
			for (const resource of deleted) {
				item.tree.delete(resource.sourceUri);
			}

			for (const resource of toInsert) {
				item.tree.add(resource.sourceUri, resource);
			}
		}

		if (before !== after && (before === 0 || after === 0)) {
			this.refresh();
		} else {
			this.refresh(item);
		}
	}

	setVisible(visible: boolean): void {
		if (visible) {
			this.visibilityDisposables = new DisposableStore();
			this.scmViewService.onDidChangeVisibleRepositories(this._onDidChangeVisibleRepositories, this, this.visibilityDisposables);
			this._onDidChangeVisibleRepositories({ added: this.scmViewService.visibleRepositories, removed: Iterable.empty() });

			if (typeof this.scrollTop === 'number') {
				this.tree.scrollTop = this.scrollTop;
				this.scrollTop = undefined;
			}

			this.editorService.onDidActiveEditorChange(this.onDidActiveEditorChange, this, this.visibilityDisposables);
			this.onDidActiveEditorChange();
		} else {
			this.updateViewState();

			this.visibilityDisposables.dispose();
			this._onDidChangeVisibleRepositories({ added: Iterable.empty(), removed: [...this.items.keys()] });
			this.scrollTop = this.tree.scrollTop;
		}

		this.visible = visible;
		this.updateRepositoryCollapseAllContextKeys();
	}

	private refresh(item?: IRepositoryItem | IGroupItem): void {
		if (!this.alwaysShowRepositories && this.items.size === 1) {
			const provider = Iterable.first(this.items.values())!.element.provider;
			this.scmProviderContextKey.set(provider.contextValue);
			this.scmProviderRootUriContextKey.set(provider.rootUri?.toString());
			this.scmProviderHasRootUriContextKey.set(!!provider.rootUri);
		} else {
			this.scmProviderContextKey.set(undefined);
			this.scmProviderRootUriContextKey.set(undefined);
			this.scmProviderHasRootUriContextKey.set(false);
		}

		const focusedInput = this.inputRenderer.getFocusedInput();

		if (!this.alwaysShowRepositories && (this.items.size === 1 && (!item || isRepositoryItem(item)))) {
			const item = Iterable.first(this.items.values())!;
			this.tree.setChildren(null, this.render(item, this.treeViewState).children);
		} else if (item) {
			this.tree.setChildren(item.element, this.render(item, this.treeViewState).children);
		} else {
			const items = coalesce(this.scmViewService.visibleRepositories.map(r => this.items.get(r)));
			this.tree.setChildren(null, items.map(item => this.render(item, this.treeViewState)));
		}

		if (focusedInput) {
			this.inputRenderer.getRenderedInputWidget(focusedInput)?.focus();
		}

		this.updateRepositoryCollapseAllContextKeys();
	}

	private render(item: IRepositoryItem | IGroupItem, treeViewState?: ITreeViewState): ICompressedTreeElement<TreeElement> {
		if (isRepositoryItem(item)) {
			const children: ICompressedTreeElement<TreeElement>[] = [];
			const hasSomeChanges = item.groupItems.some(item => item.element.elements.length > 0);

			if (item.element.input.visible) {
				children.push({ element: item.element.input, incompressible: true, collapsible: false });
			}

			if (hasSomeChanges || (this.items.size === 1 && (!this.showActionButton || !item.element.provider.actionButton))) {
				children.push(...item.groupItems.map(i => this.render(i, treeViewState)));
			}

			if (this.showActionButton && item.element.provider.actionButton) {
				const button: ICompressedTreeElement<ISCMActionButton> = {
					element: {
						type: 'actionButton',
						repository: item.element,
						button: item.element.provider.actionButton,
					},
					incompressible: true,
					collapsible: false
				};
				children.push(button);
			}

			const collapsed = treeViewState ? treeViewState.collapsed.indexOf(getSCMResourceId(item.element)) > -1 : false;

			return { element: item.element, children, incompressible: true, collapsed, collapsible: true };
		} else {
			const children = this.mode === ViewModelMode.List
				? Iterable.map(item.resources, element => ({ element, incompressible: true }))
				: Iterable.map(item.tree.root.children, node => asTreeElement(node, true, treeViewState));

			const collapsed = treeViewState ? treeViewState.collapsed.indexOf(getSCMResourceId(item.element)) > -1 : false;

			return { element: item.element, children, incompressible: true, collapsed, collapsible: true };
		}
	}

	private updateViewState(): void {
		const collapsed: string[] = [];
		const visit = (node: ITreeNode<TreeElement | null, FuzzyScore>) => {
			if (node.element && node.collapsible && node.collapsed) {
				collapsed.push(getSCMResourceId(node.element));
			}

			for (const child of node.children) {
				visit(child);
			}
		};

		visit(this.tree.getNode());

		this._treeViewState = { collapsed };
	}

	private onDidActiveEditorChange(): void {
		if (!this.configurationService.getValue<boolean>('scm.autoReveal')) {
			return;
		}

		if (this.firstVisible) {
			this.firstVisible = false;
			this.visibilityDisposables.add(disposableTimeout(() => this.onDidActiveEditorChange(), 250));
			return;
		}

		const uri = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });

		if (!uri) {
			return;
		}

		for (const repository of this.scmViewService.visibleRepositories) {
			const item = this.items.get(repository);

			if (!item) {
				continue;
			}

			// go backwards from last group
			for (let j = item.groupItems.length - 1; j >= 0; j--) {
				const groupItem = item.groupItems[j];
				const resource = this.mode === ViewModelMode.Tree
					? groupItem.tree.getNode(uri)?.element
					: groupItem.resources.find(r => this.uriIdentityService.extUri.isEqual(r.sourceUri, uri));

				if (resource) {
					this.tree.reveal(resource);
					this.tree.setSelection([resource]);
					this.tree.setFocus([resource]);
					return;
				}
			}
		}
	}

	focus() {
		if (this.tree.getFocus().length === 0) {
			for (const repository of this.scmViewService.visibleRepositories) {
				const widget = this.inputRenderer.getRenderedInputWidget(repository.input);

				if (widget) {
					widget.focus();
					return;
				}
			}
		}

		this.tree.domFocus();
	}

	private updateRepositoryCollapseAllContextKeys(): void {
		if (!this.visible || this.scmViewService.visibleRepositories.length === 1) {
			this.isAnyRepositoryCollapsibleContextKey.set(false);
			this.areAllRepositoriesCollapsedContextKey.set(false);
			return;
		}

		this.isAnyRepositoryCollapsibleContextKey.set(this.scmViewService.visibleRepositories.some(r => this.tree.hasElement(r) && this.tree.isCollapsible(r)));
		this.areAllRepositoriesCollapsedContextKey.set(this.scmViewService.visibleRepositories.every(r => this.tree.hasElement(r) && (!this.tree.isCollapsible(r) || this.tree.isCollapsed(r))));
	}

	collapseAllRepositories(): void {
		for (const repository of this.scmViewService.visibleRepositories) {
			if (this.tree.isCollapsible(repository)) {
				this.tree.collapse(repository);
			}
		}
	}

	expandAllRepositories(): void {
		for (const repository of this.scmViewService.visibleRepositories) {
			if (this.tree.isCollapsible(repository)) {
				this.tree.expand(repository);
			}
		}
	}

	private getViewModelMode(): ViewModelMode {
		let mode = this.configurationService.getValue<'tree' | 'list'>('scm.defaultViewMode') === 'list' ? ViewModelMode.List : ViewModelMode.Tree;
		const storageMode = this.storageService.get(`scm.viewMode`, StorageScope.WORKSPACE) as ViewModelMode;
		if (typeof storageMode === 'string') {
			mode = storageMode;
		}

		return mode;
	}

	private getViewModelSortKey(): ViewModelSortKey {
		// Tree
		if (this._mode === ViewModelMode.Tree) {
			return ViewModelSortKey.Path;
		}

		// List
		let viewSortKey: ViewModelSortKey;
		const viewSortKeyString = this.configurationService.getValue<'path' | 'name' | 'status'>('scm.defaultViewSortKey');
		switch (viewSortKeyString) {
			case 'name':
				viewSortKey = ViewModelSortKey.Name;
				break;
			case 'status':
				viewSortKey = ViewModelSortKey.Status;
				break;
			default:
				viewSortKey = ViewModelSortKey.Path;
				break;
		}

		const storageSortKey = this.storageService.get(`scm.viewSortKey`, StorageScope.WORKSPACE) as ViewModelSortKey;
		if (typeof storageSortKey === 'string') {
			viewSortKey = storageSortKey;
		}

		return viewSortKey;
	}

	dispose(): void {
		this.visibilityDisposables.dispose();
		this.disposables.dispose();
		dispose(this.items.values());
		this.items.clear();
	}
}

class SetListViewModeAction extends ViewAction<SCMViewPane>  {
	constructor(menu: Partial<IAction2Options['menu']> = {}) {
		super({
			id: 'workbench.scm.action.setListViewMode',
			title: localize('setListViewMode', "View as List"),
			viewId: VIEW_PANE_ID,
			f1: false,
			icon: Codicon.listFlat,
			toggled: ContextKeys.ViewModelMode.isEqualTo(ViewModelMode.List),
			menu: { id: Menus.ViewSort, group: '1_viewmode', ...menu }
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.viewModel.mode = ViewModelMode.List;
	}
}

class SetListViewModeNavigationAction extends SetListViewModeAction {
	constructor() {
		super({
			id: MenuId.SCMTitle,
			when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.ViewModelMode.isEqualTo(ViewModelMode.Tree)),
			group: 'navigation',
			order: -1000
		});
	}
}

class SetTreeViewModeAction extends ViewAction<SCMViewPane>  {
	constructor(menu: Partial<IAction2Options['menu']> = {}) {
		super({
			id: 'workbench.scm.action.setTreeViewMode',
			title: localize('setTreeViewMode', "View as Tree"),
			viewId: VIEW_PANE_ID,
			f1: false,
			icon: Codicon.listTree,
			toggled: ContextKeys.ViewModelMode.isEqualTo(ViewModelMode.Tree),
			menu: { id: Menus.ViewSort, group: '1_viewmode', ...menu }
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.viewModel.mode = ViewModelMode.Tree;
	}
}

class SetTreeViewModeNavigationAction extends SetTreeViewModeAction {
	constructor() {
		super({
			id: MenuId.SCMTitle,
			when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.ViewModelMode.isEqualTo(ViewModelMode.List)),
			group: 'navigation',
			order: -1000
		});
	}
}

registerAction2(SetListViewModeAction);
registerAction2(SetTreeViewModeAction);
registerAction2(SetListViewModeNavigationAction);
registerAction2(SetTreeViewModeNavigationAction);

abstract class RepositorySortAction extends ViewAction<SCMViewPane> {
	constructor(private sortKey: ISCMRepositorySortKey, title: string) {
		super({
			id: `workbench.scm.action.repositories.setSortKey.${sortKey}`,
			title,
			viewId: VIEW_PANE_ID,
			f1: false,
			toggled: RepositoryContextKeys.RepositorySortKey.isEqualTo(sortKey),
			menu: [
				{
					id: Menus.Repositories,
					group: '1_sort'
				},
				{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', REPOSITORIES_VIEW_PANE_ID),
					group: '1_sort',
				},
			]
		});
	}

	runInView(accessor: ServicesAccessor) {
		accessor.get(ISCMViewService).toggleSortKey(this.sortKey);
	}
}


class RepositorySortByDiscoveryTimeAction extends RepositorySortAction {
	constructor() {
		super(ISCMRepositorySortKey.DiscoveryTime, localize('repositorySortByDiscoveryTime', "Sort by Discovery Time"));
	}
}

class RepositorySortByNameAction extends RepositorySortAction {
	constructor() {
		super(ISCMRepositorySortKey.Name, localize('repositorySortByName', "Sort by Name"));
	}
}

class RepositorySortByPathAction extends RepositorySortAction {
	constructor() {
		super(ISCMRepositorySortKey.Path, localize('repositorySortByPath', "Sort by Path"));
	}
}

registerAction2(RepositorySortByDiscoveryTimeAction);
registerAction2(RepositorySortByNameAction);
registerAction2(RepositorySortByPathAction);

abstract class SetSortKeyAction extends ViewAction<SCMViewPane>  {
	constructor(private sortKey: ViewModelSortKey, title: string) {
		super({
			id: `workbench.scm.action.setSortKey.${sortKey}`,
			title,
			viewId: VIEW_PANE_ID,
			f1: false,
			toggled: ContextKeys.ViewModelSortKey.isEqualTo(sortKey),
			precondition: ContextKeys.ViewModelMode.isEqualTo(ViewModelMode.List),
			menu: { id: Menus.ViewSort, group: '2_sort' }
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.viewModel.sortKey = this.sortKey;
	}
}

class SetSortByNameAction extends SetSortKeyAction {
	constructor() {
		super(ViewModelSortKey.Name, localize('sortChangesByName', "Sort Changes by Name"));
	}
}

class SetSortByPathAction extends SetSortKeyAction {
	constructor() {
		super(ViewModelSortKey.Path, localize('sortChangesByPath', "Sort Changes by Path"));
	}
}

class SetSortByStatusAction extends SetSortKeyAction {
	constructor() {
		super(ViewModelSortKey.Status, localize('sortChangesByStatus', "Sort Changes by Status"));
	}
}

registerAction2(SetSortByNameAction);
registerAction2(SetSortByPathAction);
registerAction2(SetSortByStatusAction);

class CollapseAllRepositoriesAction extends ViewAction<SCMViewPane>  {

	constructor() {
		super({
			id: `workbench.scm.action.collapseAllRepositories`,
			title: localize('collapse all', "Collapse All Repositories"),
			viewId: VIEW_PANE_ID,
			f1: false,
			icon: Codicon.collapseAll,
			menu: {
				id: MenuId.SCMTitle,
				group: 'navigation',
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.ViewModelIsAnyRepositoryCollapsible.isEqualTo(true), ContextKeys.ViewModelAreAllRepositoriesCollapsed.isEqualTo(false))
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.viewModel.collapseAllRepositories();
	}
}

class ExpandAllRepositoriesAction extends ViewAction<SCMViewPane>  {

	constructor() {
		super({
			id: `workbench.scm.action.expandAllRepositories`,
			title: localize('expand all', "Expand All Repositories"),
			viewId: VIEW_PANE_ID,
			f1: false,
			icon: Codicon.expandAll,
			menu: {
				id: MenuId.SCMTitle,
				group: 'navigation',
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.ViewModelIsAnyRepositoryCollapsible.isEqualTo(true), ContextKeys.ViewModelAreAllRepositoriesCollapsed.isEqualTo(true))
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.viewModel.expandAllRepositories();
	}
}

registerAction2(CollapseAllRepositoriesAction);
registerAction2(ExpandAllRepositoriesAction);

class SCMInputWidget {

	private static readonly ValidationTimeouts: { [severity: number]: number } = {
		[InputValidationType.Information]: 5000,
		[InputValidationType.Warning]: 8000,
		[InputValidationType.Error]: 10000
	};

	private readonly defaultInputFontFamily = DEFAULT_FONT_FAMILY;

	private element: HTMLElement;
	private editorContainer: HTMLElement;
	private placeholderTextContainer: HTMLElement;
	private inputEditor: CodeEditorWidget;
	private disposables = new DisposableStore();

	private model: { readonly input: ISCMInput; readonly textModel: ITextModel } | undefined;
	private repositoryIdContextKey: IContextKey<string | undefined>;
	private repositoryDisposables = new DisposableStore();

	private validation: IInputValidation | undefined;
	private validationDisposable: IDisposable = Disposable.None;
	private validationHasFocus: boolean = false;
	private _validationTimer: any;

	// This is due to "Setup height change listener on next tick" above
	// https://github.com/microsoft/vscode/issues/108067
	private lastLayoutWasTrash = false;
	private shouldFocusAfterLayout = false;

	readonly onDidChangeContentHeight: Event<void>;

	get input(): ISCMInput | undefined {
		return this.model?.input;
	}

	set input(input: ISCMInput | undefined) {
		if (input === this.input) {
			return;
		}

		this.clearValidation();
		this.editorContainer.classList.remove('synthetic-focus');

		this.repositoryDisposables.dispose();
		this.repositoryDisposables = new DisposableStore();
		this.repositoryIdContextKey.set(input?.repository.id);

		if (!input) {
			this.model?.textModel.dispose();
			this.inputEditor.setModel(undefined);
			this.model = undefined;
			return;
		}

		let query: string | undefined;

		if (input.repository.provider.rootUri) {
			query = `rootUri=${encodeURIComponent(input.repository.provider.rootUri.toString())}`;
		}

		const uri = URI.from({
			scheme: Schemas.vscodeSourceControl,
			path: `${input.repository.provider.contextValue}/${input.repository.provider.id}/input`,
			query
		});

		if (this.configurationService.getValue('editor.wordBasedSuggestions', { resource: uri }) !== false) {
			this.configurationService.updateValue('editor.wordBasedSuggestions', false, { resource: uri }, ConfigurationTarget.MEMORY);
		}

		const textModel = this.modelService.getModel(uri) ?? this.modelService.createModel('', this.languageService.createById('scminput'), uri);
		this.inputEditor.setModel(textModel);

		// Validation
		const validationDelayer = new ThrottledDelayer<any>(200);
		const validate = async () => {
			const position = this.inputEditor.getSelection()?.getStartPosition();
			const offset = position && textModel.getOffsetAt(position);
			const value = textModel.getValue();

			this.setValidation(await input.validateInput(value, offset || 0));
		};

		const triggerValidation = () => validationDelayer.trigger(validate);
		this.repositoryDisposables.add(validationDelayer);
		this.repositoryDisposables.add(this.inputEditor.onDidChangeCursorPosition(triggerValidation));

		// Adaptive indentation rules
		const opts = this.modelService.getCreationOptions(textModel.getLanguageId(), textModel.uri, textModel.isForSimpleWidget);
		const onEnter = Event.filter(this.inputEditor.onKeyDown, e => e.keyCode === KeyCode.Enter, this.repositoryDisposables);
		this.repositoryDisposables.add(onEnter(() => textModel.detectIndentation(opts.insertSpaces, opts.tabSize)));

		// Keep model in sync with API
		textModel.setValue(input.value);
		this.repositoryDisposables.add(input.onDidChange(({ value, reason }) => {
			if (value === textModel.getValue()) { // circuit breaker
				return;
			}
			textModel.setValue(value);

			const position = reason === SCMInputChangeReason.HistoryPrevious
				? textModel.getFullModelRange().getStartPosition()
				: textModel.getFullModelRange().getEndPosition();
			this.inputEditor.setPosition(position);
			this.inputEditor.revealPositionInCenterIfOutsideViewport(position);
		}));
		this.repositoryDisposables.add(input.onDidChangeFocus(() => this.focus()));
		this.repositoryDisposables.add(input.onDidChangeValidationMessage((e) => this.setValidation(e, { focus: true, timeout: true })));
		this.repositoryDisposables.add(input.onDidChangeValidateInput((e) => triggerValidation()));

		// Keep API in sync with model, update placeholder visibility and validate
		const updatePlaceholderVisibility = () => this.placeholderTextContainer.classList.toggle('hidden', textModel.getValueLength() > 0);
		this.repositoryDisposables.add(textModel.onDidChangeContent(() => {
			input.setValue(textModel.getValue(), true);
			updatePlaceholderVisibility();
			triggerValidation();
		}));
		updatePlaceholderVisibility();

		// Update placeholder text
		const updatePlaceholderText = () => {
			const binding = this.keybindingService.lookupKeybinding('scm.acceptInput');
			const label = binding ? binding.getLabel() : (platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter');
			const placeholderText = format(input.placeholder, label);

			this.inputEditor.updateOptions({ ariaLabel: placeholderText });
			this.placeholderTextContainer.textContent = placeholderText;
		};
		this.repositoryDisposables.add(input.onDidChangePlaceholder(updatePlaceholderText));
		this.repositoryDisposables.add(this.keybindingService.onDidUpdateKeybindings(updatePlaceholderText));
		updatePlaceholderText();

		// Update input template
		let commitTemplate = '';
		const updateTemplate = () => {
			if (typeof input.repository.provider.commitTemplate === 'undefined' || !input.visible) {
				return;
			}

			const oldCommitTemplate = commitTemplate;
			commitTemplate = input.repository.provider.commitTemplate;

			const value = textModel.getValue();

			if (value && value !== oldCommitTemplate) {
				return;
			}

			textModel.setValue(commitTemplate);
		};
		this.repositoryDisposables.add(input.repository.provider.onDidChangeCommitTemplate(updateTemplate, this));
		updateTemplate();

		// Update input enablement
		const updateEnablement = (enabled: boolean) => {
			this.inputEditor.updateOptions({ readOnly: !enabled });
		};
		this.repositoryDisposables.add(input.onDidChangeEnablement(enabled => updateEnablement(enabled)));
		updateEnablement(input.enabled);

		// Save model
		this.model = { input, textModel };
	}

	get selections(): Selection[] | null {
		return this.inputEditor.getSelections();
	}

	set selections(selections: Selection[] | null) {
		if (selections) {
			this.inputEditor.setSelections(selections);
		}
	}

	private setValidation(validation: IInputValidation | undefined, options?: { focus?: boolean; timeout?: boolean }) {
		if (this._validationTimer) {
			clearTimeout(this._validationTimer);
			this._validationTimer = 0;
		}

		this.validation = validation;
		this.renderValidation();

		if (options?.focus && !this.hasFocus()) {
			this.focus();
		}

		if (validation && options?.timeout) {
			this._validationTimer = setTimeout(() => this.setValidation(undefined), SCMInputWidget.ValidationTimeouts[validation.type]);
		}
	}

	constructor(
		container: HTMLElement,
		overflowWidgetsDomNode: HTMLElement,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IModelService private modelService: IModelService,
		@ILanguageService private languageService: ILanguageService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		this.element = append(container, $('.scm-editor'));
		this.editorContainer = append(this.element, $('.scm-editor-container'));
		this.placeholderTextContainer = append(this.editorContainer, $('.scm-editor-placeholder'));

		const fontFamily = this.getInputEditorFontFamily();
		const fontSize = this.getInputEditorFontSize();
		const lineHeight = this.computeLineHeight(fontSize);
		// We respect the configured `editor.accessibilitySupport` setting to be able to have wrapping
		// even when a screen reader is attached.
		const accessibilitySupport = this.configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport');

		this.setPlaceholderFontStyles(fontFamily, fontSize, lineHeight);

		const contextKeyService2 = contextKeyService.createScoped(this.element);
		this.repositoryIdContextKey = contextKeyService2.createKey('scmRepository', undefined);

		const editorOptions: IEditorConstructionOptions = {
			...getSimpleEditorOptions(),
			lineDecorationsWidth: 4,
			dragAndDrop: true,
			cursorWidth: 1,
			fontSize: fontSize,
			lineHeight: lineHeight,
			fontFamily: fontFamily,
			wrappingStrategy: 'advanced',
			wrappingIndent: 'none',
			padding: { top: 3, bottom: 3 },
			quickSuggestions: false,
			scrollbar: { alwaysConsumeMouseWheel: false },
			overflowWidgetsDomNode,
			renderWhitespace: 'none',
			dropIntoEditor: { enabled: true },
			accessibilitySupport
		};

		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			isSimpleWidget: true,
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				ColorDetector.ID,
				ContextMenuController.ID,
				DragAndDropController.ID,
				DropIntoEditorController.ID,
				LinkDetector.ID,
				MenuPreventer.ID,
				MessageController.ID,
				ModesHoverController.ID,
				SelectionClipboardContributionID,
				SnippetController2.ID,
				SuggestController.ID,
			])
		};

		const services = new ServiceCollection([IContextKeyService, contextKeyService2]);
		const instantiationService2 = instantiationService.createChild(services);
		this.inputEditor = instantiationService2.createInstance(CodeEditorWidget, this.editorContainer, editorOptions, codeEditorWidgetOptions);
		this.disposables.add(this.inputEditor);

		this.disposables.add(this.inputEditor.onDidFocusEditorText(() => {
			if (this.input?.repository) {
				this.scmViewService.focus(this.input.repository);
			}

			this.editorContainer.classList.add('synthetic-focus');
			this.renderValidation();
		}));
		this.disposables.add(this.inputEditor.onDidBlurEditorText(() => {
			this.editorContainer.classList.remove('synthetic-focus');

			setTimeout(() => {
				if (!this.validation || !this.validationHasFocus) {
					this.clearValidation();
				}
			}, 0);
		}));

		const firstLineKey = contextKeyService2.createKey<boolean>('scmInputIsInFirstPosition', false);
		const lastLineKey = contextKeyService2.createKey<boolean>('scmInputIsInLastPosition', false);

		this.disposables.add(this.inputEditor.onDidChangeCursorPosition(({ position }) => {
			const viewModel = this.inputEditor._getViewModel()!;
			const lastLineNumber = viewModel.getLineCount();
			const lastLineCol = viewModel.getLineContent(lastLineNumber).length + 1;
			const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
			firstLineKey.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
			lastLineKey.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
		}));

		const relevantSettings = [
			'scm.inputFontFamily',
			'editor.fontFamily', // When `scm.inputFontFamily` is 'editor', we use it as an effective value
			'scm.inputFontSize',
			'editor.accessibilitySupport'
		];

		const onInputFontFamilyChanged = Event.filter(
			this.configurationService.onDidChangeConfiguration,
			(e) => {
				for (const setting of relevantSettings) {
					if (e.affectsConfiguration(setting)) {
						return true;
					}
				}
				return false;
			},
			this.disposables
		);
		this.disposables.add(onInputFontFamilyChanged(() => {
			const fontFamily = this.getInputEditorFontFamily();
			const fontSize = this.getInputEditorFontSize();
			const lineHeight = this.computeLineHeight(fontSize);
			const accessibilitySupport = this.configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport');

			this.inputEditor.updateOptions({
				fontFamily: fontFamily,
				fontSize: fontSize,
				lineHeight: lineHeight,
				accessibilitySupport
			});

			this.setPlaceholderFontStyles(fontFamily, fontSize, lineHeight);
		}));

		this.onDidChangeContentHeight = Event.signal(Event.filter(this.inputEditor.onDidContentSizeChange, e => e.contentHeightChanged, this.disposables));
	}

	getContentHeight(): number {
		const editorContentHeight = this.inputEditor.getContentHeight();
		return Math.min(editorContentHeight, 134);
	}

	layout(): void {
		const editorHeight = this.getContentHeight();
		const dimension = new Dimension(this.element.clientWidth - 2, editorHeight);

		if (dimension.width < 0) {
			this.lastLayoutWasTrash = true;
			return;
		}

		this.lastLayoutWasTrash = false;
		this.inputEditor.layout(dimension);
		this.renderValidation();

		if (this.shouldFocusAfterLayout) {
			this.shouldFocusAfterLayout = false;
			this.focus();
		}
	}

	focus(): void {
		if (this.lastLayoutWasTrash) {
			this.lastLayoutWasTrash = false;
			this.shouldFocusAfterLayout = true;
			return;
		}

		this.inputEditor.focus();
		this.editorContainer.classList.add('synthetic-focus');
	}

	hasFocus(): boolean {
		return this.inputEditor.hasTextFocus();
	}

	private renderValidation(): void {
		this.clearValidation();

		this.editorContainer.classList.toggle('validation-info', this.validation?.type === InputValidationType.Information);
		this.editorContainer.classList.toggle('validation-warning', this.validation?.type === InputValidationType.Warning);
		this.editorContainer.classList.toggle('validation-error', this.validation?.type === InputValidationType.Error);

		if (!this.validation || !this.inputEditor.hasTextFocus()) {
			return;
		}

		const disposables = new DisposableStore();

		this.validationDisposable = this.contextViewService.showContextView({
			getAnchor: () => this.editorContainer,
			render: container => {
				const validationContainer = append(container, $('.scm-editor-validation-container'));
				validationContainer.classList.toggle('validation-info', this.validation!.type === InputValidationType.Information);
				validationContainer.classList.toggle('validation-warning', this.validation!.type === InputValidationType.Warning);
				validationContainer.classList.toggle('validation-error', this.validation!.type === InputValidationType.Error);
				validationContainer.style.width = `${this.editorContainer.clientWidth}px`;
				const element = append(validationContainer, $('.scm-editor-validation'));

				const message = this.validation!.message;
				if (typeof message === 'string') {
					element.textContent = message;
				} else {
					const tracker = trackFocus(element);
					disposables.add(tracker);
					disposables.add(tracker.onDidFocus(() => (this.validationHasFocus = true)));
					disposables.add(tracker.onDidBlur(() => {
						this.validationHasFocus = false;
						this.contextViewService.hideContextView();
					}));

					const renderer = disposables.add(this.instantiationService.createInstance(MarkdownRenderer, {}));
					const renderedMarkdown = renderer.render(message, {
						actionHandler: {
							callback: (content) => {
								this.openerService.open(content, { allowCommands: typeof message !== 'string' && message.isTrusted });
								this.contextViewService.hideContextView();
							},
							disposables: disposables
						},
					});
					disposables.add(renderedMarkdown);
					element.appendChild(renderedMarkdown.element);
				}
				const actionsContainer = append(validationContainer, $('.scm-editor-validation-actions'));
				const actionbar = new ActionBar(actionsContainer);
				const action = new Action('scmInputWidget.validationMessage.close', localize('label.close', "Close"), Codicon.close.classNames, true, () => {
					this.contextViewService.hideContextView();
				});
				disposables.add(actionbar);
				actionbar.push(action, { icon: true, label: false });

				return Disposable.None;
			},
			onHide: () => {
				this.validationHasFocus = false;
				disposables.dispose();
			},
			anchorAlignment: AnchorAlignment.LEFT
		});
	}

	private getInputEditorFontFamily(): string {
		const inputFontFamily = this.configurationService.getValue<string>('scm.inputFontFamily').trim();

		if (inputFontFamily.toLowerCase() === 'editor') {
			return this.configurationService.getValue<string>('editor.fontFamily').trim();
		}

		if (inputFontFamily.length !== 0 && inputFontFamily.toLowerCase() !== 'default') {
			return inputFontFamily;
		}

		return this.defaultInputFontFamily;
	}

	private getInputEditorFontSize(): number {
		return this.configurationService.getValue<number>('scm.inputFontSize');
	}

	private computeLineHeight(fontSize: number): number {
		return Math.round(fontSize * 1.5);
	}

	private setPlaceholderFontStyles(fontFamily: string, fontSize: number, lineHeight: number): void {
		this.placeholderTextContainer.style.fontFamily = fontFamily;
		this.placeholderTextContainer.style.fontSize = `${fontSize}px`;
		this.placeholderTextContainer.style.lineHeight = `${lineHeight}px`;
	}

	clearValidation(): void {
		this.validationDisposable.dispose();
		this.validationHasFocus = false;
	}

	dispose(): void {
		this.input = undefined;
		this.repositoryDisposables.dispose();
		this.clearValidation();
		this.disposables.dispose();
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.scm-editor-validation a { color: ${link}; }`);
	}

	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.scm-editor-validation a:active, .scm-editor-validation a:hover { color: ${activeLink}; }`);
	}
});

export class SCMViewPane extends ViewPane {

	private _onDidLayout: Emitter<void>;
	private layoutCache: ISCMLayout;

	private listContainer!: HTMLElement;
	private tree!: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private _viewModel!: ViewModel;
	get viewModel(): ViewModel { return this._viewModel; }
	private listLabels!: ResourceLabels;
	private inputRenderer!: InputRenderer;
	private actionButtonRenderer!: ActionButtonRenderer;
	private readonly disposables = new DisposableStore();

	constructor(
		options: IViewPaneOptions,
		@ISCMService private scmService: ISCMService,
		@ISCMViewService private scmViewService: ISCMViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService private commandService: ICommandService,
		@IEditorService private editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super({ ...options, titleMenuId: MenuId.SCMTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		this._onDidLayout = new Emitter<void>();
		this.layoutCache = {
			height: undefined,
			width: undefined,
			onDidChange: this._onDidLayout.event
		};

		this._register(Event.any(this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository)(() => this._onDidChangeViewWelcomeState.fire()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// List
		this.listContainer = append(container, $('.scm-view.show-file-icons'));

		const overflowWidgetsDomNode = $('.scm-overflow-widgets-container.monaco-editor');

		const updateActionsVisibility = () => this.listContainer.classList.toggle('show-actions', this.configurationService.getValue<boolean>('scm.alwaysShowActions'));
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowActions'), this.disposables)(updateActionsVisibility));
		updateActionsVisibility();

		const updateProviderCountVisibility = () => {
			const value = this.configurationService.getValue<'hidden' | 'auto' | 'visible'>('scm.providerCountBadge');
			this.listContainer.classList.toggle('hide-provider-counts', value === 'hidden');
			this.listContainer.classList.toggle('auto-provider-counts', value === 'auto');
		};
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.providerCountBadge'), this.disposables)(updateProviderCountVisibility));
		updateProviderCountVisibility();

		this.inputRenderer = this.instantiationService.createInstance(InputRenderer, this.layoutCache, overflowWidgetsDomNode, (input, height) => this.tree.updateElementHeight(input, height));
		const delegate = new ListDelegate(this.inputRenderer);

		this.actionButtonRenderer = this.instantiationService.createInstance(ActionButtonRenderer);

		this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(this.listLabels);

		const actionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
		this._register(actionRunner);
		this._register(actionRunner.onWillRun(() => this.tree.domFocus()));

		const renderers: ICompressibleTreeRenderer<any, any, any>[] = [
			this.instantiationService.createInstance(RepositoryRenderer, getActionViewItemProvider(this.instantiationService)),
			this.inputRenderer,
			this.actionButtonRenderer,
			this.instantiationService.createInstance(ResourceGroupRenderer, getActionViewItemProvider(this.instantiationService)),
			this._register(this.instantiationService.createInstance(ResourceRenderer, () => this._viewModel, this.listLabels, getActionViewItemProvider(this.instantiationService), actionRunner))
		];

		const filter = new SCMTreeFilter();
		const sorter = new SCMTreeSorter(() => this._viewModel);
		const keyboardNavigationLabelProvider = this.instantiationService.createInstance(SCMTreeKeyboardNavigationLabelProvider, () => this._viewModel);
		const identityProvider = new SCMResourceIdentityProvider();

		this.tree = this.instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
			'SCM Tree Repo',
			this.listContainer,
			delegate,
			renderers,
			{
				transformOptimization: false,
				identityProvider,
				horizontalScrolling: false,
				setRowLineHeight: false,
				filter,
				sorter,
				keyboardNavigationLabelProvider,
				overrideStyles: {
					listBackground: this.viewDescriptorService.getViewLocationById(this.id) === ViewContainerLocation.Panel ? PANEL_BACKGROUND : SIDE_BAR_BACKGROUND
				},
				accessibilityProvider: this.instantiationService.createInstance(SCMAccessibilityProvider)
			}) as WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;

		this._register(this.tree.onDidOpen(this.open, this));

		this._register(this.tree.onContextMenu(this.onListContextMenu, this));
		this._register(this.tree.onDidScroll(this.inputRenderer.clearValidation, this.inputRenderer));
		this._register(this.tree);

		append(this.listContainer, overflowWidgetsDomNode);

		this._register(this.instantiationService.createInstance(RepositoryVisibilityActionController));

		this._viewModel = this.instantiationService.createInstance(ViewModel, this.tree, this.inputRenderer);
		this._register(this._viewModel);

		this.listContainer.classList.add('file-icon-themable-tree');
		this.listContainer.classList.add('show-file-icons');

		this.updateIndentStyles(this.themeService.getFileIconTheme());
		this._register(this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this));
		this._register(this._viewModel.onDidChangeMode(this.onDidChangeMode, this));

		this._register(this.onDidChangeBodyVisibility(this._viewModel.setVisible, this._viewModel));

		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowRepositories'), this.disposables)(this.updateActions, this));
		this.updateActions();
	}

	private updateIndentStyles(theme: IFileIconTheme): void {
		this.listContainer.classList.toggle('list-view-mode', this._viewModel.mode === ViewModelMode.List);
		this.listContainer.classList.toggle('tree-view-mode', this._viewModel.mode === ViewModelMode.Tree);
		this.listContainer.classList.toggle('align-icons-and-twisties', (this._viewModel.mode === ViewModelMode.List && theme.hasFileIcons) || (theme.hasFileIcons && !theme.hasFolderIcons));
		this.listContainer.classList.toggle('hide-arrows', this._viewModel.mode === ViewModelMode.Tree && theme.hidesExplorerArrows === true);
	}

	private onDidChangeMode(): void {
		this.updateIndentStyles(this.themeService.getFileIconTheme());
	}

	override layoutBody(height: number | undefined = this.layoutCache.height, width: number | undefined = this.layoutCache.width): void {
		if (height === undefined) {
			return;
		}

		if (width !== undefined) {
			super.layoutBody(height, width);
		}

		this.layoutCache.height = height;
		this.layoutCache.width = width;
		this._onDidLayout.fire();

		this.listContainer.style.height = `${height}px`;
		this.tree.layout(height, width);
	}

	override focus(): void {
		super.focus();

		if (this.isExpanded()) {
			this._viewModel.focus();
		}
	}

	private async open(e: IOpenEvent<TreeElement | undefined>): Promise<void> {
		if (!e.element) {
			return;
		} else if (isSCMRepository(e.element)) {
			this.scmViewService.focus(e.element);
			return;
		} else if (isSCMResourceGroup(e.element)) {
			const provider = e.element.provider;
			const repository = Iterable.find(this.scmService.repositories, r => r.provider === provider);
			if (repository) {
				this.scmViewService.focus(repository);
			}
			return;
		} else if (ResourceTree.isResourceNode(e.element)) {
			const provider = e.element.context.provider;
			const repository = Iterable.find(this.scmService.repositories, r => r.provider === provider);
			if (repository) {
				this.scmViewService.focus(repository);
			}
			return;
		} else if (isSCMInput(e.element)) {
			this.scmViewService.focus(e.element.repository);

			const widget = this.inputRenderer.getRenderedInputWidget(e.element);

			if (widget) {
				widget.focus();
				this.tree.setFocus([], e.browserEvent);

				const selection = this.tree.getSelection();

				if (selection.length === 1 && selection[0] === e.element) {
					setTimeout(() => this.tree.setSelection([]));
				}
			}

			return;
		} else if (isSCMActionButton(e.element)) {
			this.scmViewService.focus(e.element.repository);

			// Focus the action button
			const target = e.browserEvent?.target as HTMLElement;
			if (target.classList.contains('monaco-tl-row') || target.classList.contains('button-container')) {
				this.actionButtonRenderer.focusActionButton(e.element);
				this.tree.setFocus([], e.browserEvent);
			}

			return;
		}

		// ISCMResource
		if (e.element.command?.id === API_OPEN_EDITOR_COMMAND_ID || e.element.command?.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
			await this.commandService.executeCommand(e.element.command.id, ...(e.element.command.arguments || []), e);
		} else {
			await e.element.open(!!e.editorOptions.preserveFocus);

			if (e.editorOptions.pinned) {
				const activeEditorPane = this.editorService.activeEditorPane;

				activeEditorPane?.group.pinEditor(activeEditorPane.input);
			}
		}

		const provider = e.element.resourceGroup.provider;
		const repository = Iterable.find(this.scmService.repositories, r => r.provider === provider);

		if (repository) {
			this.scmViewService.focus(repository);
		}
	}

	private onListContextMenu(e: ITreeContextMenuEvent<TreeElement | null>): void {
		if (!e.element) {
			const menu = this.menuService.createMenu(Menus.ViewSort, this.contextKeyService);
			const actions: IAction[] = [];
			createAndFillInContextMenuActions(menu, undefined, actions);

			return this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions,
				onHide: () => {
					menu.dispose();
				}
			});
		}

		const element = e.element;
		let context: any = element;
		let actions: IAction[] = [];

		if (isSCMRepository(element)) {
			const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
			const menu = menus.repositoryMenu;
			context = element.provider;
			actions = collectContextMenuActions(menu);
		} else if (isSCMInput(element) || isSCMActionButton(element)) {
			// noop
		} else if (isSCMResourceGroup(element)) {
			const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
			const menu = menus.getResourceGroupMenu(element);
			actions = collectContextMenuActions(menu);
		} else if (ResourceTree.isResourceNode(element)) {
			if (element.element) {
				const menus = this.scmViewService.menus.getRepositoryMenus(element.element.resourceGroup.provider);
				const menu = menus.getResourceMenu(element.element);
				actions = collectContextMenuActions(menu);
			} else {
				const menus = this.scmViewService.menus.getRepositoryMenus(element.context.provider);
				const menu = menus.getResourceFolderMenu(element.context);
				actions = collectContextMenuActions(menu);
			}
		} else {
			const menus = this.scmViewService.menus.getRepositoryMenus(element.resourceGroup.provider);
			const menu = menus.getResourceMenu(element);
			actions = collectContextMenuActions(menu);
		}

		const actionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
		actionRunner.onWillRun(() => this.tree.domFocus());

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => context,
			actionRunner
		});
	}

	private getSelectedResources(): (ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>)[] {
		return this.tree.getSelection()
			.filter(r => !!r && !isSCMResourceGroup(r))! as any;
	}

	override shouldShowWelcome(): boolean {
		return this.scmService.repositoryCount === 0;
	}

	override getActionsContext(): unknown {
		return this.scmViewService.visibleRepositories.length === 1 ? this.scmViewService.visibleRepositories[0].provider : undefined;
	}

	override dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}
}

export const scmProviderSeparatorBorderColor = registerColor('scm.providerBorder', { dark: '#454545', light: '#C8C8C8', hcDark: contrastBorder, hcLight: contrastBorder }, localize('scm.providerBorder', "SCM Provider separator border."));

registerThemingParticipant((theme, collector) => {
	const inputBackgroundColor = theme.getColor(inputBackground);
	if (inputBackgroundColor) {
		collector.addRule(`.scm-view .scm-editor-container .monaco-editor-background,
		.scm-view .scm-editor-container .monaco-editor,
		.scm-view .scm-editor-container .monaco-editor .margin
		{ background-color: ${inputBackgroundColor} !important; }`);
	}

	const selectionBackgroundColor = theme.getColor(selectionBackground) ?? theme.getColor(editorSelectionBackground);
	if (selectionBackgroundColor) {
		collector.addRule(`.scm-view .scm-editor-container .monaco-editor .focused .selected-text { background-color: ${selectionBackgroundColor}; }`);
	}

	const inputForegroundColor = theme.getColor(inputForeground);
	if (inputForegroundColor) {
		collector.addRule(`.scm-view .scm-editor-container .mtk1 { color: ${inputForegroundColor}; }`);
	}

	const inputBorderColor = theme.getColor(inputBorder);
	if (inputBorderColor) {
		collector.addRule(`.scm-view .scm-editor-container { outline: 1px solid ${inputBorderColor}; }`);
	}

	const panelInputBorder = theme.getColor(PANEL_INPUT_BORDER);
	if (panelInputBorder) {
		collector.addRule(`.monaco-workbench .part.panel .scm-view .scm-editor-container { outline: 1px solid ${panelInputBorder}; }`);
	}

	const buttonBorderColor = theme.getColor(buttonBorder);
	collector.addRule(`.scm-view .button-container .monaco-description-button { height: ${buttonBorderColor ? '32px' : '30px'}; }`);

	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`.scm-view .scm-editor-container.synthetic-focus { outline: 1px solid ${focusBorderColor}; }`);
	}

	const inputPlaceholderForegroundColor = theme.getColor(inputPlaceholderForeground);
	if (inputPlaceholderForegroundColor) {
		collector.addRule(`.scm-view .scm-editor-placeholder { color: ${inputPlaceholderForegroundColor}; }`);
	}

	const inputValidationInfoBorderColor = theme.getColor(inputValidationInfoBorder);
	if (inputValidationInfoBorderColor) {
		collector.addRule(`.scm-view .scm-editor-container.validation-info { outline: 1px solid ${inputValidationInfoBorderColor} !important; }`);
		collector.addRule(`.scm-editor-validation-container.validation-info { border-color: ${inputValidationInfoBorderColor}; }`);
	}

	const inputValidationInfoBackgroundColor = theme.getColor(inputValidationInfoBackground);
	if (inputValidationInfoBackgroundColor) {
		collector.addRule(`.scm-editor-validation-container.validation-info { background-color: ${inputValidationInfoBackgroundColor}; }`);
	}

	const inputValidationInfoForegroundColor = theme.getColor(inputValidationInfoForeground);
	if (inputValidationInfoForegroundColor) {
		collector.addRule(`.scm-editor-validation-container.validation-info { color: ${inputValidationInfoForegroundColor}; }`);
	}

	const inputValidationWarningBorderColor = theme.getColor(inputValidationWarningBorder);
	if (inputValidationWarningBorderColor) {
		collector.addRule(`.scm-view .scm-editor-container.validation-warning { outline: 1px solid ${inputValidationWarningBorderColor} !important; }`);
		collector.addRule(`.scm-editor-validation-container.validation-warning { border-color: ${inputValidationWarningBorderColor}; }`);
	}

	const inputValidationWarningBackgroundColor = theme.getColor(inputValidationWarningBackground);
	if (inputValidationWarningBackgroundColor) {
		collector.addRule(`.scm-editor-validation-container.validation-warning { background-color: ${inputValidationWarningBackgroundColor}; }`);
	}

	const inputValidationWarningForegroundColor = theme.getColor(inputValidationWarningForeground);
	if (inputValidationWarningForegroundColor) {
		collector.addRule(`.scm-editor-validation-container.validation-warning { color: ${inputValidationWarningForegroundColor}; }`);
	}

	const inputValidationErrorBorderColor = theme.getColor(inputValidationErrorBorder);
	if (inputValidationErrorBorderColor) {
		collector.addRule(`.scm-view .scm-editor-container.validation-error { outline: 1px solid ${inputValidationErrorBorderColor} !important; }`);
		collector.addRule(`.scm-editor-validation-container.validation-error { border-color: ${inputValidationErrorBorderColor}; }`);
	}

	const inputValidationErrorBackgroundColor = theme.getColor(inputValidationErrorBackground);
	if (inputValidationErrorBackgroundColor) {
		collector.addRule(`.scm-editor-validation-container.validation-error { background-color: ${inputValidationErrorBackgroundColor}; }`);
	}

	const inputValidationErrorForegroundColor = theme.getColor(inputValidationErrorForeground);
	if (inputValidationErrorForegroundColor) {
		collector.addRule(`.scm-editor-validation-container.validation-error { color: ${inputValidationErrorForegroundColor}; }`);
	}

	const repositoryStatusActionsBorderColor = theme.getColor(SIDE_BAR_BORDER);
	if (repositoryStatusActionsBorderColor) {
		collector.addRule(`.scm-view .scm-provider > .status > .monaco-action-bar > .actions-container { border-color: ${repositoryStatusActionsBorderColor}; }`);
	}
});

export class SCMActionButton implements IDisposable {
	private button: Button | ButtonWithDescription | ButtonWithDropdown | undefined;
	private readonly disposables = new MutableDisposable<DisposableStore>();

	constructor(
		private readonly container: HTMLElement,
		private readonly contextMenuService: IContextMenuService,
		private readonly commandService: ICommandService,
		private readonly themeService: IThemeService,
		private readonly notificationService: INotificationService
	) {
	}

	dispose(): void {
		this.disposables?.dispose();
	}

	setButton(button: ISCMActionButtonDescriptor | undefined): void {
		// Clear old button
		this.clear();
		if (!button) {
			return;
		}

		if (button.secondaryCommands?.length) {
			const actions: IAction[] = [];
			for (let index = 0; index < button.secondaryCommands.length; index++) {
				const commands = button.secondaryCommands[index];
				for (const command of commands) {
					actions.push(new Action(command.id, command.title, undefined, true, async () => await this.executeCommand(command.id, ...(command.arguments || []))));
				}
				if (commands.length) {
					actions.push(new Separator());
				}
			}
			// Remove last separator
			actions.pop();

			// ButtonWithDropdown
			this.button = new ButtonWithDropdown(this.container, {
				actions: actions,
				addPrimaryActionToDropdown: false,
				contextMenuProvider: this.contextMenuService,
				title: button.command.tooltip,
				supportIcons: true
			});
		} else if (button.description) {
			// ButtonWithDescription
			this.button = new ButtonWithDescription(this.container, { supportIcons: true, title: button.command.tooltip });
			(this.button as ButtonWithDescription).description = button.description;
		} else {
			// Button
			this.button = new Button(this.container, { supportIcons: true, title: button.command.tooltip });
		}

		this.button.enabled = button.enabled;
		this.button.label = button.command.title;
		this.button.onDidClick(async () => await this.executeCommand(button.command.id, ...(button.command.arguments || [])), null, this.disposables.value);

		this.disposables.value!.add(this.button);
		this.disposables.value!.add(attachButtonStyler(this.button, this.themeService));
	}

	focus(): void {
		this.button?.focus();
	}

	private clear(): void {
		this.disposables.value = new DisposableStore();
		this.button = undefined;
		clearNode(this.container);
	}

	private async executeCommand(commandId: string, ...args: any[]): Promise<void> {
		try {
			await this.commandService.executeCommand(commandId, ...args);
		} catch (ex) {
			this.notificationService.error(ex);
		}
	}
}
