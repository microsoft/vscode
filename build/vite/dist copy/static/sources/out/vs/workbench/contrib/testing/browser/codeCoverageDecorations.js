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
import * as dom from '../../../../base/browser/dom.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { mapFindFirst } from '../../../../base/common/arraysFind.js';
import { assert, assertNever } from '../../../../base/common/assert.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isUriComponents, URI } from '../../../../base/common/uri.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { InjectedTextCursorStops } from '../../../../editor/common/model.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey, observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { TEXT_FILE_EDITOR_ID } from '../../files/common/files.js';
import { getTestingConfiguration } from '../common/configuration.js';
import { FileCoverage } from '../common/testCoverage.js';
import { ITestCoverageService } from '../common/testCoverageService.js';
import { TestId } from '../common/testId.js';
import { ITestService } from '../common/testService.js';
import { TestingContextKeys } from '../common/testingContextKeys.js';
import * as coverUtils from './codeCoverageDisplayUtils.js';
import { testingCoverageMissingBranch, testingCoverageReport, testingFilterIcon, testingRerunIcon } from './icons.js';
import { ManagedTestCoverageBars } from './testCoverageBars.js';
import { testingCoveredMinimapBackground, testingUncoveredMinimapBackground } from './theme.js';
const CLASS_HIT = 'coverage-deco-hit';
const CLASS_MISS = 'coverage-deco-miss';
const TOGGLE_INLINE_COMMAND_TEXT = localize('testing.toggleInlineCoverage', 'Toggle Inline');
const TOGGLE_INLINE_COMMAND_ID = 'testing.toggleInlineCoverage';
const BRANCH_MISS_INDICATOR_CHARS = 4;
const GO_TO_NEXT_MISSED_LINE_TITLE = localize2('testing.goToNextMissedLine', "Go to Next Uncovered Line");
const GO_TO_PREVIOUS_MISSED_LINE_TITLE = localize2('testing.goToPreviousMissedLine', "Go to Previous Uncovered Line");
let CodeCoverageDecorations = class CodeCoverageDecorations extends Disposable {
    static { this.ID = "editor.contrib.coverageDecorations" /* Testing.CoverageDecorationsContributionId */; }
    constructor(editor, instantiationService, coverage, configurationService, log, contextKeyService) {
        super();
        this.editor = editor;
        this.coverage = coverage;
        this.log = log;
        this.displayedStore = this._register(new DisposableStore());
        this.hoveredStore = this._register(new DisposableStore());
        this.decorationIds = new Map();
        this.hasInlineCoverageDetails = observableValue('hasInlineCoverageDetails', false);
        this.summaryWidget = new Lazy(() => this._register(instantiationService.createInstance(CoverageToolbarWidget, this.editor)));
        const modelObs = observableFromEvent(this, editor.onDidChangeModel, () => editor.getModel());
        const configObs = observableFromEvent(this, editor.onDidChangeConfiguration, i => i);
        const fileCoverage = derived(reader => {
            const report = coverage.selected.read(reader);
            if (!report) {
                return;
            }
            const model = modelObs.read(reader);
            if (!model) {
                return;
            }
            const file = report.getUri(model.uri);
            if (!file) {
                return;
            }
            report.didAddCoverage.read(reader); // re-read if changes when there's no report
            return { file, testId: coverage.filterToTest.read(reader) };
        });
        this._register(bindContextKey(TestingContextKeys.hasPerTestCoverage, contextKeyService, reader => !!fileCoverage.read(reader)?.file.perTestData?.size));
        this._register(bindContextKey(TestingContextKeys.hasCoverageInFile, contextKeyService, reader => !!fileCoverage.read(reader)?.file));
        this._register(bindContextKey(TestingContextKeys.hasInlineCoverageDetails, contextKeyService, reader => this.hasInlineCoverageDetails.read(reader)));
        const minimapEnabled = observableConfigValue("testing.coverageMinimapEnabled" /* TestingConfigKeys.CoverageMinimapEnabled */, true, configurationService);
        this._register(autorun(reader => {
            const c = fileCoverage.read(reader);
            if (c) {
                this.apply(editor.getModel(), c.file, c.testId, coverage.showInline.read(reader), minimapEnabled.read(reader));
            }
            else {
                this.clear();
            }
        }));
        const toolbarEnabled = observableConfigValue("testing.coverageToolbarEnabled" /* TestingConfigKeys.CoverageToolbarEnabled */, true, configurationService);
        this._register(autorun(reader => {
            const c = fileCoverage.read(reader);
            if (c && toolbarEnabled.read(reader)) {
                this.summaryWidget.value.setCoverage(c.file, c.testId);
            }
            else {
                this.summaryWidget.rawValue?.clearCoverage();
            }
        }));
        this._register(autorun(reader => {
            const c = fileCoverage.read(reader);
            if (c) {
                const evt = configObs.read(reader);
                if (evt?.hasChanged(75 /* EditorOption.lineHeight */) !== false) {
                    this.updateEditorStyles();
                }
            }
        }));
        this._register(editor.onMouseMove(e => {
            const model = editor.getModel();
            if (e.target.type === 3 /* MouseTargetType.GUTTER_LINE_NUMBERS */ && model) {
                this.hoverLineNumber(editor.getModel());
            }
            else if (coverage.showInline.get() && e.target.type === 6 /* MouseTargetType.CONTENT_TEXT */ && model) {
                this.hoverInlineDecoration(model, e.target.position);
            }
            else {
                this.hoveredStore.clear();
            }
        }));
        this._register(editor.onWillChangeModel(() => {
            const model = editor.getModel();
            if (!this.details || !model) {
                return;
            }
            // Decorations adjust to local changes made in-editor, keep them synced in case the file is reopened:
            for (const decoration of model.getAllDecorations()) {
                const own = this.decorationIds.get(decoration.id);
                if (own) {
                    own.detail.range = decoration.range;
                }
            }
        }));
    }
    updateEditorStyles() {
        const lineHeight = this.editor.getOption(75 /* EditorOption.lineHeight */);
        const { style } = this.editor.getContainerDomNode();
        style.setProperty('--vscode-testing-coverage-lineHeight', `${lineHeight}px`);
    }
    hoverInlineDecoration(model, position) {
        const allDecorations = model.getDecorationsInRange(Range.fromPositions(position));
        const decoration = mapFindFirst(allDecorations, ({ id }) => this.decorationIds.has(id) ? { id, deco: this.decorationIds.get(id) } : undefined);
        if (decoration === this.hoveredSubject) {
            return;
        }
        this.hoveredStore.clear();
        this.hoveredSubject = decoration;
        if (!decoration) {
            return;
        }
        model.changeDecorations(e => {
            e.changeDecorationOptions(decoration.id, {
                ...decoration.deco.options,
                className: `${decoration.deco.options.className} coverage-deco-hovered`,
            });
        });
        this.hoveredStore.add(toDisposable(() => {
            this.hoveredSubject = undefined;
            model.changeDecorations(e => {
                e.changeDecorationOptions(decoration.id, decoration.deco.options);
            });
        }));
    }
    hoverLineNumber(model) {
        if (this.hoveredSubject === 'lineNo' || !this.details || this.coverage.showInline.get()) {
            return;
        }
        this.hoveredStore.clear();
        this.hoveredSubject = 'lineNo';
        model.changeDecorations(e => {
            for (const [id, decoration] of this.decorationIds) {
                const { applyHoverOptions, options } = decoration;
                const dup = { ...options };
                applyHoverOptions(dup);
                e.changeDecorationOptions(id, dup);
            }
        });
        this.hoveredStore.add(this.editor.onMouseLeave(() => {
            this.hoveredStore.clear();
        }));
        this.hoveredStore.add(toDisposable(() => {
            this.hoveredSubject = undefined;
            model.changeDecorations(e => {
                for (const [id, decoration] of this.decorationIds) {
                    e.changeDecorationOptions(id, decoration.options);
                }
            });
        }));
    }
    /**
     * Navigate to the next missed (uncovered) line from the current cursor position.
     * @returns true if navigation occurred, false if no missed line was found
     */
    goToNextMissedLine() {
        return this.navigateToMissedLine(true);
    }
    /**
     * Navigate to the previous missed (uncovered) line from the current cursor position.
     * @returns true if navigation occurred, false if no missed line was found
     */
    goToPreviousMissedLine() {
        return this.navigateToMissedLine(false);
    }
    navigateToMissedLine(next) {
        const model = this.editor.getModel();
        const position = this.editor.getPosition();
        if (!model || !position || !this.details) {
            return false;
        }
        const currentLine = position.lineNumber;
        let closestBefore;
        let closestAfter;
        let firstMissed;
        let lastMissed;
        // Find the closest missed line before and after the current position
        for (const [, { detail, options }] of this.decorationIds) {
            // Check if this is a missed line (CLASS_MISS in lineNumberClassName)
            if (options.lineNumberClassName?.includes(CLASS_MISS)) {
                const range = detail.range;
                if (range.isEmpty()) {
                    continue;
                }
                const lineNumber = range.startLineNumber;
                const missedLine = { lineNumber, range };
                // Track first and last missed lines for wrap-around
                if (!firstMissed || lineNumber < firstMissed.lineNumber) {
                    firstMissed = missedLine;
                }
                if (!lastMissed || lineNumber > lastMissed.lineNumber) {
                    lastMissed = missedLine;
                }
                // Track closest before and after current line
                if (lineNumber < currentLine) {
                    if (!closestBefore || lineNumber > closestBefore.lineNumber) {
                        closestBefore = missedLine;
                    }
                }
                else if (lineNumber > currentLine) {
                    if (!closestAfter || lineNumber < closestAfter.lineNumber) {
                        closestAfter = missedLine;
                    }
                }
            }
        }
        // Determine target line based on direction
        const targetLine = next
            ? (closestAfter || firstMissed) // Next: closest after, or wrap to first
            : (closestBefore || lastMissed); // Previous: closest before, or wrap to last
        if (targetLine) {
            this.editor.setPosition(new Position(targetLine.lineNumber, 1));
            this.editor.revealLineInCenter(targetLine.lineNumber);
            return true;
        }
        return false;
    }
    async apply(model, coverage, testId, showInlineByDefault, showMinimap) {
        const details = this.details = await this.loadDetails(coverage, testId, model);
        if (!details) {
            this.hasInlineCoverageDetails.set(false, undefined);
            return this.clear();
        }
        // Update context key to indicate inline coverage details are available
        this.hasInlineCoverageDetails.set(details.ranges.length > 0, undefined);
        this.displayedStore.clear();
        model.changeDecorations(e => {
            for (const detailRange of details.ranges) {
                const { metadata: { detail, description }, range, primary } = detailRange;
                if (detail.type === 2 /* DetailType.Branch */) {
                    const hits = detail.detail.branches[detail.branch].count;
                    const cls = hits ? CLASS_HIT : CLASS_MISS;
                    // don't bother showing the miss indicator if the condition wasn't executed at all:
                    const showMissIndicator = !hits && range.isEmpty() && detail.detail.branches.some(b => b.count);
                    const options = {
                        showIfCollapsed: showMissIndicator, // only avoid collapsing if we want to show the miss indicator
                        description: 'coverage-gutter',
                        lineNumberClassName: `coverage-deco-gutter ${cls}`,
                        minimap: showMinimap ? {
                            color: themeColorFromId(hits ? testingCoveredMinimapBackground : testingUncoveredMinimapBackground),
                            position: 2 /* MinimapPosition.Gutter */,
                        } : undefined,
                    };
                    const applyHoverOptions = (target) => {
                        target.hoverMessage = description;
                        if (showMissIndicator) {
                            target.after = {
                                content: '\xa0'.repeat(BRANCH_MISS_INDICATOR_CHARS), // nbsp
                                inlineClassName: `coverage-deco-branch-miss-indicator ${ThemeIcon.asClassName(testingCoverageMissingBranch)}`,
                                inlineClassNameAffectsLetterSpacing: true,
                                cursorStops: InjectedTextCursorStops.None,
                            };
                        }
                        else {
                            target.className = `coverage-deco-inline ${cls}`;
                            if (primary && typeof hits === 'number') {
                                target.before = countBadge(hits);
                            }
                        }
                    };
                    if (showInlineByDefault) {
                        applyHoverOptions(options);
                    }
                    this.decorationIds.set(e.addDecoration(range, options), { options, applyHoverOptions, detail: detailRange });
                }
                else if (detail.type === 1 /* DetailType.Statement */) {
                    const cls = detail.count ? CLASS_HIT : CLASS_MISS;
                    const options = {
                        showIfCollapsed: false,
                        description: 'coverage-inline',
                        lineNumberClassName: `coverage-deco-gutter ${cls}`,
                        minimap: showMinimap ? {
                            color: themeColorFromId(detail.count ? testingCoveredMinimapBackground : testingUncoveredMinimapBackground),
                            position: 2 /* MinimapPosition.Gutter */,
                        } : undefined,
                    };
                    const applyHoverOptions = (target) => {
                        target.className = `coverage-deco-inline ${cls}`;
                        target.hoverMessage = description;
                        if (primary && typeof detail.count === 'number') {
                            target.before = countBadge(detail.count);
                        }
                    };
                    if (showInlineByDefault) {
                        applyHoverOptions(options);
                    }
                    this.decorationIds.set(e.addDecoration(range, options), { options, applyHoverOptions, detail: detailRange });
                }
            }
        });
        this.displayedStore.add(toDisposable(() => {
            model.changeDecorations(e => {
                for (const decoration of this.decorationIds.keys()) {
                    e.removeDecoration(decoration);
                }
                this.decorationIds.clear();
            });
        }));
    }
    clear() {
        this.loadingCancellation?.cancel();
        this.loadingCancellation = undefined;
        this.displayedStore.clear();
        this.hoveredStore.clear();
        this.hasInlineCoverageDetails.set(false, undefined);
    }
    async loadDetails(coverage, testId, textModel) {
        const cts = this.loadingCancellation = new CancellationTokenSource();
        this.displayedStore.add(this.loadingCancellation);
        try {
            const details = testId
                ? await coverage.detailsForTest(testId, this.loadingCancellation.token)
                : await coverage.details(this.loadingCancellation.token);
            if (cts.token.isCancellationRequested) {
                return;
            }
            return new CoverageDetailsModel(details, textModel);
        }
        catch (e) {
            this.log.error('Error loading coverage details', e);
        }
        return undefined;
    }
};
CodeCoverageDecorations = __decorate([
    __param(1, IInstantiationService),
    __param(2, ITestCoverageService),
    __param(3, IConfigurationService),
    __param(4, ILogService),
    __param(5, IContextKeyService)
], CodeCoverageDecorations);
export { CodeCoverageDecorations };
const countBadge = (count) => {
    if (count === 0) {
        return undefined;
    }
    return {
        content: `${count > 99 ? '99+' : count}x`,
        cursorStops: InjectedTextCursorStops.None,
        inlineClassName: `coverage-deco-inline-count`,
        inlineClassNameAffectsLetterSpacing: true,
    };
};
export class CoverageDetailsModel {
    constructor(details, textModel) {
        this.details = details;
        this.ranges = [];
        //#region decoration generation
        // Coverage from a provider can have a range that contains smaller ranges,
        // such as a function declaration that has nested statements. In this we
        // make sequential, non-overlapping ranges for each detail for display in
        // the editor without ugly overlaps.
        const detailRanges = details.map(detail => ({
            range: tidyLocation(detail.location),
            primary: true,
            metadata: { detail, description: this.describe(detail, textModel) }
        }));
        for (const { range, metadata: { detail } } of detailRanges) {
            if (detail.type === 1 /* DetailType.Statement */ && detail.branches) {
                for (let i = 0; i < detail.branches.length; i++) {
                    const branch = { type: 2 /* DetailType.Branch */, branch: i, detail };
                    detailRanges.push({
                        range: tidyLocation(detail.branches[i].location || Range.fromPositions(range.getEndPosition())),
                        primary: true,
                        metadata: {
                            detail: branch,
                            description: this.describe(branch, textModel),
                        },
                    });
                }
            }
        }
        // type ordering is done so that function declarations come first on a tie so that
        // single-statement functions (`() => foo()` for example) get inline decorations.
        detailRanges.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range) || a.metadata.detail.type - b.metadata.detail.type);
        const stack = [];
        const result = this.ranges = [];
        const pop = () => {
            const next = stack.pop();
            const prev = stack[stack.length - 1];
            if (prev) {
                prev.range = prev.range.setStartPosition(next.range.endLineNumber, next.range.endColumn);
            }
            result.push(next);
        };
        for (const item of detailRanges) {
            // 1. Ensure that any ranges in the stack that ended before this are flushed
            const start = item.range.getStartPosition();
            while (stack[stack.length - 1]?.range.containsPosition(start) === false) {
                pop();
            }
            // Empty ranges (usually representing missing branches) can be added
            // without worry about overlay.
            if (item.range.isEmpty()) {
                result.push(item);
                continue;
            }
            // 2. Take the last (overlapping) item in the stack, push range before
            // the `item.range` into the result and modify its stack to push the start
            // until after the `item.range` ends.
            const prev = stack[stack.length - 1];
            if (prev) {
                const primary = prev.primary;
                const si = prev.range.setEndPosition(start.lineNumber, start.column);
                prev.range = prev.range.setStartPosition(item.range.endLineNumber, item.range.endColumn);
                prev.primary = false;
                // discard the previous range if it became empty, e.g. a nested statement
                if (prev.range.isEmpty()) {
                    stack.pop();
                }
                result.push({ range: si, primary, metadata: prev.metadata });
            }
            stack.push(item);
        }
        while (stack.length) {
            pop();
        }
        //#endregion
    }
    /** Gets the markdown description for the given detail */
    describe(detail, model) {
        if (detail.type === 0 /* DetailType.Declaration */) {
            return namedDetailLabel(detail.name, detail);
        }
        else if (detail.type === 1 /* DetailType.Statement */) {
            const text = wrapName(model.getValueInRange(tidyLocation(detail.location)).trim() || `<empty statement>`);
            if (detail.branches?.length) {
                const covered = detail.branches.filter(b => !!b.count).length;
                return new MarkdownString().appendMarkdown(localize('coverage.branches', '{0} of {1} of branches in {2} were covered.', covered, detail.branches.length, text));
            }
            else {
                return namedDetailLabel(text, detail);
            }
        }
        else if (detail.type === 2 /* DetailType.Branch */) {
            const text = wrapName(model.getValueInRange(tidyLocation(detail.detail.location)).trim() || `<empty statement>`);
            const { count, label } = detail.detail.branches[detail.branch];
            const label2 = label ? wrapInBackticks(label) : `#${detail.branch + 1}`;
            if (!count) {
                return new MarkdownString().appendMarkdown(localize('coverage.branchNotCovered', 'Branch {0} in {1} was not covered.', label2, text));
            }
            else if (count === true) {
                return new MarkdownString().appendMarkdown(localize('coverage.branchCoveredYes', 'Branch {0} in {1} was executed.', label2, text));
            }
            else {
                return new MarkdownString().appendMarkdown(localize('coverage.branchCovered', 'Branch {0} in {1} was executed {2} time(s).', label2, text, count));
            }
        }
        assertNever(detail);
    }
}
function namedDetailLabel(name, detail) {
    return new MarkdownString().appendMarkdown(!detail.count // 0 or false
        ? localize('coverage.declExecutedNo', '`{0}` was not executed.', name)
        : typeof detail.count === 'number'
            ? localize('coverage.declExecutedCount', '`{0}` was executed {1} time(s).', name, detail.count)
            : localize('coverage.declExecutedYes', '`{0}` was executed.', name));
}
// 'tidies' the range by normalizing it into a range and removing leading
// and trailing whitespace.
function tidyLocation(location) {
    if (location instanceof Position) {
        return Range.fromPositions(location, new Position(location.lineNumber, 0x7FFFFFFF));
    }
    return location;
}
function wrapInBackticks(str) {
    return '`' + str.replace(/[\n\r`]/g, '') + '`';
}
function wrapName(functionNameOrCode) {
    if (functionNameOrCode.length > 50) {
        functionNameOrCode = functionNameOrCode.slice(0, 40) + '...';
    }
    return wrapInBackticks(functionNameOrCode);
}
let CoverageToolbarWidget = class CoverageToolbarWidget extends Disposable {
    constructor(editor, configurationService, contextMenuService, testService, keybindingService, commandService, coverage, instaService) {
        super();
        this.editor = editor;
        this.configurationService = configurationService;
        this.contextMenuService = contextMenuService;
        this.testService = testService;
        this.keybindingService = keybindingService;
        this.commandService = commandService;
        this.coverage = coverage;
        this.registered = false;
        this.isRunning = false;
        this.showStore = this._register(new DisposableStore());
        this._domNode = dom.h('div.coverage-summary-widget', [
            dom.h('div', [
                dom.h('span.bars@bars'),
                dom.h('span.toolbar@toolbar'),
            ]),
        ]);
        this.bars = this._register(instaService.createInstance(ManagedTestCoverageBars, {
            compact: false,
            overall: false,
            container: this._domNode.bars,
        }));
        this.actionBar = this._register(instaService.createInstance(ActionBar, this._domNode.toolbar, {
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            actionViewItemProvider: (action, options) => {
                if (action instanceof ActionWithIcon) {
                    if (action.iconOnly) {
                        action.class = ThemeIcon.asClassName(action.icon);
                        return new ActionViewItem(undefined, action, { ...options, label: false, icon: true });
                    }
                    const vm = new CodiconActionViewItem(undefined, action, options);
                    vm.themeIcon = action.icon;
                    return vm;
                }
                return undefined;
            }
        }));
        this._register(autorun(reader => {
            coverage.showInline.read(reader);
            this.setActions();
        }));
        this._register(dom.addStandardDisposableListener(this._domNode.root, dom.EventType.CONTEXT_MENU, e => {
            this.contextMenuService.showContextMenu({
                menuId: MenuId.StickyScrollContext,
                getAnchor: () => e,
            });
        }));
    }
    /** @inheritdoc */
    getId() {
        return 'coverage-summary-widget';
    }
    /** @inheritdoc */
    getDomNode() {
        return this._domNode.root;
    }
    /** @inheritdoc */
    getPosition() {
        return {
            preference: 2 /* OverlayWidgetPositionPreference.TOP_CENTER */,
            stackOrdinal: 9,
        };
    }
    clearCoverage() {
        this.current = undefined;
        this.bars.setCoverageInfo(undefined);
        this.hide();
    }
    setCoverage(coverage, testId) {
        this.current = { coverage, testId };
        this.bars.setCoverageInfo(coverage);
        if (!coverage) {
            this.hide();
        }
        else {
            this.setActions();
            this.show();
        }
    }
    setActions() {
        this.actionBar.clear();
        const current = this.current;
        if (!current) {
            return;
        }
        const toggleAction = new ActionWithIcon('toggleInline', this.coverage.showInline.get()
            ? localize('testing.hideInlineCoverage', 'Hide Inline')
            : localize('testing.showInlineCoverage', 'Show Inline'), testingCoverageReport, undefined, () => this.coverage.showInline.set(!this.coverage.showInline.get(), undefined));
        toggleAction.tooltip = this.keybindingService.appendKeybinding(TOGGLE_INLINE_COMMAND_TEXT, TOGGLE_INLINE_COMMAND_ID);
        const hasUncoveredStmt = current.coverage.statement.covered < current.coverage.statement.total;
        // Navigation buttons for missed coverage lines
        this.actionBar.push(new ActionWithIcon('goToPreviousMissed', GO_TO_PREVIOUS_MISSED_LINE_TITLE.value, Codicon.arrowUp, hasUncoveredStmt, () => this.commandService.executeCommand("testing.coverage.goToPreviousMissedLine" /* TestCommandId.CoverageGoToPreviousMissedLine */), true));
        this.actionBar.push(new ActionWithIcon('goToNextMissed', GO_TO_NEXT_MISSED_LINE_TITLE.value, Codicon.arrowDown, hasUncoveredStmt, () => this.commandService.executeCommand("testing.coverage.goToNextMissedLine" /* TestCommandId.CoverageGoToNextMissedLine */), true));
        this.actionBar.push(toggleAction);
        if (current.testId) {
            const testItem = current.coverage.fromResult.getTestById(current.testId.toString());
            assert(!!testItem, 'got coverage for an unreported test');
            this.actionBar.push(new ActionWithIcon('perTestFilter', coverUtils.labels.showingFilterFor(testItem.label), testingFilterIcon, undefined, () => this.commandService.executeCommand("testing.coverageFilterToTestInEditor" /* TestCommandId.CoverageFilterToTestInEditor */, this.current, this.editor)));
        }
        else if (current.coverage.perTestData?.size) {
            this.actionBar.push(new ActionWithIcon('perTestFilter', localize('testing.coverageForTestAvailable', "{0} test(s) ran code in this file", current.coverage.perTestData.size), testingFilterIcon, undefined, () => this.commandService.executeCommand("testing.coverageFilterToTestInEditor" /* TestCommandId.CoverageFilterToTestInEditor */, this.current, this.editor)));
        }
        this.actionBar.push(new ActionWithIcon('rerun', localize('testing.rerun', 'Rerun'), testingRerunIcon, !this.isRunning, () => this.rerunTest()));
    }
    show() {
        if (this.registered) {
            return;
        }
        this.registered = true;
        let viewZoneId;
        const ds = this.showStore;
        this.editor.addOverlayWidget(this);
        this.editor.changeViewZones(accessor => {
            viewZoneId = accessor.addZone({
                afterLineNumber: 0,
                afterColumn: 0,
                domNode: document.createElement('div'),
                heightInPx: 30,
                ordinal: -1, // show before code lenses
            });
        });
        ds.add(toDisposable(() => {
            this.registered = false;
            this.editor.removeOverlayWidget(this);
            this.editor.changeViewZones(accessor => {
                accessor.removeZone(viewZoneId);
            });
        }));
        ds.add(this.configurationService.onDidChangeConfiguration(e => {
            if (this.current && (e.affectsConfiguration("testing.coverageBarThresholds" /* TestingConfigKeys.CoverageBarThresholds */) || e.affectsConfiguration("testing.displayedCoveragePercent" /* TestingConfigKeys.CoveragePercent */))) {
                this.setCoverage(this.current.coverage, this.current.testId);
            }
        }));
    }
    rerunTest() {
        const current = this.current;
        if (current) {
            this.isRunning = true;
            this.setActions();
            this.testService.runResolvedTests(current.coverage.fromResult.request).finally(() => {
                this.isRunning = false;
                this.setActions();
            });
        }
    }
    hide() {
        this.showStore.clear();
    }
};
CoverageToolbarWidget = __decorate([
    __param(1, IConfigurationService),
    __param(2, IContextMenuService),
    __param(3, ITestService),
    __param(4, IKeybindingService),
    __param(5, ICommandService),
    __param(6, ITestCoverageService),
    __param(7, IInstantiationService)
], CoverageToolbarWidget);
registerAction2(class ToggleInlineCoverage extends Action2 {
    constructor() {
        super({
            id: TOGGLE_INLINE_COMMAND_ID,
            // note: ideally this would be "show inline", but the command palette does
            // not use the 'toggled' titles, so we need to make this generic.
            title: localize2('coverage.toggleInline', "Toggle Inline Coverage"),
            category: Categories.Test,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 85 /* KeyCode.Semicolon */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 39 /* KeyCode.KeyI */),
            },
            toggled: {
                condition: TestingContextKeys.inlineCoverageEnabled,
                title: localize('coverage.hideInline', "Hide Inline Coverage"),
            },
            icon: testingCoverageReport,
            menu: [
                { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
                { id: MenuId.EditorTitle, when: ContextKeyExpr.and(TestingContextKeys.hasInlineCoverageDetails, TestingContextKeys.coverageToolbarEnabled.notEqualsTo(true)), group: 'navigation' },
            ]
        });
    }
    run(accessor) {
        const coverage = accessor.get(ITestCoverageService);
        coverage.showInline.set(!coverage.showInline.get(), undefined);
    }
});
registerAction2(class ToggleCoverageToolbar extends Action2 {
    constructor() {
        super({
            id: "testing.coverageToggleToolbar" /* TestCommandId.CoverageToggleToolbar */,
            title: localize2('testing.toggleToolbarTitle', "Show Test Coverage Toolbar"),
            metadata: {
                description: localize2('testing.toggleToolbarDesc', 'Toggle the sticky coverage bar in the editor.')
            },
            category: Categories.Test,
            toggled: {
                condition: TestingContextKeys.coverageToolbarEnabled,
            },
            menu: [
                { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
                { id: MenuId.StickyScrollContext, when: TestingContextKeys.isTestCoverageOpen },
                { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: 'coverage', order: 1 },
            ]
        });
    }
    run(accessor) {
        const config = accessor.get(IConfigurationService);
        const value = getTestingConfiguration(config, "testing.coverageToolbarEnabled" /* TestingConfigKeys.CoverageToolbarEnabled */);
        config.updateValue("testing.coverageToolbarEnabled" /* TestingConfigKeys.CoverageToolbarEnabled */, !value);
    }
});
registerAction2(class FilterCoverageToTestInEditor extends Action2 {
    constructor() {
        super({
            id: "testing.coverageFilterToTestInEditor" /* TestCommandId.CoverageFilterToTestInEditor */,
            title: localize2('testing.filterActionLabel', "Filter Coverage to Test"),
            category: Categories.Test,
            icon: Codicon.filter,
            toggled: {
                icon: Codicon.filterFilled,
                condition: TestingContextKeys.isCoverageFilteredToTest,
            },
            menu: [
                {
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(TestingContextKeys.hasCoverageInFile, TestingContextKeys.coverageToolbarEnabled.notEqualsTo(true), TestingContextKeys.hasPerTestCoverage, ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID)),
                    group: 'navigation',
                },
            ]
        });
    }
    run(accessor, coverageOrUri, editor) {
        const testCoverageService = accessor.get(ITestCoverageService);
        const quickInputService = accessor.get(IQuickInputService);
        const commandService = accessor.get(ICommandService);
        const activeEditor = isCodeEditor(editor) ? editor : accessor.get(ICodeEditorService).getActiveCodeEditor();
        let coverage;
        if (coverageOrUri instanceof FileCoverage) {
            coverage = coverageOrUri;
        }
        else if (isUriComponents(coverageOrUri)) {
            coverage = testCoverageService.selected.get()?.getUri(URI.from(coverageOrUri));
        }
        else {
            const uri = activeEditor?.getModel()?.uri;
            coverage = uri && testCoverageService.selected.get()?.getUri(uri);
        }
        if (!coverage || !coverage.perTestData?.size) {
            return;
        }
        const tests = [...coverage.perTestData].map(TestId.fromString);
        const commonPrefix = TestId.getLengthOfCommonPrefix(tests.length, i => tests[i]);
        const result = coverage.fromResult;
        const previousSelection = testCoverageService.filterToTest.get();
        const buttons = [{
                iconClass: 'codicon-go-to-file',
                tooltip: 'Go to Test',
            }];
        const items = [
            { label: coverUtils.labels.allTests, testId: undefined },
            { type: 'separator' },
            ...tests.map(id => ({ label: coverUtils.getLabelForItem(result, id, commonPrefix), testId: id, buttons })),
        ];
        // These handle the behavior that reveals the start of coverage when the
        // user picks from the quickpick. Scroll position is restored if the user
        // exits without picking an item, or picks "all tests".
        const scrollTop = activeEditor?.getScrollTop() || 0;
        const revealScrollCts = new MutableDisposable();
        quickInputService.pick(items, {
            activeItem: items.find((item) => 'testId' in item && item.testId?.toString() === previousSelection?.toString()),
            placeHolder: coverUtils.labels.pickShowCoverage,
            onDidTriggerItemButton: (context) => {
                commandService.executeCommand('vscode.revealTest', context.item.testId?.toString());
            },
            onDidFocus: (entry) => {
                if (!entry.testId) {
                    revealScrollCts.clear();
                    activeEditor?.setScrollTop(scrollTop);
                    testCoverageService.filterToTest.set(undefined, undefined);
                }
                else {
                    const cts = revealScrollCts.value = new CancellationTokenSource();
                    coverage.detailsForTest(entry.testId, cts.token).then(details => {
                        const first = details.find(d => d.type === 1 /* DetailType.Statement */);
                        if (!cts.token.isCancellationRequested && first) {
                            activeEditor?.revealLineNearTop(first.location instanceof Position ? first.location.lineNumber : first.location.startLineNumber);
                        }
                    }, () => { });
                    testCoverageService.filterToTest.set(entry.testId, undefined);
                }
            },
        }).then(selected => {
            if (!selected) {
                activeEditor?.setScrollTop(scrollTop);
            }
            revealScrollCts.dispose();
            testCoverageService.filterToTest.set(selected ? selected.testId : previousSelection, undefined);
        });
    }
});
registerAction2(class ToggleCoverageInExplorer extends Action2 {
    constructor() {
        super({
            id: "testing.toggleCoverageInExplorer" /* TestCommandId.CoverageToggleInExplorer */,
            title: localize2('testing.toggleCoverageInExplorerTitle', "Toggle Coverage in Explorer"),
            metadata: {
                description: localize2('testing.toggleCoverageInExplorerDesc', 'Toggle the display of test coverage in the File Explorer view.')
            },
            category: Categories.Test,
            toggled: {
                condition: ContextKeyExpr.equals('config.testing.showCoverageInExplorer', true),
                title: localize('testing.hideCoverageInExplorer', "Hide Coverage in Explorer"),
            },
            menu: [
                { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
            ]
        });
    }
    run(accessor) {
        const config = accessor.get(IConfigurationService);
        const value = getTestingConfiguration(config, "testing.showCoverageInExplorer" /* TestingConfigKeys.ShowCoverageInExplorer */);
        config.updateValue("testing.showCoverageInExplorer" /* TestingConfigKeys.ShowCoverageInExplorer */, !value);
    }
});
registerAction2(class GoToNextMissedCoverageLine extends Action2 {
    constructor() {
        super({
            id: "testing.coverage.goToNextMissedLine" /* TestCommandId.CoverageGoToNextMissedLine */,
            title: GO_TO_NEXT_MISSED_LINE_TITLE,
            metadata: {
                description: localize2('testing.goToNextMissedLineDesc', 'Navigate to the next line that is not covered by tests.')
            },
            category: Categories.Test,
            icon: Codicon.arrowDown,
            precondition: TestingContextKeys.hasCoverageInFile,
            keybinding: {
                when: ActiveEditorContext,
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 512 /* KeyMod.Alt */ | 67 /* KeyCode.F9 */,
            },
            menu: [
                { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
                { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: 'coverage', order: 2 },
            ]
        });
    }
    run(accessor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const activeEditor = codeEditorService.getActiveCodeEditor();
        if (!activeEditor) {
            return;
        }
        const contribution = activeEditor.getContribution(CodeCoverageDecorations.ID);
        contribution?.goToNextMissedLine();
    }
});
registerAction2(class GoToPreviousMissedCoverageLine extends Action2 {
    constructor() {
        super({
            id: "testing.coverage.goToPreviousMissedLine" /* TestCommandId.CoverageGoToPreviousMissedLine */,
            title: GO_TO_PREVIOUS_MISSED_LINE_TITLE,
            metadata: {
                description: localize2('testing.goToPreviousMissedLineDesc', 'Navigate to the previous line that is not covered by tests.')
            },
            category: Categories.Test,
            icon: Codicon.arrowUp,
            precondition: TestingContextKeys.hasCoverageInFile,
            keybinding: {
                when: ActiveEditorContext,
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 67 /* KeyCode.F9 */,
            },
            menu: [
                { id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
                { id: MenuId.EditorTitle, when: TestingContextKeys.hasCoverageInFile, group: 'coverage', order: 3 },
            ]
        });
    }
    run(accessor) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const activeEditor = codeEditorService.getActiveCodeEditor();
        if (!activeEditor) {
            return;
        }
        const contribution = activeEditor.getContribution(CodeCoverageDecorations.ID);
        contribution?.goToPreviousMissedLine();
    }
});
class ActionWithIcon extends Action {
    constructor(id, title, icon, enabled, run, iconOnly = false) {
        super(id, title, undefined, enabled, run);
        this.icon = icon;
        this.iconOnly = iconOnly;
    }
}
class CodiconActionViewItem extends ActionViewItem {
    updateLabel() {
        if (this.options.label && this.label && this.themeIcon) {
            dom.reset(this.label, renderIcon(this.themeIcon), this.action.label);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUNvdmVyYWdlRGVjb3JhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2Jyb3dzZXIvY29kZUNvdmVyYWdlRGVjb3JhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFNBQVMsRUFBc0IsTUFBTSxvREFBb0QsQ0FBQztBQUNuRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQW1CLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFDaEYsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BILE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxD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