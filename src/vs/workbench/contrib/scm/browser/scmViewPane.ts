/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/scm.css';
import { Event, Emitter } from '../../../../base/common/event.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { IDisposable, Disposable, DisposableStore, combinedDisposable, dispose, toDisposable, MutableDisposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ViewPane, IViewPaneOptions, ViewAction } from '../../../browser/parts/views/viewPane.js';
import { append, $, Dimension, asCSSUrl, trackFocus, clearNode, isPointerEvent, isActiveElement } from '../../../../base/browser/dom.js';
import { IListVirtualDelegate, IIdentityProvider } from '../../../../base/browser/ui/list/list.js';
import { ISCMResourceGroup, ISCMResource, InputValidationType, ISCMRepository, ISCMInput, IInputValidation, ISCMViewService, ISCMViewVisibleRepositoryChangeEvent, ISCMService, SCMInputChangeReason, VIEW_PANE_ID, ISCMActionButton, ISCMActionButtonDescriptor, ISCMRepositorySortKey, ISCMInputValueProviderContext } from '../common/scm.js';
import { ResourceLabels, IResourceLabel, IFileLabelOptions } from '../../../browser/labels.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextViewService, IContextMenuService, IOpenContextView } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService, IContextKey, ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { MenuItemAction, IMenuService, registerAction2, MenuId, IAction2Options, MenuRegistry, Action2, IMenu } from '../../../../platform/actions/common/actions.js';
import { IAction, ActionRunner, Action, Separator, IActionRunner } from '../../../../base/common/actions.js';
import { ActionBar, IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IThemeService, IFileIconTheme } from '../../../../platform/theme/common/themeService.js';
import { isSCMResource, isSCMResourceGroup, connectPrimaryMenuToInlineActionBar, isSCMRepository, isSCMInput, collectContextMenuActions, getActionViewItemProvider, isSCMActionButton, isSCMViewService, isSCMResourceNode } from './util.js';
import { WorkbenchCompressibleAsyncDataTree, IOpenEvent } from '../../../../platform/list/browser/listService.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { disposableTimeout, Sequencer, ThrottledDelayer, Throttler } from '../../../../base/common/async.js';
import { ITreeNode, ITreeFilter, ITreeSorter, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeDragOverReaction, IAsyncDataSource } from '../../../../base/browser/ui/tree/tree.js';
import { ResourceTree, IResourceNode } from '../../../../base/common/resourceTree.js';
import { ICompressibleTreeRenderer, ICompressibleKeyboardNavigationLabelProvider } from '../../../../base/browser/ui/tree/objectTree.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { URI } from '../../../../base/common/uri.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { compareFileNames, comparePaths } from '../../../../base/common/comparers.js';
import { FuzzyScore, createMatches, IMatch } from '../../../../base/common/filters.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { localize } from '../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorConstructionOptions } from '../../../../editor/browser/config/editorConfiguration.js';
import { getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from '../../codeEditor/browser/simpleEditorOptions.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { MenuPreventer } from '../../codeEditor/browser/menuPreventer.js';
import { SelectionClipboardContributionID } from '../../codeEditor/browser/selectionClipboard.js';
import { EditorDictation } from '../../codeEditor/browser/dictation/editorDictation.js';
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import * as platform from '../../../../base/common/platform.js';
import { compare, format } from '../../../../base/common/strings.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ColorDetector } from '../../../../editor/contrib/colorPicker/browser/colorDetector.js';
import { LinkDetector } from '../../../../editor/contrib/links/browser/links.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DEFAULT_FONT_FAMILY } from '../../../../base/browser/fonts.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { RepositoryActionRunner, RepositoryRenderer } from './scmRepositoryRenderer.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { LabelFuzzyScore } from '../../../../base/browser/ui/tree/abstractTree.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { createActionViewItem, createAndFillInActionBarActions, createAndFillInContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MarkdownRenderer, openLinkFromMarkdown } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { Button, ButtonWithDescription, ButtonWithDropdown } from '../../../../base/browser/ui/button/button.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { RepositoryContextKeys } from './scmViewService.js';
import { DragAndDropController } from '../../../../editor/contrib/dnd/browser/dnd.js';
import { CopyPasteController } from '../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js';
import { DropIntoEditorController } from '../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js';
import { MessageController } from '../../../../editor/contrib/message/browser/messageController.js';
import { defaultButtonStyles, defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { InlineCompletionsController } from '../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { Schemas } from '../../../../base/common/network.js';
import { IDragAndDropData } from '../../../../base/browser/dnd.js';
import { fillEditorsDragData } from '../../../browser/dnd.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../base/browser/ui/list/listView.js';
import { CodeDataTransfers } from '../../../../platform/dnd/browser/dnd.js';
import { FormatOnType } from '../../../../editor/contrib/format/browser/formatActions.js';
import { EditorOption, EditorOptions, IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IAsyncDataTreeViewState, ITreeCompressionDelegate } from '../../../../base/browser/ui/tree/asyncDataTree.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { IMenuWorkbenchToolBarOptions, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { clamp, rot } from '../../../../base/common/numbers.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { OpenScmGroupAction } from '../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js';
import { ContentHoverController } from '../../../../editor/contrib/hover/browser/contentHoverController.js';
import { GlyphHoverController } from '../../../../editor/contrib/hover/browser/glyphHoverController.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { autorun } from '../../../../base/common/observable.js';
import { PlaceholderTextContribution } from '../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';

type TreeElement = ISCMRepository | ISCMInput | ISCMActionButton | ISCMResourceGroup | ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>;

function processResourceFilterData(uri: URI, filterData: FuzzyScore | LabelFuzzyScore | undefined): [IMatch[] | undefined, IMatch[] | undefined] {
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

export class ActionButtonRenderer implements ICompressibleTreeRenderer<ISCMActionButton, FuzzyScore, ActionButtonTemplate> {
	static readonly DEFAULT_HEIGHT = 30;

	static readonly TEMPLATE_ID = 'actionButton';
	get templateId(): string { return ActionButtonRenderer.TEMPLATE_ID; }

	private actionButtons = new Map<ISCMActionButton, SCMActionButton>();

	constructor(
		@ICommandService private commandService: ICommandService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@INotificationService private notificationService: INotificationService,
	) { }

	renderTemplate(container: HTMLElement): ActionButtonTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie');

		// Use default cursor & disable hover for list item
		container.parentElement!.parentElement!.classList.add('cursor-default', 'force-no-hover');

		const buttonContainer = append(container, $('.button-container'));
		const actionButton = new SCMActionButton(buttonContainer, this.contextMenuService, this.commandService, this.notificationService);

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


class SCMTreeDragAndDrop implements ITreeDragAndDrop<TreeElement> {
	constructor(private readonly instantiationService: IInstantiationService) { }

	getDragURI(element: TreeElement): string | null {
		if (isSCMResource(element)) {
			return element.sourceUri.toString();
		}

		return null;
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		const items = SCMTreeDragAndDrop.getResourcesFromDragAndDropData(data as ElementsDragAndDropData<TreeElement, TreeElement[]>);
		if (originalEvent.dataTransfer && items?.length) {
			this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, items, originalEvent));

			const fileResources = items.filter(s => s.scheme === Schemas.file).map(r => r.fsPath);
			if (fileResources.length) {
				originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
			}
		}
	}

	getDragLabel(elements: TreeElement[], originalEvent: DragEvent): string | undefined {
		if (elements.length === 1) {
			const element = elements[0];
			if (isSCMResource(element)) {
				return basename(element.sourceUri);
			}
		}

		return String(elements.length);
	}

	onDragOver(data: IDragAndDropData, targetElement: TreeElement | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		return true;
	}

	drop(data: IDragAndDropData, targetElement: TreeElement | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void { }

	private static getResourcesFromDragAndDropData(data: ElementsDragAndDropData<TreeElement, TreeElement[]>): URI[] {
		const uris: URI[] = [];
		for (const element of [...data.context ?? [], ...data.elements]) {
			if (isSCMResource(element)) {
				uris.push(element.sourceUri);
			}
		}
		return uris;
	}

	dispose(): void { }
}

interface InputTemplate {
	readonly inputWidget: SCMInputWidget;
	inputWidgetHeight: number;
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
		@IInstantiationService private instantiationService: IInstantiationService
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

		return { inputWidget, inputWidgetHeight: InputRenderer.DEFAULT_HEIGHT, elementDisposables: new DisposableStore(), templateDisposable };
	}

	renderElement(node: ITreeNode<ISCMInput, FuzzyScore>, index: number, templateData: InputTemplate): void {
		const input = node.element;
		templateData.inputWidget.input = input;

		// Remember widget
		this.inputWidgets.set(input, templateData.inputWidget);
		templateData.elementDisposables.add({
			dispose: () => this.inputWidgets.delete(input)
		});

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

		// Reset widget height so it's recalculated
		templateData.inputWidgetHeight = InputRenderer.DEFAULT_HEIGHT;

		// Rerender the element whenever the editor content height changes
		const onDidChangeContentHeight = () => {
			const contentHeight = templateData.inputWidget.getContentHeight();
			this.contentHeights.set(input, contentHeight);

			if (templateData.inputWidgetHeight !== contentHeight) {
				this.updateHeight(input, contentHeight + 10);
				templateData.inputWidgetHeight = contentHeight;
				templateData.inputWidget.layout();
			}
		};

		const startListeningContentHeightChange = () => {
			templateData.elementDisposables.add(templateData.inputWidget.onDidChangeContentHeight(onDidChangeContentHeight));
			onDidChangeContentHeight();
		};

		// Setup height change listener on next tick
		disposableTimeout(startListeningContentHeightChange, 0, templateData.elementDisposables);

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
		@ISCMViewService private scmViewService: ISCMViewService
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		// hack
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-twistie');

		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer, {}, defaultCountBadgeStyles);
		const disposables = combinedDisposable(actionBar);

		return { name, count, actionBar, elementDisposables: new DisposableStore(), disposables };
	}

	renderElement(node: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		const group = node.element;
		template.name.textContent = group.label;
		template.actionBar.clear();
		template.actionBar.context = group;
		template.count.setCount(group.resources.length);

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
	actionBarMenu: IMenu | undefined;
	readonly actionBarMenuListener: MutableDisposable<IDisposable>;
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

	protected override async runAction(action: IAction, context: ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>): Promise<any> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const selection = this.getSelectedResources();
		const contextIsSelected = selection.some(s => s === context);
		const actualContext = contextIsSelected ? selection : [context];
		const args = actualContext.map(e => ResourceTree.isResourceNode(e) ? ResourceTree.collect(e) : [e]).flat();
		await action.run(...args);
	}
}

class ResourceRenderer implements ICompressibleTreeRenderer<ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore | LabelFuzzyScore, ResourceTemplate> {

	static readonly TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	private readonly disposables = new DisposableStore();
	private renderedResources = new Map<ResourceTemplate, RenderedResourceData>();

	constructor(
		private viewMode: () => ViewMode,
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
		const actionBarMenuListener = new MutableDisposable<IDisposable>();
		const disposables = combinedDisposable(actionBar, fileLabel, actionBarMenuListener);

		return { element, name, fileLabel, decorationIcon, actionBar, actionBarMenu: undefined, actionBarMenuListener, elementDisposables: new DisposableStore(), disposables };
	}

	renderElement(node: ITreeNode<ISCMResource, FuzzyScore | LabelFuzzyScore> | ITreeNode<ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore | LabelFuzzyScore>, index: number, template: ResourceTemplate): void {
		const resourceOrFolder = node.element;
		const iconResource = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.element : resourceOrFolder;
		const uri = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.uri : resourceOrFolder.sourceUri;
		const fileKind = ResourceTree.isResourceNode(resourceOrFolder) ? FileKind.FOLDER : FileKind.FILE;
		const tooltip = !ResourceTree.isResourceNode(resourceOrFolder) && resourceOrFolder.decorations.tooltip || '';
		const hidePath = this.viewMode() === ViewMode.Tree;

		let matches: IMatch[] | undefined;
		let descriptionMatches: IMatch[] | undefined;
		let strikethrough: boolean | undefined;

		if (ResourceTree.isResourceNode(resourceOrFolder)) {
			if (resourceOrFolder.element) {
				const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.element.resourceGroup.provider);
				this._renderActionBar(template, resourceOrFolder, menus.getResourceMenu(resourceOrFolder.element));

				template.element.classList.toggle('faded', resourceOrFolder.element.decorations.faded);
				strikethrough = resourceOrFolder.element.decorations.strikeThrough;
			} else {
				const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.context.provider);
				this._renderActionBar(template, resourceOrFolder, menus.getResourceFolderMenu(resourceOrFolder.context));

				matches = createMatches(node.filterData as FuzzyScore | undefined);
				template.element.classList.remove('faded');
			}
		} else {
			const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.resourceGroup.provider);
			this._renderActionBar(template, resourceOrFolder, menus.getResourceMenu(resourceOrFolder));

			[matches, descriptionMatches] = processResourceFilterData(uri, node.filterData);
			template.element.classList.toggle('faded', resourceOrFolder.decorations.faded);
			strikethrough = resourceOrFolder.decorations.strikeThrough;
		}

		const renderedData: RenderedResourceData = {
			tooltip, uri, fileLabelOptions: { hidePath, fileKind, matches, descriptionMatches, strikethrough }, iconResource
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

		const menus = this.scmViewService.menus.getRepositoryMenus(folder.context.provider);
		this._renderActionBar(template, folder, menus.getResourceFolderMenu(folder.context));

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

	private _renderActionBar(template: ResourceTemplate, resourceOrFolder: ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, menu: IMenu): void {
		if (!template.actionBarMenu || template.actionBarMenu !== menu) {
			template.actionBar.clear();

			template.actionBarMenu = menu;
			template.actionBarMenuListener.value = connectPrimaryMenuToInlineActionBar(menu, template.actionBar);
		}

		template.actionBar.context = resourceOrFolder;
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
		} else if (isSCMResourceGroup(element)) {
			return ResourceGroupRenderer.TEMPLATE_ID;
		} else if (isSCMResource(element) || isSCMResourceNode(element)) {
			return ResourceRenderer.TEMPLATE_ID;
		} else {
			throw new Error('Unknown element');
		}
	}
}

class SCMTreeCompressionDelegate implements ITreeCompressionDelegate<TreeElement> {

	isIncompressible(element: TreeElement): boolean {
		if (ResourceTree.isResourceNode(element)) {
			return element.childrenCount === 0 || !element.parent || !element.parent.parent;
		}

		return true;
	}

}

class SCMTreeFilter implements ITreeFilter<TreeElement> {

	filter(element: TreeElement): boolean {
		if (isSCMResourceGroup(element)) {
			return element.resources.length > 0 || !element.hideWhenEmpty;
		} else {
			return true;
		}
	}
}

export class SCMTreeSorter implements ITreeSorter<TreeElement> {

	constructor(
		private readonly viewMode: () => ViewMode,
		private readonly viewSortKey: () => ViewSortKey) { }

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
			return isSCMResourceGroup(other) ? 0 : -1;
		}

		// Resource (List)
		if (this.viewMode() === ViewMode.List) {
			// FileName
			if (this.viewSortKey() === ViewSortKey.Name) {
				const oneName = basename((one as ISCMResource).sourceUri);
				const otherName = basename((other as ISCMResource).sourceUri);

				return compareFileNames(oneName, otherName);
			}

			// Status
			if (this.viewSortKey() === ViewSortKey.Status) {
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

		// Resource (Tree)
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
		private viewMode: () => ViewMode,
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
			if (this.viewMode() === ViewMode.List) {
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
	if (isSCMRepository(element)) {
		const provider = element.provider;
		return `repo:${provider.id}`;
	} else if (isSCMInput(element)) {
		const provider = element.repository.provider;
		return `input:${provider.id}`;
	} else if (isSCMActionButton(element)) {
		const provider = element.repository.provider;
		return `actionButton:${provider.id}`;
	} else if (isSCMResourceGroup(element)) {
		const provider = element.provider;
		return `resourceGroup:${provider.id}/${element.id}`;
	} else if (isSCMResource(element)) {
		const group = element.resourceGroup;
		const provider = group.provider;
		return `resource:${provider.id}/${group.id}/${element.sourceUri.toString()}`;
	} else if (isSCMResourceNode(element)) {
		const group = element.context;
		return `folder:${group.provider.id}/${group.id}/$FOLDER/${element.uri.toString()}`;
	} else {
		throw new Error('Invalid tree element');
	}
}

class SCMResourceIdentityProvider implements IIdentityProvider<TreeElement> {

	getId(element: TreeElement): string {
		return getSCMResourceId(element);
	}
}

export class SCMAccessibilityProvider implements IListAccessibilityProvider<TreeElement> {

	constructor(
		@ILabelService private readonly labelService: ILabelService
	) { }

	getWidgetAriaLabel(): string {
		return localize('scm', "Source Control Management");
	}

	getAriaLabel(element: TreeElement): string {
		if (ResourceTree.isResourceNode(element)) {
			return this.labelService.getUriLabel(element.uri, { relative: true, noPrefix: true }) || element.name;
		} else if (isSCMRepository(element)) {
			return `${element.provider.name} ${element.provider.label}`;
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

const enum ViewMode {
	List = 'list',
	Tree = 'tree'
}

const enum ViewSortKey {
	Path = 'path',
	Name = 'name',
	Status = 'status'
}

const Menus = {
	ViewSort: new MenuId('SCMViewSort'),
	Repositories: new MenuId('SCMRepositories'),
	ChangesSettings: new MenuId('SCMChangesSettings'),
};

export const ContextKeys = {
	SCMViewMode: new RawContextKey<ViewMode>('scmViewMode', ViewMode.List),
	SCMViewSortKey: new RawContextKey<ViewSortKey>('scmViewSortKey', ViewSortKey.Path),
	SCMViewAreAllRepositoriesCollapsed: new RawContextKey<boolean>('scmViewAreAllRepositoriesCollapsed', false),
	SCMViewIsAnyRepositoryCollapsible: new RawContextKey<boolean>('scmViewIsAnyRepositoryCollapsible', false),
	SCMProvider: new RawContextKey<string | undefined>('scmProvider', undefined),
	SCMProviderRootUri: new RawContextKey<string | undefined>('scmProviderRootUri', undefined),
	SCMProviderHasRootUri: new RawContextKey<boolean>('scmProviderHasRootUri', undefined),
	SCMHistoryItemCount: new RawContextKey<number>('scmHistoryItemCount', 0),
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
	group: '0_view&sort',
	order: 1
});

MenuRegistry.appendMenuItem(Menus.ViewSort, {
	title: localize('repositories', "Repositories"),
	submenu: Menus.Repositories,
	when: ContextKeyExpr.greater(ContextKeys.RepositoryCount.key, 1),
	group: '0_repositories'
});

class RepositoryVisibilityAction extends Action2 {

	private repository: ISCMRepository;

	constructor(repository: ISCMRepository) {
		super({
			id: `workbench.scm.action.toggleRepositoryVisibility.${repository.provider.id}`,
			title: repository.provider.name,
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
	private readonly disposables = new DisposableStore();

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@ISCMService scmService: ISCMService
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

		this.updateRepositoryContextKeys();
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		this.items.get(repository)?.dispose();
		this.items.delete(repository);
		this.updateRepositoryContextKeys();
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

	private updateRepositoryContextKeys(): void {
		this.repositoryCountContextKey.set(this.items.size);
		this.repositoryVisibilityCountContextKey.set(Iterable.reduce(this.items.keys(), (r, repository) => r + (this.scmViewService.isVisible(repository) ? 1 : 0), 0));
	}

	dispose(): void {
		this.disposables.dispose();
		dispose(this.items.values());
		this.items.clear();
	}
}

class SetListViewModeAction extends ViewAction<SCMViewPane> {
	constructor(
		id = 'workbench.scm.action.setListViewMode',
		menu: Partial<IAction2Options['menu']> = {}) {
		super({
			id,
			title: localize('setListViewMode', "View as List"),
			viewId: VIEW_PANE_ID,
			f1: false,
			icon: Codicon.listTree,
			toggled: ContextKeys.SCMViewMode.isEqualTo(ViewMode.List),
			menu: { id: Menus.ViewSort, group: '1_viewmode', ...menu }
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.viewMode = ViewMode.List;
	}
}

class SetListViewModeNavigationAction extends SetListViewModeAction {
	constructor() {
		super(
			'workbench.scm.action.setListViewModeNavigation',
			{
				id: MenuId.SCMTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.SCMViewMode.isEqualTo(ViewMode.Tree)),
				group: 'navigation',
				order: -1000
			});
	}
}

class SetTreeViewModeAction extends ViewAction<SCMViewPane> {
	constructor(
		id = 'workbench.scm.action.setTreeViewMode',
		menu: Partial<IAction2Options['menu']> = {}) {
		super(
			{
				id,
				title: localize('setTreeViewMode', "View as Tree"),
				viewId: VIEW_PANE_ID,
				f1: false,
				icon: Codicon.listFlat,
				toggled: ContextKeys.SCMViewMode.isEqualTo(ViewMode.Tree),
				menu: { id: Menus.ViewSort, group: '1_viewmode', ...menu }
			});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.viewMode = ViewMode.Tree;
	}
}

class SetTreeViewModeNavigationAction extends SetTreeViewModeAction {
	constructor() {
		super(
			'workbench.scm.action.setTreeViewModeNavigation',
			{
				id: MenuId.SCMTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.SCMViewMode.isEqualTo(ViewMode.List)),
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
					id: MenuId.SCMSourceControlTitle,
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

abstract class SetSortKeyAction extends ViewAction<SCMViewPane> {
	constructor(private sortKey: ViewSortKey, title: string) {
		super({
			id: `workbench.scm.action.setSortKey.${sortKey}`,
			title,
			viewId: VIEW_PANE_ID,
			f1: false,
			toggled: ContextKeys.SCMViewSortKey.isEqualTo(sortKey),
			precondition: ContextKeys.SCMViewMode.isEqualTo(ViewMode.List),
			menu: { id: Menus.ViewSort, group: '2_sort' }
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.viewSortKey = this.sortKey;
	}
}

class SetSortByNameAction extends SetSortKeyAction {
	constructor() {
		super(ViewSortKey.Name, localize('sortChangesByName', "Sort Changes by Name"));
	}
}

class SetSortByPathAction extends SetSortKeyAction {
	constructor() {
		super(ViewSortKey.Path, localize('sortChangesByPath', "Sort Changes by Path"));
	}
}

class SetSortByStatusAction extends SetSortKeyAction {
	constructor() {
		super(ViewSortKey.Status, localize('sortChangesByStatus', "Sort Changes by Status"));
	}
}

registerAction2(SetSortByNameAction);
registerAction2(SetSortByPathAction);
registerAction2(SetSortByStatusAction);

class CollapseAllRepositoriesAction extends ViewAction<SCMViewPane> {

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
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.SCMViewIsAnyRepositoryCollapsible.isEqualTo(true), ContextKeys.SCMViewAreAllRepositoriesCollapsed.isEqualTo(false))
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.collapseAllRepositories();
	}
}

class ExpandAllRepositoriesAction extends ViewAction<SCMViewPane> {

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
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.SCMViewIsAnyRepositoryCollapsible.isEqualTo(true), ContextKeys.SCMViewAreAllRepositoriesCollapsed.isEqualTo(true))
			}
		});
	}

	async runInView(_: ServicesAccessor, view: SCMViewPane): Promise<void> {
		view.expandAllRepositories();
	}
}

registerAction2(CollapseAllRepositoriesAction);
registerAction2(ExpandAllRepositoriesAction);

const enum SCMInputWidgetCommandId {
	CancelAction = 'scm.input.cancelAction'
}

const enum SCMInputWidgetStorageKey {
	LastActionId = 'scm.input.lastActionId'
}

class SCMInputWidgetActionRunner extends ActionRunner {

	private readonly _runningActions = new Set<IAction>();
	public get runningActions(): Set<IAction> { return this._runningActions; }

	private _cts: CancellationTokenSource | undefined;

	constructor(
		private readonly input: ISCMInput,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
	}

	protected override async runAction(action: IAction): Promise<void> {
		try {
			// Cancel previous action
			if (this.runningActions.size !== 0) {
				this._cts?.cancel();

				if (action.id === SCMInputWidgetCommandId.CancelAction) {
					return;
				}
			}

			// Create action context
			const context: ISCMInputValueProviderContext[] = [];
			for (const group of this.input.repository.provider.groups) {
				context.push({
					resourceGroupId: group.id,
					resources: [...group.resources.map(r => r.sourceUri)]
				});
			}

			// Run action
			this._runningActions.add(action);
			this._cts = new CancellationTokenSource();
			await action.run(...[this.input.repository.provider.rootUri, context, this._cts.token]);
		} finally {
			this._runningActions.delete(action);

			// Save last action
			if (this._runningActions.size === 0) {
				this.storageService.store(SCMInputWidgetStorageKey.LastActionId, action.id, StorageScope.PROFILE, StorageTarget.USER);
			}
		}
	}

}

class SCMInputWidgetToolbar extends WorkbenchToolBar {

	private _dropdownActions: IAction[] = [];
	get dropdownActions(): IAction[] { return this._dropdownActions; }

	private _dropdownAction: IAction;
	get dropdownAction(): IAction { return this._dropdownAction; }

	private _cancelAction: IAction;

	private _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _disposables = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		container: HTMLElement,
		options: IMenuWorkbenchToolBarOptions | undefined,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService commandService: ICommandService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container, { resetMenu: MenuId.SCMInputBox, ...options }, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);

		this._dropdownAction = new Action(
			'scmInputMoreActions',
			localize('scmInputMoreActions', "More Actions..."),
			'codicon-chevron-down');

		this._cancelAction = new MenuItemAction({
			id: SCMInputWidgetCommandId.CancelAction,
			title: localize('scmInputCancelAction', "Cancel"),
			icon: Codicon.debugStop,
		}, undefined, undefined, undefined, undefined, contextKeyService, commandService);
	}

	public setInput(input: ISCMInput): void {
		this._disposables.value = new DisposableStore();

		const contextKeyService = this.contextKeyService.createOverlay([
			['scmProvider', input.repository.provider.contextValue],
			['scmProviderRootUri', input.repository.provider.rootUri?.toString()],
			['scmProviderHasRootUri', !!input.repository.provider.rootUri]
		]);

		const menu = this._disposables.value.add(this.menuService.createMenu(MenuId.SCMInputBox, contextKeyService, { emitEventsForSubmenuChanges: true }));

		const isEnabled = (): boolean => {
			return input.repository.provider.groups.some(g => g.resources.length > 0);
		};

		const updateToolbar = () => {
			const actions: IAction[] = [];
			createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, actions);

			for (const action of actions) {
				action.enabled = isEnabled();
			}
			this._dropdownAction.enabled = isEnabled();

			let primaryAction: IAction | undefined = undefined;

			if (actions.length === 1) {
				primaryAction = actions[0];
			} else if (actions.length > 1) {
				const lastActionId = this.storageService.get(SCMInputWidgetStorageKey.LastActionId, StorageScope.PROFILE, '');
				primaryAction = actions.find(a => a.id === lastActionId) ?? actions[0];
			}

			this._dropdownActions = actions.length === 1 ? [] : actions;
			super.setActions(primaryAction ? [primaryAction] : [], []);

			this._onDidChange.fire();
		};

		this._disposables.value.add(menu.onDidChange(() => updateToolbar()));
		this._disposables.value.add(input.repository.provider.onDidChangeResources(() => updateToolbar()));
		this._disposables.value.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, SCMInputWidgetStorageKey.LastActionId, this._disposables.value)(() => updateToolbar()));

		this.actionRunner = new SCMInputWidgetActionRunner(input, this.storageService);
		this._disposables.value.add(this.actionRunner.onWillRun(e => {
			if ((this.actionRunner as SCMInputWidgetActionRunner).runningActions.size === 0) {
				super.setActions([this._cancelAction], []);
				this._onDidChange.fire();
			}
		}));
		this._disposables.value.add(this.actionRunner.onDidRun(e => {
			if ((this.actionRunner as SCMInputWidgetActionRunner).runningActions.size === 0) {
				updateToolbar();
			}
		}));

		updateToolbar();
	}
}

class SCMInputWidgetEditorOptions {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private readonly defaultInputFontFamily = DEFAULT_FONT_FAMILY;

	private readonly _disposables = new DisposableStore();

	constructor(
		private readonly overflowWidgetsDomNode: HTMLElement,
		private readonly configurationService: IConfigurationService) {

		const onDidChangeConfiguration = Event.filter(
			this.configurationService.onDidChangeConfiguration,
			e => {
				return e.affectsConfiguration('editor.accessibilitySupport') ||
					e.affectsConfiguration('editor.cursorBlinking') ||
					e.affectsConfiguration('editor.fontFamily') ||
					e.affectsConfiguration('editor.rulers') ||
					e.affectsConfiguration('editor.wordWrap') ||
					e.affectsConfiguration('scm.inputFontFamily') ||
					e.affectsConfiguration('scm.inputFontSize');
			},
			this._disposables
		);

		this._disposables.add(onDidChangeConfiguration(() => this._onDidChange.fire()));
	}

	getEditorConstructionOptions(): IEditorConstructionOptions {
		const fontFamily = this._getEditorFontFamily();
		const fontSize = this._getEditorFontSize();
		const lineHeight = this._getEditorLineHeight(fontSize);

		return {
			...getSimpleEditorOptions(this.configurationService),
			...this._getEditorLanguageConfiguration(),
			cursorWidth: 1,
			dragAndDrop: true,
			dropIntoEditor: { enabled: true },
			fontFamily: fontFamily,
			fontSize: fontSize,
			formatOnType: true,
			lineDecorationsWidth: 6,
			lineHeight: lineHeight,
			overflowWidgetsDomNode: this.overflowWidgetsDomNode,
			padding: { top: 2, bottom: 2 },
			quickSuggestions: false,
			renderWhitespace: 'none',
			scrollbar: {
				alwaysConsumeMouseWheel: false,
				vertical: 'hidden'
			},
			wrappingIndent: 'none',
			wrappingStrategy: 'advanced',
		};
	}

	getEditorOptions(): IEditorOptions {
		const fontFamily = this._getEditorFontFamily();
		const fontSize = this._getEditorFontSize();
		const lineHeight = this._getEditorLineHeight(fontSize);
		const accessibilitySupport = this.configurationService.getValue<'auto' | 'off' | 'on'>('editor.accessibilitySupport');
		const cursorBlinking = this.configurationService.getValue<'blink' | 'smooth' | 'phase' | 'expand' | 'solid'>('editor.cursorBlinking');

		return { ...this._getEditorLanguageConfiguration(), accessibilitySupport, cursorBlinking, fontFamily, fontSize, lineHeight };
	}

	private _getEditorFontFamily(): string {
		const inputFontFamily = this.configurationService.getValue<string>('scm.inputFontFamily').trim();

		if (inputFontFamily.toLowerCase() === 'editor') {
			return this.configurationService.getValue<string>('editor.fontFamily').trim();
		}

		if (inputFontFamily.length !== 0 && inputFontFamily.toLowerCase() !== 'default') {
			return inputFontFamily;
		}

		return this.defaultInputFontFamily;
	}

	private _getEditorFontSize(): number {
		return this.configurationService.getValue<number>('scm.inputFontSize');
	}

	private _getEditorLanguageConfiguration(): IEditorOptions {
		// editor.rulers
		const rulersConfig = this.configurationService.inspect('editor.rulers', { overrideIdentifier: 'scminput' });
		const rulers = rulersConfig.overrideIdentifiers?.includes('scminput') ? EditorOptions.rulers.validate(rulersConfig.value) : [];

		// editor.wordWrap
		const wordWrapConfig = this.configurationService.inspect('editor.wordWrap', { overrideIdentifier: 'scminput' });
		const wordWrap = wordWrapConfig.overrideIdentifiers?.includes('scminput') ? EditorOptions.wordWrap.validate(wordWrapConfig.value) : 'on';

		return { rulers, wordWrap };
	}

	private _getEditorLineHeight(fontSize: number): number {
		return Math.round(fontSize * 1.5);
	}

	dispose(): void {
		this._disposables.dispose();
	}

}

class SCMInputWidget {

	private static readonly ValidationTimeouts: { [severity: number]: number } = {
		[InputValidationType.Information]: 5000,
		[InputValidationType.Warning]: 8000,
		[InputValidationType.Error]: 10000
	};

	private readonly contextKeyService: IContextKeyService;

	private element: HTMLElement;
	private editorContainer: HTMLElement;
	private readonly inputEditor: CodeEditorWidget;
	private readonly inputEditorOptions: SCMInputWidgetEditorOptions;
	private toolbarContainer: HTMLElement;
	private toolbar: SCMInputWidgetToolbar;
	private readonly disposables = new DisposableStore();

	private model: { readonly input: ISCMInput; readonly textModel: ITextModel } | undefined;
	private repositoryIdContextKey: IContextKey<string | undefined>;
	private readonly repositoryDisposables = new DisposableStore();

	private validation: IInputValidation | undefined;
	private validationContextView: IOpenContextView | undefined;
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
		this.element.classList.remove('synthetic-focus');

		this.repositoryDisposables.clear();
		this.repositoryIdContextKey.set(input?.repository.id);

		if (!input) {
			this.inputEditor.setModel(undefined);
			this.model = undefined;
			return;
		}

		const textModel = input.repository.provider.inputBoxTextModel;
		this.inputEditor.setModel(textModel);

		if (this.configurationService.getValue('editor.wordBasedSuggestions', { resource: textModel.uri }) !== 'off') {
			this.configurationService.updateValue('editor.wordBasedSuggestions', 'off', { resource: textModel.uri }, ConfigurationTarget.MEMORY);
		}

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
			const currentValue = textModel.getValue();
			if (value === currentValue) { // circuit breaker
				return;
			}

			textModel.pushStackElement();
			textModel.pushEditOperations(null, [EditOperation.replaceMove(textModel.getFullModelRange(), value)], () => []);

			const position = reason === SCMInputChangeReason.HistoryPrevious
				? textModel.getFullModelRange().getStartPosition()
				: textModel.getFullModelRange().getEndPosition();
			this.inputEditor.setPosition(position);
			this.inputEditor.revealPositionInCenterIfOutsideViewport(position);
		}));
		this.repositoryDisposables.add(input.onDidChangeFocus(() => this.focus()));
		this.repositoryDisposables.add(input.onDidChangeValidationMessage((e) => this.setValidation(e, { focus: true, timeout: true })));
		this.repositoryDisposables.add(input.onDidChangeValidateInput((e) => triggerValidation()));

		// Keep API in sync with model and validate
		this.repositoryDisposables.add(textModel.onDidChangeContent(() => {
			input.setValue(textModel.getValue(), true);
			triggerValidation();
		}));

		// Update placeholder text
		const updatePlaceholderText = () => {
			const binding = this.keybindingService.lookupKeybinding('scm.acceptInput');
			const label = binding ? binding.getLabel() : (platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter');
			const placeholderText = format(input.placeholder, label);

			this.inputEditor.updateOptions({ placeholder: placeholderText });
		};
		this.repositoryDisposables.add(input.onDidChangePlaceholder(updatePlaceholderText));
		this.repositoryDisposables.add(this.keybindingService.onDidUpdateKeybindings(updatePlaceholderText));
		updatePlaceholderText();

		// Update input template
		let commitTemplate = '';
		this.repositoryDisposables.add(autorun(reader => {
			if (!input.visible) {
				return;
			}

			const oldCommitTemplate = commitTemplate;
			commitTemplate = input.repository.provider.commitTemplate.read(reader);

			const value = textModel.getValue();
			if (value && value !== oldCommitTemplate) {
				return;
			}

			textModel.setValue(commitTemplate);
		}));

		// Update input enablement
		const updateEnablement = (enabled: boolean) => {
			this.inputEditor.updateOptions({ readOnly: !enabled });
		};
		this.repositoryDisposables.add(input.onDidChangeEnablement(enabled => updateEnablement(enabled)));
		updateEnablement(input.enabled);

		// Toolbar
		this.toolbar.setInput(input);

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
		@IKeybindingService private keybindingService: IKeybindingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		this.element = append(container, $('.scm-editor'));
		this.editorContainer = append(this.element, $('.scm-editor-container'));
		this.toolbarContainer = append(this.element, $('.scm-editor-toolbar'));

		this.contextKeyService = contextKeyService.createScoped(this.element);
		this.repositoryIdContextKey = this.contextKeyService.createKey('scmRepository', undefined);

		this.inputEditorOptions = new SCMInputWidgetEditorOptions(overflowWidgetsDomNode, this.configurationService);
		this.disposables.add(this.inputEditorOptions.onDidChange(this.onDidChangeEditorOptions, this));
		this.disposables.add(this.inputEditorOptions);

		const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
			contributions: EditorExtensionsRegistry.getSomeEditorContributions([
				CodeActionController.ID,
				ColorDetector.ID,
				ContextMenuController.ID,
				CopyPasteController.ID,
				DragAndDropController.ID,
				DropIntoEditorController.ID,
				EditorDictation.ID,
				FormatOnType.ID,
				ContentHoverController.ID,
				GlyphHoverController.ID,
				InlineCompletionsController.ID,
				LinkDetector.ID,
				MenuPreventer.ID,
				MessageController.ID,
				PlaceholderTextContribution.ID,
				SelectionClipboardContributionID,
				SnippetController2.ID,
				SuggestController.ID
			]),
			isSimpleWidget: true
		};

		const services = new ServiceCollection([IContextKeyService, this.contextKeyService]);
		const instantiationService2 = instantiationService.createChild(services, this.disposables);
		const editorConstructionOptions = this.inputEditorOptions.getEditorConstructionOptions();
		this.inputEditor = instantiationService2.createInstance(CodeEditorWidget, this.editorContainer, editorConstructionOptions, codeEditorWidgetOptions);
		this.disposables.add(this.inputEditor);

		this.disposables.add(this.inputEditor.onDidFocusEditorText(() => {
			if (this.input?.repository) {
				this.scmViewService.focus(this.input.repository);
			}

			this.element.classList.add('synthetic-focus');
			this.renderValidation();
		}));
		this.disposables.add(this.inputEditor.onDidBlurEditorText(() => {
			this.element.classList.remove('synthetic-focus');

			setTimeout(() => {
				if (!this.validation || !this.validationHasFocus) {
					this.clearValidation();
				}
			}, 0);
		}));

		this.disposables.add(this.inputEditor.onDidBlurEditorWidget(() => {
			CopyPasteController.get(this.inputEditor)?.clearWidgets();
			DropIntoEditorController.get(this.inputEditor)?.clearWidgets();
		}));

		const firstLineKey = this.contextKeyService.createKey<boolean>('scmInputIsInFirstPosition', false);
		const lastLineKey = this.contextKeyService.createKey<boolean>('scmInputIsInLastPosition', false);

		this.disposables.add(this.inputEditor.onDidChangeCursorPosition(({ position }) => {
			const viewModel = this.inputEditor._getViewModel()!;
			const lastLineNumber = viewModel.getLineCount();
			const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
			const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
			firstLineKey.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
			lastLineKey.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
		}));
		this.disposables.add(this.inputEditor.onDidScrollChange(e => {
			this.toolbarContainer.classList.toggle('scroll-decoration', e.scrollTop > 0);
		}));

		Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.showInputActionButton'))(() => this.layout(), this, this.disposables);

		this.onDidChangeContentHeight = Event.signal(Event.filter(this.inputEditor.onDidContentSizeChange, e => e.contentHeightChanged, this.disposables));

		// Toolbar
		this.toolbar = instantiationService2.createInstance(SCMInputWidgetToolbar, this.toolbarContainer, {
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction && this.toolbar.dropdownActions.length > 1) {
					return instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, this.toolbar.dropdownAction, this.toolbar.dropdownActions, '', { actionRunner: this.toolbar.actionRunner, hoverDelegate: options.hoverDelegate });
				}

				return createActionViewItem(instantiationService, action, options);
			},
			menuOptions: {
				shouldForwardArgs: true
			}
		});
		this.disposables.add(this.toolbar.onDidChange(() => this.layout()));
		this.disposables.add(this.toolbar);
	}

	getContentHeight(): number {
		const lineHeight = this.inputEditor.getOption(EditorOption.lineHeight);
		const { top, bottom } = this.inputEditor.getOption(EditorOption.padding);

		const inputMinLinesConfig = this.configurationService.getValue('scm.inputMinLineCount');
		const inputMinLines = typeof inputMinLinesConfig === 'number' ? clamp(inputMinLinesConfig, 1, 50) : 1;
		const editorMinHeight = inputMinLines * lineHeight + top + bottom;

		const inputMaxLinesConfig = this.configurationService.getValue('scm.inputMaxLineCount');
		const inputMaxLines = typeof inputMaxLinesConfig === 'number' ? clamp(inputMaxLinesConfig, 1, 50) : 10;
		const editorMaxHeight = inputMaxLines * lineHeight + top + bottom;

		return clamp(this.inputEditor.getContentHeight(), editorMinHeight, editorMaxHeight);
	}

	layout(): void {
		const editorHeight = this.getContentHeight();
		const toolbarWidth = this.getToolbarWidth();
		const dimension = new Dimension(this.element.clientWidth - toolbarWidth, editorHeight);

		if (dimension.width < 0) {
			this.lastLayoutWasTrash = true;
			return;
		}

		this.lastLayoutWasTrash = false;
		this.inputEditor.layout(dimension);
		this.renderValidation();

		const showInputActionButton = this.configurationService.getValue<boolean>('scm.showInputActionButton') === true;
		this.toolbarContainer.classList.toggle('hidden', !showInputActionButton || this.toolbar?.isEmpty() === true);

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
		this.element.classList.add('synthetic-focus');
	}

	hasFocus(): boolean {
		return this.inputEditor.hasTextFocus();
	}

	private onDidChangeEditorOptions(): void {
		this.inputEditor.updateOptions(this.inputEditorOptions.getEditorOptions());
	}

	private renderValidation(): void {
		this.clearValidation();

		this.element.classList.toggle('validation-info', this.validation?.type === InputValidationType.Information);
		this.element.classList.toggle('validation-warning', this.validation?.type === InputValidationType.Warning);
		this.element.classList.toggle('validation-error', this.validation?.type === InputValidationType.Error);

		if (!this.validation || !this.inputEditor.hasTextFocus()) {
			return;
		}

		const disposables = new DisposableStore();

		this.validationContextView = this.contextViewService.showContextView({
			getAnchor: () => this.element,
			render: container => {
				this.element.style.borderBottomLeftRadius = '0';
				this.element.style.borderBottomRightRadius = '0';

				const validationContainer = append(container, $('.scm-editor-validation-container'));
				validationContainer.classList.toggle('validation-info', this.validation!.type === InputValidationType.Information);
				validationContainer.classList.toggle('validation-warning', this.validation!.type === InputValidationType.Warning);
				validationContainer.classList.toggle('validation-error', this.validation!.type === InputValidationType.Error);
				validationContainer.style.width = `${this.element.clientWidth + 2}px`;
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
						this.element.style.borderBottomLeftRadius = '2px';
						this.element.style.borderBottomRightRadius = '2px';
						this.contextViewService.hideContextView();
					}));

					const renderer = disposables.add(this.instantiationService.createInstance(MarkdownRenderer, {}));
					const renderedMarkdown = renderer.render(message, {
						actionHandler: {
							callback: (link) => {
								openLinkFromMarkdown(this.openerService, link, message.isTrusted);
								this.element.style.borderBottomLeftRadius = '2px';
								this.element.style.borderBottomRightRadius = '2px';
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
				const action = new Action('scmInputWidget.validationMessage.close', localize('label.close', "Close"), ThemeIcon.asClassName(Codicon.close), true, () => {
					this.contextViewService.hideContextView();
					this.element.style.borderBottomLeftRadius = '2px';
					this.element.style.borderBottomRightRadius = '2px';
				});
				disposables.add(actionbar);
				actionbar.push(action, { icon: true, label: false });

				return Disposable.None;
			},
			onHide: () => {
				this.validationHasFocus = false;
				this.element.style.borderBottomLeftRadius = '2px';
				this.element.style.borderBottomRightRadius = '2px';
				disposables.dispose();
			},
			anchorAlignment: AnchorAlignment.LEFT
		});
	}

	private getToolbarWidth(): number {
		const showInputActionButton = this.configurationService.getValue<boolean>('scm.showInputActionButton');
		if (!this.toolbar || !showInputActionButton || this.toolbar?.isEmpty() === true) {
			return 0;
		}

		return this.toolbar.dropdownActions.length === 0 ?
			26 /* 22px action + 4px margin */ :
			39 /* 35px action + 4px margin */;
	}

	clearValidation(): void {
		this.validationContextView?.close();
		this.validationContextView = undefined;
		this.validationHasFocus = false;
	}

	dispose(): void {
		this.input = undefined;
		this.repositoryDisposables.dispose();
		this.clearValidation();
		this.disposables.dispose();
	}
}

export class SCMViewPane extends ViewPane {

	private _onDidLayout: Emitter<void>;
	private layoutCache: ISCMLayout;

	private treeScrollTop: number | undefined;
	private treeContainer!: HTMLElement;
	private tree!: WorkbenchCompressibleAsyncDataTree<ISCMViewService, TreeElement, FuzzyScore>;

	private listLabels!: ResourceLabels;
	private inputRenderer!: InputRenderer;
	private actionButtonRenderer!: ActionButtonRenderer;

	private _viewMode: ViewMode;
	get viewMode(): ViewMode { return this._viewMode; }
	set viewMode(mode: ViewMode) {
		if (this._viewMode === mode) {
			return;
		}

		this._viewMode = mode;

		// Update sort key based on view mode
		this.viewSortKey = this.getViewSortKey();

		this.updateChildren();
		this.onDidActiveEditorChange();
		this._onDidChangeViewMode.fire(mode);
		this.viewModeContextKey.set(mode);

		this.updateIndentStyles(this.themeService.getFileIconTheme());
		this.storageService.store(`scm.viewMode`, mode, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	private readonly _onDidChangeViewMode = new Emitter<ViewMode>();
	readonly onDidChangeViewMode = this._onDidChangeViewMode.event;

	private _viewSortKey: ViewSortKey;
	get viewSortKey(): ViewSortKey { return this._viewSortKey; }
	set viewSortKey(sortKey: ViewSortKey) {
		if (this._viewSortKey === sortKey) {
			return;
		}

		this._viewSortKey = sortKey;

		this.updateChildren();
		this.viewSortKeyContextKey.set(sortKey);
		this._onDidChangeViewSortKey.fire(sortKey);

		if (this._viewMode === ViewMode.List) {
			this.storageService.store(`scm.viewSortKey`, sortKey, StorageScope.WORKSPACE, StorageTarget.USER);
		}
	}

	private readonly _onDidChangeViewSortKey = new Emitter<ViewSortKey>();
	readonly onDidChangeViewSortKey = this._onDidChangeViewSortKey.event;

	private readonly items = new DisposableMap<ISCMRepository, IDisposable>();
	private readonly visibilityDisposables = new DisposableStore();

	private readonly treeOperationSequencer = new Sequencer();
	private readonly revealResourceThrottler = new Throttler();
	private readonly updateChildrenThrottler = new Throttler();

	private viewModeContextKey: IContextKey<ViewMode>;
	private viewSortKeyContextKey: IContextKey<ViewSortKey>;
	private areAllRepositoriesCollapsedContextKey: IContextKey<boolean>;
	private isAnyRepositoryCollapsibleContextKey: IContextKey<boolean>;

	private scmProviderContextKey: IContextKey<string | undefined>;
	private scmProviderRootUriContextKey: IContextKey<string | undefined>;
	private scmProviderHasRootUriContextKey: IContextKey<boolean>;

	private readonly disposables = new DisposableStore();

	constructor(
		options: IViewPaneOptions,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@ISCMService private readonly scmService: ISCMService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
	) {
		super({ ...options, titleMenuId: MenuId.SCMTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// View mode and sort key
		this._viewMode = this.getViewMode();
		this._viewSortKey = this.getViewSortKey();

		// Context Keys
		this.viewModeContextKey = ContextKeys.SCMViewMode.bindTo(contextKeyService);
		this.viewModeContextKey.set(this._viewMode);
		this.viewSortKeyContextKey = ContextKeys.SCMViewSortKey.bindTo(contextKeyService);
		this.viewSortKeyContextKey.set(this.viewSortKey);
		this.areAllRepositoriesCollapsedContextKey = ContextKeys.SCMViewAreAllRepositoriesCollapsed.bindTo(contextKeyService);
		this.isAnyRepositoryCollapsibleContextKey = ContextKeys.SCMViewIsAnyRepositoryCollapsible.bindTo(contextKeyService);
		this.scmProviderContextKey = ContextKeys.SCMProvider.bindTo(contextKeyService);
		this.scmProviderRootUriContextKey = ContextKeys.SCMProviderRootUri.bindTo(contextKeyService);
		this.scmProviderHasRootUriContextKey = ContextKeys.SCMProviderHasRootUri.bindTo(contextKeyService);

		this._onDidLayout = new Emitter<void>();
		this.layoutCache = { height: undefined, width: undefined, onDidChange: this._onDidLayout.event };

		this.storageService.onDidChangeValue(StorageScope.WORKSPACE, undefined, this.disposables)(e => {
			switch (e.key) {
				case 'scm.viewMode':
					this.viewMode = this.getViewMode();
					break;
				case 'scm.viewSortKey':
					this.viewSortKey = this.getViewSortKey();
					break;
			}
		}, this, this.disposables);

		this.storageService.onWillSaveState(e => {
			this.viewMode = this.getViewMode();
			this.viewSortKey = this.getViewSortKey();

			this.storeTreeViewState();
		}, this, this.disposables);

		Event.any(this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository)(() => this._onDidChangeViewWelcomeState.fire(), this, this.disposables);

		this.disposables.add(this.revealResourceThrottler);
		this.disposables.add(this.updateChildrenThrottler);
	}

	protected override layoutBody(height: number | undefined = this.layoutCache.height, width: number | undefined = this.layoutCache.width): void {
		if (height === undefined) {
			return;
		}

		if (width !== undefined) {
			super.layoutBody(height, width);
		}

		this.layoutCache.height = height;
		this.layoutCache.width = width;
		this._onDidLayout.fire();

		this.treeContainer.style.height = `${height}px`;
		this.tree.layout(height, width);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// Tree
		this.treeContainer = append(container, $('.scm-view.show-file-icons'));
		this.treeContainer.classList.add('file-icon-themable-tree');
		this.treeContainer.classList.add('show-file-icons');

		const updateActionsVisibility = () => this.treeContainer.classList.toggle('show-actions', this.configurationService.getValue<boolean>('scm.alwaysShowActions'));
		Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowActions'), this.disposables)(updateActionsVisibility, this, this.disposables);
		updateActionsVisibility();

		const updateProviderCountVisibility = () => {
			const value = this.configurationService.getValue<'hidden' | 'auto' | 'visible'>('scm.providerCountBadge');
			this.treeContainer.classList.toggle('hide-provider-counts', value === 'hidden');
			this.treeContainer.classList.toggle('auto-provider-counts', value === 'auto');
		};
		Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.providerCountBadge'), this.disposables)(updateProviderCountVisibility, this, this.disposables);
		updateProviderCountVisibility();

		const viewState = this.loadTreeViewState();
		this.createTree(this.treeContainer, viewState);

		this.onDidChangeBodyVisibility(async visible => {
			if (visible) {
				this.treeOperationSequencer.queue(async () => {
					await this.tree.setInput(this.scmViewService, viewState);

					Event.filter(this.configurationService.onDidChangeConfiguration,
						e =>
							e.affectsConfiguration('scm.alwaysShowRepositories'),
						this.visibilityDisposables)
						(() => {
							this.updateActions();
							this.updateChildren();
						}, this, this.visibilityDisposables);

					Event.filter(this.configurationService.onDidChangeConfiguration,
						e =>
							e.affectsConfiguration('scm.inputMinLineCount') ||
							e.affectsConfiguration('scm.inputMaxLineCount') ||
							e.affectsConfiguration('scm.showActionButton'),
						this.visibilityDisposables)
						(() => this.updateChildren(), this, this.visibilityDisposables);

					// Add visible repositories
					this.editorService.onDidActiveEditorChange(this.onDidActiveEditorChange, this, this.visibilityDisposables);
					this.scmViewService.onDidChangeVisibleRepositories(this.onDidChangeVisibleRepositories, this, this.visibilityDisposables);
					this.onDidChangeVisibleRepositories({ added: this.scmViewService.visibleRepositories, removed: Iterable.empty() });

					// Restore scroll position
					if (typeof this.treeScrollTop === 'number') {
						this.tree.scrollTop = this.treeScrollTop;
						this.treeScrollTop = undefined;
					}

					this.updateRepositoryCollapseAllContextKeys();
				});
			} else {
				this.visibilityDisposables.clear();
				this.onDidChangeVisibleRepositories({ added: Iterable.empty(), removed: [...this.items.keys()] });
				this.treeScrollTop = this.tree.scrollTop;

				this.updateRepositoryCollapseAllContextKeys();
			}
		}, this, this.disposables);

		this.disposables.add(this.instantiationService.createInstance(RepositoryVisibilityActionController));

		this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this, this.disposables);
		this.updateIndentStyles(this.themeService.getFileIconTheme());
	}

	private createTree(container: HTMLElement, viewState?: IAsyncDataTreeViewState): void {
		const overflowWidgetsDomNode = $('.scm-overflow-widgets-container.monaco-editor');

		this.inputRenderer = this.instantiationService.createInstance(InputRenderer, this.layoutCache, overflowWidgetsDomNode, (input, height) => {
			try {
				// Attempt to update the input element height. There is an
				// edge case where the input has already been disposed and
				// updating the height would fail.
				this.tree.updateElementHeight(input, height);
			}
			catch { }
		});
		this.actionButtonRenderer = this.instantiationService.createInstance(ActionButtonRenderer);

		this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this.disposables.add(this.listLabels);

		const resourceActionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
		resourceActionRunner.onWillRun(() => this.tree.domFocus(), this, this.disposables);
		this.disposables.add(resourceActionRunner);

		const treeDataSource = this.instantiationService.createInstance(SCMTreeDataSource, () => this.viewMode);
		this.disposables.add(treeDataSource);

		const compressionEnabled = observableConfigValue('scm.compactFolders', true, this.configurationService);

		this.tree = this.instantiationService.createInstance(
			WorkbenchCompressibleAsyncDataTree,
			'SCM Tree Repo',
			container,
			new ListDelegate(this.inputRenderer),
			new SCMTreeCompressionDelegate(),
			[
				this.inputRenderer,
				this.actionButtonRenderer,
				this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMTitle, getActionViewItemProvider(this.instantiationService)),
				this.instantiationService.createInstance(ResourceGroupRenderer, getActionViewItemProvider(this.instantiationService)),
				this.instantiationService.createInstance(ResourceRenderer, () => this.viewMode, this.listLabels, getActionViewItemProvider(this.instantiationService), resourceActionRunner)
			],
			treeDataSource,
			{
				horizontalScrolling: false,
				setRowLineHeight: false,
				transformOptimization: false,
				filter: new SCMTreeFilter(),
				dnd: new SCMTreeDragAndDrop(this.instantiationService),
				identityProvider: new SCMResourceIdentityProvider(),
				sorter: new SCMTreeSorter(() => this.viewMode, () => this.viewSortKey),
				keyboardNavigationLabelProvider: this.instantiationService.createInstance(SCMTreeKeyboardNavigationLabelProvider, () => this.viewMode),
				overrideStyles: this.getLocationBasedColors().listOverrideStyles,
				compressionEnabled: compressionEnabled.get(),
				collapseByDefault: (e: unknown) => {
					// Repository, Resource Group, Resource Folder (Tree)
					if (isSCMRepository(e) || isSCMResourceGroup(e) || isSCMResourceNode(e)) {
						return false;
					}

					// History Item Group, History Item, or History Item Change
					return (viewState?.expanded ?? []).indexOf(getSCMResourceId(e as TreeElement)) === -1;
				},
				accessibilityProvider: this.instantiationService.createInstance(SCMAccessibilityProvider)
			}) as WorkbenchCompressibleAsyncDataTree<ISCMViewService, TreeElement, FuzzyScore>;

		this.disposables.add(this.tree);

		this.tree.onDidOpen(this.open, this, this.disposables);
		this.tree.onContextMenu(this.onListContextMenu, this, this.disposables);
		this.tree.onDidScroll(this.inputRenderer.clearValidation, this.inputRenderer, this.disposables);
		Event.filter(this.tree.onDidChangeCollapseState, e => isSCMRepository(e.node.element?.element), this.disposables)(this.updateRepositoryCollapseAllContextKeys, this, this.disposables);

		this.disposables.add(autorun(reader => {
			this.tree.updateOptions({
				compressionEnabled: compressionEnabled.read(reader)
			});
		}));

		append(container, overflowWidgetsDomNode);
	}

	private async open(e: IOpenEvent<TreeElement | undefined>): Promise<void> {
		if (!e.element) {
			return;
		} else if (isSCMRepository(e.element)) {
			this.scmViewService.focus(e.element);
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
			this.actionButtonRenderer.focusActionButton(e.element);
			this.tree.setFocus([], e.browserEvent);

			return;
		} else if (isSCMResourceGroup(e.element)) {
			const provider = e.element.provider;
			const repository = Iterable.find(this.scmService.repositories, r => r.provider === provider);
			if (repository) {
				this.scmViewService.focus(repository);
			}
			return;
		} else if (isSCMResource(e.element)) {
			if (e.element.command?.id === API_OPEN_EDITOR_COMMAND_ID || e.element.command?.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
				if (isPointerEvent(e.browserEvent) && e.browserEvent.button === 1) {
					const resourceGroup = e.element.resourceGroup;
					const title = `${resourceGroup.provider.label}: ${resourceGroup.label}`;
					await OpenScmGroupAction.openMultiFileDiffEditor(this.editorService, title, resourceGroup.provider.rootUri, resourceGroup.id, {
						...e.editorOptions,
						viewState: {
							revealData: {
								resource: {
									original: e.element.multiDiffEditorOriginalUri,
									modified: e.element.multiDiffEditorModifiedUri,
								}
							}
						},
						preserveFocus: true,
					});
				} else {
					await this.commandService.executeCommand(e.element.command.id, ...(e.element.command.arguments || []), e);
				}
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
		} else if (isSCMResourceNode(e.element)) {
			const provider = e.element.context.provider;
			const repository = Iterable.find(this.scmService.repositories, r => r.provider === provider);
			if (repository) {
				this.scmViewService.focus(repository);
			}
			return;
		}
	}

	private onDidActiveEditorChange(): void {
		if (!this.configurationService.getValue<boolean>('scm.autoReveal')) {
			return;
		}

		const uri = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });

		if (!uri) {
			return;
		}

		// Do not set focus/selection when the resource is already focused and selected
		if (this.tree.getFocus().some(e => isSCMResource(e) && this.uriIdentityService.extUri.isEqual(e.sourceUri, uri)) &&
			this.tree.getSelection().some(e => isSCMResource(e) && this.uriIdentityService.extUri.isEqual(e.sourceUri, uri))) {
			return;
		}

		this.revealResourceThrottler.queue(
			() => this.treeOperationSequencer.queue(
				async () => {
					for (const repository of this.scmViewService.visibleRepositories) {
						const item = this.items.get(repository);

						if (!item) {
							continue;
						}

						// go backwards from last group
						for (let j = repository.provider.groups.length - 1; j >= 0; j--) {
							const groupItem = repository.provider.groups[j];
							const resource = this.viewMode === ViewMode.Tree
								? groupItem.resourceTree.getNode(uri)?.element
								: groupItem.resources.find(r => this.uriIdentityService.extUri.isEqual(r.sourceUri, uri));

							if (resource) {
								await this.tree.expandTo(resource);
								this.tree.reveal(resource);

								this.tree.setSelection([resource]);
								this.tree.setFocus([resource]);
								return;
							}
						}
					}
				}));
	}

	private onDidChangeVisibleRepositories({ added, removed }: ISCMViewVisibleRepositoryChangeEvent): void {
		// Added repositories
		for (const repository of added) {
			const repositoryDisposables = new DisposableStore();

			repositoryDisposables.add(repository.provider.onDidChange(() => this.updateChildren(repository)));
			repositoryDisposables.add(repository.input.onDidChangeVisibility(() => this.updateChildren(repository)));
			repositoryDisposables.add(repository.provider.onDidChangeResourceGroups(() => this.updateChildren(repository)));

			const resourceGroupDisposables = repositoryDisposables.add(new DisposableMap<ISCMResourceGroup, IDisposable>());

			const onDidChangeResourceGroups = () => {
				for (const [resourceGroup] of resourceGroupDisposables) {
					if (!repository.provider.groups.includes(resourceGroup)) {
						resourceGroupDisposables.deleteAndDispose(resourceGroup);
					}
				}

				for (const resourceGroup of repository.provider.groups) {
					if (!resourceGroupDisposables.has(resourceGroup)) {
						const disposableStore = new DisposableStore();

						disposableStore.add(resourceGroup.onDidChange(() => this.updateChildren(repository)));
						disposableStore.add(resourceGroup.onDidChangeResources(() => this.updateChildren(repository)));
						resourceGroupDisposables.set(resourceGroup, disposableStore);
					}
				}
			};

			repositoryDisposables.add(repository.provider.onDidChangeResourceGroups(onDidChangeResourceGroups));
			onDidChangeResourceGroups();

			this.items.set(repository, repositoryDisposables);
		}

		// Removed repositories
		for (const repository of removed) {
			this.items.deleteAndDispose(repository);
		}

		this.updateChildren();
		this.onDidActiveEditorChange();
	}

	private onListContextMenu(e: ITreeContextMenuEvent<TreeElement | null>): void {
		if (!e.element) {
			const menu = this.menuService.getMenuActions(Menus.ViewSort, this.contextKeyService);
			const actions: IAction[] = [];
			createAndFillInContextMenuActions(menu, actions);

			return this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions,
				onHide: () => { }
			});
		}

		const element = e.element;
		let context: any = element;
		let actions: IAction[] = [];
		let actionRunner: IActionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());

		if (isSCMRepository(element)) {
			const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
			const menu = menus.repositoryContextMenu;
			context = element.provider;
			actionRunner = new RepositoryActionRunner(() => this.getSelectedRepositories());
			actions = collectContextMenuActions(menu);
		} else if (isSCMInput(element) || isSCMActionButton(element)) {
			// noop
		} else if (isSCMResourceGroup(element)) {
			const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
			const menu = menus.getResourceGroupMenu(element);
			actions = collectContextMenuActions(menu);
		} else if (isSCMResource(element)) {
			const menus = this.scmViewService.menus.getRepositoryMenus(element.resourceGroup.provider);
			const menu = menus.getResourceMenu(element);
			actions = collectContextMenuActions(menu);
		} else if (isSCMResourceNode(element)) {
			if (element.element) {
				const menus = this.scmViewService.menus.getRepositoryMenus(element.element.resourceGroup.provider);
				const menu = menus.getResourceMenu(element.element);
				actions = collectContextMenuActions(menu);
			} else {
				const menus = this.scmViewService.menus.getRepositoryMenus(element.context.provider);
				const menu = menus.getResourceFolderMenu(element.context);
				actions = collectContextMenuActions(menu);
			}
		}

		actionRunner.onWillRun(() => this.tree.domFocus());

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => context,
			actionRunner
		});
	}

	private getSelectedRepositories(): ISCMRepository[] {
		const focusedRepositories = this.tree.getFocus().filter(r => !!r && isSCMRepository(r))! as ISCMRepository[];
		const selectedRepositories = this.tree.getSelection().filter(r => !!r && isSCMRepository(r))! as ISCMRepository[];

		return Array.from(new Set<ISCMRepository>([...focusedRepositories, ...selectedRepositories]));
	}

	private getSelectedResources(): (ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>)[] {
		return this.tree.getSelection()
			.filter(r => !!r && !isSCMResourceGroup(r))! as any;
	}

	private getViewMode(): ViewMode {
		let mode = this.configurationService.getValue<'tree' | 'list'>('scm.defaultViewMode') === 'list' ? ViewMode.List : ViewMode.Tree;
		const storageMode = this.storageService.get(`scm.viewMode`, StorageScope.WORKSPACE) as ViewMode;
		if (typeof storageMode === 'string') {
			mode = storageMode;
		}

		return mode;
	}

	private getViewSortKey(): ViewSortKey {
		// Tree
		if (this._viewMode === ViewMode.Tree) {
			return ViewSortKey.Path;
		}

		// List
		let viewSortKey: ViewSortKey;
		const viewSortKeyString = this.configurationService.getValue<'path' | 'name' | 'status'>('scm.defaultViewSortKey');
		switch (viewSortKeyString) {
			case 'name':
				viewSortKey = ViewSortKey.Name;
				break;
			case 'status':
				viewSortKey = ViewSortKey.Status;
				break;
			default:
				viewSortKey = ViewSortKey.Path;
				break;
		}

		const storageSortKey = this.storageService.get(`scm.viewSortKey`, StorageScope.WORKSPACE) as ViewSortKey;
		if (typeof storageSortKey === 'string') {
			viewSortKey = storageSortKey;
		}

		return viewSortKey;
	}

	private loadTreeViewState(): IAsyncDataTreeViewState | undefined {
		const storageViewState = this.storageService.get('scm.viewState2', StorageScope.WORKSPACE);
		if (!storageViewState) {
			return undefined;
		}

		try {
			const treeViewState = JSON.parse(storageViewState);
			return treeViewState;
		} catch {
			return undefined;
		}
	}

	private storeTreeViewState() {
		if (this.tree) {
			this.storageService.store('scm.viewState2', JSON.stringify(this.tree.getViewState()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	private updateChildren(element?: ISCMRepository) {
		this.updateChildrenThrottler.queue(
			() => this.treeOperationSequencer.queue(
				async () => {
					const focusedInput = this.inputRenderer.getFocusedInput();

					if (element && this.tree.hasNode(element)) {
						// Refresh specific repository
						await this.tree.updateChildren(element);
					} else {
						// Refresh the entire tree
						await this.tree.updateChildren(undefined);
					}

					if (focusedInput) {
						this.inputRenderer.getRenderedInputWidget(focusedInput)?.focus();
					}

					this.updateScmProviderContextKeys();
					this.updateRepositoryCollapseAllContextKeys();
				}));
	}

	private updateIndentStyles(theme: IFileIconTheme): void {
		this.treeContainer.classList.toggle('list-view-mode', this.viewMode === ViewMode.List);
		this.treeContainer.classList.toggle('tree-view-mode', this.viewMode === ViewMode.Tree);
		this.treeContainer.classList.toggle('align-icons-and-twisties', (this.viewMode === ViewMode.List && theme.hasFileIcons) || (theme.hasFileIcons && !theme.hasFolderIcons));
		this.treeContainer.classList.toggle('hide-arrows', this.viewMode === ViewMode.Tree && theme.hidesExplorerArrows === true);
	}

	private updateScmProviderContextKeys(): void {
		const alwaysShowRepositories = this.configurationService.getValue<boolean>('scm.alwaysShowRepositories');

		if (!alwaysShowRepositories && this.items.size === 1) {
			const provider = Iterable.first(this.items.keys())!.provider;
			this.scmProviderContextKey.set(provider.contextValue);
			this.scmProviderRootUriContextKey.set(provider.rootUri?.toString());
			this.scmProviderHasRootUriContextKey.set(!!provider.rootUri);
		} else {
			this.scmProviderContextKey.set(undefined);
			this.scmProviderRootUriContextKey.set(undefined);
			this.scmProviderHasRootUriContextKey.set(false);
		}
	}

	private updateRepositoryCollapseAllContextKeys(): void {
		if (!this.isBodyVisible() || this.items.size === 1) {
			this.isAnyRepositoryCollapsibleContextKey.set(false);
			this.areAllRepositoriesCollapsedContextKey.set(false);
			return;
		}

		this.isAnyRepositoryCollapsibleContextKey.set(this.scmViewService.visibleRepositories.some(r => this.tree.hasNode(r) && this.tree.isCollapsible(r)));
		this.areAllRepositoriesCollapsedContextKey.set(this.scmViewService.visibleRepositories.every(r => this.tree.hasNode(r) && (!this.tree.isCollapsible(r) || this.tree.isCollapsed(r))));
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

	focusPreviousInput(): void {
		this.treeOperationSequencer.queue(() => this.focusInput(-1));
	}

	focusNextInput(): void {
		this.treeOperationSequencer.queue(() => this.focusInput(1));
	}

	private async focusInput(delta: number): Promise<void> {
		if (!this.scmViewService.focusedRepository ||
			this.scmViewService.visibleRepositories.length === 0) {
			return;
		}

		let input = this.scmViewService.focusedRepository.input;
		const repositories = this.scmViewService.visibleRepositories;

		// One visible repository and the input is already focused
		if (repositories.length === 1 && this.inputRenderer.getRenderedInputWidget(input)?.hasFocus() === true) {
			return;
		}

		// Multiple visible repositories and the input already focused
		if (repositories.length > 1 && this.inputRenderer.getRenderedInputWidget(input)?.hasFocus() === true) {
			const focusedRepositoryIndex = repositories.indexOf(this.scmViewService.focusedRepository);
			const newFocusedRepositoryIndex = rot(focusedRepositoryIndex + delta, repositories.length);
			input = repositories[newFocusedRepositoryIndex].input;
		}

		await this.tree.expandTo(input);

		this.tree.reveal(input);
		this.inputRenderer.getRenderedInputWidget(input)?.focus();
	}

	focusPreviousResourceGroup(): void {
		this.treeOperationSequencer.queue(() => this.focusResourceGroup(-1));
	}

	focusNextResourceGroup(): void {
		this.treeOperationSequencer.queue(() => this.focusResourceGroup(1));
	}

	private async focusResourceGroup(delta: number): Promise<void> {
		if (!this.scmViewService.focusedRepository ||
			this.scmViewService.visibleRepositories.length === 0) {
			return;
		}

		const treeHasDomFocus = isActiveElement(this.tree.getHTMLElement());
		const resourceGroups = this.scmViewService.focusedRepository.provider.groups;
		const focusedResourceGroup = this.tree.getFocus().find(e => isSCMResourceGroup(e));
		const focusedResourceGroupIndex = treeHasDomFocus && focusedResourceGroup ? resourceGroups.indexOf(focusedResourceGroup) : -1;

		let resourceGroupNext: ISCMResourceGroup | undefined;

		if (focusedResourceGroupIndex === -1) {
			// First visible resource group
			for (const resourceGroup of resourceGroups) {
				if (this.tree.hasNode(resourceGroup)) {
					resourceGroupNext = resourceGroup;
					break;
				}
			}
		} else {
			// Next/Previous visible resource group
			let index = rot(focusedResourceGroupIndex + delta, resourceGroups.length);
			while (index !== focusedResourceGroupIndex) {
				if (this.tree.hasNode(resourceGroups[index])) {
					resourceGroupNext = resourceGroups[index];
					break;
				}
				index = rot(index + delta, resourceGroups.length);
			}
		}

		if (resourceGroupNext) {
			await this.tree.expandTo(resourceGroupNext);
			this.tree.reveal(resourceGroupNext);

			this.tree.setSelection([resourceGroupNext]);
			this.tree.setFocus([resourceGroupNext]);
			this.tree.domFocus();
		}
	}

	override shouldShowWelcome(): boolean {
		return this.scmService.repositoryCount === 0;
	}

	override getActionsContext(): unknown {
		return this.scmViewService.visibleRepositories.length === 1 ? this.scmViewService.visibleRepositories[0].provider : undefined;
	}

	override focus(): void {
		super.focus();

		this.treeOperationSequencer.queue(() => {
			return new Promise<void>(resolve => {
				if (this.isExpanded()) {
					if (this.tree.getFocus().length === 0) {
						for (const repository of this.scmViewService.visibleRepositories) {
							const widget = this.inputRenderer.getRenderedInputWidget(repository.input);

							if (widget) {
								widget.focus();
								resolve();
								return;
							}
						}
					}

					this.tree.domFocus();
					resolve();
				}
			});
		});
	}

	override dispose(): void {
		this.visibilityDisposables.dispose();
		this.disposables.dispose();
		this.items.dispose();
		super.dispose();
	}
}

class SCMTreeDataSource extends Disposable implements IAsyncDataSource<ISCMViewService, TreeElement> {
	constructor(
		private readonly viewMode: () => ViewMode,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISCMViewService private readonly scmViewService: ISCMViewService
	) {
		super();
	}

	async getChildren(inputOrElement: ISCMViewService | TreeElement): Promise<Iterable<TreeElement>> {
		const repositoryCount = this.scmViewService.visibleRepositories.length;

		const showActionButton = this.configurationService.getValue<boolean>('scm.showActionButton') === true;
		const alwaysShowRepositories = this.configurationService.getValue<boolean>('scm.alwaysShowRepositories') === true;

		if (isSCMViewService(inputOrElement) && (repositoryCount > 1 || alwaysShowRepositories)) {
			return this.scmViewService.visibleRepositories;
		} else if ((isSCMViewService(inputOrElement) && repositoryCount === 1 && !alwaysShowRepositories) || isSCMRepository(inputOrElement)) {
			const children: TreeElement[] = [];

			inputOrElement = isSCMRepository(inputOrElement) ? inputOrElement : this.scmViewService.visibleRepositories[0];
			const actionButton = inputOrElement.provider.actionButton;
			const resourceGroups = inputOrElement.provider.groups;

			// SCM Input
			if (inputOrElement.input.visible) {
				children.push(inputOrElement.input);
			}

			// Action Button
			if (showActionButton && actionButton) {
				children.push({
					type: 'actionButton',
					repository: inputOrElement,
					button: actionButton
				} satisfies ISCMActionButton);
			}

			// ResourceGroups
			const hasSomeChanges = resourceGroups.some(group => group.resources.length > 0);
			if (hasSomeChanges || (repositoryCount === 1 && (!showActionButton || !actionButton))) {
				children.push(...resourceGroups);
			}

			return children;
		} else if (isSCMResourceGroup(inputOrElement)) {
			if (this.viewMode() === ViewMode.List) {
				// Resources (List)
				return inputOrElement.resources;
			} else if (this.viewMode() === ViewMode.Tree) {
				// Resources (Tree)
				const children: TreeElement[] = [];
				for (const node of inputOrElement.resourceTree.root.children) {
					children.push(node.element && node.childrenCount === 0 ? node.element : node);
				}

				return children;
			}
		} else if (isSCMResourceNode(inputOrElement)) {
			// Resources (Tree), History item changes (Tree)
			const children: TreeElement[] = [];
			for (const node of inputOrElement.children) {
				children.push(node.element && node.childrenCount === 0 ? node.element : node);
			}

			return children;
		}

		return [];
	}

	getParent(element: TreeElement): ISCMViewService | TreeElement {
		if (isSCMResourceNode(element)) {
			if (element.parent === element.context.resourceTree.root) {
				return element.context;
			} else if (element.parent) {
				return element.parent;
			} else {
				throw new Error('Invalid element passed to getParent');
			}
		} else if (isSCMResource(element)) {
			if (this.viewMode() === ViewMode.List) {
				return element.resourceGroup;
			}

			const node = element.resourceGroup.resourceTree.getNode(element.sourceUri);
			const result = node?.parent;

			if (!result) {
				throw new Error('Invalid element passed to getParent');
			}

			if (result === element.resourceGroup.resourceTree.root) {
				return element.resourceGroup;
			}

			return result;
		} else if (isSCMInput(element)) {
			return element.repository;
		} else if (isSCMResourceGroup(element)) {
			const repository = this.scmViewService.visibleRepositories.find(r => r.provider === element.provider);
			if (!repository) {
				throw new Error('Invalid element passed to getParent');
			}

			return repository;
		} else {
			throw new Error('Unexpected call to getParent');
		}
	}

	hasChildren(inputOrElement: ISCMViewService | TreeElement): boolean {
		if (isSCMViewService(inputOrElement)) {
			return this.scmViewService.visibleRepositories.length !== 0;
		} else if (isSCMRepository(inputOrElement)) {
			return true;
		} else if (isSCMInput(inputOrElement)) {
			return false;
		} else if (isSCMActionButton(inputOrElement)) {
			return false;
		} else if (isSCMResourceGroup(inputOrElement)) {
			return true;
		} else if (isSCMResource(inputOrElement)) {
			return false;
		} else if (ResourceTree.isResourceNode(inputOrElement)) {
			return inputOrElement.childrenCount > 0;
		} else {
			throw new Error('hasChildren not implemented.');
		}
	}
}

export class SCMActionButton implements IDisposable {
	private button: Button | ButtonWithDescription | ButtonWithDropdown | undefined;
	private readonly disposables = new MutableDisposable<DisposableStore>();

	constructor(
		private readonly container: HTMLElement,
		private readonly contextMenuService: IContextMenuService,
		private readonly commandService: ICommandService,
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
				supportIcons: true,
				...defaultButtonStyles
			});
		} else {
			// Button
			this.button = new Button(this.container, { supportIcons: true, supportShortLabel: !!button.description, title: button.command.tooltip, ...defaultButtonStyles });
		}

		this.button.enabled = button.enabled;
		this.button.label = button.command.title;
		if (this.button instanceof Button && button.description) {
			this.button.labelShort = button.description;
		}
		this.button.onDidClick(async () => await this.executeCommand(button.command.id, ...(button.command.arguments || [])), null, this.disposables.value);

		this.disposables.value!.add(this.button);
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

setupSimpleEditorSelectionStyling('.scm-view .scm-editor-container');
