/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, observableFromEvent } from 'vs/base/common/observable';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationOptions, ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { ILogService } from 'vs/platform/log/common/log';
import { FileCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { ITestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { CoverageDetails, DetailType, IStatementCoverage } from 'vs/workbench/contrib/testing/common/testTypes';

const GLYPH_LANE = GlyphMarginLane.Left;
const MAX_HOVERED_LINES = 30;
const CLASS_HIT = 'coverage-deco-hit';
const CLASS_MISS = 'coverage-deco-miss';

export class CodeCoverageDecorations extends Disposable implements IEditorContribution {
	private loadingCancellation?: CancellationTokenSource;
	private readonly displayedStore = this._register(new DisposableStore());
	private readonly hoveredStore = this._register(new DisposableStore());
	private decorationIds = new Map<string, {
		options: IModelDecorationOptions;
		hoverOptions: Partial<IModelDecorationOptions>;
	}>();
	private hoveredLineNumber?: number;

	constructor(
		private readonly editor: ICodeEditor,
		@ITestCoverageService coverage: ITestCoverageService,
		@ILogService private readonly log: ILogService,
	) {
		super();

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
				this.apply(editor.getModel()!, c);
			} else {
				this.clear();
			}
		}));

		this._register(editor.onMouseMove(e => {
			if (e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN
				&& e.target.detail.glyphMarginLane === GLYPH_LANE) {
				this.hoverLineNumber(editor.getModel()!, e.target.position.lineNumber);
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

		this.hoveredStore.add(this.editor.onMouseLeave(e => {
			this.hoveredStore.clear();
		}));

		this.hoveredStore.add(toDisposable(() => {
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

	private async apply(model: ITextModel, coverage: FileCoverage) {
		const details = await this.loadDetails(coverage);
		if (!details) {
			return this.clear();
		}

		const detailModel = new CoverageDetailsModel(details);

		model.changeDecorations(e => {
			for (const { metadata: detail, range } of detailModel.ranges) {
				if (detail.type === DetailType.Branch) {
					const hits = detail.detail.branches![detail.branch].count;
					const cls = hits ? CLASS_HIT : CLASS_MISS;
					const opts: IModelDecorationOptions = {
						showIfCollapsed: false,
						description: 'coverage-gutter',
						glyphMargin: { position: GlyphMarginLane.Left, persistLane: true },
						glyphMarginHoverMessage: new MarkdownString()
							.appendCodeblock(model.getLanguageId(), model.getValueInRange(range))
							.appendText(localize('testing.branchHitCount', 'Branch hit count: {0}', hits)),
						glyphMarginClassName: `coverage-deco-gutter ${cls}`,
					};

					this.decorationIds.set(e.addDecoration(range, opts), {
						options: opts,
						hoverOptions: {
							className: `coverage-deco-inline ${cls}`,
						}
					});
				} else if (detail.type === DetailType.Statement) {
					const cls = detail.count ? CLASS_HIT : CLASS_MISS;
					const opts: IModelDecorationOptions = {
						showIfCollapsed: false,
						description: 'coverage-inline',
						glyphMargin: { position: GlyphMarginLane.Left, persistLane: true },
						glyphMarginHoverMessage: new MarkdownString()
							.appendCodeblock(model.getLanguageId(), model.getValueInRange(range))
							.appendText(localize('testing.hitCount', 'Hit count: {0}', detail.count)),
						glyphMarginClassName: `coverage-deco-gutter ${cls}`,
					};

					this.decorationIds.set(e.addDecoration(range, opts), {
						options: opts,
						hoverOptions: {
							className: `coverage-deco-inline ${cls}`,
						}
					});
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
