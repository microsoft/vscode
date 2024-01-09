/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived, observableFromEvent } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { ILogService } from 'vs/platform/log/common/log';
import { FileCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { ITestCoverageService } from 'vs/workbench/contrib/testing/common/testCoverageService';
import { DetailType } from 'vs/workbench/contrib/testing/common/testTypes';

export class CodeCoverageDecorations extends Disposable implements IEditorContribution {
	private loadingCancellation?: CancellationTokenSource;
	private readonly displayedStore = this._register(new DisposableStore());

	constructor(
		editor: ICodeEditor,
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
	}

	private async apply(model: ITextModel, coverage: FileCoverage) {
		const details = await this.loadDetails(coverage);
		if (!details) {
			return this.clear();
		}

		const decorations: string[] = [];
		model.changeDecorations(e => {
			for (const detail of details) {
				const range = detail.location instanceof Range ? detail.location : Range.fromPositions(detail.location);
				if (detail.type === DetailType.Statement) {
					const cls = detail.count > 0 ? 'coverage-deco-hit' : 'coverage-deco-miss';
					decorations.push(e.addDecoration(range, {
						showIfCollapsed: false,
						glyphMargin: { position: GlyphMarginLane.Left, persistLane: true },
						description: localize('testing.hitCount', 'Hit count: {0}', detail.count),
						glyphMarginClassName: `coverage-deco-gutter ${cls}`,
						className: `coverage-deco-inline ${cls}`,
					}));

					if (detail.branches) {
						for (const branch of detail.branches) {
							const location = branch.location || range.getEndPosition();
							const branchRange = location instanceof Range ? location : Range.fromPositions(location);
							decorations.push(e.addDecoration(branchRange, {
								showIfCollapsed: false,
								glyphMargin: { position: GlyphMarginLane.Left, persistLane: true },
								description: localize('testing.hitCount', 'Hit count: {0}', detail.count),
								glyphMarginClassName: `coverage-deco-gutter ${cls}`,
								className: `coverage-deco-inline ${cls}`,
							}));
						}
					}
				}
			}
		});

		this.displayedStore.add(toDisposable(() => {
			model.changeDecorations(e => {
				for (const decoration of decorations) {
					e.removeDecoration(decoration);
				}
			});
		}));
	}

	private clear() {
		this.loadingCancellation?.cancel();
		this.loadingCancellation = undefined;
		this.displayedStore.clear();
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
