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
var CurrentlyFilteredToRenderer_1, FileCoverageRenderer_1, DeclarationCoverageRenderer_1;
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { findLast } from '../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../base/common/assert.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { memoize } from '../../../../base/common/decorators.js';
import { createMatches } from '../../../../base/common/filters.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { basenameOrAuthority } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { EditorOpenSource } from '../../../../platform/editor/common/editor.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ResourceLabels } from '../../../browser/labels.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { onObservableChange } from '../common/observableUtils.js';
import { BypassedFileCoverage, FileCoverage, getTotalCoveragePercent } from '../common/testCoverage.js';
import { ITestCoverageService } from '../common/testCoverageService.js';
import { TestId } from '../common/testId.js';
import { TestingContextKeys } from '../common/testingContextKeys.js';
import * as coverUtils from './codeCoverageDisplayUtils.js';
import { testingStatesToIcons, testingWasCovered } from './icons.js';
import { ManagedTestCoverageBars } from './testCoverageBars.js';
var CoverageSortOrder;
(function (CoverageSortOrder) {
    CoverageSortOrder[CoverageSortOrder["Coverage"] = 0] = "Coverage";
    CoverageSortOrder[CoverageSortOrder["Location"] = 1] = "Location";
    CoverageSortOrder[CoverageSortOrder["Name"] = 2] = "Name";
})(CoverageSortOrder || (CoverageSortOrder = {}));
let TestCoverageView = class TestCoverageView extends ViewPane {
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, coverageService, storageService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.coverageService = coverageService;
        this.storageService = storageService;
        this.tree = this._register(new MutableDisposable());
        this.sortOrder = observableValue('sortOrder', 1 /* CoverageSortOrder.Location */);
        const storedOrder = this.storageService.getNumber('testing.coverageSortOrder', 1 /* StorageScope.WORKSPACE */);
        if (storedOrder !== undefined && storedOrder >= 0 /* CoverageSortOrder.Coverage */ && storedOrder <= 2 /* CoverageSortOrder.Name */) {
            this.sortOrder.set(storedOrder, undefined);
        }
    }
    renderBody(container) {
        super.renderBody(container);
        this._register(autorun(reader => {
            const order = this.sortOrder.read(reader);
            this.storageService.store('testing.coverageSortOrder', order, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }));
        const labels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
        this._register(autorun(reader => {
            const coverage = this.coverageService.selected.read(reader);
            if (coverage) {
                const t = (this.tree.value ??= this.instantiationService.createInstance(TestCoverageTree, container, labels, this.sortOrder));
                t.setInput(coverage, this.coverageService.filterToTest.read(reader));
            }
            else {
                this.tree.clear();
            }
        }));
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.tree.value?.layout(height, width);
    }
    collapseAll() {
        this.tree.value?.collapseAll();
    }
};
TestCoverageView = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService),
    __param(10, ITestCoverageService),
    __param(11, IStorageService)
], TestCoverageView);
export { TestCoverageView };
let fnNodeId = 0;
class DeclarationCoverageNode {
    get hits() {
        return this.data.count;
    }
    get label() {
        return this.data.name;
    }
    get location() {
        return this.data.location;
    }
    get tpc() {
        const attr = this.attributableCoverage();
        return attr && getTotalCoveragePercent(attr.statement, attr.branch, undefined);
    }
    constructor(uri, data, details) {
        this.uri = uri;
        this.data = data;
        this.id = String(fnNodeId++);
        this.containedDetails = new Set();
        this.children = [];
        if (data.location instanceof Range) {
            for (const detail of details) {
                if (this.contains(detail.location)) {
                    this.containedDetails.add(detail);
                }
            }
        }
    }
    /** Gets whether this function has a defined range and contains the given range. */
    contains(location) {
        const own = this.data.location;
        return own instanceof Range && (location instanceof Range ? own.containsRange(location) : own.containsPosition(location));
    }
    /**
     * If the function defines a range, we can look at statements within the
     * function to get total coverage for the function, rather than a boolean
     * yes/no.
     */
    attributableCoverage() {
        const { location, count } = this.data;
        if (!(location instanceof Range) || !count) {
            return;
        }
        const statement = { covered: 0, total: 0 };
        const branch = { covered: 0, total: 0 };
        for (const detail of this.containedDetails) {
            if (detail.type !== 1 /* DetailType.Statement */) {
                continue;
            }
            statement.covered += detail.count ? 1 : 0;
            statement.total++;
            if (detail.branches) {
                for (const { count } of detail.branches) {
                    branch.covered += count ? 1 : 0;
                    branch.total++;
                }
            }
        }
        return { statement, branch };
    }
}
__decorate([
    memoize
], DeclarationCoverageNode.prototype, "attributableCoverage", null);
class RevealUncoveredDeclarations {
    get label() {
        return localize('functionsWithoutCoverage', "{0} declarations without coverage...", this.n);
    }
    constructor(n) {
        this.n = n;
        this.id = String(fnNodeId++);
    }
}
class CurrentlyFilteredTo {
    get label() {
        return localize('filteredToTest', "Showing coverage for \"{0}\"", this.testItem.label);
    }
    constructor(testItem) {
        this.testItem = testItem;
        this.id = String(fnNodeId++);
    }
}
class LoadingDetails {
    constructor() {
        this.id = String(fnNodeId++);
        this.label = localize('loadingCoverageDetails', "Loading Coverage Details...");
    }
}
const isFileCoverage = (c) => typeof c === 'object' && 'value' in c;
const isDeclarationCoverage = (c) => c instanceof DeclarationCoverageNode;
const shouldShowDeclDetailsOnExpand = (c) => isFileCoverage(c) && c.value instanceof FileCoverage && !!c.value.declaration?.total;
let TestCoverageTree = class TestCoverageTree extends Disposable {
    constructor(container, labels, sortOrder, instantiationService, editorService, commandService) {
        super();
        this.inputDisposables = this._register(new DisposableStore());
        container.classList.add('testing-stdtree');
        this.tree = instantiationService.createInstance((WorkbenchCompressibleObjectTree), 'TestCoverageView', container, new TestCoverageTreeListDelegate(), [
            instantiationService.createInstance(FileCoverageRenderer, labels),
            instantiationService.createInstance(DeclarationCoverageRenderer),
            instantiationService.createInstance(BasicRenderer),
            instantiationService.createInstance(CurrentlyFilteredToRenderer),
        ], {
            expandOnlyOnTwistieClick: true,
            sorter: new Sorter(sortOrder),
            keyboardNavigationLabelProvider: {
                getCompressedNodeKeyboardNavigationLabel(elements) {
                    return elements.map(e => this.getKeyboardNavigationLabel(e)).join('/');
                },
                getKeyboardNavigationLabel(e) {
                    return isFileCoverage(e)
                        ? basenameOrAuthority(e.value.uri)
                        : e.label;
                },
            },
            accessibilityProvider: {
                getAriaLabel(element) {
                    if (isFileCoverage(element)) {
                        const name = basenameOrAuthority(element.value.uri);
                        return localize('testCoverageItemLabel', "{0} coverage: {0}%", name, (element.value.tpc * 100).toFixed(2));
                    }
                    else {
                        return element.label;
                    }
                },
                getWidgetAriaLabel() {
                    return localize('testCoverageTreeLabel', "Test Coverage Explorer");
                }
            },
            identityProvider: new TestCoverageIdentityProvider(),
        });
        this._register(autorun(reader => {
            sortOrder.read(reader);
            this.tree.resort(null, true);
        }));
        this._register(this.tree);
        this._register(this.tree.onDidChangeCollapseState(e => {
            const el = e.node.element;
            if (!e.node.collapsed && !e.node.children.length && el && shouldShowDeclDetailsOnExpand(el)) {
                if (el.value.hasSynchronousDetails) {
                    this.tree.setChildren(el, [{ element: new LoadingDetails(), incompressible: true }]);
                }
                el.value.details().then(details => this.updateWithDetails(el, details));
            }
        }));
        this._register(this.tree.onDidOpen(e => {
            let resource;
            let selection;
            if (e.element) {
                if (isFileCoverage(e.element) && !e.element.children?.size) {
                    resource = e.element.value.uri;
                }
                else if (isDeclarationCoverage(e.element)) {
                    resource = e.element.uri;
                    selection = e.element.location;
                }
                else if (e.element instanceof CurrentlyFilteredTo) {
                    commandService.executeCommand("testing.coverageFilterToTest" /* TestCommandId.CoverageFilterToTest */);
                    return;
                }
            }
            if (!resource) {
                return;
            }
            editorService.openEditor({
                resource,
                options: {
                    selection: selection instanceof Position ? Range.fromPositions(selection, selection) : selection,
                    revealIfOpened: true,
                    selectionRevealType: 3 /* TextEditorSelectionRevealType.NearTopIfOutsideViewport */,
                    preserveFocus: e.editorOptions.preserveFocus,
                    pinned: e.editorOptions.pinned,
                    source: EditorOpenSource.USER,
                },
            }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
        }));
    }
    setInput(coverage, showOnlyTest) {
        this.inputDisposables.clear();
        let tree = coverage.tree;
        // Filter to only a test, generate a new tree with only those items selected
        if (showOnlyTest) {
            tree = coverage.filterTreeForTest(showOnlyTest);
        }
        const files = [];
        for (let node of tree.nodes) {
            // when showing initial children, only show from the first file or tee
            while (!(node.value instanceof FileCoverage) && node.children?.size === 1) {
                node = Iterable.first(node.children.values());
            }
            files.push(node);
        }
        const toChild = (value) => {
            const isFile = !value.children?.size;
            return {
                element: value,
                incompressible: isFile,
                collapsed: isFile,
                // directories can be expanded, and items with function info can be expanded
                collapsible: !isFile || !!value.value?.declaration?.total,
                children: value.children && Iterable.map(value.children?.values(), toChild)
            };
        };
        this.inputDisposables.add(onObservableChange(coverage.didAddCoverage, nodes => {
            const toRender = findLast(nodes, n => this.tree.hasElement(n));
            if (toRender) {
                this.tree.setChildren(toRender, Iterable.map(toRender.children?.values() || [], toChild), { diffIdentityProvider: { getId: el => el.value.id } });
            }
        }));
        let children = Iterable.map(files, toChild);
        const filteredTo = showOnlyTest && coverage.result.getTestById(showOnlyTest.toString());
        if (filteredTo) {
            children = Iterable.concat(Iterable.single({
                element: new CurrentlyFilteredTo(filteredTo),
                incompressible: true,
            }), children);
        }
        this.tree.setChildren(null, children);
    }
    layout(height, width) {
        this.tree.layout(height, width);
    }
    collapseAll() {
        this.tree.collapseAll();
    }
    updateWithDetails(el, details) {
        if (!this.tree.hasElement(el)) {
            return; // avoid any issues if the tree changes in the meanwhile
        }
        const decl = [];
        for (const fn of details) {
            if (fn.type !== 0 /* DetailType.Declaration */) {
                continue;
            }
            let arr = decl;
            while (true) {
                const parent = arr.find(p => p.containedDetails.has(fn));
                if (parent) {
                    arr = parent.children;
                }
                else {
                    break;
                }
            }
            arr.push(new DeclarationCoverageNode(el.value.uri, fn, details));
        }
        const makeChild = (fn) => ({
            element: fn,
            incompressible: true,
            collapsed: true,
            collapsible: fn.children.length > 0,
            children: fn.children.map(makeChild)
        });
        this.tree.setChildren(el, decl.map(makeChild));
    }
};
TestCoverageTree = __decorate([
    __param(3, IInstantiationService),
    __param(4, IEditorService),
    __param(5, ICommandService)
], TestCoverageTree);
class TestCoverageTreeListDelegate {
    getHeight(element) {
        return 22;
    }
    getTemplateId(element) {
        if (isFileCoverage(element)) {
            return FileCoverageRenderer.ID;
        }
        if (isDeclarationCoverage(element)) {
            return DeclarationCoverageRenderer.ID;
        }
        if (element instanceof LoadingDetails || element instanceof RevealUncoveredDeclarations) {
            return BasicRenderer.ID;
        }
        if (element instanceof CurrentlyFilteredTo) {
            return CurrentlyFilteredToRenderer.ID;
        }
        assertNever(element);
    }
}
class Sorter {
    constructor(order) {
        this.order = order;
    }
    compare(a, b) {
        const order = this.order.get();
        if (isFileCoverage(a) && isFileCoverage(b)) {
            switch (order) {
                case 1 /* CoverageSortOrder.Location */:
                case 2 /* CoverageSortOrder.Name */:
                    return a.value.uri.toString().localeCompare(b.value.uri.toString());
                case 0 /* CoverageSortOrder.Coverage */:
                    return b.value.tpc - a.value.tpc;
            }
        }
        else if (isDeclarationCoverage(a) && isDeclarationCoverage(b)) {
            switch (order) {
                case 1 /* CoverageSortOrder.Location */:
                    return Position.compare(a.location instanceof Range ? a.location.getStartPosition() : a.location, b.location instanceof Range ? b.location.getStartPosition() : b.location);
                case 2 /* CoverageSortOrder.Name */:
                    return a.label.localeCompare(b.label);
                case 0 /* CoverageSortOrder.Coverage */: {
                    const attrA = a.tpc;
                    const attrB = b.tpc;
                    return (attrA !== undefined && attrB !== undefined && attrB - attrA)
                        || (+b.hits - +a.hits)
                        || a.label.localeCompare(b.label);
                }
            }
        }
        else {
            return 0;
        }
    }
}
let CurrentlyFilteredToRenderer = class CurrentlyFilteredToRenderer {
    static { CurrentlyFilteredToRenderer_1 = this; }
    static { this.ID = 'C'; }
    constructor(menuService, contextKeyService) {
        this.menuService = menuService;
        this.contextKeyService = contextKeyService;
        this.templateId = CurrentlyFilteredToRenderer_1.ID;
    }
    renderCompressedElements(node, index, templateData) {
        this.renderInner(node.element.elements[node.element.elements.length - 1], templateData);
    }
    renderTemplate(container) {
        container.classList.add('testing-stdtree-container');
        const label = dom.append(container, dom.$('.label'));
        const menu = this.menuService.getMenuActions(MenuId.TestCoverageFilterItem, this.contextKeyService, {
            shouldForwardArgs: true,
        });
        const actions = new ActionBar(container);
        actions.push(getActionBarActions(menu, 'inline').primary, { icon: true, label: false });
        actions.domNode.style.display = 'block';
        return { label, actions };
    }
    renderElement(element, index, templateData) {
        this.renderInner(element.element, templateData);
    }
    disposeTemplate(templateData) {
        templateData.actions.dispose();
    }
    renderInner(element, container) {
        container.label.innerText = element.label;
    }
};
CurrentlyFilteredToRenderer = CurrentlyFilteredToRenderer_1 = __decorate([
    __param(0, IMenuService),
    __param(1, IContextKeyService)
], CurrentlyFilteredToRenderer);
let FileCoverageRenderer = class FileCoverageRenderer {
    static { FileCoverageRenderer_1 = this; }
    static { this.ID = 'F'; }
    constructor(labels, labelService, instantiationService) {
        this.labels = labels;
        this.labelService = labelService;
        this.instantiationService = instantiationService;
        this.templateId = FileCoverageRenderer_1.ID;
    }
    /** @inheritdoc */
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        container.classList.add('testing-stdtree-container', 'test-coverage-list-item');
        return {
            container,
            bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
            label: templateDisposables.add(this.labels.create(container, {
                supportHighlights: true,
            })),
            elementsDisposables: templateDisposables.add(new DisposableStore()),
            templateDisposables,
        };
    }
    /** @inheritdoc */
    renderElement(node, _index, templateData) {
        this.doRender(node.element, templateData, node.filterData);
    }
    /** @inheritdoc */
    renderCompressedElements(node, _index, templateData) {
        this.doRender(node.element.elements, templateData, node.filterData);
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
    /** @inheritdoc */
    doRender(element, templateData, filterData) {
        templateData.elementsDisposables.clear();
        const stat = (element instanceof Array ? element[element.length - 1] : element);
        const file = stat.value;
        const name = element instanceof Array ? element.map(e => basenameOrAuthority(e.value.uri)) : basenameOrAuthority(file.uri);
        if (file instanceof BypassedFileCoverage) {
            templateData.bars.setCoverageInfo(undefined);
        }
        else {
            templateData.elementsDisposables.add(autorun(reader => {
                stat.value?.didChange.read(reader);
                templateData.bars.setCoverageInfo(file);
            }));
            templateData.bars.setCoverageInfo(file);
        }
        templateData.label.setResource({ resource: file.uri, name }, {
            fileKind: stat.children?.size ? FileKind.FOLDER : FileKind.FILE,
            matches: createMatches(filterData),
            separator: this.labelService.getSeparator(file.uri.scheme, file.uri.authority),
            extraClasses: ['label'],
        });
    }
};
FileCoverageRenderer = FileCoverageRenderer_1 = __decorate([
    __param(1, ILabelService),
    __param(2, IInstantiationService)
], FileCoverageRenderer);
let DeclarationCoverageRenderer = class DeclarationCoverageRenderer {
    static { DeclarationCoverageRenderer_1 = this; }
    static { this.ID = 'N'; }
    constructor(instantiationService) {
        this.instantiationService = instantiationService;
        this.templateId = DeclarationCoverageRenderer_1.ID;
    }
    /** @inheritdoc */
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        container.classList.add('test-coverage-list-item', 'testing-stdtree-container');
        const icon = dom.append(container, dom.$('.state'));
        const label = dom.append(container, dom.$('.label'));
        return {
            container,
            bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
            templateDisposables,
            icon,
            label,
        };
    }
    /** @inheritdoc */
    renderElement(node, _index, templateData) {
        this.doRender(node.element, templateData, node.filterData);
    }
    /** @inheritdoc */
    renderCompressedElements(node, _index, templateData) {
        this.doRender(node.element.elements[node.element.elements.length - 1], templateData, node.filterData);
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
    /** @inheritdoc */
    doRender(element, templateData, _filterData) {
        const covered = !!element.hits;
        const icon = covered ? testingWasCovered : testingStatesToIcons.get(0 /* TestResultState.Unset */);
        templateData.container.classList.toggle('not-covered', !covered);
        templateData.icon.className = `computed-state ${ThemeIcon.asClassName(icon)}`;
        templateData.label.innerText = element.label;
        templateData.bars.setCoverageInfo(element.attributableCoverage());
    }
};
DeclarationCoverageRenderer = DeclarationCoverageRenderer_1 = __decorate([
    __param(0, IInstantiationService)
], DeclarationCoverageRenderer);
class BasicRenderer {
    constructor() {
        this.templateId = BasicRenderer.ID;
    }
    static { this.ID = 'B'; }
    renderCompressedElements(node, _index, container) {
        this.renderInner(node.element.elements[node.element.elements.length - 1], container);
    }
    renderTemplate(container) {
        return container;
    }
    renderElement(node, index, container) {
        this.renderInner(node.element, container);
    }
    disposeTemplate() {
        // no-op
    }
    renderInner(element, container) {
        container.innerText = element.label;
    }
}
class TestCoverageIdentityProvider {
    getId(element) {
        return isFileCoverage(element)
            ? element.value.uri.toString()
            : element.id;
    }
}
registerAction2(class TestCoverageChangePerTestFilterAction extends Action2 {
    constructor() {
        super({
            id: "testing.coverageFilterToTest" /* TestCommandId.CoverageFilterToTest */,
            category: Categories.Test,
            title: localize2('testing.changeCoverageFilter', 'Filter Coverage by Test'),
            icon: Codicon.filter,
            toggled: {
                icon: Codicon.filterFilled,
                condition: TestingContextKeys.isCoverageFilteredToTest,
            },
            menu: [
                { id: MenuId.CommandPalette, when: TestingContextKeys.hasPerTestCoverage },
                { id: MenuId.TestCoverageFilterItem, group: 'inline' },
                {
                    id: MenuId.ViewTitle,
                    when: ContextKeyExpr.and(TestingContextKeys.hasPerTestCoverage, ContextKeyExpr.equals('view', "workbench.view.testCoverage" /* Testing.CoverageViewId */)),
                    group: 'navigation',
                },
            ]
        });
    }
    run(accessor) {
        const coverageService = accessor.get(ITestCoverageService);
        const quickInputService = accessor.get(IQuickInputService);
        const coverage = coverageService.selected.get();
        if (!coverage) {
            return;
        }
        const tests = [...coverage.allPerTestIDs()].map(TestId.fromString);
        const commonPrefix = TestId.getLengthOfCommonPrefix(tests.length, i => tests[i]);
        const result = coverage.result;
        const previousSelection = coverageService.filterToTest.get();
        const previousSelectionStr = previousSelection?.toString();
        const items = [
            { label: coverUtils.labels.allTests, id: undefined },
            { type: 'separator' },
            ...tests.map(testId => ({ label: coverUtils.getLabelForItem(result, testId, commonPrefix), testId })),
        ];
        quickInputService.pick(items, {
            activeItem: items.find((item) => 'testId' in item && item.testId?.toString() === previousSelectionStr),
            placeHolder: coverUtils.labels.pickShowCoverage,
            onDidFocus: (entry) => {
                coverageService.filterToTest.set(entry.testId, undefined);
            },
        }).then(selected => {
            coverageService.filterToTest.set(selected ? selected.testId : previousSelection, undefined);
        });
    }
});
registerAction2(class TestCoverageChangeSortingAction extends ViewAction {
    constructor() {
        super({
            id: "testing.coverageViewChangeSorting" /* TestCommandId.CoverageViewChangeSorting */,
            viewId: "workbench.view.testCoverage" /* Testing.CoverageViewId */,
            title: localize2('testing.changeCoverageSort', 'Change Sort Order'),
            icon: Codicon.sortPrecedence,
            menu: {
                id: MenuId.ViewTitle,
                when: ContextKeyExpr.equals('view', "workbench.view.testCoverage" /* Testing.CoverageViewId */),
                group: 'navigation',
                order: 1,
            }
        });
    }
    runInView(accessor, view) {
        const disposables = new DisposableStore();
        const quickInput = disposables.add(accessor.get(IQuickInputService).createQuickPick());
        const items = [
            { label: localize('testing.coverageSortByLocation', 'Sort by Location'), value: 1 /* CoverageSortOrder.Location */, description: localize('testing.coverageSortByLocationDescription', 'Files are sorted alphabetically, declarations are sorted by position') },
            { label: localize('testing.coverageSortByCoverage', 'Sort by Coverage'), value: 0 /* CoverageSortOrder.Coverage */, description: localize('testing.coverageSortByCoverageDescription', 'Files and declarations are sorted by total coverage') },
            { label: localize('testing.coverageSortByName', 'Sort by Name'), value: 2 /* CoverageSortOrder.Name */, description: localize('testing.coverageSortByNameDescription', 'Files and declarations are sorted alphabetically') },
        ];
        quickInput.placeholder = localize('testing.coverageSortPlaceholder', 'Sort the Test Coverage view...');
        quickInput.items = items;
        quickInput.show();
        disposables.add(quickInput.onDidHide(() => disposables.dispose()));
        disposables.add(quickInput.onDidAccept(() => {
            const picked = quickInput.selectedItems[0]?.value;
            if (picked !== undefined) {
                view.sortOrder.set(picked, undefined);
                quickInput.dispose();
            }
        }));
    }
});
registerAction2(class TestCoverageCollapseAllAction extends ViewAction {
    constructor() {
        super({
            id: "testing.coverageViewCollapseAll" /* TestCommandId.CoverageViewCollapseAll */,
            viewId: "workbench.view.testCoverage" /* Testing.CoverageViewId */,
            title: localize2('testing.coverageCollapseAll', 'Collapse All Coverage'),
            icon: Codicon.collapseAll,
            menu: {
                id: MenuId.ViewTitle,
                when: ContextKeyExpr.equals('view', "workbench.view.testCoverage" /* Testing.CoverageViewId */),
                group: 'navigation',
                order: 2,
            }
        });
    }
    runInView(_accessor, view) {
        view.collapseAll();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdENvdmVyYWdlVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0Q292ZXJhZ2VWaWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUsvRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFjLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RHLE9BQU8sRUFBZSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFOUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztB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