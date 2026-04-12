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
import { compareFileNames } from '../../../../base/common/comparers.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { createMatches } from '../../../../base/common/filters.js';
import * as glob from '../../../../base/common/glob.js';
import { DisposableStore, MutableDisposable, Disposable } from '../../../../base/common/lifecycle.js';
import { posix, relative } from '../../../../base/common/path.js';
import { basename, dirname, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import './media/breadcrumbscontrol.css';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchDataTree, WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { breadcrumbsPickerBackground, widgetBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { isWorkspace, isWorkspaceFolder, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ResourceLabels, DEFAULT_LABELS_CONTAINER } from '../../labels.js';
import { BreadcrumbsConfig } from './breadcrumbs.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../nls.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
let BreadcrumbsPicker = class BreadcrumbsPicker {
    constructor(parent, resource, _instantiationService, _themeService, _configurationService) {
        this.resource = resource;
        this._instantiationService = _instantiationService;
        this._themeService = _themeService;
        this._configurationService = _configurationService;
        this._disposables = new DisposableStore();
        this._fakeEvent = new UIEvent('fakeEvent');
        this._onWillPickElement = new Emitter();
        this.onWillPickElement = this._onWillPickElement.event;
        this._previewDispoables = new MutableDisposable();
        this._domNode = document.createElement('div');
        this._domNode.className = 'monaco-breadcrumbs-picker show-file-icons';
        parent.appendChild(this._domNode);
    }
    dispose() {
        this._disposables.dispose();
        this._previewDispoables.dispose();
        this._onWillPickElement.dispose();
        this._domNode.remove();
        setTimeout(() => this._tree.dispose(), 0); // tree cannot be disposed while being opened...
    }
    async show(input, maxHeight, width, arrowSize, arrowOffset) {
        const theme = this._themeService.getColorTheme();
        const color = theme.getColor(breadcrumbsPickerBackground);
        this._arrow = document.createElement('div');
        this._arrow.className = 'arrow';
        this._arrow.style.borderColor = `transparent transparent ${color ? color.toString() : ''}`;
        this._domNode.appendChild(this._arrow);
        this._treeContainer = document.createElement('div');
        this._treeContainer.style.background = color ? color.toString() : '';
        this._treeContainer.style.paddingTop = '2px';
        this._treeContainer.style.borderRadius = '3px';
        this._treeContainer.style.boxShadow = 'var(--vscode-shadow-lg)';
        this._treeContainer.style.border = `1px solid ${this._themeService.getColorTheme().getColor(widgetBorder)}`;
        this._domNode.appendChild(this._treeContainer);
        this._layoutInfo = { maxHeight, width, arrowSize, arrowOffset, inputHeight: 0 };
        this._tree = this._createTree(this._treeContainer, input);
        this._disposables.add(this._tree.onDidOpen(async (e) => {
            const { element, editorOptions, sideBySide } = e;
            const didReveal = await this._revealElement(element, { ...editorOptions, preserveFocus: false }, sideBySide);
            if (!didReveal) {
                return;
            }
        }));
        this._disposables.add(this._tree.onDidChangeFocus(e => {
            this._previewDispoables.value = this._previewElement(e.elements[0]);
        }));
        this._disposables.add(this._tree.onDidChangeContentHeight(() => {
            this._layout();
        }));
        this._domNode.focus();
        try {
            await this._setInput(input);
            this._layout();
        }
        catch (err) {
            onUnexpectedError(err);
        }
    }
    _layout() {
        const headerHeight = 2 * this._layoutInfo.arrowSize;
        const treeHeight = Math.min(this._layoutInfo.maxHeight - headerHeight, this._tree.contentHeight);
        const totalHeight = treeHeight + headerHeight;
        this._domNode.style.height = `${totalHeight}px`;
        this._domNode.style.width = `${this._layoutInfo.width}px`;
        this._arrow.style.top = `-${2 * this._layoutInfo.arrowSize}px`;
        this._arrow.style.borderWidth = `${this._layoutInfo.arrowSize}px`;
        this._arrow.style.marginLeft = `${this._layoutInfo.arrowOffset}px`;
        this._treeContainer.style.height = `${treeHeight}px`;
        this._treeContainer.style.width = `${this._layoutInfo.width}px`;
        this._tree.layout(treeHeight, this._layoutInfo.width);
    }
    restoreViewState() { }
};
BreadcrumbsPicker = __decorate([
    __param(2, IInstantiationService),
    __param(3, IThemeService),
    __param(4, IConfigurationService)
], BreadcrumbsPicker);
export { BreadcrumbsPicker };
//#region - Files
class FileVirtualDelegate {
    getHeight(_element) {
        return 22;
    }
    getTemplateId(_element) {
        return 'FileStat';
    }
}
class FileIdentityProvider {
    getId(element) {
        if (URI.isUri(element)) {
            return element.toString();
        }
        else if (isWorkspace(element)) {
            return element.id;
        }
        else if (isWorkspaceFolder(element)) {
            return element.uri.toString();
        }
        else {
            return element.resource.toString();
        }
    }
}
let FileDataSource = class FileDataSource {
    constructor(_fileService) {
        this._fileService = _fileService;
    }
    hasChildren(element) {
        return URI.isUri(element)
            || isWorkspace(element)
            || isWorkspaceFolder(element)
            || element.isDirectory;
    }
    async getChildren(element) {
        if (isWorkspace(element)) {
            return element.folders;
        }
        let uri;
        if (isWorkspaceFolder(element)) {
            uri = element.uri;
        }
        else if (URI.isUri(element)) {
            uri = element;
        }
        else {
            uri = element.resource;
        }
        const stat = await this._fileService.resolve(uri);
        return stat.children ?? [];
    }
};
FileDataSource = __decorate([
    __param(0, IFileService)
], FileDataSource);
let FileRenderer = class FileRenderer {
    constructor(_labels, _configService) {
        this._labels = _labels;
        this._configService = _configService;
        this.templateId = 'FileStat';
    }
    renderTemplate(container) {
        return this._labels.create(container, { supportHighlights: true });
    }
    renderElement(node, index, templateData) {
        const fileDecorations = this._configService.getValue('explorer.decorations');
        const { element } = node;
        let resource;
        let fileKind;
        if (isWorkspaceFolder(element)) {
            resource = element.uri;
            fileKind = FileKind.ROOT_FOLDER;
        }
        else {
            resource = element.resource;
            fileKind = element.isDirectory ? FileKind.FOLDER : FileKind.FILE;
        }
        templateData.setFile(resource, {
            fileKind,
            hidePath: true,
            fileDecorations: fileDecorations,
            matches: createMatches(node.filterData),
            extraClasses: ['picker-item']
        });
    }
    disposeTemplate(templateData) {
        templateData.dispose();
    }
};
FileRenderer = __decorate([
    __param(1, IConfigurationService)
], FileRenderer);
class FileNavigationLabelProvider {
    getKeyboardNavigationLabel(element) {
        return element.name;
    }
}
class FileAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize('breadcrumbs', "Breadcrumbs");
    }
    getAriaLabel(element) {
        return element.name;
    }
}
let FileFilter = class FileFilter {
    constructor(_workspaceService, configService, fileService) {
        this._workspaceService = _workspaceService;
        this._cachedExpressions = new Map();
        this._disposables = new DisposableStore();
        const config = BreadcrumbsConfig.FileExcludes.bindTo(configService);
        const update = () => {
            _workspaceService.getWorkspace().folders.forEach(folder => {
                const excludesConfig = config.getValue({ resource: folder.uri });
                if (!excludesConfig) {
                    return;
                }
                // adjust patterns to be absolute in case they aren't
                // free floating (**/)
                const adjustedConfig = {};
                for (const pattern in excludesConfig) {
                    if (typeof excludesConfig[pattern] !== 'boolean') {
                        continue;
                    }
                    const patternAbs = pattern.indexOf('**/') !== 0
                        ? posix.join(folder.uri.path, pattern)
                        : pattern;
                    adjustedConfig[patternAbs] = excludesConfig[pattern];
                }
                const ignoreCase = !fileService.hasCapability(folder.uri, 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */);
                this._cachedExpressions.set(folder.uri.toString(), glob.parse(adjustedConfig, { ignoreCase }));
            });
        };
        update();
        this._disposables.add(config);
        this._disposables.add(config.onDidChange(update));
        this._disposables.add(_workspaceService.onDidChangeWorkspaceFolders(update));
    }
    dispose() {
        this._disposables.dispose();
    }
    filter(element, _parentVisibility) {
        if (isWorkspaceFolder(element)) {
            // not a file
            return true;
        }
        const folder = this._workspaceService.getWorkspaceFolder(element.resource);
        if (!folder || !this._cachedExpressions.has(folder.uri.toString())) {
            // no folder or no filer
            return true;
        }
        const expression = this._cachedExpressions.get(folder.uri.toString());
        return !expression(relative(folder.uri.path, element.resource.path), basename(element.resource));
    }
};
FileFilter = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IConfigurationService),
    __param(2, IFileService)
], FileFilter);
export class FileSorter {
    compare(a, b) {
        if (isWorkspaceFolder(a) && isWorkspaceFolder(b)) {
            return a.index - b.index;
        }
        if (a.isDirectory === b.isDirectory) {
            // same type -> compare on names
            return compareFileNames(a.name, b.name);
        }
        else if (a.isDirectory) {
            return -1;
        }
        else {
            return 1;
        }
    }
}
let BreadcrumbsFilePicker = class BreadcrumbsFilePicker extends BreadcrumbsPicker {
    constructor(parent, resource, instantiationService, themeService, configService, _workspaceService, _editorService) {
        super(parent, resource, instantiationService, themeService, configService);
        this._workspaceService = _workspaceService;
        this._editorService = _editorService;
    }
    _createTree(container) {
        // tree icon theme specials
        this._treeContainer.classList.add('file-icon-themable-tree');
        this._treeContainer.classList.add('show-file-icons');
        const onFileIconThemeChange = (fileIconTheme) => {
            this._treeContainer.classList.toggle('align-icons-and-twisties', fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
            this._treeContainer.classList.toggle('hide-arrows', fileIconTheme.hidesExplorerArrows === true);
        };
        this._disposables.add(this._themeService.onDidFileIconThemeChange(onFileIconThemeChange));
        onFileIconThemeChange(this._themeService.getFileIconTheme());
        const labels = this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER /* TODO@Jo visibility propagation */);
        this._disposables.add(labels);
        return this._instantiationService.createInstance((WorkbenchAsyncDataTree), 'BreadcrumbsFilePicker', container, new FileVirtualDelegate(), [this._instantiationService.createInstance(FileRenderer, labels)], this._instantiationService.createInstance(FileDataSource), {
            multipleSelectionSupport: false,
            sorter: new FileSorter(),
            filter: this._instantiationService.createInstance(FileFilter),
            identityProvider: new FileIdentityProvider(),
            keyboardNavigationLabelProvider: new FileNavigationLabelProvider(),
            accessibilityProvider: this._instantiationService.createInstance(FileAccessibilityProvider),
            showNotFoundMessage: false,
            overrideStyles: {
                listBackground: breadcrumbsPickerBackground
            },
        });
    }
    async _setInput(element) {
        const { uri, kind } = element;
        let input;
        if (kind === FileKind.ROOT_FOLDER) {
            input = this._workspaceService.getWorkspace();
        }
        else {
            input = dirname(uri);
        }
        const tree = this._tree;
        await tree.setInput(input);
        let focusElement;
        for (const { element } of tree.getNode().children) {
            if (isWorkspaceFolder(element) && isEqual(element.uri, uri)) {
                focusElement = element;
                break;
            }
            else if (isEqual(element.resource, uri)) {
                focusElement = element;
                break;
            }
        }
        if (focusElement) {
            tree.reveal(focusElement, 0.5);
            tree.setFocus([focusElement], this._fakeEvent);
        }
        tree.domFocus();
    }
    _previewElement(_element) {
        return Disposable.None;
    }
    async _revealElement(element, options, sideBySide) {
        if (!isWorkspaceFolder(element) && element.isFile) {
            this._onWillPickElement.fire();
            await this._editorService.openEditor({ resource: element.resource, options }, sideBySide ? SIDE_GROUP : undefined);
            return true;
        }
        return false;
    }
};
BreadcrumbsFilePicker = __decorate([
    __param(2, IInstantiationService),
    __param(3, IThemeService),
    __param(4, IConfigurationService),
    __param(5, IWorkspaceContextService),
    __param(6, IEditorService)
], BreadcrumbsFilePicker);
export { BreadcrumbsFilePicker };
//#endregion
//#region - Outline
let OutlineTreeSorter = class OutlineTreeSorter {
    constructor(comparator, uri, configService) {
        this.comparator = comparator;
        this._order = configService.getValue(uri, 'breadcrumbs.symbolSortOrder');
    }
    compare(a, b) {
        if (this._order === 'name') {
            return this.comparator.compareByName(a, b);
        }
        else if (this._order === 'type') {
            return this.comparator.compareByType(a, b);
        }
        else {
            return this.comparator.compareByPosition(a, b);
        }
    }
};
OutlineTreeSorter = __decorate([
    __param(2, ITextResourceConfigurationService)
], OutlineTreeSorter);
export class BreadcrumbsOutlinePicker extends BreadcrumbsPicker {
    _createTree(container, input) {
        const { config } = input.outline;
        return this._instantiationService.createInstance((WorkbenchDataTree), 'BreadcrumbsOutlinePicker', container, config.delegate, config.renderers, config.treeDataSource, {
            ...config.options,
            sorter: this._instantiationService.createInstance(OutlineTreeSorter, config.comparator, undefined),
            collapseByDefault: true,
            expandOnlyOnTwistieClick: true,
            multipleSelectionSupport: false,
            showNotFoundMessage: false
        });
    }
    _setInput(input) {
        const viewState = input.outline.captureViewState();
        this.restoreViewState = () => { viewState.dispose(); };
        const tree = this._tree;
        tree.setInput(input.outline);
        if (input.element !== input.outline) {
            tree.reveal(input.element, 0.5);
            tree.setFocus([input.element], this._fakeEvent);
        }
        tree.domFocus();
        return Promise.resolve();
    }
    _previewElement(element) {
        const outline = this._tree.getInput();
        return outline.preview(element);
    }
    async _revealElement(element, options, sideBySide) {
        this._onWillPickElement.fire();
        const outline = this._tree.getInput();
        await outline.reveal(element, options, sideBySide, false);
        return true;
    }
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJlYWRjcnVtYnNQaWNrZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvYnJlYWRjcnVtYnNQaWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxhQUFhLEVBQWMsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRSxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sRUFBZSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkgsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxnQ0FBZ0MsQ0FBQztBQUN4QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFrQyxZQUFZLEVBQWEsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM3RyxPQUFPLEVBQUUsMkJBQTJCLEVB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