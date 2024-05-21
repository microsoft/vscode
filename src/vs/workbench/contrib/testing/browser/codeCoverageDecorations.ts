/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { ActionBar, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Action } from 'vs/base/common/actions';
import { mapFindFirst } from 'vs/base/common/arraysFind';
import { assert, assertNever } from 'vs/base/common/assert';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { ThemeIcon } from 'vs/base/common/themables';
import { isUriComponents, URI } from 'vs/base/common/uri';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, MouseTargetType, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, InjectedTextCursorStops, InjectedTextOptions, ITextModel } from 'vs/editor/common/model';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { observableConfigValue } from 'vs/platform/observable/common/platformObservableUtils';
import { IQuickInputService, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import * as coverUtils from 'vs/workbench/contrib/testing/browser/codeCoverageDisplayUtils';
import { testingCoverageMissingBranch, testingCoverageReport, testingFilterIcon, testingRerunIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { ManagedTestCoverageBars } from 'vs/workbench/contrib/testing/browser/testCoverageBars';
import { getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { TestCommandId } from 'vs/workbench/contrib/testing/common/constants';
import { FileCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { ITestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { CoverageDetails, DetailType, IDeclarationCoverage, IStatementCoverage } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';

const MAX_HOVERED_LINES = 30;
const CLASS_HIT = 'coverage-deco-hit';
const CLASS_MISS = 'coverage-deco-miss';
const TOGGLE_INLINE_COMMAND_TEXT = localize('testing.toggleInlineCoverage', 'Toggle Inline');
const TOGGLE_INLINE_COMMAND_ID = 'testing.toggleInlineCoverage';
const BRANCH_MISS_INDICATOR_CHARS = 4;

export class CodeCoverageDecorations extends Disposable implements IEditorContribution {
	public static showInline = observableValue('inlineCoverage', false);
	private static readonly fileCoverageDecorations = new WeakMap<FileCoverage, CoverageDetailsModel>();

	private loadingCancellation?: CancellationTokenSource;
	private readonly displayedStore = this._register(new DisposableStore());
	private readonly hoveredStore = this._register(new DisposableStore());
	private readonly summaryWidget: Lazy<CoverageToolbarWidget>;
	private decorationIds = new Map<string, {
		detail: DetailRange;
		options: IModelDecorationOptions;
		applyHoverOptions(target: IModelDecorationOptions): void;
	}>();
	private hoveredSubject?: unknown;
	private details?: CoverageDetailsModel;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITestCoverageService coverage: ITestCoverageService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly log: ILogService,
	) {
		super();

		this.summaryWidget = new Lazy(() => this._register(instantiationService.createInstance(CoverageToolbarWidget, this.editor)));

		const modelObs = observableFromEvent(editor.onDidChangeModel, () => editor.getModel());
		const configObs = observableFromEvent(editor.onDidChangeConfiguration, i => i);

		const fileCoverage = derived(reader => {
			const report = coverage.selected.read(reader);
			if (!report) {
				return;
			}

			const model = modelObs.read(reader);
			if (!model) {
				return;
			}

			let file = report.getUri(model.uri);
			if (file) {
				const testFilter = coverage.filterToTest.read(reader);
				if (testFilter) {
					file = file.perTestData?.get(testFilter.toString()) || file;
				}

				return file;
			}

			report.didAddCoverage.read(reader); // re-read if changes when there's no report
			return undefined;
		});

		this._register(autorun(reader => {
			const c = fileCoverage.read(reader);
			if (c) {
				this.apply(editor.getModel()!, c, CodeCoverageDecorations.showInline.read(reader));
			} else {
				this.clear();
			}
		}));

		const toolbarEnabled = observableConfigValue(TestingConfigKeys.CoverageToolbarEnabled, true, configurationService);
		this._register(autorun(reader => {
			const c = fileCoverage.read(reader);
			if (c && toolbarEnabled.read(reader)) {
				this.summaryWidget.value.setCoverage(c);
			} else {
				this.summaryWidget.rawValue?.setCoverage(undefined);
			}
		}));

		this._register(autorun(reader => {
			const c = fileCoverage.read(reader);
			if (c) {
				const evt = configObs.read(reader);
				if (evt?.hasChanged(EditorOption.lineHeight) !== false) {
					this.updateEditorStyles();
				}
			}
		}));

		this._register(editor.onMouseMove(e => {
			const model = editor.getModel();
			if (e.target.type === MouseTargetType.GUTTER_LINE_NUMBERS && model) {
				this.hoverLineNumber(editor.getModel()!, e.target.position.lineNumber);
			} else if (CodeCoverageDecorations.showInline.get() && e.target.type === MouseTargetType.CONTENT_TEXT && model) {
				this.hoverInlineDecoration(model, e.target.position);
			} else {
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

	private updateEditorStyles() {
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		const { style } = this.editor.getContainerDomNode();
		style.setProperty('--vscode-testing-coverage-lineHeight', `${lineHeight}px`);
	}

	private hoverInlineDecoration(model: ITextModel, position: Position) {
		const allDecorations = model.getDecorationsInRange(Range.fromPositions(position));
		const decoration = mapFindFirst(allDecorations, ({ id }) => this.decorationIds.has(id) ? { id, deco: this.decorationIds.get(id)! } : undefined);
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
				e.changeDecorationOptions(decoration!.id, decoration!.deco.options);
			});
		}));
	}

	private hoverLineNumber(model: ITextModel, lineNumber: number) {
		if (lineNumber === this.hoveredSubject || !this.details) {
			return;
		}

		this.hoveredStore.clear();
		this.hoveredSubject = lineNumber;

		const todo = [{ line: lineNumber, dir: 0 }];
		const toEnable = new Set<string>();
		if (!CodeCoverageDecorations.showInline.get()) {
			for (let i = 0; i < todo.length && i < MAX_HOVERED_LINES; i++) {
				const { line, dir } = todo[i];
				let found = false;
				for (const decoration of model.getLineDecorations(line)) {
					if (this.decorationIds.has(decoration.id)) {
						toEnable.add(decoration.id);
						found = true;
					}
				}
				if (found) {
					if (dir <= 0) {
						todo.push({ line: line - 1, dir: -1 });
					}
					if (dir >= 0) {
						todo.push({ line: line + 1, dir: 1 });
					}
				}
			}

			model.changeDecorations(e => {
				for (const id of toEnable) {
					const { applyHoverOptions, options } = this.decorationIds.get(id)!;
					const dup = { ...options };
					applyHoverOptions(dup);
					e.changeDecorationOptions(id, dup);
				}
			});
		}

		this.hoveredStore.add(this.editor.onMouseLeave(() => {
			this.hoveredStore.clear();
		}));

		this.hoveredStore.add(toDisposable(() => {
			this.hoveredSubject = undefined;

			model.changeDecorations(e => {
				for (const id of toEnable) {
					const deco = this.decorationIds.get(id);
					if (deco) {
						e.changeDecorationOptions(id, deco.options);
					}
				}
			});
		}));
	}

	private async apply(model: ITextModel, coverage: FileCoverage, showInlineByDefault: boolean) {
		const details = this.details = await this.loadDetails(coverage, model);
		if (!details) {
			return this.clear();
		}

		this.displayedStore.clear();

		model.changeDecorations(e => {
			for (const detailRange of details.ranges) {
				const { metadata: { detail, description }, range, primary } = detailRange;
				if (detail.type === DetailType.Branch) {
					const hits = detail.detail.branches![detail.branch].count;
					const cls = hits ? CLASS_HIT : CLASS_MISS;
					// don't bother showing the miss indicator if the condition wasn't executed at all:
					const showMissIndicator = !hits && range.isEmpty() && detail.detail.branches!.some(b => b.count);
					const options: IModelDecorationOptions = {
						showIfCollapsed: showMissIndicator, // only avoid collapsing if we want to show the miss indicator
						description: 'coverage-gutter',
						lineNumberClassName: `coverage-deco-gutter ${cls}`,
					};

					const applyHoverOptions = (target: IModelDecorationOptions) => {
						target.hoverMessage = description;
						if (showMissIndicator) {
							target.after = {
								content: '\xa0'.repeat(BRANCH_MISS_INDICATOR_CHARS), // nbsp
								inlineClassName: `coverage-deco-branch-miss-indicator ${ThemeIcon.asClassName(testingCoverageMissingBranch)}`,
								inlineClassNameAffectsLetterSpacing: true,
								cursorStops: InjectedTextCursorStops.None,
							};
						} else {
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
				} else if (detail.type === DetailType.Statement) {
					const cls = detail.count ? CLASS_HIT : CLASS_MISS;
					const options: IModelDecorationOptions = {
						showIfCollapsed: false,
						description: 'coverage-inline',
						lineNumberClassName: `coverage-deco-gutter ${cls}`,
					};

					const applyHoverOptions = (target: IModelDecorationOptions) => {
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

	private clear() {
		this.loadingCancellation?.cancel();
		this.loadingCancellation = undefined;
		this.displayedStore.clear();
		this.hoveredStore.clear();
	}

	private async loadDetails(coverage: FileCoverage, textModel: ITextModel) {
		const existing = CodeCoverageDecorations.fileCoverageDecorations.get(coverage);
		if (existing) {
			return existing;
		}

		const cts = this.loadingCancellation = new CancellationTokenSource();
		this.displayedStore.add(this.loadingCancellation);

		try {
			const details = await coverage.details(this.loadingCancellation.token);
			if (cts.token.isCancellationRequested) {
				return;
			}
			const model = CodeCoverageDecorations.fileCoverageDecorations.get(coverage)
				|| new CoverageDetailsModel(details, textModel);
			CodeCoverageDecorations.fileCoverageDecorations.set(coverage, model);
			return model;
		} catch (e) {
			this.log.error('Error loading coverage details', e);
		}

		return undefined;
	}
}

const countBadge = (count: number): InjectedTextOptions | undefined => {
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

type CoverageDetailsWithBranch = CoverageDetails | { type: DetailType.Branch; branch: number; detail: IStatementCoverage };
type DetailRange = { range: Range; primary: boolean; metadata: { detail: CoverageDetailsWithBranch; description: IMarkdownString | undefined } };

export class CoverageDetailsModel {
	public readonly ranges: DetailRange[] = [];

	constructor(public readonly details: CoverageDetails[], textModel: ITextModel) {

		//#region decoration generation
		// Coverage from a provider can have a range that contains smaller ranges,
		// such as a function declaration that has nested statements. In this we
		// make sequential, non-overlapping ranges for each detail for display in
		// the editor without ugly overlaps.
		const detailRanges: DetailRange[] = details.map(detail => ({
			range: tidyLocation(detail.location),
			primary: true,
			metadata: { detail, description: this.describe(detail, textModel) }
		}));

		for (const { range, metadata: { detail } } of detailRanges) {
			if (detail.type === DetailType.Statement && detail.branches) {
				for (let i = 0; i < detail.branches.length; i++) {
					const branch: CoverageDetailsWithBranch = { type: DetailType.Branch, branch: i, detail };
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

		const stack: DetailRange[] = [];
		const result: DetailRange[] = this.ranges = [];
		const pop = () => {
			const next = stack.pop()!;
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
				if (prev.range.isEmpty()) { stack.pop(); }
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
	public describe(detail: CoverageDetailsWithBranch, model: ITextModel): IMarkdownString | undefined {
		if (detail.type === DetailType.Declaration) {
			return namedDetailLabel(detail.name, detail);
		} else if (detail.type === DetailType.Statement) {
			const text = wrapName(model.getValueInRange(tidyLocation(detail.location)).trim() || `<empty statement>`);
			if (detail.branches?.length) {
				const covered = detail.branches.filter(b => !!b.count).length;
				return new MarkdownString().appendMarkdown(localize('coverage.branches', '{0} of {1} of branches in {2} were covered.', covered, detail.branches.length, text));
			} else {
				return namedDetailLabel(text, detail);
			}
		} else if (detail.type === DetailType.Branch) {
			const text = wrapName(model.getValueInRange(tidyLocation(detail.detail.location)).trim() || `<empty statement>`);
			const { count, label } = detail.detail.branches![detail.branch];
			const label2 = label ? wrapInBackticks(label) : `#${detail.branch + 1}`;
			if (!count) {
				return new MarkdownString().appendMarkdown(localize('coverage.branchNotCovered', 'Branch {0} in {1} was not covered.', label2, text));
			} else if (count === true) {
				return new MarkdownString().appendMarkdown(localize('coverage.branchCoveredYes', 'Branch {0} in {1} was executed.', label2, text));
			} else {
				return new MarkdownString().appendMarkdown(localize('coverage.branchCovered', 'Branch {0} in {1} was executed {2} time(s).', label2, text, count));
			}
		}

		assertNever(detail);
	}
}

function namedDetailLabel(name: string, detail: IStatementCoverage | IDeclarationCoverage) {
	return new MarkdownString().appendMarkdown(
		!detail.count // 0 or false
			? localize('coverage.declExecutedNo', '`{0}` was not executed.', name)
			: typeof detail.count === 'number'
				? localize('coverage.declExecutedCount', '`{0}` was executed {1} time(s).', name, detail.count)
				: localize('coverage.declExecutedYes', '`{0}` was executed.', name)
	);
}

// 'tidies' the range by normalizing it into a range and removing leading
// and trailing whitespace.
function tidyLocation(location: Range | Position): Range {
	if (location instanceof Position) {
		return Range.fromPositions(location, new Position(location.lineNumber, 0x7FFFFFFF));
	}

	return location;
}

function wrapInBackticks(str: string) {
	return '`' + str.replace(/[\n\r`]/g, '') + '`';
}

function wrapName(functionNameOrCode: string) {
	if (functionNameOrCode.length > 50) {
		functionNameOrCode = functionNameOrCode.slice(0, 40) + '...';
	}
	return wrapInBackticks(functionNameOrCode);
}

class CoverageToolbarWidget extends Disposable implements IOverlayWidget {
	private current: FileCoverage | undefined;
	private registered = false;
	private isRunning = false;
	private readonly showStore = this._register(new DisposableStore());
	private readonly actionBar: ActionBar;
	private readonly _domNode = dom.h('div.coverage-summary-widget', [
		dom.h('div', [
			dom.h('span.bars@bars'),
			dom.h('span.toolbar@toolbar'),
		]),
	]);

	private readonly bars: ManagedTestCoverageBars;

	constructor(
		private readonly editor: ICodeEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITestService private readonly testService: ITestService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ICommandService private readonly commandService: ICommandService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super();

		this.bars = this._register(instaService.createInstance(ManagedTestCoverageBars, {
			compact: false,
			overall: false,
			container: this._domNode.bars,
		}));

		this.actionBar = this._register(instaService.createInstance(ActionBar, this._domNode.toolbar, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionViewItemProvider: (action, options) => {
				const vm = new CodiconActionViewItem(undefined, action, options);
				if (action instanceof ActionWithIcon) {
					vm.themeIcon = action.icon;
				}
				return vm;
			}
		}));


		this._register(autorun(reader => {
			CodeCoverageDecorations.showInline.read(reader);
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
	public getId(): string {
		return 'coverage-summary-widget';
	}

	/** @inheritdoc */
	public getDomNode(): HTMLElement {
		return this._domNode.root;
	}

	/** @inheritdoc */
	public getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: OverlayWidgetPositionPreference.TOP_CENTER,
			stackOridinal: 9,
		};
	}

	public setCoverage(coverage: FileCoverage | undefined) {
		this.current = coverage;
		this.bars.setCoverageInfo(coverage);

		if (!coverage) {
			this.hide();
		} else {
			this.setActions();
			this.show();
		}
	}

	private setActions() {
		this.actionBar.clear();
		const coverage = this.current;
		if (!coverage) {
			return;
		}

		const toggleAction = new ActionWithIcon(
			'toggleInline',
			CodeCoverageDecorations.showInline.get()
				? localize('testing.hideInlineCoverage', 'Hide Inline Coverage')
				: localize('testing.showInlineCoverage', 'Show Inline Coverage'),
			testingCoverageReport,
			undefined,
			() => CodeCoverageDecorations.showInline.set(!CodeCoverageDecorations.showInline.get(), undefined),
		);

		const kb = this.keybindingService.lookupKeybinding(TOGGLE_INLINE_COMMAND_ID);
		if (kb) {
			toggleAction.tooltip = `${TOGGLE_INLINE_COMMAND_TEXT} (${kb.getLabel()})`;
		}

		this.actionBar.push(toggleAction);

		if (coverage.isForTest) {
			const testItem = coverage.fromResult.getTestById(coverage.isForTest.id.toString());
			assert(!!testItem, 'got coverage for an unreported test');
			this.actionBar.push(new ActionWithIcon('perTestFilter',
				coverUtils.labels.showingFilterFor(testItem.label),
				testingFilterIcon,
				undefined,
				() => this.commandService.executeCommand(TestCommandId.CoverageFilterToTestInEditor, this.current),
			));
		} else if (coverage.perTestData?.size) {
			this.actionBar.push(new ActionWithIcon('perTestFilter',
				localize('testing.coverageForTestAvailable', "{0} test(s) ran code in this file", coverage.perTestData.size),
				testingFilterIcon,
				undefined,
				() => this.commandService.executeCommand(TestCommandId.CoverageFilterToTestInEditor, this.current),
			));
		}

		this.actionBar.push(new ActionWithIcon(
			'rerun',
			localize('testing.rerun', 'Rerun'),
			testingRerunIcon,
			!this.isRunning,
			() => this.rerunTest()
		));
	}

	private show() {
		if (this.registered) {
			return;
		}

		this.registered = true;
		let viewZoneId: string;
		const ds = this.showStore;

		this.editor.addOverlayWidget(this);
		this.editor.changeViewZones(accessor => {
			viewZoneId = accessor.addZone({ // make space for the widget
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
			if (e.affectsConfiguration(TestingConfigKeys.CoverageBarThresholds) || e.affectsConfiguration(TestingConfigKeys.CoveragePercent)) {
				this.setCoverage(this.current);
			}
		}));
	}

	private rerunTest() {
		const current = this.current;
		if (current) {
			this.isRunning = true;
			this.setActions();
			this.testService.runResolvedTests(current.fromResult.request).finally(() => {
				this.isRunning = false;
				this.setActions();
			});
		}
	}

	private hide() {
		this.showStore.clear();
	}
}

registerAction2(class ToggleInlineCoverage extends Action2 {
	constructor() {
		super({
			id: TOGGLE_INLINE_COMMAND_ID,
			title: localize2('coverage.toggleInline', "Show Inline Coverage"),
			category: Categories.Test,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI),
			},
			icon: testingCoverageReport,
			menu: [
				{ id: MenuId.CommandPalette, when: TestingContextKeys.isTestCoverageOpen },
				{ id: MenuId.EditorTitle, when: ContextKeyExpr.and(TestingContextKeys.isTestCoverageOpen, TestingContextKeys.coverageToolbarEnabled.notEqualsTo(true)), group: 'navigation' },
			]
		});
	}

	public run() {
		CodeCoverageDecorations.showInline.set(!CodeCoverageDecorations.showInline.get(), undefined);
	}
});

registerAction2(class ToggleCoverageToolbar extends Action2 {
	constructor() {
		super({
			id: TestCommandId.CoverageToggleToolbar,
			title: localize2('testing.toggleToolbarTitle', "Test Coverage Toolbar"),
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
				{ id: MenuId.EditorTitle, when: TestingContextKeys.isTestCoverageOpen, group: 'coverage@1' },
			]
		});
	}

	run(accessor: ServicesAccessor): void {
		const config = accessor.get(IConfigurationService);
		const value = getTestingConfiguration(config, TestingConfigKeys.CoverageToolbarEnabled);
		config.updateValue(TestingConfigKeys.CoverageToolbarEnabled, !value);
	}
});

registerAction2(class FilterCoverageToTestInEditor extends Action2 {
	constructor() {
		super({
			id: TestCommandId.CoverageFilterToTestInEditor,
			title: localize2('testing.filterActionLabel', "Filter Coverage to Test"),
			category: Categories.Test,
			icon: Codicon.filter,
			toggled: {
				icon: Codicon.filterFilled,
				condition: TestingContextKeys.isCoverageFilteredToTest,
			},
			menu: [
				{ id: MenuId.EditorTitle, when: ContextKeyExpr.and(TestingContextKeys.isTestCoverageOpen, TestingContextKeys.coverageToolbarEnabled.notEqualsTo(true)), group: 'navigation' },
			]
		});
	}

	run(accessor: ServicesAccessor, coverageOrUri?: FileCoverage | URI): void {
		const testCoverageService = accessor.get(ITestCoverageService);
		const quickInputService = accessor.get(IQuickInputService);
		const activeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor();
		let coverage: FileCoverage | undefined;
		if (coverageOrUri instanceof FileCoverage) {
			coverage = coverageOrUri;
		} else if (isUriComponents(coverageOrUri)) {
			coverage = testCoverageService.selected.get()?.getUri(URI.from(coverageOrUri));
		} else {
			const uri = activeEditor?.getModel()?.uri;
			coverage = uri && testCoverageService.selected.get()?.getUri(uri);
		}

		if (!coverage || !(coverage.isForTest || coverage.perTestData?.size)) {
			return;
		}

		const options = coverage?.perTestData ?? coverage?.isForTest?.parent.perTestData;
		if (!options) {
			return;
		}

		const tests = [...options.values()];
		const commonPrefix = TestId.getLengthOfCommonPrefix(tests.length, i => tests[i].isForTest!.id);
		const result = coverage.fromResult;
		const previousSelection = testCoverageService.filterToTest.get();

		type TItem = { label: string; description?: string; item: FileCoverage | undefined };

		const items: QuickPickInput<TItem>[] = [
			{ label: coverUtils.labels.allTests, item: undefined },
			{ type: 'separator' },
			...tests.map(item => ({ label: coverUtils.getLabelForItem(result, item.isForTest!.id, commonPrefix), description: coverUtils.labels.percentCoverage(item.tpc), item })),
		];

		// These handle the behavior that reveals the start of coverage when the
		// user picks from the quickpick. Scroll position is restored if the user
		// exits without picking an item, or picks "all tets".
		const scrollTop = activeEditor?.getScrollTop() || 0;
		const revealScrollCts = new MutableDisposable<CancellationTokenSource>();

		quickInputService.pick(items, {
			activeItem: items.find((item): item is TItem => 'item' in item && item.item === coverage),
			placeHolder: coverUtils.labels.pickShowCoverage,
			onDidFocus: (entry) => {
				if (!entry.item) {
					revealScrollCts.clear();
					activeEditor?.setScrollTop(scrollTop);
					testCoverageService.filterToTest.set(undefined, undefined);
				} else {
					const cts = revealScrollCts.value = new CancellationTokenSource();
					entry.item.details(cts.token).then(
						details => {
							const first = details.find(d => d.type === DetailType.Statement);
							if (!cts.token.isCancellationRequested && first) {
								activeEditor?.revealLineNearTop(first.location instanceof Position ? first.location.lineNumber : first.location.startLineNumber);
							}
						},
						() => { /* ignored */ }
					);
					testCoverageService.filterToTest.set(entry.item.isForTest!.id, undefined);
				}
			},
		}).then(selected => {
			if (!selected) {
				activeEditor?.setScrollTop(scrollTop);
			}

			revealScrollCts.dispose();
			testCoverageService.filterToTest.set(selected ? selected.item?.isForTest!.id : previousSelection, undefined);
		});
	}
});

class ActionWithIcon extends Action {
	constructor(id: string, title: string, public readonly icon: ThemeIcon, enabled: boolean | undefined, run: () => void) {
		super(id, title, undefined, enabled, run);
	}
}

class CodiconActionViewItem extends ActionViewItem {

	public themeIcon?: ThemeIcon;

	protected override updateLabel(): void {
		if (this.options.label && this.label && this.themeIcon) {
			dom.reset(this.label, renderIcon(this.themeIcon), this.action.label);
		}
	}
}
