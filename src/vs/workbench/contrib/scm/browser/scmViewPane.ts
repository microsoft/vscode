/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scm';
import { Event, Emitter } from 'vs/base/common/event';
import { basename, dirname, isEqual } from 'vs/base/common/resources';
import { IDisposable, Disposable, DisposableStore, combinedDisposable, dispose } from 'vs/base/common/lifecycle';
import { ViewPane, IViewPaneOptions } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { append, $, addClass, toggleClass, trackFocus, removeClass } from 'vs/base/browser/dom';
import { IListVirtualDelegate, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ISCMResourceGroup, ISCMResource, InputValidationType, ISCMService, ISCMRepository, ISCMProvider } from 'vs/workbench/contrib/scm/common/scm';
import { ResourceLabels, IResourceLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { MenuItemAction, IMenuService } from 'vs/platform/actions/common/actions';
import { IAction, IActionViewItem, ActionRunner, Action, RadioGroup } from 'vs/base/common/actions';
import { ContextAwareMenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { SCMMenus } from './menus';
import { ActionBar, IActionViewItemProvider, Separator, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT, registerThemingParticipant, IFileIconTheme } from 'vs/platform/theme/common/themeService';
import { isSCMResource, isSCMResourceGroup, connectPrimaryMenuToInlineActionBar, isSCMRepository } from './util';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { WorkbenchCompressibleObjectTree, IOpenEvent } from 'vs/platform/list/browser/listService';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { disposableTimeout, ThrottledDelayer } from 'vs/base/common/async';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITreeNode, ITreeFilter, ITreeSorter, ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { ResourceTree, IResourceNode } from 'vs/base/common/resourceTree';
import { ISequence, ISplice, SimpleSequence } from 'vs/base/common/sequence';
import { ICompressibleTreeRenderer, ICompressibleKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/tree/objectTree';
import { Iterable } from 'vs/base/common/iterator';
import { ICompressedTreeNode, ICompressedTreeElement } from 'vs/base/browser/ui/tree/compressedObjectTreeModel';
import { URI } from 'vs/base/common/uri';
import { FileKind } from 'vs/platform/files/common/files';
import { compareFileNames, comparePaths } from 'vs/base/common/comparers';
import { FuzzyScore, createMatches, IMatch } from 'vs/base/common/filters';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { localize } from 'vs/nls';
import { flatten, find } from 'vs/base/common/arrays';
import { memoize } from 'vs/base/common/decorators';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { toResource, SideBySideEditor } from 'vs/workbench/common/editor';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditorWidget';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorConstructionOptions } from 'vs/editor/common/config/editorOptions';
import { getSimpleEditorOptions } from 'vs/workbench/contrib/codeEditor/browser/simpleEditorOptions';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { MenuPreventer } from 'vs/workbench/contrib/codeEditor/browser/menuPreventer';
import { SelectionClipboardContributionID } from 'vs/workbench/contrib/codeEditor/browser/selectionClipboard';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/contextmenu';
import * as platform from 'vs/base/common/platform';
import { escape, compare } from 'vs/base/common/strings';
import { inputPlaceholderForeground, inputValidationInfoBorder, inputValidationWarningBorder, inputValidationErrorBorder, inputValidationInfoBackground, inputValidationInfoForeground, inputValidationWarningBackground, inputValidationWarningForeground, inputValidationErrorBackground, inputValidationErrorForeground, inputBackground, inputForeground, inputBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { Schemas } from 'vs/base/common/network';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ModesHoverController } from 'vs/editor/contrib/hover/hover';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/colorDetector';
import { LinkDetector } from 'vs/editor/contrib/links/links';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ILabelService } from 'vs/platform/label/common/label';
import { ContextSubMenu } from 'vs/base/browser/contextmenu';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DEFAULT_FONT_FAMILY } from 'vs/workbench/browser/style';
import { Command } from 'vs/editor/common/modes';
import { renderCodicons } from 'vs/base/common/codicons';

type TreeElement = ISCMRepository | ISCMResourceGroup | IResourceNode<ISCMResource, ISCMResourceGroup> | ISCMResource;

function splitMatches(uri: URI, filterData: FuzzyScore | undefined): [IMatch[] | undefined, IMatch[] | undefined] {
	let matches: IMatch[] | undefined;
	let descriptionMatches: IMatch[] | undefined;

	if (filterData) {
		matches = [];
		descriptionMatches = [];

		const fileName = basename(uri);
		const allMatches = createMatches(filterData);

		for (const match of allMatches) {
			if (match.start < fileName.length) {
				matches!.push(
					{
						start: match.start,
						end: Math.min(match.end, fileName.length)
					}
				);
			} else {
				descriptionMatches!.push(
					{
						start: match.start - (fileName.length + 1),
						end: match.end - (fileName.length + 1)
					}
				);
			}
		}
	}

	return [matches, descriptionMatches];
}

class StatusBarAction extends Action {

	constructor(
		private command: Command,
		private commandService: ICommandService
	) {
		super(`statusbaraction{${command.id}}`, command.title, '', true);
		this.tooltip = command.tooltip || '';
	}

	run(): Promise<void> {
		return this.commandService.executeCommand(this.command.id, ...(this.command.arguments || []));
	}
}

class StatusBarActionViewItem extends ActionViewItem {

	constructor(action: StatusBarAction) {
		super(null, action, {});
	}

	updateLabel(): void {
		if (this.options.label && this.label) {
			this.label.innerHTML = renderCodicons(escape(this.getAction().label));
		}
	}
}


interface RepositoryTemplate {
	readonly title: HTMLElement;
	readonly type: HTMLElement;
	readonly countContainer: HTMLElement;
	readonly count: CountBadge;
	readonly actionBar: ActionBar;
	disposable: IDisposable;
	readonly templateDisposable: IDisposable;
}

class RepositoryRenderer implements ICompressibleTreeRenderer<ISCMRepository, FuzzyScore, RepositoryTemplate> {

	static readonly TEMPLATE_ID = 'repository';
	get templateId(): string { return RepositoryRenderer.TEMPLATE_ID; }

	private readonly _onDidRenderElement = new Emitter<ISCMRepository>();
	readonly onDidRenderElement = this._onDidRenderElement.event;

	constructor(
		@ICommandService protected commandService: ICommandService,
		@IThemeService protected themeService: IThemeService
	) { }

	renderTemplate(container: HTMLElement): RepositoryTemplate {
		const provider = append(container, $('.scm-provider'));
		append(provider, $('span.icon.codicon.codicon-repo'));
		const name = append(provider, $('.name'));
		const title = append(name, $('span.title'));
		const type = append(name, $('span.type'));
		const actionBar = new ActionBar(provider, { actionViewItemProvider: a => new StatusBarActionViewItem(a as StatusBarAction) });
		const countContainer = append(provider, $('.count'));
		const count = new CountBadge(countContainer);
		const badgeStyler = attachBadgeStyler(count, this.themeService);
		const disposable = Disposable.None;
		const templateDisposable = combinedDisposable(actionBar, badgeStyler);

		return { title, type, countContainer, count, actionBar, disposable, templateDisposable };
	}

	renderElement(node: ITreeNode<ISCMRepository, FuzzyScore>, index: number, templateData: RepositoryTemplate): void {
		templateData.disposable.dispose();

		const disposables = new DisposableStore();
		const repository = node.element;

		if (repository.provider.rootUri) {
			templateData.title.textContent = basename(repository.provider.rootUri);
			templateData.type.textContent = repository.provider.label;
		} else {
			templateData.title.textContent = repository.provider.label;
			templateData.type.textContent = '';
		}

		const actions: IAction[] = [];
		const disposeActions = () => dispose(actions);
		disposables.add({ dispose: disposeActions });

		const update = () => {
			disposeActions();

			const commands = repository.provider.statusBarCommands || [];
			actions.splice(0, actions.length, ...commands.map(c => new StatusBarAction(c, this.commandService)));
			templateData.actionBar.clear();
			templateData.actionBar.push(actions);

			const count = repository.provider.count || 0;
			toggleClass(templateData.countContainer, 'hidden', count === 0);
			templateData.count.setCount(count);

			this._onDidRenderElement.fire(repository);
		};

		disposables.add(repository.provider.onDidChange(update, null));
		update();

		templateData.disposable = disposables;
	}

	renderCompressedElements(): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(group: ITreeNode<ISCMRepository, FuzzyScore>, index: number, template: RepositoryTemplate): void {
		template.disposable.dispose();
	}

	disposeTemplate(templateData: RepositoryTemplate): void {
		templateData.disposable.dispose();
		templateData.templateDisposable.dispose();
	}
}

interface ResourceGroupTemplate {
	readonly name: HTMLElement;
	readonly count: CountBadge;
	readonly actionBar: ActionBar;
	elementDisposables: IDisposable;
	readonly disposables: IDisposable;
}

class ResourceGroupRenderer implements ICompressibleTreeRenderer<ISCMResourceGroup, FuzzyScore, ResourceGroupTemplate> {

	static readonly TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private actionViewItemProvider: IActionViewItemProvider,
		private themeService: IThemeService,
		private menus: Map<ISCMProvider, SCMMenus>
	) { }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		// hack
		addClass(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement, 'force-twistie');

		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);
		const styler = attachBadgeStyler(count, this.themeService);
		const elementDisposables = Disposable.None;
		const disposables = combinedDisposable(actionBar, styler);

		return { name, count, actionBar, elementDisposables, disposables };
	}

	renderElement(node: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		template.elementDisposables.dispose();

		const group = node.element;
		template.name.textContent = group.label;
		template.actionBar.clear();
		template.actionBar.context = group;
		template.count.setCount(group.elements.length);

		const disposables = new DisposableStore();
		const menus = this.menus.get(group.provider)!;
		disposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceGroupMenu(group), template.actionBar));

		template.elementDisposables = disposables;
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResourceGroup>, FuzzyScore>, index: number, templateData: ResourceGroupTemplate, height: number | undefined): void {
		throw new Error('Should never happen since node is incompressible');
	}

	disposeElement(group: ITreeNode<ISCMResourceGroup, FuzzyScore>, index: number, template: ResourceGroupTemplate): void {
		template.elementDisposables.dispose();
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
	elementDisposables: IDisposable;
	disposables: IDisposable;
}

class RepositoryPaneActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => (ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>)[]) {
		super();
	}

	async runAction(action: IAction, context: ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>): Promise<any> {
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

class ResourceRenderer implements ICompressibleTreeRenderer<ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore, ResourceTemplate> {

	static readonly TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		private viewModelProvider: () => ViewModel,
		private labels: ResourceLabels,
		private actionViewItemProvider: IActionViewItemProvider,
		private actionRunner: ActionRunner,
		private themeService: IThemeService,
		private menus: Map<ISCMProvider, SCMMenus>
	) { }

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

		return { element, name, fileLabel, decorationIcon, actionBar, elementDisposables: Disposable.None, disposables };
	}

	renderElement(node: ITreeNode<ISCMResource, FuzzyScore> | ITreeNode<ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore>, index: number, template: ResourceTemplate): void {
		template.elementDisposables.dispose();

		const elementDisposables = new DisposableStore();
		const resourceOrFolder = node.element;
		const theme = this.themeService.getColorTheme();
		const iconResource = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.element : resourceOrFolder;
		const icon = iconResource && (theme.type === LIGHT ? iconResource.decorations.icon : iconResource.decorations.iconDark);

		const uri = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.uri : resourceOrFolder.sourceUri;
		const fileKind = ResourceTree.isResourceNode(resourceOrFolder) ? FileKind.FOLDER : FileKind.FILE;
		const viewModel = this.viewModelProvider();

		const [matches, descriptionMatches] = splitMatches(uri, node.filterData);
		template.fileLabel.setFile(uri, {
			fileDecorations: { colors: false, badges: !icon },
			hidePath: viewModel.mode === ViewModelMode.Tree,
			fileKind,
			matches,
			descriptionMatches
		});

		template.actionBar.clear();
		template.actionBar.context = resourceOrFolder;

		if (ResourceTree.isResourceNode(resourceOrFolder)) {
			if (resourceOrFolder.element) {
				const menus = this.menus.get(resourceOrFolder.element.resourceGroup.provider)!;
				elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceMenu(resourceOrFolder.element.resourceGroup), template.actionBar));
				toggleClass(template.name, 'strike-through', resourceOrFolder.element.decorations.strikeThrough);
				toggleClass(template.element, 'faded', resourceOrFolder.element.decorations.faded);
			} else {
				const menus = this.menus.get(resourceOrFolder.context.provider)!;
				elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceFolderMenu(resourceOrFolder.context), template.actionBar));
				removeClass(template.name, 'strike-through');
				removeClass(template.element, 'faded');
			}
		} else {
			const menus = this.menus.get(resourceOrFolder.resourceGroup.provider)!;
			elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceMenu(resourceOrFolder.resourceGroup), template.actionBar));
			toggleClass(template.name, 'strike-through', resourceOrFolder.decorations.strikeThrough);
			toggleClass(template.element, 'faded', resourceOrFolder.decorations.faded);
		}

		const tooltip = !ResourceTree.isResourceNode(resourceOrFolder) && resourceOrFolder.decorations.tooltip || '';

		if (icon) {
			template.decorationIcon.style.display = '';
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
			template.decorationIcon.title = tooltip;
		} else {
			template.decorationIcon.style.display = 'none';
			template.decorationIcon.style.backgroundImage = '';
			template.decorationIcon.title = '';
		}

		template.element.setAttribute('data-tooltip', tooltip);
		template.elementDisposables = elementDisposables;
	}

	disposeElement(resource: ITreeNode<ISCMResource, FuzzyScore> | ITreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>, FuzzyScore>, index: number, template: ResourceTemplate): void {
		template.elementDisposables.dispose();
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResource> | ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>, FuzzyScore>, index: number, template: ResourceTemplate, height: number | undefined): void {
		template.elementDisposables.dispose();

		const elementDisposables = new DisposableStore();
		const compressed = node.element as ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>;
		const folder = compressed.elements[compressed.elements.length - 1];

		const label = compressed.elements.map(e => e.name).join('/');
		const fileKind = FileKind.FOLDER;

		const [matches, descriptionMatches] = splitMatches(folder.uri, node.filterData);
		template.fileLabel.setResource({ resource: folder.uri, name: label }, {
			fileDecorations: { colors: false, badges: true },
			fileKind,
			matches,
			descriptionMatches
		});

		template.actionBar.clear();
		template.actionBar.context = folder;

		const menus = this.menus.get(folder.context.provider)!;
		elementDisposables.add(connectPrimaryMenuToInlineActionBar(menus.getResourceFolderMenu(folder.context), template.actionBar));

		removeClass(template.name, 'strike-through');
		removeClass(template.element, 'faded');
		template.decorationIcon.style.display = 'none';
		template.decorationIcon.style.backgroundImage = '';

		template.element.setAttribute('data-tooltip', '');
		template.elementDisposables = elementDisposables;
	}

	disposeCompressedElements(node: ITreeNode<ICompressedTreeNode<ISCMResource> | ICompressedTreeNode<IResourceNode<ISCMResource, ISCMResourceGroup>>, FuzzyScore>, index: number, template: ResourceTemplate, height: number | undefined): void {
		template.elementDisposables.dispose();
	}

	disposeTemplate(template: ResourceTemplate): void {
		template.elementDisposables.dispose();
		template.disposables.dispose();
	}
}

class ProviderListDelegate implements IListVirtualDelegate<TreeElement> {

	getHeight() { return 22; }

	getTemplateId(element: TreeElement) {
		if (isSCMRepository(element)) {
			return RepositoryRenderer.TEMPLATE_ID;
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

	constructor(@ILabelService private readonly labelService: ILabelService) { }

	getKeyboardNavigationLabel(element: TreeElement): { toString(): string; } | undefined {
		if (ResourceTree.isResourceNode(element)) {
			return element.name;
		} else if (isSCMRepository(element)) {
			return element.provider.label; // TODO@joao
		} else if (isSCMResourceGroup(element)) {
			return element.label;
		} else {
			// Since a match in the file name takes precedence over a match
			// in the folder name we are returning the label as file/folder.
			const fileName = basename(element.sourceUri);
			const filePath = this.labelService.getUriLabel(dirname(element.sourceUri), { relative: true });

			return filePath.length !== 0 ? `${fileName} ${filePath}` : fileName;
		}
	}

	getCompressedNodeKeyboardNavigationLabel(elements: TreeElement[]): { toString(): string | undefined; } | undefined {
		const folders = elements as IResourceNode<ISCMResource, ISCMResourceGroup>[];
		return folders.map(e => e.name).join('/');
	}
}

class SCMResourceIdentityProvider implements IIdentityProvider<TreeElement> {

	getId(element: TreeElement): string {
		if (ResourceTree.isResourceNode(element)) {
			const group = element.context;
			return `${group.provider.contextValue}/${group.id}/$FOLDER/${element.uri.toString()}`;
		} else if (isSCMRepository(element)) {
			const provider = element.provider;
			return `${provider.contextValue}}`;
		} else if (isSCMResource(element)) {
			const group = element.resourceGroup;
			const provider = group.provider;
			return `${provider.contextValue}/${group.id}/${element.sourceUri.toString()}`;
		} else {
			const provider = element.provider;
			return `${provider.contextValue}/${element.id}`;
		}
	}
}

export class SCMAccessibilityProvider implements IListAccessibilityProvider<TreeElement> {

	constructor(@ILabelService private readonly labelService: ILabelService) { }

	getWidgetAriaLabel(): string {
		return localize('scm', "Source Control Management");
	}

	getAriaLabel(element: TreeElement): string {
		if (ResourceTree.isResourceNode(element)) {
			return this.labelService.getUriLabel(element.uri, { relative: true, noPrefix: true }) || element.name;
		} else if (isSCMRepository(element)) {
			return element.provider.label; // TODO@joao
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
	readonly disposable: IDisposable;
}

interface IRepositoryItem {
	readonly element: ISCMRepository;
	readonly groupItems: IGroupItem[];
	readonly disposable: IDisposable;
}

function isRepositoryItem(item: IRepositoryItem | IGroupItem): item is IRepositoryItem {
	return Array.isArray((item as IRepositoryItem).groupItems);
}

function asTreeElement(node: IResourceNode<ISCMResource, ISCMResourceGroup>, forceIncompressible: boolean): ICompressedTreeElement<TreeElement> {
	return {
		element: (node.childrenCount === 0 && node.element) ? node.element : node,
		children: Iterable.map(node.children, node => asTreeElement(node, false)),
		incompressible: !!node.element || forceIncompressible
	};
}

const enum ViewModelMode {
	List = 'list',
	Tree = 'tree'
}

const enum ViewModelSortKey {
	Path,
	Name,
	Status
}

class ViewModel {

	private readonly _onDidChangeMode = new Emitter<ViewModelMode>();
	readonly onDidChangeMode = this._onDidChangeMode.event;

	get mode(): ViewModelMode { return this._mode; }
	set mode(mode: ViewModelMode) {
		this._mode = mode;

		for (const item of this.items) {
			for (const groupItem of item.groupItems) {
				groupItem.tree.clear();

				if (mode === ViewModelMode.Tree) {
					for (const resource of groupItem.resources) {
						groupItem.tree.add(resource.sourceUri, resource);
					}
				}
			}
		}

		this.refresh();
		this._onDidChangeMode.fire(mode);
	}

	get sortKey(): ViewModelSortKey { return this._sortKey; }
	set sortKey(sortKey: ViewModelSortKey) {
		if (sortKey !== this._sortKey) {
			this._sortKey = sortKey;
			this.refresh();
		}
	}

	private items: IRepositoryItem[] = [];
	private visibilityDisposables = new DisposableStore();
	private scrollTop: number | undefined;
	private firstVisible = true;
	private disposables = new DisposableStore();

	constructor(
		private repositories: ISequence<ISCMRepository>,
		private tree: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>,
		private _mode: ViewModelMode,
		private _sortKey: ViewModelSortKey,
		@IEditorService protected editorService: IEditorService,
		@IConfigurationService protected configurationService: IConfigurationService,
	) { }

	private onDidSpliceRepositories({ start, deleteCount, toInsert }: ISplice<ISCMRepository>): void {
		const itemsToInsert = toInsert.map(repository => {
			const disposable = repository.provider.groups.onDidSplice(splice => this.onDidSpliceGroups(item, splice));
			const groupItems = repository.provider.groups.elements.map(group => this.createGroupItem(group));
			const item: IRepositoryItem = { element: repository, groupItems, disposable };

			return item;
		});

		const itemsToDispose = this.items.splice(start, deleteCount, ...itemsToInsert);

		for (const item of itemsToDispose) {
			for (const groupItem of item.groupItems) {
				groupItem.disposable.dispose();
			}

			item.disposable.dispose();
		}

		this.refresh();
	}

	private onDidSpliceGroups(item: IRepositoryItem, { start, deleteCount, toInsert }: ISplice<ISCMResourceGroup>): void {
		const itemsToInsert: IGroupItem[] = toInsert.map(group => this.createGroupItem(group));
		const itemsToDispose = item.groupItems.splice(start, deleteCount, ...itemsToInsert);

		for (const item of itemsToDispose) {
			item.disposable.dispose();
		}

		this.refresh(item);
	}

	private createGroupItem(group: ISCMResourceGroup): IGroupItem {
		const tree = new ResourceTree<ISCMResource, ISCMResourceGroup>(group, group.provider.rootUri || URI.file('/'));
		const resources: ISCMResource[] = [...group.elements];
		const disposable = combinedDisposable(
			group.onDidChange(() => this.tree.refilter()),
			group.onDidSplice(splice => this.onDidSpliceGroup(item, splice))
		);

		const item: IGroupItem = { element: group, resources, tree, disposable };

		if (this._mode === ViewModelMode.Tree) {
			for (const resource of resources) {
				item.tree.add(resource.sourceUri, resource);
			}
		}

		return item;
	}

	private onDidSpliceGroup(item: IGroupItem, { start, deleteCount, toInsert }: ISplice<ISCMResource>): void {
		const deleted = item.resources.splice(start, deleteCount, ...toInsert);

		if (this._mode === ViewModelMode.Tree) {
			for (const resource of deleted) {
				item.tree.delete(resource.sourceUri);
			}

			for (const resource of toInsert) {
				item.tree.add(resource.sourceUri, resource);
			}
		}

		this.refresh(item);
	}

	setVisible(visible: boolean): void {
		if (visible) {
			this.visibilityDisposables = new DisposableStore();
			this.repositories.onDidSplice(this.onDidSpliceRepositories, this, this.visibilityDisposables);
			this.onDidSpliceRepositories({ start: 0, deleteCount: 0, toInsert: this.repositories.elements });

			if (typeof this.scrollTop === 'number') {
				this.tree.scrollTop = this.scrollTop;
				this.scrollTop = undefined;
			}

			this.editorService.onDidActiveEditorChange(this.onDidActiveEditorChange, this, this.visibilityDisposables);
			this.onDidActiveEditorChange();
		} else {
			this.visibilityDisposables.dispose();
			this.onDidSpliceRepositories({ start: 0, deleteCount: this.items.length, toInsert: [] });
			this.scrollTop = this.tree.scrollTop;
		}
	}

	private refresh(item?: IRepositoryItem | IGroupItem): void {
		if (item) {
			this.tree.setChildren(item.element, this.render(item).children);
		} else {
			this.tree.setChildren(null, this.items.map(item => this.render(item)));
		}
	}

	private render(item: IRepositoryItem | IGroupItem): ICompressedTreeElement<TreeElement> {
		if (isRepositoryItem(item)) {
			return { element: item.element, children: item.groupItems.map(i => this.render(i)), incompressible: true, collapsible: true };
		} else {
			const children = this.mode === ViewModelMode.List
				? Iterable.map(item.resources, element => ({ element, incompressible: true }))
				: Iterable.map(item.tree.root.children, node => asTreeElement(node, true));

			return { element: item.element, children, incompressible: true, collapsible: true };
		}
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

		const editor = this.editorService.activeEditor;

		if (!editor) {
			return;
		}

		const uri = toResource(editor, { supportSideBySide: SideBySideEditor.PRIMARY });

		if (!uri) {
			return;
		}

		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i];
			// go backwards from last group
			for (let j = item.groupItems.length - 1; j >= 0; j--) {
				const groupItem = item.groupItems[j];
				const resource = this.mode === ViewModelMode.Tree
					? groupItem.tree.getNode(uri)?.element
					: find(groupItem.resources, r => isEqual(r.sourceUri, uri));

				if (resource) {
					this.tree.reveal(resource);
					this.tree.setSelection([resource]);
					this.tree.setFocus([resource]);
					return;
				}
			}
		}
	}

	dispose(): void {
		this.visibilityDisposables.dispose();
		this.disposables.dispose();

		for (const item of this.items) {
			item.disposable.dispose();
		}

		this.items = [];
	}
}

class SCMViewSubMenuAction extends ContextSubMenu {
	constructor(viewModel: ViewModel) {
		super(localize('sortAction', "View & Sort"),
			[
				...new RadioGroup([
					new SCMViewModeListAction(viewModel),
					new SCMViewModeTreeAction(viewModel)
				]).actions,
				new Separator(),
				...new RadioGroup([
					new SCMSortByNameAction(viewModel),
					new SCMSortByPathAction(viewModel),
					new SCMSortByStatusAction(viewModel)
				]).actions
			]
		);
	}
}

abstract class SCMViewModeAction extends Action {
	constructor(id: string, label: string, private viewModel: ViewModel, private viewMode: ViewModelMode) {
		super(id, label);

		this.checked = this.viewModel.mode === this.viewMode;
	}

	async run(): Promise<void> {
		if (this.viewMode !== this.viewModel.mode) {
			this.checked = !this.checked;
			this.viewModel.mode = this.viewMode;
		}
	}
}

class SCMViewModeListAction extends SCMViewModeAction {
	static readonly ID = 'workbench.scm.action.viewModeList';
	static readonly LABEL = localize('viewModeList', "View as List");

	constructor(viewModel: ViewModel) {
		super(SCMViewModeListAction.ID, SCMViewModeListAction.LABEL, viewModel, ViewModelMode.List);
	}
}

class SCMViewModeTreeAction extends SCMViewModeAction {
	static readonly ID = 'workbench.scm.action.viewModeTree';
	static readonly LABEL = localize('viewModeTree', "View as Tree");

	constructor(viewModel: ViewModel) {
		super(SCMViewModeTreeAction.ID, SCMViewModeTreeAction.LABEL, viewModel, ViewModelMode.Tree);
	}
}

abstract class SCMSortAction extends Action {

	private readonly _listener: IDisposable;

	constructor(id: string, label: string, private viewModel: ViewModel, private sortKey: ViewModelSortKey) {
		super(id, label);

		this.checked = this.sortKey === ViewModelSortKey.Path;
		this.enabled = this.viewModel?.mode === ViewModelMode.List ?? false;
		this._listener = viewModel?.onDidChangeMode(e => this.enabled = e === ViewModelMode.List);
	}

	async run(): Promise<void> {
		if (this.sortKey !== this.viewModel.sortKey) {
			this.checked = !this.checked;
			this.viewModel.sortKey = this.sortKey;
		}
	}

	dispose(): void {
		this._listener.dispose();
		super.dispose();
	}
}

class SCMSortByNameAction extends SCMSortAction {
	static readonly ID = 'workbench.scm.action.sortByName';
	static readonly LABEL = localize('sortByName', "Sort by Name");

	constructor(viewModel: ViewModel) {
		super(SCMSortByNameAction.ID, SCMSortByNameAction.LABEL, viewModel, ViewModelSortKey.Name);
	}
}

class SCMSortByPathAction extends SCMSortAction {
	static readonly ID = 'workbench.scm.action.sortByPath';
	static readonly LABEL = localize('sortByPath', "Sort by Path");

	constructor(viewModel: ViewModel) {
		super(SCMSortByPathAction.ID, SCMSortByPathAction.LABEL, viewModel, ViewModelSortKey.Path);
	}
}

class SCMSortByStatusAction extends SCMSortAction {
	static readonly ID = 'workbench.scm.action.sortByStatus';
	static readonly LABEL = localize('sortByStatus', "Sort by Status");

	constructor(viewModel: ViewModel) {
		super(SCMSortByStatusAction.ID, SCMSortByStatusAction.LABEL, viewModel, ViewModelSortKey.Status);
	}
}

export class SCMViewPane extends ViewPane {

	private readonly defaultInputFontFamily = DEFAULT_FONT_FAMILY;

	// TODO@joao: can we remove these?
	private cachedHeight: number | undefined = undefined;
	private cachedWidth: number | undefined = undefined;
	private inputContainer!: HTMLElement;
	private validationContainer!: HTMLElement;
	private inputEditor!: CodeEditorWidget;
	private inputModel!: ITextModel;
	private listContainer!: HTMLElement;
	private tree!: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private viewModel!: ViewModel;
	private listLabels!: ResourceLabels;
	private menus = new Map<ISCMProvider, SCMMenus>();
	// protected contextKeyService: IContextKeyService;
	private commitTemplate = '';

	constructor(
		options: IViewPaneOptions,
		@ISCMService private scmService: ISCMService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IThemeService protected themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextViewService protected contextViewService: IContextViewService,
		@ICommandService protected commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService protected editorService: IEditorService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService protected menuService: IMenuService,
		@IStorageService private storageService: IStorageService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		this._register(Event.any(this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository)(() => this._onDidChangeViewWelcomeState.fire()));

		// TODO@joao: move this to the container of the input box
		// this.contextKeyService = contextKeyService.createScoped(this.element);
		// this.contextKeyService.createKey('scmRepository', this.repository);
	}

	protected renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// TODO@joao: Input
		// this.inputContainer = append(container, $('.scm-editor'));
		// const editorContainer = append(this.inputContainer, $('.scm-editor-container'));

		// const placeholderTextContainer = append(editorContainer, $('.scm-editor-placeholder'));
		// const updatePlaceholder = () => {
		// 	const binding = this.keybindingService.lookupKeybinding('scm.acceptInput');
		// 	const label = binding ? binding.getLabel() : (platform.isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter');
		// 	const placeholderText = format(this.repository.input.placeholder, label);

		// 	this.inputEditor.updateOptions({ ariaLabel: placeholderText });
		// 	placeholderTextContainer.textContent = placeholderText;
		// };

		// this.validationContainer = append(editorContainer, $('.scm-editor-validation'));

		// const validationDelayer = new ThrottledDelayer<any>(200);
		// const validate = () => {
		// 	const position = this.inputEditor.getSelection()?.getStartPosition();
		// 	const offset = position && this.inputModel.getOffsetAt(position);
		// 	const value = this.inputModel.getValue();

		// 	return this.repository.input.validateInput(value, offset || 0).then(result => {
		// 		if (!result) {
		// 			removeClass(editorContainer, 'validation-info');
		// 			removeClass(editorContainer, 'validation-warning');
		// 			removeClass(editorContainer, 'validation-error');
		// 			removeClass(this.validationContainer, 'validation-info');
		// 			removeClass(this.validationContainer, 'validation-warning');
		// 			removeClass(this.validationContainer, 'validation-error');
		// 			this.validationContainer.textContent = null;
		// 		} else {
		// 			toggleClass(editorContainer, 'validation-info', result.type === InputValidationType.Information);
		// 			toggleClass(editorContainer, 'validation-warning', result.type === InputValidationType.Warning);
		// 			toggleClass(editorContainer, 'validation-error', result.type === InputValidationType.Error);
		// 			toggleClass(this.validationContainer, 'validation-info', result.type === InputValidationType.Information);
		// 			toggleClass(this.validationContainer, 'validation-warning', result.type === InputValidationType.Warning);
		// 			toggleClass(this.validationContainer, 'validation-error', result.type === InputValidationType.Error);
		// 			this.validationContainer.textContent = result.message;
		// 		}
		// 	});
		// };

		// const triggerValidation = () => validationDelayer.trigger(validate);

		// const editorOptions: IEditorConstructionOptions = {
		// 	...getSimpleEditorOptions(),
		// 	lineDecorationsWidth: 4,
		// 	dragAndDrop: false,
		// 	cursorWidth: 1,
		// 	fontSize: 13,
		// 	lineHeight: 20,
		// 	fontFamily: this.getInputEditorFontFamily(),
		// 	wrappingStrategy: 'advanced',
		// 	wrappingIndent: 'none',
		// 	padding: { top: 3, bottom: 3 },
		// 	quickSuggestions: false
		// };
		// const codeEditorWidgetOptions: ICodeEditorWidgetOptions = {
		// 	isSimpleWidget: true,
		// 	contributions: EditorExtensionsRegistry.getSomeEditorContributions([
		// 		SuggestController.ID,
		// 		SnippetController2.ID,
		// 		MenuPreventer.ID,
		// 		SelectionClipboardContributionID,
		// 		ContextMenuController.ID,
		// 		ColorDetector.ID,
		// 		ModesHoverController.ID,
		// 		LinkDetector.ID
		// 	])
		// };

		// const services = new ServiceCollection([IContextKeyService, this.contextKeyService]);
		// const instantiationService = this.instantiationService.createChild(services);
		// this.inputEditor = instantiationService.createInstance(CodeEditorWidget, editorContainer, editorOptions, codeEditorWidgetOptions);

		// this._register(this.inputEditor);

		// this._register(this.inputEditor.onDidFocusEditorText(() => addClass(editorContainer, 'synthetic-focus')));
		// this._register(this.inputEditor.onDidBlurEditorText(() => removeClass(editorContainer, 'synthetic-focus')));

		// const onInputFontFamilyChanged = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.inputFontFamily'));
		// this._register(onInputFontFamilyChanged(() => this.inputEditor.updateOptions({ fontFamily: this.getInputEditorFontFamily() })));

		// let query: string | undefined;

		// if (this.repository.provider.rootUri) {
		// 	query = `rootUri=${encodeURIComponent(this.repository.provider.rootUri.toString())}`;
		// }

		// const uri = URI.from({
		// 	scheme: Schemas.vscode,
		// 	path: `scm/${this.repository.provider.contextValue}/${this.repository.provider.id}/input`,
		// 	query
		// });

		// this.configurationService.updateValue('editor.wordBasedSuggestions', false, { resource: uri }, ConfigurationTarget.MEMORY);

		// const mode = this.modeService.create('scminput');
		// this.inputModel = this.modelService.getModel(uri) || this.modelService.createModel('', mode, uri);
		// this.inputEditor.setModel(this.inputModel);

		// this._register(this.inputEditor.onDidChangeCursorPosition(triggerValidation));

		// const opts = this.modelService.getCreationOptions(this.inputModel.getLanguageIdentifier().language, this.inputModel.uri, this.inputModel.isForSimpleWidget);
		// const onEnter = Event.filter(this.inputEditor.onKeyDown, e => e.keyCode === KeyCode.Enter);
		// this._register(onEnter(() => this.inputModel.detectIndentation(opts.insertSpaces, opts.tabSize)));

		// Keep model in sync with API
		// this.inputModel.setValue(this.repository.input.value);
		// this._register(this.repository.input.onDidChange(value => {
		// 	if (value === this.inputModel.getValue()) {
		// 		return;
		// 	}
		// 	this.inputModel.setValue(value);
		// 	this.inputEditor.setPosition(this.inputModel.getFullModelRange().getEndPosition());
		// }));

		// Keep API in sync with model and update placeholder and validation
		// toggleClass(placeholderTextContainer, 'hidden', this.inputModel.getValueLength() > 0);
		// this.inputModel.onDidChangeContent(() => {
		// 	this.repository.input.value = this.inputModel.getValue();
		// 	toggleClass(placeholderTextContainer, 'hidden', this.inputModel.getValueLength() > 0);
		// 	triggerValidation();
		// });

		// updatePlaceholder();
		// this._register(this.repository.input.onDidChangePlaceholder(updatePlaceholder, null));
		// this._register(this.keybindingService.onDidUpdateKeybindings(updatePlaceholder, null));

		// const onDidChangeContentHeight = Event.filter(this.inputEditor.onDidContentSizeChange, e => e.contentHeightChanged);
		// this._register(onDidChangeContentHeight(() => this.layoutBody()));

		// this._register(this.repository.provider.onDidChangeCommitTemplate(this.onDidChangeCommitTemplate, this));
		// this.onDidChangeCommitTemplate();

		// Input box visibility
		// this._register(this.repository.input.onDidChangeVisibility(this.updateInputBoxVisibility, this));
		// this.updateInputBoxVisibility();

		// List
		this.listContainer = append(container, $('.scm-status.show-file-icons'));

		const updateActionsVisibility = () => toggleClass(this.listContainer, 'show-actions', this.configurationService.getValue<boolean>('scm.alwaysShowActions'));
		Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowActions'))(updateActionsVisibility);
		updateActionsVisibility();

		const delegate = new ProviderListDelegate();

		const actionViewItemProvider = (action: IAction) => this.getActionViewItem(action);

		this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
		this._register(this.listLabels);

		const actionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
		this._register(actionRunner);
		this._register(actionRunner.onDidBeforeRun(() => this.tree.domFocus()));

		const renderers = [
			new RepositoryRenderer(this.commandService, this.themeService),
			new ResourceGroupRenderer(actionViewItemProvider, this.themeService, this.menus),
			new ResourceRenderer(() => this.viewModel, this.listLabels, actionViewItemProvider, actionRunner, this.themeService, this.menus)
		];

		const filter = new SCMTreeFilter();
		const sorter = new SCMTreeSorter(() => this.viewModel);
		const keyboardNavigationLabelProvider = this.instantiationService.createInstance(SCMTreeKeyboardNavigationLabelProvider);
		const identityProvider = new SCMResourceIdentityProvider();

		this.tree = this.instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
			'SCM Tree Repo',
			this.listContainer,
			delegate,
			renderers,
			{
				identityProvider,
				horizontalScrolling: false,
				filter,
				sorter,
				keyboardNavigationLabelProvider,
				overrideStyles: {
					listBackground: SIDE_BAR_BACKGROUND
				},
				accessibilityProvider: this.instantiationService.createInstance(SCMAccessibilityProvider)
			}) as WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;

		this._register(this.tree.onDidOpen(this.open, this));

		this._register(this.tree.onContextMenu(this.onListContextMenu, this));
		this._register(this.tree);

		let viewMode = this.configurationService.getValue<'tree' | 'list'>('scm.defaultViewMode') === 'list' ? ViewModelMode.List : ViewModelMode.Tree;
		const storageMode = this.storageService.get(`scm.viewMode`, StorageScope.WORKSPACE) as ViewModelMode;

		if (typeof storageMode === 'string') {
			viewMode = storageMode;
		}

		this._register(this.scmService.onDidAddRepository(r => this.menus.set(r.provider, this.instantiationService.createInstance(SCMMenus, r.provider))));
		this._register(this.scmService.onDidRemoveRepository(r => this.menus.delete(r.provider)));

		const repositories = new SimpleSequence(this.scmService.repositories, this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository);
		this._register(repositories);

		this.viewModel = this.instantiationService.createInstance(ViewModel, repositories, this.tree, viewMode, ViewModelSortKey.Path);
		this._register(this.viewModel);

		addClass(this.listContainer, 'file-icon-themable-tree');
		addClass(this.listContainer, 'show-file-icons');

		this.updateIndentStyles(this.themeService.getFileIconTheme());
		this._register(this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this));
		this._register(this.viewModel.onDidChangeMode(this.onDidChangeMode, this));

		this._register(this.onDidChangeBodyVisibility(this._onDidChangeVisibility, this));

		this.updateActions();
	}

	private updateIndentStyles(theme: IFileIconTheme): void {
		toggleClass(this.listContainer, 'list-view-mode', this.viewModel.mode === ViewModelMode.List);
		toggleClass(this.listContainer, 'tree-view-mode', this.viewModel.mode === ViewModelMode.Tree);
		toggleClass(this.listContainer, 'align-icons-and-twisties', (this.viewModel.mode === ViewModelMode.List && theme.hasFileIcons) || (theme.hasFileIcons && !theme.hasFolderIcons));
		toggleClass(this.listContainer, 'hide-arrows', this.viewModel.mode === ViewModelMode.Tree && theme.hidesExplorerArrows === true);
	}

	private onDidChangeMode(): void {
		this.updateIndentStyles(this.themeService.getFileIconTheme());
		this.storageService.store(`scm.viewMode`, this.viewModel.mode, StorageScope.WORKSPACE);
	}

	layoutBody(height: number | undefined = this.cachedHeight, width: number | undefined = this.cachedWidth): void {
		if (height === undefined) {
			return;
		}

		if (width !== undefined) {
			super.layoutBody(height, width);
		}

		this.cachedHeight = height;
		this.cachedWidth = width;

		// if (this.repository.input.visible) {
		// 	removeClass(this.inputContainer, 'hidden');

		// 	const editorContentHeight = this.inputEditor.getContentHeight();
		// 	const editorHeight = Math.min(editorContentHeight, 134);
		// 	this.inputEditor.layout({ height: editorHeight, width: width! - 12 - 16 - 2 });

		// 	this.validationContainer.style.top = `${editorHeight + 1}px`;

		// 	const listHeight = height - (editorHeight + 5 + 2 + 5);
		// 	this.listContainer.style.height = `${listHeight}px`;
		// 	this.tree.layout(listHeight, width);
		// } else {
		// 	addClass(this.inputContainer, 'hidden');

		// 	this.inputEditor.onHide();
		this.listContainer.style.height = `${height}px`;
		this.tree.layout(height, width);
		// }
	}

	focus(): void {
		super.focus();

		if (this.isExpanded()) {
			this.tree.domFocus();
		}
	}

	private _onDidChangeVisibility(visible: boolean): void {
		this.viewModel.setVisible(visible);

		// TODO@joao
		// if (this.repository.input.visible && visible) {
		// 	this.inputEditor.onVisible();
		// } else {
		// 	this.inputEditor.onHide();
		// }
	}

	// TODO@joao
	getActions(): IAction[] {
		return [];
		// return this.menus.getTitleActions();
	}

	// TODO@joao
	getSecondaryActions(): IAction[] {
		return [];
		// if (!this.viewModel) {
		// 	return [];
		// }

		// const result: IAction[] = [new SCMViewSubMenuAction(this.viewModel)];
		// const secondaryActions = this.menus.getTitleSecondaryActions();

		// if (secondaryActions.length > 0) {
		// 	result.push(new Separator(), ...secondaryActions);
		// }

		// return result;
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService);
	}

	// TODO@joao
	// getActionsContext(): any {
	// 	return this.repository.provider;
	// }

	private async open(e: IOpenEvent<TreeElement | null>): Promise<void> {
		if (!e.element || isSCMRepository(e.element) || isSCMResourceGroup(e.element) || ResourceTree.isResourceNode(e.element)) {
			return;
		}

		await e.element.open(!!e.editorOptions.preserveFocus);

		if (e.editorOptions.pinned) {
			const activeEditorPane = this.editorService.activeEditorPane;

			if (activeEditorPane) {
				activeEditorPane.group.pinEditor(activeEditorPane.input);
			}
		}
	}

	private onListContextMenu(e: ITreeContextMenuEvent<TreeElement | null>): void {
		if (!e.element) {
			return;
		}

		const element = e.element;
		let actions: IAction[] = [];

		if (isSCMRepository(element)) {
			// TODO@joao
		} else if (isSCMResourceGroup(element)) {
			const menus = this.menus.get(element.provider)!;
			actions = menus.getResourceGroupContextActions(element);
		} else if (ResourceTree.isResourceNode(element)) {
			if (element.element) {
				const menus = this.menus.get(element.element.resourceGroup.provider)!;
				actions = menus.getResourceContextActions(element.element);
			} else {
				const menus = this.menus.get(element.context.provider)!;
				actions = menus.getResourceFolderContextActions(element.context);
			}
		} else {
			const menus = this.menus.get(element.resourceGroup.provider)!;
			actions = menus.getResourceContextActions(element);
		}

		const actionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
		actionRunner.onDidBeforeRun(() => this.tree.domFocus());

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => element,
			actionRunner
		});
	}

	private getSelectedResources(): (ISCMResource | IResourceNode<ISCMResource, ISCMResourceGroup>)[] {
		return this.tree.getSelection()
			.filter(r => !!r && !isSCMResourceGroup(r))! as any;
	}

	// private onDidChangeCommitTemplate(): void {
	// 	if (typeof this.repository.provider.commitTemplate === 'undefined' || !this.repository.input.visible) {
	// 		return;
	// 	}

	// 	const oldCommitTemplate = this.commitTemplate;
	// 	this.commitTemplate = this.repository.provider.commitTemplate;

	// 	const value = this.inputModel.getValue();

	// 	if (value && value !== oldCommitTemplate) {
	// 		return;
	// 	}

	// 	this.inputModel.setValue(this.commitTemplate);
	// }

	// private updateInputBoxVisibility(): void {
	// 	if (this.cachedHeight) {
	// 		this.layoutBody(this.cachedHeight);
	// 	}
	// }

	// private getInputEditorFontFamily(): string {
	// 	const inputFontFamily = this.configurationService.getValue<string>('scm.inputFontFamily').trim();

	// 	if (inputFontFamily.toLowerCase() === 'editor') {
	// 		return this.configurationService.getValue<string>('editor.fontFamily').trim();
	// 	}

	// 	if (inputFontFamily.length !== 0 && inputFontFamily.toLowerCase() !== 'default') {
	// 		return inputFontFamily;
	// 	}

	// 	return this.defaultInputFontFamily;
	// }

	shouldShowWelcome(): boolean {
		return this.scmService.repositories.length === 0;
	}
}

registerThemingParticipant((theme, collector) => {
	const inputBackgroundColor = theme.getColor(inputBackground);
	if (inputBackgroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-container .monaco-editor-background,
		.scm-viewlet .scm-editor-container .monaco-editor,
		.scm-viewlet .scm-editor-container .monaco-editor .margin
		{ background-color: ${inputBackgroundColor}; }`);
	}

	const inputForegroundColor = theme.getColor(inputForeground);
	if (inputForegroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-container .mtk1 { color: ${inputForegroundColor}; }`);
	}

	const inputBorderColor = theme.getColor(inputBorder);
	if (inputBorderColor) {
		collector.addRule(`.scm-viewlet .scm-editor-container { outline: 1px solid ${inputBorderColor}; }`);
	}

	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`.scm-viewlet .scm-editor-container.synthetic-focus { outline: 1px solid ${focusBorderColor}; }`);
	}

	const inputPlaceholderForegroundColor = theme.getColor(inputPlaceholderForeground);
	if (inputPlaceholderForegroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-placeholder { color: ${inputPlaceholderForegroundColor}; }`);
	}

	const inputValidationInfoBorderColor = theme.getColor(inputValidationInfoBorder);
	if (inputValidationInfoBorderColor) {
		collector.addRule(`.scm-viewlet .scm-editor-container.validation-info { outline: 1px solid ${inputValidationInfoBorderColor}; }`);
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-info { border: 1px solid ${inputValidationInfoBorderColor}; }`);
	}

	const inputValidationInfoBackgroundColor = theme.getColor(inputValidationInfoBackground);
	if (inputValidationInfoBackgroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-info { background-color: ${inputValidationInfoBackgroundColor}; }`);
	}

	const inputValidationInfoForegroundColor = theme.getColor(inputValidationInfoForeground);
	if (inputValidationInfoForegroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-info { color: ${inputValidationInfoForegroundColor}; }`);
	}

	const inputValidationWarningBorderColor = theme.getColor(inputValidationWarningBorder);
	if (inputValidationWarningBorderColor) {
		collector.addRule(`.scm-viewlet .scm-editor-container.validation-warning { outline: 1px solid ${inputValidationWarningBorderColor}; }`);
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-warning { border: 1px solid ${inputValidationWarningBorderColor}; }`);
	}

	const inputValidationWarningBackgroundColor = theme.getColor(inputValidationWarningBackground);
	if (inputValidationWarningBackgroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-warning { background-color: ${inputValidationWarningBackgroundColor}; }`);
	}

	const inputValidationWarningForegroundColor = theme.getColor(inputValidationWarningForeground);
	if (inputValidationWarningForegroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-warning { color: ${inputValidationWarningForegroundColor}; }`);
	}

	const inputValidationErrorBorderColor = theme.getColor(inputValidationErrorBorder);
	if (inputValidationErrorBorderColor) {
		collector.addRule(`.scm-viewlet .scm-editor-container.validation-error { outline: 1px solid ${inputValidationErrorBorderColor}; }`);
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-error { border: 1px solid ${inputValidationErrorBorderColor}; }`);
	}

	const inputValidationErrorBackgroundColor = theme.getColor(inputValidationErrorBackground);
	if (inputValidationErrorBackgroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-error { background-color: ${inputValidationErrorBackgroundColor}; }`);
	}

	const inputValidationErrorForegroundColor = theme.getColor(inputValidationErrorForeground);
	if (inputValidationErrorForegroundColor) {
		collector.addRule(`.scm-viewlet .scm-editor-validation.validation-error { color: ${inputValidationErrorForegroundColor}; }`);
	}
});
