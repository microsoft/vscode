/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { isDefined } from 'vs/base/common/types';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IModelDecorationOptions, ITextModel } from 'vs/editor/common/model';
import { HoverOperation, HoverStartMode, IHoverComputer } from 'vs/editor/contrib/hover/browser/hoverOperation';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { FileCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { ITestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { CoverageDetails, DetailType, IStatementCoverage } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';

const MAX_HOVERED_LINES = 30;
const CLASS_HIT = 'coverage-deco-hit';
const CLASS_MISS = 'coverage-deco-miss';
const TOGGLE_INLINE_COMMAND_TEXT = localize('testing.toggleInlineCoverage', 'Toggle Inline Coverage');
const TOGGLE_INLINE_COMMAND_ID = 'testing.toggleInlineCoverage';

export class CodeCoverageDecorations extends Disposable implements IEditorContribution {
	public static showInline = observableValue('inlineCoverage', false);

	private loadingCancellation?: CancellationTokenSource;
	private readonly displayedStore = this._register(new DisposableStore());
	private readonly hoveredStore = this._register(new DisposableStore());
	private readonly lineHoverWidget: Lazy<LineHoverWidget>;
	private decorationIds = new Map<string, {
		options: IModelDecorationOptions;
		hoverOptions: Partial<IModelDecorationOptions>;
	}>();
	private hoveredLineNumber?: number;
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

		const fileCoverage = derived(reader => {
			const report = coverage.selected.read(reader);
			if (!report) {
				return;
			}

			const model = modelObs.read(reader);
			if (!model) {
				return;
			}

			return report.getUri(model.uri);
		});

		this._register(autorun(reader => {
			const c = fileCoverage.read(reader);
			if (c) {
				this.apply(editor.getModel()!, c, CodeCoverageDecorations.showInline.read(reader));
			} else {
				this.clear();
			}
		}));

		this._register(editor.onMouseMove(e => {
			if (e.target.type === MouseTargetType.GUTTER_LINE_NUMBERS) {
				this.hoverLineNumber(editor.getModel()!, e.target.position.lineNumber);
			} else if (this.lineHoverWidget.hasValue && this.lineHoverWidget.value.getDomNode().contains(e.target.element)) {
				// don't dismiss the hover
			} else {
				this.hoveredStore.clear();
			}
		}));
	}

	private hoverLineNumber(model: ITextModel, lineNumber: number) {
		if (lineNumber === this.hoveredLineNumber) {
			return;
		}

		this.hoveredLineNumber = lineNumber;
		this.hoveredStore.clear();

		const todo = [{ line: lineNumber, dir: 0 }];
		const toEnable = new Set<string>();
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
				const { hoverOptions, options } = this.decorationIds.get(id)!;
				e.changeDecorationOptions(id, { ...options, ...hoverOptions });
			}
		});

		this.lineHoverWidget.value.startShowingAt(lineNumber, this.details!);

		this.hoveredStore.add(this.editor.onMouseLeave(() => {
			this.hoveredStore.clear();
		}));

		this.hoveredStore.add(toDisposable(() => {
			this.lineHoverWidget.value.hide();
			this.hoveredLineNumber = -1;

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
		const details = await this.loadDetails(coverage);
		if (!details) {
			return this.clear();
		}

		this.displayedStore.clear();
		const detailModel = this.details = new CoverageDetailsModel(details);

		model.changeDecorations(e => {
			for (const { metadata: detail, range } of detailModel.ranges) {
				if (detail.type === DetailType.Branch) {
					const hits = detail.detail.branches![detail.branch].count;
					const cls = hits ? CLASS_HIT : CLASS_MISS;
					const options: IModelDecorationOptions = {
						showIfCollapsed: false,
						description: 'coverage-gutter',
						lineNumberClassName: `coverage-deco-gutter ${cls}`,
					};

					const hoverOptions: Partial<IModelDecorationOptions> = { className: `coverage-deco-inline ${cls}` };
					if (showInlineByDefault) {
						Object.assign(options, hoverOptions);
					}

					this.decorationIds.set(e.addDecoration(range, options), { options, hoverOptions });
				} else if (detail.type === DetailType.Statement) {
					const cls = detail.count ? CLASS_HIT : CLASS_MISS;
					const options: IModelDecorationOptions = {
						showIfCollapsed: false,
						description: 'coverage-inline',
						lineNumberClassName: `coverage-deco-gutter ${cls}`,
					};

					const hoverOptions: Partial<IModelDecorationOptions> = { className: `coverage-deco-inline ${cls}` };
					if (showInlineByDefault) {
						Object.assign(options, hoverOptions);
					}

					this.decorationIds.set(e.addDecoration(range, options), { options, hoverOptions });
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

	private async loadDetails(coverage: FileCoverage) {
		const cts = this.loadingCancellation = new CancellationTokenSource();
		this.displayedStore.add(this.loadingCancellation);

		try {
			const details = await coverage.details(this.loadingCancellation.token);
			if (!cts.token.isCancellationRequested) {
				return details;
			}
		} catch (e) {
			this.log.error('Error loading coverage details', e);
		}

		return undefined;
	}
}

type CoverageDetailsWithBranch = CoverageDetails | { type: DetailType.Branch; branch: number; detail: IStatementCoverage };
type DetailRange = { range: Range; metadata: CoverageDetailsWithBranch };

export class CoverageDetailsModel {
	public ranges: DetailRange[] = [];

	constructor(public readonly details: CoverageDetails[]) {

		//#region decoration generation
		// Coverage from a provider can have a range that contains smaller ranges,
		// such as a function declarationt that has nested statements. In this we
		// make sequential, non-overlapping ranges for each detail for display in
		// the editor without ugly overlaps.
		const detailRanges: DetailRange[] = details.map(d => ({ range: tidyLocation(d.location), metadata: d }));

		for (const { range, metadata: detail } of detailRanges) {
			if (detail.type === DetailType.Statement && detail.branches) {
				for (let i = 0; i < detail.branches.length; i++) {
					detailRanges.push({
						range: tidyLocation(detail.branches[i].location || Range.fromPositions(range.getEndPosition())),
						metadata: { type: DetailType.Branch, branch: i, detail },
					});
				}
			}
		}

		detailRanges.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));

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
				const si = prev.range.setEndPosition(start.lineNumber, start.column);
				prev.range = prev.range.setStartPosition(item.range.endLineNumber, item.range.endColumn);
				result.push({ range: si, metadata: prev.metadata });
			}

			stack.push(item);
		}
		while (stack.length) {
			pop();
		}
		//#endregion
	}
}

// 'tidies' the range by normalizing it into a range and removing leading
// and trailing whitespace.
function tidyLocation(location: Range | Position): Range {
	if (location instanceof Position) {
		return Range.fromPositions(location);
	}

	return location;
}

class LineHoverComputer implements IHoverComputer<IMarkdownString> {
	public line = -1;
	public lineContents = '';
	public details!: CoverageDetailsModel;

	constructor(@IKeybindingService private readonly keybindingService: IKeybindingService) { }

	/** @inheritdoc */
	public computeSync(): IMarkdownString[] {
		const bestDetails: DetailRange[] = [];
		let bestLine = -1;
		for (const detail of this.details.ranges) {
			if (detail.range.startLineNumber > this.line) {
				break;
			}
			if (detail.range.endLineNumber < this.line) {
				continue;
			}
			if (detail.range.startLineNumber !== bestLine) {
				bestDetails.length = 0;
			}
			bestLine = detail.range.startLineNumber;
			bestDetails.push(detail);
		}

		const strs = bestDetails.map(({ range, metadata: detail }) => {
			if (detail.type === DetailType.Function) {
				return new MarkdownString().appendMarkdown(localize('coverage.fnExecutedCount', 'Function `{0}` was executed {1} time(s).', detail.name, detail.count));
			} else if (detail.type === DetailType.Statement) {
				const text = normalizeName(this.lineContents.slice(range.startColumn - 1, range.endLineNumber === range.startLineNumber ? range.endColumn + 1 : undefined) || `<empty statement>`);
				const str = new MarkdownString();
				if (detail.branches?.length) {
					const covered = detail.branches.filter(b => b.count > 0).length;
					str.appendMarkdown(localize('coverage.branches', '{0} of {1} of branches in `{2}` were covered.', covered, detail.branches.length, text));
				} else {
					str.appendMarkdown(localize('coverage.codeExecutedCount', '`{0}` was executed {1} time(s).', text, detail.count));
				}
				return str;
			} else {
				return undefined;
			}
		}).filter(isDefined);

		if (strs.length) {
			const s = new MarkdownString().appendMarkdown(`[${TOGGLE_INLINE_COMMAND_TEXT}](command:${TOGGLE_INLINE_COMMAND_ID})`);
			s.isTrusted = true;
			const binding = this.keybindingService.lookupKeybinding(TOGGLE_INLINE_COMMAND_ID);
			if (binding) {
				s.appendText(` (${binding.getLabel()})`);
			}
			strs.push(s);
		}

		return strs;
	}
}

function normalizeName(functionNameOrCode: string) {
	functionNameOrCode = functionNameOrCode.replace(/[\n\r`]/g, '');
	if (functionNameOrCode.length > 50) {
		functionNameOrCode = functionNameOrCode.slice(0, 40) + '...';
	}
	return functionNameOrCode;
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
	public startShowingAt(lineNumber: number, details: CoverageDetailsModel) {
		this.hide();
		this.computer.line = lineNumber;
		this.computer.lineContents = this.editor.getModel()?.getLineContent(lineNumber) || '';
		this.computer.details = details;
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
			title: { value: localize('coverage.toggleInline', "Toggle Inline Coverage"), original: 'Toggle Inline Coverage' },
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
