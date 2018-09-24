/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { binarySearch, isFalsyOrEmpty } from 'vs/base/common/arrays';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { find, build, Block } from 'vs/editor/contrib/smartSelect/tokenTree';


export abstract class WordDistance {

	static readonly None = new class extends WordDistance {
		distance() { return 0; }
	};

	static create(service: IEditorWorkerService, editor: ICodeEditor): Thenable<WordDistance> {

		if (!editor.getConfiguration().contribInfo.suggest.localityBonus) {
			return Promise.resolve(WordDistance.None);
		}

		const model = editor.getModel();
		const position = editor.getPosition();

		// use token tree ranges
		let node = find(build(model), position);
		let blockScores = new Map<number, number>();
		let score = 0;

		let stop = false;
		let lastRange: Range;
		while (node && !stop) {
			if (node instanceof Block || !node.parent) {
				// assign block score
				score += 1;
				if (!lastRange) {
					for (let line = node.start.lineNumber; line <= node.end.lineNumber; line++) {
						blockScores.set(line, score);
					}
				} else {
					for (let line = node.start.lineNumber; line < lastRange.startLineNumber; line++) {
						blockScores.set(line, score);
					}
					for (let line = lastRange.endLineNumber; line <= node.end.lineNumber; line++) {
						blockScores.set(line, score);
					}
				}
				lastRange = node.range;
				stop = node.end.lineNumber - node.start.lineNumber >= 100;
			}
			node = node.parent;
		}

		return service.computeWordLines(model.uri, lastRange).then(lineNumbers => {

			return new class extends WordDistance {
				distance(anchor: IPosition, word: string) {
					if (!lineNumbers || !position.equals(editor.getPosition())) {
						return 0;
					}
					let wordLines = lineNumbers[word];
					if (isFalsyOrEmpty(wordLines)) {
						return 101;
					}
					let idx = binarySearch(wordLines, anchor.lineNumber, (a, b) => a - b);
					let wordLineNumber = idx >= 0 ? wordLines[idx] : wordLines[Math.max(0, ~idx - 1)];
					if (!blockScores.has(wordLineNumber)) {
						return 101;
					}
					return blockScores.get(wordLineNumber);
				}
			};
		});
	}

	abstract distance(anchor: IPosition, word: string): number;
}


