/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ActionButtonRenderer_1, InputRenderer_1, ResourceGroupRenderer_1, ResourceRenderer_1;
import './media/scm.css';
import { Event, Emitter } from '../../../../base/common/event.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { Disposable, DisposableStore, combinedDisposable, dispose, toDisposable, MutableDisposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ViewPane, ViewAction } from '../../../browser/parts/views/viewPane.js';
import { append, $, clearNode, isPointerEvent, isActiveElement } from '../../../../base/browser/dom.js';
import { asCSSUrl } from '../../../../base/browser/cssValue.js';
import { ISCMViewService, ISCMService, VIEW_PANE_ID } from '../common/scm.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { MenuItemAction, IMenuService, registerAction2, MenuId, MenuRegistry, Action2 } from '../../../../platform/actions/common/actions.js';
import { ActionRunner, Separator, toAction } from '../../../../base/common/actions.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { isSCMResource, isSCMResourceGroup, isSCMRepository, isSCMInput, collectContextMenuActions, getActionViewItemProvider, isSCMActionButton, isSCMViewService, isSCMResourceNode, connectPrimaryMenu } from './util.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { disposableTimeout, Sequencer, Throttler } from '../../../../base/common/async.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { compareFileNames, comparePaths } from '../../../../base/common/comparers.js';
import { createMatches } from '../../../../base/common/filters.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { localize } from '../../../../nls.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { compare } from '../../../../base/common/strings.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { RepositoryActionRunner, RepositoryRenderer } from './scmRepositoryRenderer.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { getFlatContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Button, ButtonWithDropdown } from '../../../../base/browser/ui/button/button.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { RepositoryContextKeys } from './scmViewService.js';
import { defaultButtonStyles, defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Schemas } from '../../../../base/common/network.js';
import { fillEditorsDragData } from '../../../browser/dnd.js';
import { CodeDataTransfers } from '../../../../platform/dnd/browser/dnd.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { rot } from '../../../../base/common/numbers.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { OpenScmGroupAction } from '../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js';
import { autorun } from '../../../../base/common/observable.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { SCMInputWidget } from './scmInput.js';
function processResourceFilterData(uri, filterData) {
    if (!filterData) {
        return [undefined, undefined];
    }
    if (!filterData.label) {
        const matches = createMatches(filterData);
        return [matches, undefined];
    }
    const fileName = basename(uri);
    const label = filterData.label;
    const pathLength = label.length - fileName.length;
    const matches = createMatches(filterData.score);
    // FileName match
    if (label === fileName) {
        return [matches, undefined];
    }
    // FilePath match
    const labelMatches = [];
    const descriptionMatches = [];
    for (const match of matches) {
        if (match.start > pathLength) {
            // Label match
            labelMatches.push({
                start: match.start - pathLength,
                end: match.end - pathLength
            });
        }
        else if (match.end < pathLength) {
            // Description match
            descriptionMatches.push(match);
        }
        else {
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
let ActionButtonRenderer = class ActionButtonRenderer {
    static { ActionButtonRenderer_1 = this; }
    static { this.DEFAULT_HEIGHT = 28; }
    static { this.TEMPLATE_ID = 'actionButton'; }
    get templateId() { return ActionButtonRenderer_1.TEMPLATE_ID; }
    constructor(commandService, contextMenuService, notificationService) {
        this.commandService = commandService;
        this.contextMenuService = contextMenuService;
        this.notificationService = notificationService;
        this.actionButtons = new Map();
    }
    renderTemplate(container) {
        // Use default cursor & disable hover for list item
        container.parentElement.parentElement.classList.add('cursor-default', 'force-no-hover');
        const buttonContainer = append(container, $('.button-container'));
        const actionButton = new SCMActionButton(buttonContainer, this.contextMenuService, this.commandService, this.notificationService);
        return { actionButton, disposable: Disposable.None, templateDisposable: actionButton };
    }
    renderElement(node, index, templateData) {
        templateData.disposable.dispose();
        const disposables = new DisposableStore();
        const actionButton = node.element;
        templateData.actionButton.setButton(node.element.button);
        // Remember action button
        this.actionButtons.set(actionButton, templateData.actionButton);
        disposables.add({ dispose: () => this.actionButtons.delete(actionButton) });
        templateData.disposable = disposables;
    }
    renderCompressedElements() {
        throw new Error('Should never happen since node is incompressible');
    }
    focusActionButton(actionButton) {
        this.actionButtons.get(actionButton)?.focus();
    }
    disposeElement(node, index, template) {
        template.disposable.dispose();
    }
    disposeTemplate(templateData) {
        templateData.disposable.dispose();
        templateData.templateDisposable.dispose();
    }
};
ActionButtonRenderer = ActionButtonRenderer_1 = __decorate([
    __param(0, ICommandService),
    __param(1, IContextMenuService),
    __param(2, INotificationService)
], ActionButtonRenderer);
export { ActionButtonRenderer };
class SCMTreeDragAndDrop {
    constructor(instantiationService) {
        this.instantiationService = instantiationService;
    }
    getDragURI(element) {
        if (isSCMResource(element)) {
            return element.sourceUri.toString();
        }
        return null;
    }
    onDragStart(data, originalEvent) {
        const items = SCMTreeDragAndDrop.getResourcesFromDragAndDropData(data);
        if (originalEvent.dataTransfer && items?.length) {
            this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, items, originalEvent));
            const fileResources = items.filter(s => s.scheme === Schemas.file).map(r => r.fsPath);
            if (fileResources.length) {
                originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
            }
        }
    }
    getDragLabel(elements, originalEvent) {
        if (elements.length === 1) {
            const element = elements[0];
            if (isSCMResource(element)) {
                return basename(element.sourceUri);
            }
        }
        return String(elements.length);
    }
    onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
        return true;
    }
    drop(data, targetElement, targetIndex, targetSector, originalEvent) { }
    static getResourcesFromDragAndDropData(data) {
        const uris = [];
        for (const element of [...data.context ?? [], ...data.elements]) {
            if (isSCMResource(element)) {
                uris.push(element.sourceUri);
            }
        }
        return uris;
    }
    dispose() { }
}
let InputRenderer = class InputRenderer {
    static { InputRenderer_1 = this; }
    static { this.DEFAULT_HEIGHT = 26; }
    static { this.TEMPLATE_ID = 'input'; }
    get templateId() { return InputRenderer_1.TEMPLATE_ID; }
    constructor(outerLayout, overflowWidgetsDomNode, updateHeight, instantiationService) {
        this.outerLayout = outerLayout;
        this.overflowWidgetsDomNode = overflowWidgetsDomNode;
        this.updateHeight = updateHeight;
        this.instantiationService = instantiationService;
        this.inputWidgets = new Map();
        this.contentHeights = new WeakMap();
        this.editorSelections = new WeakMap();
    }
    renderTemplate(container) {
        // Disable hover for list item
        container.parentElement.parentElement.classList.add('force-no-hover');
        const templateDisposable = new DisposableStore();
        const inputElement = append(container, $('.scm-input'));
        const inputWidget = this.instantiationService.createInstance(SCMInputWidget, inputElement, this.overflowWidgetsDomNode);
        templateDisposable.add(inputWidget);
        return { inputWidget, inputWidgetHeight: InputRenderer_1.DEFAULT_HEIGHT, elementDisposables: new DisposableStore(), templateDisposable };
    }
    renderElement(node, index, templateData) {
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
        templateData.inputWidgetHeight = InputRenderer_1.DEFAULT_HEIGHT;
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
    renderCompressedElements() {
        throw new Error('Should never happen since node is incompressible');
    }
    disposeElement(group, index, template) {
        template.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.templateDisposable.dispose();
    }
    getHeight(input) {
        return (this.contentHeights.get(input) ?? InputRenderer_1.DEFAULT_HEIGHT) + 10;
    }
    getRenderedInputWidget(input) {
        return this.inputWidgets.get(input);
    }
    getFocusedInput() {
        for (const [input, inputWidget] of this.inputWidgets) {
            if (inputWidget.hasFocus()) {
                return input;
            }
        }
        return undefined;
    }
    clearValidation() {
        for (const [, inputWidget] of this.inputWidgets) {
            inputWidget.clearValidation();
        }
    }
};
InputRenderer = InputRenderer_1 = __decorate([
    __param(3, IInstantiationService)
], InputRenderer);
let ResourceGroupRenderer = class ResourceGroupRenderer {
    static { ResourceGroupRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'resource group'; }
    get templateId() { return ResourceGroupRenderer_1.TEMPLATE_ID; }
    constructor(actionViewItemProvider, actionRunner, commandService, contextKeyService, contextMenuService, keybindingService, menuService, scmViewService, telemetryService) {
        this.actionViewItemProvider = actionViewItemProvider;
        this.actionRunner = actionRunner;
        this.commandService = commandService;
        this.contextKeyService = contextKeyService;
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.menuService = menuService;
        this.scmViewService = scmViewService;
        this.telemetryService = telemetryService;
    }
    renderTemplate(container) {
        const element = append(container, $('.resource-group'));
        const name = append(element, $('.name'));
        const actionsContainer = append(element, $('.actions'));
        const actionBar = new WorkbenchToolBar(actionsContainer, {
            actionViewItemProvider: this.actionViewItemProvider,
            actionRunner: this.actionRunner
        }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
        const countContainer = append(element, $('.count'));
        const count = new CountBadge(countContainer, {}, defaultCountBadgeStyles);
        const disposables = combinedDisposable(actionBar, count);
        return { name, count, actionBar, elementDisposables: new DisposableStore(), disposables };
    }
    renderElement(node, index, template) {
        const group = node.element;
        template.name.textContent = group.label;
        template.count.setCount(group.resources.length);
        const menus = this.scmViewService.menus.getRepositoryMenus(group.provider);
        template.elementDisposables.add(connectPrimaryMenu(menus.getResourceGroupMenu(group), primary => {
            template.actionBar.setActions(primary);
        }, 'inline'));
        template.actionBar.context = group;
    }
    renderCompressedElements(node) {
        throw new Error('Should never happen since node is incompressible');
    }
    disposeElement(group, index, template) {
        template.elementDisposables.clear();
    }
    disposeTemplate(template) {
        template.elementDisposables.dispose();
        template.disposables.dispose();
    }
};
ResourceGroupRenderer = ResourceGroupRenderer_1 = __decorate([
    __param(2, ICommandService),
    __param(3, IContextKeyService),
    __param(4, IContextMenuService),
    __param(5, IKeybindingService),
    __param(6, IMenuService),
    __param(7, ISCMViewService),
    __param(8, ITelemetryService)
], ResourceGroupRenderer);
class RepositoryPaneActionRunner extends ActionRunner {
    constructor(getSelectedResources) {
        super();
        this.getSelectedResources = getSelectedResources;
    }
    async runAction(action, context) {
        if (!(action instanceof MenuItemAction)) {
            return super.runAction(action, context);
        }
        const isContextResourceGroup = isSCMResourceGroup(context);
        const selection = this.getSelectedResources().filter(r => isSCMResourceGroup(r) === isContextResourceGroup);
        const contextIsSelected = selection.some(s => s === context);
        const actualContext = contextIsSelected ? selection : [context];
        const args = actualContext.map(e => ResourceTree.isResourceNode(e) ? ResourceTree.collect(e) : [e]).flat();
        await action.run(...args);
    }
}
let ResourceRenderer = class ResourceRenderer {
    static { ResourceRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'resource'; }
    get templateId() { return ResourceRenderer_1.TEMPLATE_ID; }
    constructor(viewMode, labels, actionViewItemProvider, actionRunner, commandService, contextKeyService, contextMenuService, keybindingService, labelService, menuService, scmViewService, telemetryService, themeService) {
        this.viewMode = viewMode;
        this.labels = labels;
        this.actionViewItemProvider = actionViewItemProvider;
        this.actionRunner = actionRunner;
        this.commandService = commandService;
        this.contextKeyService = contextKeyService;
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.labelService = labelService;
        this.menuService = menuService;
        this.scmViewService = scmViewService;
        this.telemetryService = telemetryService;
        this.themeService = themeService;
        this.disposables = new DisposableStore();
        this.renderedResources = new Map();
        themeService.onDidColorThemeChange(this.onDidColorThemeChange, this, this.disposables);
    }
    renderTemplate(container) {
        const element = append(container, $('.resource'));
        const name = append(element, $('.name'));
        const fileLabel = this.labels.create(name, { supportDescriptionHighlights: true, supportHighlights: true });
        const actionsContainer = append(fileLabel.element, $('.actions'));
        const actionBar = new WorkbenchToolBar(actionsContainer, {
            actionViewItemProvider: this.actionViewItemProvider,
            actionRunner: this.actionRunner
        }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
        const decorationIcon = append(element, $('.decoration-icon'));
        const actionBarMenuListener = new MutableDisposable();
        const disposables = combinedDisposable(actionBar, fileLabel, actionBarMenuListener);
        return { element, name, fileLabel, decorationIcon, actionBar, actionBarMenu: undefined, actionBarMenuListener, elementDisposables: new DisposableStore(), disposables };
    }
    renderElement(node, index, template) {
        const resourceOrFolder = node.element;
        const iconResource = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.element : resourceOrFolder;
        const uri = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.uri : resourceOrFolder.sourceUri;
        const fileKind = ResourceTree.isResourceNode(resourceOrFolder) ? FileKind.FOLDER : FileKind.FILE;
        const tooltip = !ResourceTree.isResourceNode(resourceOrFolder) && resourceOrFolder.decorations.tooltip || '';
        const hidePath = this.viewMode() === "tree" /* ViewMode.Tree */;
        let matches;
        let descriptionMatches;
        let strikethrough;
        if (ResourceTree.isResourceNode(resourceOrFolder)) {
            if (resourceOrFolder.element) {
                const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.element.resourceGroup.provider);
                this._renderActionBar(template, resourceOrFolder, menus.getResourceMenu(resourceOrFolder.element));
                template.element.classList.toggle('faded', resourceOrFolder.element.decorations.faded);
                strikethrough = resourceOrFolder.element.decorations.strikeThrough;
            }
            else {
                const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.context.provider);
                this._renderActionBar(template, resourceOrFolder, menus.getResourceFolderMenu(resourceOrFolder.context));
                matches = createMatches(node.filterData);
                template.element.classList.remove('faded');
            }
        }
        else {
            const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.resourceGroup.provider);
            this._renderActionBar(template, resourceOrFolder, menus.getResourceMenu(resourceOrFolder));
            [matches, descriptionMatches] = processResourceFilterData(uri, node.filterData);
            template.element.classList.toggle('faded', resourceOrFolder.decorations.faded);
            strikethrough = resourceOrFolder.decorations.strikeThrough;
        }
        const renderedData = {
            tooltip, uri, fileLabelOptions: { hidePath, fileKind, matches, descriptionMatches, strikethrough }, iconResource
        };
        this.renderIcon(template, renderedData);
        this.renderedResources.set(template, renderedData);
        template.elementDisposables.add(toDisposable(() => this.renderedResources.delete(template)));
        template.element.setAttribute('data-tooltip', tooltip);
    }
    disposeElement(resource, index, template) {
        template.elementDisposables.clear();
    }
    renderCompressedElements(node, index, template) {
        const compressed = node.element;
        const folder = compressed.elements[compressed.elements.length - 1];
        const label = compressed.elements.map(e => e.name);
        const fileKind = FileKind.FOLDER;
        const matches = createMatches(node.filterData);
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
    disposeCompressedElements(node, index, template) {
        template.elementDisposables.clear();
    }
    disposeTemplate(template) {
        template.elementDisposables.dispose();
        template.disposables.dispose();
    }
    _renderActionBar(template, resourceOrFolder, menu) {
        if (!template.actionBarMenu || template.actionBarMenu !== menu) {
            template.actionBarMenu = menu;
            template.actionBarMenuListener.value = connectPrimaryMenu(menu, primary => {
                template.actionBar.setActions(primary);
            }, 'inline');
        }
        template.actionBar.context = resourceOrFolder;
    }
    onDidColorThemeChange() {
        for (const [template, data] of this.renderedResources) {
            this.renderIcon(template, data);
        }
    }
    renderIcon(template, data) {
        const theme = this.themeService.getColorTheme();
        const icon = isDark(theme.type) ? data.iconResource?.decorations.iconDark : data.iconResource?.decorations.icon;
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
            }
            else {
                template.decorationIcon.className = 'decoration-icon';
                template.decorationIcon.style.color = '';
                template.decorationIcon.style.display = '';
                template.decorationIcon.style.backgroundImage = asCSSUrl(icon);
            }
            template.decorationIcon.title = data.tooltip;
        }
        else {
            template.decorationIcon.className = 'decoration-icon';
            template.decorationIcon.style.color = '';
            template.decorationIcon.style.display = 'none';
            template.decorationIcon.style.backgroundImage = '';
            template.decorationIcon.title = '';
        }
    }
    dispose() {
        this.disposables.dispose();
    }
};
ResourceRenderer = ResourceRenderer_1 = __decorate([
    __param(4, ICommandService),
    __param(5, IContextKeyService),
    __param(6, IContextMenuService),
    __param(7, IKeybindingService),
    __param(8, ILabelService),
    __param(9, IMenuService),
    __param(10, ISCMViewService),
    __param(11, ITelemetryService),
    __param(12, IThemeService)
], ResourceRenderer);
class ListDelegate {
    constructor(inputRenderer) {
        this.inputRenderer = inputRenderer;
    }
    getHeight(element) {
        if (isSCMInput(element)) {
            return this.inputRenderer.getHeight(element);
        }
        else if (isSCMActionButton(element)) {
            return ActionButtonRenderer.DEFAULT_HEIGHT + 8;
        }
        else {
            return 22;
        }
    }
    getTemplateId(element) {
        if (isSCMRepository(element)) {
            return RepositoryRenderer.TEMPLATE_ID;
        }
        else if (isSCMInput(element)) {
            return InputRenderer.TEMPLATE_ID;
        }
        else if (isSCMActionButton(element)) {
            return ActionButtonRenderer.TEMPLATE_ID;
        }
        else if (isSCMResourceGroup(element)) {
            return ResourceGroupRenderer.TEMPLATE_ID;
        }
        else if (isSCMResource(element) || isSCMResourceNode(element)) {
            return ResourceRenderer.TEMPLATE_ID;
        }
        else {
            throw new Error('Unknown element');
        }
    }
}
class SCMTreeCompressionDelegate {
    isIncompressible(element) {
        if (ResourceTree.isResourceNode(element)) {
            return element.childrenCount === 0 || !element.parent || !element.parent.parent;
        }
        return true;
    }
}
class SCMTreeFilter {
    filter(element) {
        if (isSCMResourceGroup(element)) {
            return element.resources.length > 0 || !element.hideWhenEmpty;
        }
        else {
            return true;
        }
    }
}
export class SCMTreeSorter {
    constructor(viewMode, viewSortKey) {
        this.viewMode = viewMode;
        this.viewSortKey = viewSortKey;
    }
    compare(one, other) {
        if (isSCMRepository(one)) {
            if (!isSCMRepository(other)) {
                throw new Error('Invalid comparison');
            }
            return 0;
        }
        if (isSCMInput(one)) {
            return -1;
        }
        else if (isSCMInput(other)) {
            return 1;
        }
        if (isSCMActionButton(one)) {
            return -1;
        }
        else if (isSCMActionButton(other)) {
            return 1;
        }
        if (isSCMResourceGroup(one)) {
            return isSCMResourceGroup(other) ? 0 : -1;
        }
        // Resource (List)
        if (this.viewMode() === "list" /* ViewMode.List */) {
            // FileName
            if (this.viewSortKey() === "name" /* ViewSortKey.Name */) {
                const oneName = basename(one.sourceUri);
                const otherName = basename(other.sourceUri);
                return compareFileNames(oneName, otherName);
            }
            // Status
            if (this.viewSortKey() === "status" /* ViewSortKey.Status */) {
                const oneTooltip = one.decorations.tooltip ?? '';
                const otherTooltip = other.decorations.tooltip ?? '';
                if (oneTooltip !== otherTooltip) {
                    return compare(oneTooltip, otherTooltip);
                }
            }
            // Path (default)
            const onePath = one.sourceUri.fsPath;
            const otherPath = other.sourceUri.fsPath;
            return comparePaths(onePath, otherPath);
        }
        // Resource (Tree)
        const oneIsDirectory = ResourceTree.isResourceNode(one);
        const otherIsDirectory = ResourceTree.isResourceNode(other);
        if (oneIsDirectory !== otherIsDirectory) {
            return oneIsDirectory ? -1 : 1;
        }
        const oneName = ResourceTree.isResourceNode(one) ? one.name : basename(one.sourceUri);
        const otherName = ResourceTree.isResourceNode(other) ? other.name : basename(other.sourceUri);
        return compareFileNames(oneName, otherName);
    }
}
let SCMTreeKeyboardNavigationLabelProvider = class SCMTreeKeyboardNavigationLabelProvider {
    constructor(viewMode, labelService) {
        this.viewMode = viewMode;
        this.labelService = labelService;
    }
    getKeyboardNavigationLabel(element) {
        if (ResourceTree.isResourceNode(element)) {
            return element.name;
        }
        else if (isSCMRepository(element) || isSCMInput(element) || isSCMActionButton(element)) {
            return undefined;
        }
        else if (isSCMResourceGroup(element)) {
            return element.label;
        }
        else {
            if (this.viewMode() === "list" /* ViewMode.List */) {
                // In List mode match using the file name and the path.
                // Since we want to match both on the file name and the
                // full path we return an array of labels. A match in the
                // file name takes precedence over a match in the path.
                const fileName = basename(element.sourceUri);
                const filePath = this.labelService.getUriLabel(element.sourceUri, { relative: true });
                return [fileName, filePath];
            }
            else {
                // In Tree mode only match using the file name
                return basename(element.sourceUri);
            }
        }
    }
    getCompressedNodeKeyboardNavigationLabel(elements) {
        const folders = elements;
        return folders.map(e => e.name).join('/');
    }
};
SCMTreeKeyboardNavigationLabelProvider = __decorate([
    __param(1, ILabelService)
], SCMTreeKeyboardNavigationLabelProvider);
export { SCMTreeKeyboardNavigationLabelProvider };
function getSCMResourceId(element) {
    if (isSCMRepository(element)) {
        const provider = element.provider;
        return `repo:${provider.id}`;
    }
    else if (isSCMInput(element)) {
        const provider = element.repository.provider;
        return `input:${provider.id}`;
    }
    else if (isSCMActionButton(element)) {
        const provider = element.repository.provider;
        return `actionButton:${provider.id}`;
    }
    else if (isSCMResourceGroup(element)) {
        const provider = element.provider;
        return `resourceGroup:${provider.id}/${element.id}`;
    }
    else if (isSCMResource(element)) {
        const group = element.resourceGroup;
        const provider = group.provider;
        return `resource:${provider.id}/${group.id}/${element.sourceUri.toString()}`;
    }
    else if (isSCMResourceNode(element)) {
        const group = element.context;
        return `folder:${group.provider.id}/${group.id}/$FOLDER/${element.uri.toString()}`;
    }
    else {
        throw new Error('Invalid tree element');
    }
}
class SCMResourceIdentityProvider {
    getId(element) {
        return getSCMResourceId(element);
    }
}
let SCMAccessibilityProvider = class SCMAccessibilityProvider {
    constructor(accessibilityService, configurationService, keybindingService, labelService) {
        this.accessibilityService = accessibilityService;
        this.configurationService = configurationService;
        this.keybindingService = keybindingService;
        this.labelService = labelService;
    }
    getWidgetAriaLabel() {
        return localize('scm', "Source Control Management");
    }
    getAriaLabel(element) {
        if (ResourceTree.isResourceNode(element)) {
            return this.labelService.getUriLabel(element.uri, { relative: true, noPrefix: true }) || element.name;
        }
        else if (isSCMRepository(element)) {
            return `${element.provider.name} ${element.provider.label}`;
        }
        else if (isSCMInput(element)) {
            const verbosity = this.configurationService.getValue("accessibility.verbosity.sourceControl" /* AccessibilityVerbositySettingId.SourceControl */) === true;
            if (!verbosity || !this.accessibilityService.isScreenReaderOptimized()) {
                return localize('scmInput', "Source Control Input");
            }
            const kbLabel = this.keybindingService.lookupKeybinding("editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */)?.getLabel();
            return kbLabel
                ? localize('scmInputRow.accessibilityHelp', "Source Control Input, Use {0} to open Source Control Accessibility Help.", kbLabel)
                : localize('scmInputRow.accessibilityHelpNoKb', "Source Control Input, Run the Open Accessibility Help command for more information.");
        }
        else if (isSCMActionButton(element)) {
            return element.button?.command.title ?? '';
        }
        else if (isSCMResourceGroup(element)) {
            return element.label;
        }
        else {
            const result = [];
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
};
SCMAccessibilityProvider = __decorate([
    __param(0, IAccessibilityService),
    __param(1, IConfigurationService),
    __param(2, IKeybindingService),
    __param(3, ILabelService)
], SCMAccessibilityProvider);
export { SCMAccessibilityProvider };
var ViewSortKey;
(function (ViewSortKey) {
    ViewSortKey["Path"] = "path";
    ViewSortKey["Name"] = "name";
    ViewSortKey["Status"] = "status";
})(ViewSortKey || (ViewSortKey = {}));
const Menus = {
    ViewSort: new MenuId('SCMViewSort'),
    Repositories: new MenuId('SCMRepositories'),
    ChangesSettings: new MenuId('SCMChangesSettings'),
};
export const ContextKeys = {
    SCMViewMode: new RawContextKey('scmViewMode', "list" /* ViewMode.List */),
    SCMViewSortKey: new RawContextKey('scmViewSortKey', "path" /* ViewSortKey.Path */),
    SCMViewAreAllRepositoriesCollapsed: new RawContextKey('scmViewAreAllRepositoriesCollapsed', false),
    SCMViewIsAnyRepositoryCollapsible: new RawContextKey('scmViewIsAnyRepositoryCollapsible', false),
    SCMProvider: new RawContextKey('scmProvider', undefined),
    SCMProviderRootUri: new RawContextKey('scmProviderRootUri', undefined),
    SCMProviderHasRootUri: new RawContextKey('scmProviderHasRootUri', undefined),
    SCMHistoryItemCount: new RawContextKey('scmHistoryItemCount', 0),
    SCMHistoryViewMode: new RawContextKey('scmHistoryViewMode', "list" /* ViewMode.List */),
    SCMCurrentHistoryItemRefHasRemote: new RawContextKey('scmCurrentHistoryItemRefHasRemote', false),
    SCMCurrentHistoryItemRefHasBase: new RawContextKey('scmCurrentHistoryItemRefHasBase', false),
    SCMCurrentHistoryItemRefInFilter: new RawContextKey('scmCurrentHistoryItemRefInFilter', false),
    RepositoryCount: new RawContextKey('scmRepositoryCount', 0),
    RepositoryVisibilityCount: new RawContextKey('scmRepositoryVisibleCount', 0),
    RepositoryVisibility(repository) {
        return new RawContextKey(`scmRepositoryVisible:${repository.provider.id}`, false);
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
    constructor(repository) {
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
    run(accessor) {
        const scmViewService = accessor.get(ISCMViewService);
        scmViewService.toggleVisibility(this.repository);
    }
}
let RepositoryVisibilityActionController = class RepositoryVisibilityActionController {
    constructor(contextKeyService, scmViewService, scmService) {
        this.contextKeyService = contextKeyService;
        this.scmViewService = scmViewService;
        this.items = new Map();
        this.disposables = new DisposableStore();
        this.repositoryCountContextKey = ContextKeys.RepositoryCount.bindTo(contextKeyService);
        this.repositoryVisibilityCountContextKey = ContextKeys.RepositoryVisibilityCount.bindTo(contextKeyService);
        scmViewService.onDidChangeVisibleRepositories(this.onDidChangeVisibleRepositories, this, this.disposables);
        scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
        scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
        for (const repository of scmService.repositories) {
            this.onDidAddRepository(repository);
        }
    }
    onDidAddRepository(repository) {
        if (repository.provider.isHidden) {
            return;
        }
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
    onDidRemoveRepository(repository) {
        this.items.get(repository)?.dispose();
        this.items.delete(repository);
        this.updateRepositoryContextKeys();
    }
    onDidChangeVisibleRepositories() {
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
    updateRepositoryContextKeys() {
        this.repositoryCountContextKey.set(this.items.size);
        this.repositoryVisibilityCountContextKey.set(Iterable.reduce(this.items.keys(), (r, repository) => r + (this.scmViewService.isVisible(repository) ? 1 : 0), 0));
    }
    dispose() {
        this.disposables.dispose();
        dispose(this.items.values());
        this.items.clear();
    }
};
RepositoryVisibilityActionController = __decorate([
    __param(0, IContextKeyService),
    __param(1, ISCMViewService),
    __param(2, ISCMService)
], RepositoryVisibilityActionController);
class SetListViewModeAction extends ViewAction {
    constructor(id = 'workbench.scm.action.setListViewMode', menu = {}) {
        super({
            id,
            title: localize('setListViewMode', "View as List"),
            viewId: VIEW_PANE_ID,
            f1: false,
            icon: Codicon.listTree,
            toggled: ContextKeys.SCMViewMode.isEqualTo("list" /* ViewMode.List */),
            menu: { id: Menus.ViewSort, group: '1_viewmode', ...menu }
        });
    }
    async runInView(_, view) {
        view.viewMode = "list" /* ViewMode.List */;
    }
}
class SetListViewModeNavigationAction extends SetListViewModeAction {
    constructor() {
        super('workbench.scm.action.setListViewModeNavigation', {
            id: MenuId.SCMTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.SCMViewMode.isEqualTo("tree" /* ViewMode.Tree */)),
            group: 'navigation',
            isHiddenByDefault: true,
            order: -1000
        });
    }
}
class SetTreeViewModeAction extends ViewAction {
    constructor(id = 'workbench.scm.action.setTreeViewMode', menu = {}) {
        super({
            id,
            title: localize('setTreeViewMode', "View as Tree"),
            viewId: VIEW_PANE_ID,
            f1: false,
            icon: Codicon.listFlat,
            toggled: ContextKeys.SCMViewMode.isEqualTo("tree" /* ViewMode.Tree */),
            menu: { id: Menus.ViewSort, group: '1_viewmode', ...menu }
        });
    }
    async runInView(_, view) {
        view.viewMode = "tree" /* ViewMode.Tree */;
    }
}
class SetTreeViewModeNavigationAction extends SetTreeViewModeAction {
    constructor() {
        super('workbench.scm.action.setTreeViewModeNavigation', {
            id: MenuId.SCMTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals('view', VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.SCMViewMode.isEqualTo("list" /* ViewMode.List */)),
            group: 'navigation',
            isHiddenByDefault: true,
            order: -1000
        });
    }
}
registerAction2(SetListViewModeAction);
registerAction2(SetTreeViewModeAction);
registerAction2(SetListViewModeNavigationAction);
registerAction2(SetTreeViewModeNavigationAction);
class RepositorySortAction extends Action2 {
    constructor(sortKey, title) {
        super({
            id: `workbench.scm.action.repositories.setSortKey.${sortKey}`,
            title,
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
        this.sortKey = sortKey;
    }
    run(accessor) {
        accessor.get(ISCMViewService).toggleSortKey(this.sortKey);
    }
}
class RepositorySortByDiscoveryTimeAction extends RepositorySortAction {
    constructor() {
        super("discoveryTime" /* ISCMRepositorySortKey.DiscoveryTime */, localize('repositorySortByDiscoveryTime', "Sort by Discovery Time"));
    }
}
class RepositorySortByNameAction extends RepositorySortAction {
    constructor() {
        super("name" /* ISCMRepositorySortKey.Name */, localize('repositorySortByName', "Sort by Name"));
    }
}
class RepositorySortByPathAction extends RepositorySortAction {
    constructor() {
        super("path" /* ISCMRepositorySortKey.Path */, localize('repositorySortByPath', "Sort by Path"));
    }
}
registerAction2(RepositorySortByDiscoveryTimeAction);
registerAction2(RepositorySortByNameAction);
registerAction2(RepositorySortByPathAction);
class RepositorySelectionModeAction extends Action2 {
    constructor(selectionMode, title, order) {
        super({
            id: `workbench.scm.action.repositories.setSelectionMode.${selectionMode}`,
            title,
            f1: false,
            toggled: RepositoryContextKeys.RepositorySelectionMode.isEqualTo(selectionMode),
            menu: [
                {
                    id: Menus.Repositories,
                    when: ContextKeyExpr.and(ContextKeyExpr.has('scm.providerCount'), ContextKeyExpr.greater('scm.providerCount', 1)),
                    group: '2_selectionMode',
                    order
                },
                {
                    id: MenuId.SCMSourceControlTitle,
                    when: ContextKeyExpr.and(ContextKeyExpr.has('scm.providerCount'), ContextKeyExpr.greater('scm.providerCount', 1)),
                    group: '2_selectionMode',
                    order
                },
            ]
        });
        this.selectionMode = selectionMode;
    }
    run(accessor) {
        accessor.get(ISCMViewService).toggleSelectionMode(this.selectionMode);
    }
}
class RepositorySingleSelectionModeAction extends RepositorySelectionModeAction {
    constructor() {
        super("single" /* ISCMRepositorySelectionMode.Single */, localize('repositorySingleSelectionMode', "Select Single Repository"), 1);
    }
}
class RepositoryMultiSelectionModeAction extends RepositorySelectionModeAction {
    constructor() {
        super("multiple" /* ISCMRepositorySelectionMode.Multiple */, localize('repositoryMultiSelectionMode', "Select Multiple Repositories"), 2);
    }
}
registerAction2(RepositorySingleSelectionModeAction);
registerAction2(RepositoryMultiSelectionModeAction);
class SetSortKeyAction extends ViewAction {
    constructor(sortKey, title) {
        super({
            id: `workbench.scm.action.setSortKey.${sortKey}`,
            title,
            viewId: VIEW_PANE_ID,
            f1: false,
            toggled: ContextKeys.SCMViewSortKey.isEqualTo(sortKey),
            precondition: ContextKeys.SCMViewMode.isEqualTo("list" /* ViewMode.List */),
            menu: { id: Menus.ViewSort, group: '2_sort' }
        });
        this.sortKey = sortKey;
    }
    async runInView(_, view) {
        view.viewSortKey = this.sortKey;
    }
}
class SetSortByNameAction extends SetSortKeyAction {
    constructor() {
        super("name" /* ViewSortKey.Name */, localize('sortChangesByName', "Sort Changes by Name"));
    }
}
class SetSortByPathAction extends SetSortKeyAction {
    constructor() {
        super("path" /* ViewSortKey.Path */, localize('sortChangesByPath', "Sort Changes by Path"));
    }
}
class SetSortByStatusAction extends SetSortKeyAction {
    constructor() {
        super("status" /* ViewSortKey.Status */, localize('sortChangesByStatus', "Sort Changes by Status"));
    }
}
registerAction2(SetSortByNameAction);
registerAction2(SetSortByPathAction);
registerAction2(SetSortByStatusAction);
class CollapseAllRepositoriesAction extends ViewAction {
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
    async runInView(_, view) {
        view.collapseAllRepositories();
    }
}
class ExpandAllRepositoriesAction extends ViewAction {
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
    async runInView(_, view) {
        view.expandAllRepositories();
    }
}
registerAction2(CollapseAllRepositoriesAction);
registerAction2(ExpandAllRepositoriesAction);
class CollapseAllAction extends ViewAction {
    constructor() {
        super({
            id: `workbench.scm.action.collapseAll`,
            title: localize('scmCollapseAll', "Collapse All"),
            viewId: VIEW_PANE_ID,
            f1: false,
            icon: Codicon.collapseAll,
            menu: {
                id: MenuId.SCMResourceGroupContext,
                group: '9_collapse',
                when: ContextKeys.SCMViewMode.isEqualTo("tree" /* ViewMode.Tree */),
            }
        });
    }
    async runInView(_accessor, view, context) {
        if (context) {
            view.collapseAllResources(context);
        }
    }
}
registerAction2(CollapseAllAction);
let SCMViewPane = class SCMViewPane extends ViewPane {
    get viewMode() { return this._viewMode; }
    set viewMode(mode) {
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
        this.storageService.store(`scm.viewMode`, mode, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    }
    get viewSortKey() { return this._viewSortKey; }
    set viewSortKey(sortKey) {
        if (this._viewSortKey === sortKey) {
            return;
        }
        this._viewSortKey = sortKey;
        this.updateChildren();
        this.viewSortKeyContextKey.set(sortKey);
        this._onDidChangeViewSortKey.fire(sortKey);
        if (this._viewMode === "list" /* ViewMode.List */) {
            this.storageService.store(`scm.viewSortKey`, sortKey, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
        }
    }
    constructor(options, commandService, editorService, menuService, scmService, scmViewService, storageService, uriIdentityService, keybindingService, themeService, contextMenuService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, hoverService) {
        super({ ...options, titleMenuId: MenuId.SCMTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.commandService = commandService;
        this.editorService = editorService;
        this.menuService = menuService;
        this.scmService = scmService;
        this.scmViewService = scmViewService;
        this.storageService = storageService;
        this.uriIdentityService = uriIdentityService;
        this._onDidChangeViewMode = this._register(new Emitter());
        this.onDidChangeViewMode = this._onDidChangeViewMode.event;
        this._onDidChangeViewSortKey = this._register(new Emitter());
        this.onDidChangeViewSortKey = this._onDidChangeViewSortKey.event;
        this.items = new DisposableMap();
        this.visibilityDisposables = new DisposableStore();
        this.treeOperationSequencer = new Sequencer();
        this.revealResourceThrottler = new Throttler();
        this.updateChildrenThrottler = new Throttler();
        this.disposables = new DisposableStore();
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
        this._onDidLayout = this._register(new Emitter());
        this.layoutCache = { height: undefined, width: undefined, onDidChange: this._onDidLayout.event };
        this.storageService.onDidChangeValue(1 /* StorageScope.WORKSPACE */, undefined, this.disposables)(e => {
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
    layoutBody(height = this.layoutCache.height, width = this.layoutCache.width) {
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
    renderBody(container) {
        super.renderBody(container);
        // Tree
        this.treeContainer = append(container, $('.scm-view.show-file-icons'));
        this.treeContainer.classList.add('file-icon-themable-tree');
        this.treeContainer.classList.add('show-file-icons');
        const updateActionsVisibility = () => this.treeContainer.classList.toggle('show-actions', this.configurationService.getValue('scm.alwaysShowActions'));
        Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowActions'), this.disposables)(updateActionsVisibility, this, this.disposables);
        updateActionsVisibility();
        const updateProviderCountVisibility = () => {
            const value = this.configurationService.getValue('scm.providerCountBadge');
            this.treeContainer.classList.toggle('hide-provider-counts', value === 'hidden');
            this.treeContainer.classList.toggle('auto-provider-counts', value === 'auto');
        };
        Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.providerCountBadge'), this.disposables)(updateProviderCountVisibility, this, this.disposables);
        updateProviderCountVisibility();
        const viewState = this.loadTreeViewState();
        this.createTree(this.treeContainer, viewState);
        this.onDidChangeBodyVisibility(async (visible) => {
            if (visible) {
                this.treeOperationSequencer.queue(async () => {
                    await this.tree.setInput(this.scmViewService, viewState);
                    Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.alwaysShowRepositories'), this.visibilityDisposables)(() => {
                        this.updateActions();
                        this.updateChildren();
                    }, this, this.visibilityDisposables);
                    Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('scm.inputMinLineCount') ||
                        e.affectsConfiguration('scm.inputMaxLineCount') ||
                        e.affectsConfiguration('scm.showActionButton'), this.visibilityDisposables)(() => this.updateChildren(), this, this.visibilityDisposables);
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
            }
            else {
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
    createTree(container, viewState) {
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
        this.tree = this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree, 'SCM Tree Repo', container, new ListDelegate(this.inputRenderer), new SCMTreeCompressionDelegate(), [
            this.inputRenderer,
            this.actionButtonRenderer,
            this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMTitle, getActionViewItemProvider(this.instantiationService)),
            this.instantiationService.createInstance(ResourceGroupRenderer, getActionViewItemProvider(this.instantiationService), resourceActionRunner),
            this.instantiationService.createInstance(ResourceRenderer, () => this.viewMode, this.listLabels, getActionViewItemProvider(this.instantiationService), resourceActionRunner)
        ], treeDataSource, {
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
            collapseByDefault: (e) => {
                // Repository, Resource Group, Resource Folder (Tree) are not collapsed by default
                return !(isSCMRepository(e) || isSCMResourceGroup(e) || isSCMResourceNode(e));
            },
            accessibilityProvider: this.instantiationService.createInstance(SCMAccessibilityProvider),
            twistieAdditionalCssClass: (e) => {
                if (isSCMActionButton(e) || isSCMInput(e)) {
                    return 'force-no-twistie';
                }
                return undefined;
            },
        });
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
    async open(e) {
        if (!e.element) {
            return;
        }
        else if (isSCMRepository(e.element)) {
            this.scmViewService.focus(e.element);
            return;
        }
        else if (isSCMInput(e.element)) {
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
        }
        else if (isSCMActionButton(e.element)) {
            this.scmViewService.focus(e.element.repository);
            // Focus the action button
            this.actionButtonRenderer.focusActionButton(e.element);
            this.tree.setFocus([], e.browserEvent);
            return;
        }
        else if (isSCMResourceGroup(e.element)) {
            const provider = e.element.provider;
            const repository = Iterable.find(this.scmService.repositories, r => r.provider === provider);
            if (repository) {
                this.scmViewService.focus(repository);
            }
            return;
        }
        else if (isSCMResource(e.element)) {
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
                }
                else {
                    await this.commandService.executeCommand(e.element.command.id, ...(e.element.command.arguments || []), e);
                }
            }
            else {
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
        else if (isSCMResourceNode(e.element)) {
            const provider = e.element.context.provider;
            const repository = Iterable.find(this.scmService.repositories, r => r.provider === provider);
            if (repository) {
                this.scmViewService.focus(repository);
            }
            return;
        }
    }
    onDidActiveEditorChange() {
        if (!this.configurationService.getValue('scm.autoReveal')) {
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
        this.revealResourceThrottler.queue(() => this.treeOperationSequencer.queue(async () => {
            for (const repository of this.scmViewService.visibleRepositories) {
                const item = this.items.get(repository);
                if (!item) {
                    continue;
                }
                // go backwards from last group
                for (let j = repository.provider.groups.length - 1; j >= 0; j--) {
                    const groupItem = repository.provider.groups[j];
                    const resource = this.viewMode === "tree" /* ViewMode.Tree */
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
    onDidChangeVisibleRepositories({ added, removed }) {
        // Added repositories
        for (const repository of added) {
            const repositoryDisposables = new DisposableStore();
            repositoryDisposables.add(autorun(reader => {
                /** @description action button */
                repository.provider.actionButton.read(reader);
                this.updateChildren(repository);
            }));
            repositoryDisposables.add(repository.input.onDidChangeVisibility(() => this.updateChildren(repository)));
            repositoryDisposables.add(repository.provider.onDidChangeResourceGroups(() => this.updateChildren(repository)));
            const resourceGroupDisposables = repositoryDisposables.add(new DisposableMap());
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
    onListContextMenu(e) {
        if (!e.element) {
            const menu = this.menuService.getMenuActions(Menus.ViewSort, this.contextKeyService);
            const actions = getFlatContextMenuActions(menu);
            return this.contextMenuService.showContextMenu({
                getAnchor: () => e.anchor,
                getActions: () => actions,
                onHide: () => { }
            });
        }
        const element = e.element;
        let context = element;
        let actions = [];
        const disposables = new DisposableStore();
        let actionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
        disposables.add(actionRunner);
        if (isSCMRepository(element)) {
            const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
            const menu = menus.getRepositoryContextMenu(element);
            context = element.provider;
            actionRunner = new RepositoryActionRunner(() => this.getSelectedRepositories());
            disposables.add(actionRunner);
            actions = collectContextMenuActions(menu);
        }
        else if (isSCMInput(element) || isSCMActionButton(element)) {
            // noop
        }
        else if (isSCMResourceGroup(element)) {
            const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
            const menu = menus.getResourceGroupMenu(element);
            actions = collectContextMenuActions(menu);
        }
        else if (isSCMResource(element)) {
            const menus = this.scmViewService.menus.getRepositoryMenus(element.resourceGroup.provider);
            const menu = menus.getResourceMenu(element);
            actions = collectContextMenuActions(menu);
        }
        else if (isSCMResourceNode(element)) {
            if (element.element) {
                const menus = this.scmViewService.menus.getRepositoryMenus(element.element.resourceGroup.provider);
                const menu = menus.getResourceMenu(element.element);
                actions = collectContextMenuActions(menu);
            }
            else {
                const menus = this.scmViewService.menus.getRepositoryMenus(element.context.provider);
                const menu = menus.getResourceFolderMenu(element.context);
                actions = collectContextMenuActions(menu);
            }
        }
        disposables.add(actionRunner.onWillRun(() => this.tree.domFocus()));
        this.contextMenuService.showContextMenu({
            actionRunner,
            getAnchor: () => e.anchor,
            getActions: () => actions,
            getActionsContext: () => context,
            onHide: () => disposables.dispose()
        });
    }
    getSelectedRepositories() {
        const focusedRepositories = this.tree.getFocus().filter(r => !!r && isSCMRepository(r));
        const selectedRepositories = this.tree.getSelection().filter(r => !!r && isSCMRepository(r));
        return Array.from(new Set([...focusedRepositories, ...selectedRepositories]));
    }
    getSelectedResources() {
        return this.tree.getSelection().filter(r => isSCMResourceGroup(r) || isSCMResource(r) || isSCMResourceNode(r));
    }
    getViewMode() {
        let mode = this.configurationService.getValue('scm.defaultViewMode') === 'list' ? "list" /* ViewMode.List */ : "tree" /* ViewMode.Tree */;
        const storageMode = this.storageService.get(`scm.viewMode`, 1 /* StorageScope.WORKSPACE */);
        if (typeof storageMode === 'string') {
            mode = storageMode;
        }
        return mode;
    }
    getViewSortKey() {
        // Tree
        if (this._viewMode === "tree" /* ViewMode.Tree */) {
            return "path" /* ViewSortKey.Path */;
        }
        // List
        let viewSortKey;
        const viewSortKeyString = this.configurationService.getValue('scm.defaultViewSortKey');
        switch (viewSortKeyString) {
            case 'name':
                viewSortKey = "name" /* ViewSortKey.Name */;
                break;
            case 'status':
                viewSortKey = "status" /* ViewSortKey.Status */;
                break;
            default:
                viewSortKey = "path" /* ViewSortKey.Path */;
                break;
        }
        const storageSortKey = this.storageService.get(`scm.viewSortKey`, 1 /* StorageScope.WORKSPACE */);
        if (typeof storageSortKey === 'string') {
            viewSortKey = storageSortKey;
        }
        return viewSortKey;
    }
    loadTreeViewState() {
        const storageViewState = this.storageService.get('scm.viewState2', 1 /* StorageScope.WORKSPACE */);
        if (!storageViewState) {
            return undefined;
        }
        try {
            const treeViewState = JSON.parse(storageViewState);
            return treeViewState;
        }
        catch {
            return undefined;
        }
    }
    storeTreeViewState() {
        if (this.tree) {
            this.storageService.store('scm.viewState2', JSON.stringify(this.tree.getViewState()), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
    }
    updateChildren(element) {
        this.updateChildrenThrottler.queue(() => this.treeOperationSequencer.queue(async () => {
            const focusedInput = this.inputRenderer.getFocusedInput();
            if (element && this.tree.hasNode(element)) {
                // Refresh specific repository
                await this.tree.updateChildren(element);
            }
            else {
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
    updateIndentStyles(theme) {
        this.treeContainer.classList.toggle('list-view-mode', this.viewMode === "list" /* ViewMode.List */);
        this.treeContainer.classList.toggle('tree-view-mode', this.viewMode === "tree" /* ViewMode.Tree */);
        this.treeContainer.classList.toggle('align-icons-and-twisties', (this.viewMode === "list" /* ViewMode.List */ && theme.hasFileIcons) || (theme.hasFileIcons && !theme.hasFolderIcons));
        this.treeContainer.classList.toggle('hide-arrows', this.viewMode === "tree" /* ViewMode.Tree */ && theme.hidesExplorerArrows === true);
    }
    updateScmProviderContextKeys() {
        const alwaysShowRepositories = this.configurationService.getValue('scm.alwaysShowRepositories');
        if (!alwaysShowRepositories && this.items.size === 1) {
            const provider = Iterable.first(this.items.keys()).provider;
            this.scmProviderContextKey.set(provider.providerId);
            this.scmProviderRootUriContextKey.set(provider.rootUri?.toString());
            this.scmProviderHasRootUriContextKey.set(!!provider.rootUri);
        }
        else {
            this.scmProviderContextKey.set(undefined);
            this.scmProviderRootUriContextKey.set(undefined);
            this.scmProviderHasRootUriContextKey.set(false);
        }
    }
    updateRepositoryCollapseAllContextKeys() {
        if (!this.isBodyVisible() || this.items.size === 1) {
            this.isAnyRepositoryCollapsibleContextKey.set(false);
            this.areAllRepositoriesCollapsedContextKey.set(false);
            return;
        }
        this.isAnyRepositoryCollapsibleContextKey.set(this.scmViewService.visibleRepositories.some(r => this.tree.hasNode(r) && this.tree.isCollapsible(r)));
        this.areAllRepositoriesCollapsedContextKey.set(this.scmViewService.visibleRepositories.every(r => this.tree.hasNode(r) && (!this.tree.isCollapsible(r) || this.tree.isCollapsed(r))));
    }
    collapseAllRepositories() {
        for (const repository of this.scmViewService.visibleRepositories) {
            if (this.tree.isCollapsible(repository)) {
                this.tree.collapse(repository);
            }
        }
    }
    expandAllRepositories() {
        for (const repository of this.scmViewService.visibleRepositories) {
            if (this.tree.isCollapsible(repository)) {
                this.tree.expand(repository);
            }
        }
    }
    collapseAllResources(group) {
        for (const { element } of this.tree.getNode(group).children) {
            if (!isSCMViewService(element)) {
                this.tree.collapse(element, true);
            }
        }
    }
    focusPreviousInput() {
        this.treeOperationSequencer.queue(() => this.focusInput(-1));
    }
    focusNextInput() {
        this.treeOperationSequencer.queue(() => this.focusInput(1));
    }
    async focusInput(delta) {
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
    focusPreviousResourceGroup() {
        this.treeOperationSequencer.queue(() => this.focusResourceGroup(-1));
    }
    focusNextResourceGroup() {
        this.treeOperationSequencer.queue(() => this.focusResourceGroup(1));
    }
    async focusResourceGroup(delta) {
        if (!this.scmViewService.focusedRepository ||
            this.scmViewService.visibleRepositories.length === 0) {
            return;
        }
        const treeHasDomFocus = isActiveElement(this.tree.getHTMLElement());
        const resourceGroups = this.scmViewService.focusedRepository.provider.groups;
        const focusedResourceGroup = this.tree.getFocus().find(e => isSCMResourceGroup(e));
        const focusedResourceGroupIndex = treeHasDomFocus && focusedResourceGroup ? resourceGroups.indexOf(focusedResourceGroup) : -1;
        let resourceGroupNext;
        if (focusedResourceGroupIndex === -1) {
            // First visible resource group
            for (const resourceGroup of resourceGroups) {
                if (this.tree.hasNode(resourceGroup)) {
                    resourceGroupNext = resourceGroup;
                    break;
                }
            }
        }
        else {
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
    shouldShowWelcome() {
        return this.scmService.repositoryCount === 0;
    }
    getActionsContext() {
        return this.scmViewService.visibleRepositories.length === 1 ? this.scmViewService.visibleRepositories[0].provider : undefined;
    }
    focus() {
        super.focus();
        this.treeOperationSequencer.queue(() => {
            return new Promise(resolve => {
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
    dispose() {
        this._onDidChangeViewMode.dispose();
        this._onDidChangeViewSortKey.dispose();
        this.visibilityDisposables.dispose();
        this.disposables.dispose();
        this.items.dispose();
        super.dispose();
    }
};
SCMViewPane = __decorate([
    __param(1, ICommandService),
    __param(2, IEditorService),
    __param(3, IMenuService),
    __param(4, ISCMService),
    __param(5, ISCMViewService),
    __param(6, IStorageService),
    __param(7, IUriIdentityService),
    __param(8, IKeybindingService),
    __param(9, IThemeService),
    __param(10, IContextMenuService),
    __param(11, IInstantiationService),
    __param(12, IViewDescriptorService),
    __param(13, IConfigurationService),
    __param(14, IContextKeyService),
    __param(15, IOpenerService),
    __param(16, IHoverService)
], SCMViewPane);
export { SCMViewPane };
let SCMTreeDataSource = class SCMTreeDataSource extends Disposable {
    constructor(viewMode, configurationService, scmViewService) {
        super();
        this.viewMode = viewMode;
        this.configurationService = configurationService;
        this.scmViewService = scmViewService;
    }
    async getChildren(inputOrElement) {
        const repositoryCount = this.scmViewService.visibleRepositories.length;
        const showActionButton = this.configurationService.getValue('scm.showActionButton') === true;
        const alwaysShowRepositories = this.configurationService.getValue('scm.alwaysShowRepositories') === true;
        if (isSCMViewService(inputOrElement) && (repositoryCount > 1 || alwaysShowRepositories)) {
            return this.scmViewService.visibleRepositories;
        }
        else if ((isSCMViewService(inputOrElement) && repositoryCount === 1 && !alwaysShowRepositories) || isSCMRepository(inputOrElement)) {
            const children = [];
            inputOrElement = isSCMRepository(inputOrElement) ? inputOrElement : this.scmViewService.visibleRepositories[0];
            const actionButton = inputOrElement.provider.actionButton.get();
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
                });
            }
            // ResourceGroups
            const hasSomeChanges = resourceGroups.some(group => group.resources.length > 0);
            if (hasSomeChanges || (repositoryCount === 1 && (!showActionButton || !actionButton))) {
                children.push(...resourceGroups);
            }
            return children;
        }
        else if (isSCMResourceGroup(inputOrElement)) {
            if (this.viewMode() === "list" /* ViewMode.List */) {
                // Resources (List)
                return inputOrElement.resources;
            }
            else if (this.viewMode() === "tree" /* ViewMode.Tree */) {
                // Resources (Tree)
                const children = [];
                for (const node of inputOrElement.resourceTree.root.children) {
                    children.push(node.element && node.childrenCount === 0 ? node.element : node);
                }
                return children;
            }
        }
        else if (isSCMResourceNode(inputOrElement)) {
            // Resources (Tree), History item changes (Tree)
            const children = [];
            for (const node of inputOrElement.children) {
                children.push(node.element && node.childrenCount === 0 ? node.element : node);
            }
            return children;
        }
        return [];
    }
    getParent(element) {
        if (isSCMResourceNode(element)) {
            if (element.parent === element.context.resourceTree.root) {
                return element.context;
            }
            else if (element.parent) {
                return element.parent;
            }
            else {
                throw new Error('Invalid element passed to getParent');
            }
        }
        else if (isSCMResource(element)) {
            if (this.viewMode() === "list" /* ViewMode.List */) {
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
        }
        else if (isSCMInput(element)) {
            return element.repository;
        }
        else if (isSCMActionButton(element)) {
            return element.repository;
        }
        else if (isSCMResourceGroup(element)) {
            const repository = this.scmViewService.visibleRepositories.find(r => r.provider === element.provider);
            if (!repository) {
                throw new Error('Invalid element passed to getParent');
            }
            return repository;
        }
        else if (isSCMRepository(element)) {
            return this.scmViewService;
        }
        else {
            throw new Error('Unexpected call to getParent');
        }
    }
    hasChildren(inputOrElement) {
        if (isSCMViewService(inputOrElement)) {
            return this.scmViewService.visibleRepositories.length !== 0;
        }
        else if (isSCMRepository(inputOrElement)) {
            return true;
        }
        else if (isSCMInput(inputOrElement)) {
            return false;
        }
        else if (isSCMActionButton(inputOrElement)) {
            return false;
        }
        else if (isSCMResourceGroup(inputOrElement)) {
            return true;
        }
        else if (isSCMResource(inputOrElement)) {
            return false;
        }
        else if (ResourceTree.isResourceNode(inputOrElement)) {
            return inputOrElement.childrenCount > 0;
        }
        else {
            throw new Error('hasChildren not implemented.');
        }
    }
};
SCMTreeDataSource = __decorate([
    __param(1, IConfigurationService),
    __param(2, ISCMViewService)
], SCMTreeDataSource);
export class SCMActionButton {
    constructor(container, contextMenuService, commandService, notificationService) {
        this.container = container;
        this.contextMenuService = contextMenuService;
        this.commandService = commandService;
        this.notificationService = notificationService;
        this.disposables = new MutableDisposable();
    }
    dispose() {
        this.disposables?.dispose();
    }
    setButton(button) {
        // Clear old button
        this.clear();
        if (!button) {
            return;
        }
        if (button.secondaryCommands?.length) {
            const actions = [];
            for (let index = 0; index < button.secondaryCommands.length; index++) {
                const commands = button.secondaryCommands[index];
                for (const command of commands) {
                    actions.push(toAction({
                        id: command.id,
                        label: command.title,
                        enabled: true,
                        run: async () => {
                            await this.executeCommand(command.id, ...(command.arguments || []));
                        }
                    }));
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
        }
        else {
            // Button
            this.button = new Button(this.container, { supportIcons: true, supportShortLabel: !!button.command.shortTitle, title: button.command.tooltip, ...defaultButtonStyles });
        }
        this.button.enabled = button.enabled;
        this.button.label = button.command.title;
        if (this.button instanceof Button && button.command.shortTitle) {
            this.button.labelShort = button.command.shortTitle;
        }
        this.button.onDidClick(async () => await this.executeCommand(button.command.id, ...(button.command.arguments || [])), null, this.disposables.value);
        this.disposables.value.add(this.button);
    }
    focus() {
        this.button?.focus();
    }
    clear() {
        this.disposables.value = new DisposableStore();
        this.button = undefined;
        clearNode(this.container);
    }
    async executeCommand(commandId, ...args) {
        try {
            await this.commandService.executeCommand(commandId, ...args);
        }
        catch (ex) {
            this.notificationService.error(ex);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtVmlld1BhbmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zY20vYnJvd3Nlci9zY21WaWV3UGFuZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxpQkFBaUIsQ0FBQztBQUN6QixPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFlLFVBQVUsRUFBRSxlQUFlLEVBQUUsa0JBQWtCLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxhQUFhLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3SyxPQUFPLEVBQUUsUUFBUSxFQUFvQixVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVoRSxPQUFPLEVBQThELGVBQWUsRUFBd0MsV0FBVyxFQUFFLFlBQVksRUFBOEcsTUFBTSxrQkFBa0IsQ0FBQztBQUM1UixPQUFPLEVBQUUsY0FBYyxFQUFxQyxNQUFNLDRCQUE0QixDQUFDO0FBQy9GLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxD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