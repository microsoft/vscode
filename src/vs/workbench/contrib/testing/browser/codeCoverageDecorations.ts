/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { mapFindFirst } from 'vs/base/common/arraysFind';
import { assertNever } from 'vs/base/common/assert';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, ITextModel, InjectedTextCursorStops, InjectedTextOptions } from 'vs/editor/common/model';
import { HoverOperation, HoverStartMode, IHoverComputer } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { testingCoverageMissingBranch } from 'vs/workbench/contrib/testing/browser/icons';
import { FileCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { ITestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { CoverageDetails, DetailType, IDeclarationCoverage, IStatementCoverage } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';

const MAX_HOVERED_LINES = 30;
const CLASS_HIT = 'coverage-deco-hit';
const CLASS_MISS = 'coverage-deco-miss';
const TOGGLE_INLINE_COMMAND_TEXT = localize('testing.toggleInlineCoverage', 'Toggle Inline Coverage');
const TOGGLE_INLINE_COMMAND_ID = 'testing.toggleInlineCoverage';
const BRANCH_MISS_INDICATOR_CHARS = 4;

export class CodeCoverageDecorations extends Disposable implements IEditorContribution {
	public static showInline = observableValue('inlineCoverage', false);
	private static readonly fileCoverageDecorations = new WeakMap<FileCoverage, CoverageDetailsModel>();

	private loadingCancellation?: CancellationTokenSource;
	private readonly displayedStore = this._register(new DisposableStore());
	private readonly hoveredStore = this._register(new DisposableStore());
	private readonly lineHoverWidget: Lazy<LineHoverWidget>;
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
		@ILogService private readonly log: ILogService,
	) {
		super();

		this.lineHoverWidget = new Lazy(() => this._register(instantiationService.createInstance(LineHoverWidget, this.editor)));

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

			const file = report.getUri(model.uri);
			if (file) {
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
			} else if (this.lineHoverWidget.hasValue && this.lineHoverWidget.value.getDomNode().contains(e.target.element)) {
				// don't dismiss the hover
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
		const inlineEnabled = CodeCoverageDecorations.showInline.get();
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

		if (toEnable.size || inlineEnabled) {
			this.lineHoverWidget.value.startShowingAt(lineNumber);
		}

		this.hoveredStore.add(this.editor.onMouseLeave(() => {
			this.hoveredStore.clear();
		}));

		this.hoveredStore.add(toDisposable(() => {
			this.lineHoverWidget.value.hide();
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

class LineHoverComputer implements IHoverComputer<IMarkdownString> {
	public line = -1;

	constructor(@IKeybindingService private readonly keybindingService: IKeybindingService) { }

	/** @inheritdoc */
	public computeSync(): IMarkdownString[] {
		const strs: IMarkdownString[] = [];

		const s = new MarkdownString().appendMarkdown(`[${TOGGLE_INLINE_COMMAND_TEXT}](command:${TOGGLE_INLINE_COMMAND_ID})`);
		s.isTrusted = true;
		const binding = this.keybindingService.lookupKeybinding(TOGGLE_INLINE_COMMAND_ID);
		if (binding) {
			s.appendText(` (${binding.getLabel()})`);
		}
		strs.push(s);

		return strs;
	}
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

class LineHoverWidget extends Disposable implements IOverlayWidget {
	public static readonly ID = 'editor.contrib.testingCoverageLineHoverWidget';

	private readonly computer: LineHoverComputer;
	private readonly hoverOperation: HoverOperation<IMarkdownString>;
	private readonly hover = this._register(new HoverWidget());
	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly markdownRenderer: MarkdownRenderer;

	constructor(private readonly editor: ICodeEditor, @IInstantiationService instantiationService: IInstantiationService) {
		super();
		this.computer = instantiationService.createInstance(LineHoverComputer);
		this.markdownRenderer = this._register(instantiationService.createInstance(MarkdownRenderer, { editor: this.editor }));
		this.hoverOperation = this._register(new HoverOperation(this.editor, this.computer));
		this.hover.containerDomNode.classList.add('hidden');
		this.hoverOperation.onResult(result => {
			if (result.value.length) {
				this.render(result.value);
			} else {
				this.hide();
			}
		});
		this.editor.addOverlayWidget(this);
	}

	/** @inheritdoc */
	getId(): string {
		return LineHoverWidget.ID;
	}

	/** @inheritdoc */
	public getDomNode(): HTMLElement {
		return this.hover.containerDomNode;
	}

	/** @inheritdoc */
	public getPosition(): IOverlayWidgetPosition | null {
		return null;
	}

	/** @inheritdoc */
	public override dispose(): void {
		this.editor.removeOverlayWidget(this);
		super.dispose();
	}

	/** Shows the hover widget at the given line */
	public startShowingAt(lineNumber: number) {
		this.hide();
		const textModel = this.editor.getModel();
		if (!textModel) {
			return;
		}

		this.computer.line = lineNumber;
		this.hoverOperation.start(HoverStartMode.Delayed);
	}

	/** Hides the hover widget */
	public hide() {
		this.hoverOperation.cancel();
		this.hover.containerDomNode.classList.add('hidden');
	}

	private render(elements: IMarkdownString[]) {
		const { hover: h, editor: editor } = this;
		const fragment = document.createDocumentFragment();

		for (const msg of elements) {
			const markdownHoverElement = dom.$('div.hover-row.markdown-hover');
			const hoverContentsElement = dom.append(markdownHoverElement, dom.$('div.hover-contents'));
			const renderedContents = this.renderDisposables.add(this.markdownRenderer.render(msg));
			hoverContentsElement.appendChild(renderedContents.element);
			fragment.appendChild(markdownHoverElement);
		}

		dom.clearNode(h.contentsDomNode);
		h.contentsDomNode.appendChild(fragment);

		h.containerDomNode.classList.remove('hidden');
		const editorLayout = editor.getLayoutInfo();
		const topForLineNumber = editor.getTopForLineNumber(this.computer.line);
		const editorScrollTop = editor.getScrollTop();
		const lineHeight = editor.getOption(EditorOption.lineHeight);
		const nodeHeight = h.containerDomNode.clientHeight;
		const top = topForLineNumber - editorScrollTop - ((nodeHeight - lineHeight) / 2);
		const left = editorLayout.lineNumbersLeft + editorLayout.lineNumbersWidth;
		h.containerDomNode.style.left = `${left}px`;
		h.containerDomNode.style.top = `${Math.max(Math.round(top), 0)}px`;
	}
}

registerAction2(class ToggleInlineCoverage extends Action2 {
	constructor() {
		super({
			id: TOGGLE_INLINE_COMMAND_ID,
			title: localize2('coverage.toggleInline', "Toggle Inline Coverage"),
			category: Categories.Test,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.Semicolon, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI),
			},
			precondition: TestingContextKeys.isTestCoverageOpen,
		});
	}

	public run() {
		CodeCoverageDecorations.showInline.set(!CodeCoverageDecorations.showInline.get(), undefined);
	}
});
