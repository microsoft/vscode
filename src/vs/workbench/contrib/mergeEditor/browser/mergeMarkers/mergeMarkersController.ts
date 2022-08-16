/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel } from 'vs/editor/common/model';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';

export const conflictMarkers = {
	start: '<<<<<<<',
	end: '>>>>>>>',
};

export class MergeMarkersController extends Disposable {
	public static ID = 'editor.contrib.mergeConflictsController';

	private readonly viewZoneIds: string[] = [];

	public constructor(
		public readonly editor: ICodeEditor
	) {
		super();

		editor.onDidChangeModelContent(e => {
			this.updateDecorations(editor);
		});

		editor.onDidChangeModel(e => {
			this.updateDecorations(editor);
		});

		this.updateDecorations(editor);
	}

	private updateDecorations(editor: ICodeEditor) {
		const model = this.editor.getModel();
		const blocks = model ? getBlocks(model, { blockToRemoveStartLinePrefix: conflictMarkers.start, blockToRemoveEndLinePrefix: conflictMarkers.end }) : { blocks: [] };

		editor.setHiddenAreas(blocks.blocks.map(b => b.lineRange.deltaEnd(-1).toRange()), this);
		editor.changeViewZones(c => {
			for (const id of this.viewZoneIds) {
				c.removeZone(id);
			}
			this.viewZoneIds.length = 0;
			for (const b of blocks.blocks) {
				this.viewZoneIds.push(c.addZone({
					afterLineNumber: b.lineRange.endLineNumberExclusive - 1,
					domNode: h('div.conflict-zone', [
						h('div.conflict-zone-root', [h('div.conflict-zone-button', ['Conflict Marker'])]),
					]).root,
					heightInLines: 1,
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
