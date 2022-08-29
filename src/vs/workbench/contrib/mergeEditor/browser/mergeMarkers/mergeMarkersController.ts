/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { autorun, IObservable } from 'vs/base/common/observable';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel } from 'vs/editor/common/model';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import * as nls from 'vs/nls';

export const conflictMarkers = {
	start: '<<<<<<<',
	end: '>>>>>>>',
};

export class MergeMarkersController extends Disposable {
	private readonly viewZoneIds: string[] = [];
	private readonly disposableStore = new DisposableStore();

	public constructor(
		public readonly editor: ICodeEditor,
		public readonly mergeEditorViewModel: IObservable<MergeEditorViewModel | undefined>,
	) {
		super();

		this._register(editor.onDidChangeModelContent(e => {
			this.updateDecorations();
		}));

		this._register(editor.onDidChangeModel(e => {
			this.updateDecorations();
		}));

		this.updateDecorations();
	}

	private updateDecorations() {
		const model = this.editor.getModel();
		const blocks = model ? getBlocks(model, { blockToRemoveStartLinePrefix: conflictMarkers.start, blockToRemoveEndLinePrefix: conflictMarkers.end }) : { blocks: [] };

		this.editor.setHiddenAreas(blocks.blocks.map(b => b.lineRange.deltaEnd(-1).toRange()), this);
		this.editor.changeViewZones(c => {
			this.disposableStore.clear();
			for (const id of this.viewZoneIds) {
				c.removeZone(id);
			}
			this.viewZoneIds.length = 0;
			for (const b of blocks.blocks) {

				const startLine = model!.getLineContent(b.lineRange.startLineNumber).substring(0, 20);
				const endLine = model!.getLineContent(b.lineRange.endLineNumberExclusive - 1).substring(0, 20);

				const conflictingLinesCount = b.lineRange.lineCount - 2;

				const domNode = h('div', [
					h('div.conflict-zone-root', [
						h('pre', [startLine]),
						h('span.dots', ['...']),
						h('pre', [endLine]),
						h('span.text', [
							conflictingLinesCount === 1
								? nls.localize('conflictingLine', "1 Conflicting Line")
								: nls.localize('conflictingLines', "{0} Conflicting Lines", conflictingLinesCount)
						]),
					]),
				]).root;
				this.viewZoneIds.push(c.addZone({
					afterLineNumber: b.lineRange.endLineNumberExclusive - 1,
					domNode,
					heightInLines: 1.5,
				}));

				const updateWidth = () => {
					const layoutInfo = this.editor.getLayoutInfo();
					domNode.style.width = `${layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth}px`;
				};

				this.disposableStore.add(
					this.editor.onDidLayoutChange(() => {
						updateWidth();
					})
				);
				updateWidth();


				this.disposableStore.add(autorun('update classname', reader => {
					const vm = this.mergeEditorViewModel.read(reader);
					if (!vm) {
						return;
					}
					const activeRange = vm.activeModifiedBaseRange.read(reader);

					const classNames: string[] = [];
					classNames.push('conflict-zone');

					if (activeRange) {
						const activeRangeInResult = vm.model.getRangeInResult(activeRange.baseRange, reader);
						if (activeRangeInResult.intersects(b.lineRange)) {
							classNames.push('focused');
						}
					}

					domNode.className = classNames.join(' ');
				}));
			}
		});
	}
}


function getBlocks(document: ITextModel, configuration: ProjectionConfiguration): { blocks: Block[]; transformedContent: string } {
	const blocks: Block[] = [];
	const transformedContent: string[] = [];

	let inBlock = false;
	let startLineNumber = -1;
	let curLine = 0;

	for (const line of document.getLinesContent()) {
		curLine++;
		if (!inBlock) {
			if (line.startsWith(configuration.blockToRemoveStartLinePrefix)) {
				inBlock = true;
				startLineNumber = curLine;
			} else {
				transformedContent.push(line);
			}
		} else {
			if (line.startsWith(configuration.blockToRemoveEndLinePrefix)) {
				inBlock = false;
				blocks.push(new Block(new LineRange(startLineNumber, curLine - startLineNumber + 1)));
				transformedContent.push('');
			}
		}
	}

	return {
		blocks,
		transformedContent: transformedContent.join('\n')
	};
}

class Block {
	constructor(public readonly lineRange: LineRange) { }
}

interface ProjectionConfiguration {
	blockToRemoveStartLinePrefix: string;
	blockToRemoveEndLinePrefix: string;
}
