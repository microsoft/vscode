/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch, isFalsyOrEmpty } from 'vs/base/common/arrays';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as tokenTree from 'vs/editor/contrib/smartSelect/tokenTree';
import { CompletionItem, CompletionItemKind } from 'vs/editor/common/modes';


export abstract class WordDistance {

	static readonly None = new class extends WordDistance {
		distance() { return 0; }
	};

	static create(service: IEditorWorkerService, editor: ICodeEditor): Thenable<WordDistance> {

		if (!editor.getConfiguration().contribInfo.suggest.localityBonus) {
			return Promise.resolve(WordDistance.None);
		}

		if (!editor.hasModel()) {
			return Promise.resolve(WordDistance.None);
		}

		const model = editor.getModel();
		const position = editor.getPosition();

		if (!service.canComputeWordRanges(model.uri)) {
			return Promise.resolve(WordDistance.None);
		}

		// use token tree ranges
		let node = tokenTree.find(tokenTree.build(model), position);
		let ranges: Range[] = [];
		while (node) {
			if (!node.range.isEmpty()) {
				ranges.push(node.range);
			}
			if (node.end.lineNumber - node.start.lineNumber >= 100) {
				break;
			}
			node = node.parent;
		}
		ranges.reverse();

		if (ranges.length === 0) {
			return Promise.resolve(WordDistance.None);
		}

		return service.computeWordRanges(model.uri, ranges[0]).then(wordRanges => {

			return new class extends WordDistance {
				distance(anchor: IPosition, suggestion: CompletionItem) {
					if (!wordRanges || !position.equals(editor.getPosition())) {
						return 0;
					}
					if (suggestion.kind === CompletionItemKind.Keyword) {
						return 2 << 20;
					}
					let word = suggestion.label;
					let wordLines = wordRanges[word];
					if (isFalsyOrEmpty(wordLines)) {
						return 2 << 20;
					}
					let idx = binarySearch(wordLines, Range.fromPositions(anchor), Range.compareRangesUsingStarts);
					let bestWordRange = idx >= 0 ? wordLines[idx] : wordLines[Math.max(0, ~idx - 1)];
					let blockDistance = ranges.length;
					for (const range of ranges) {
						if (!Range.containsRange(range, bestWordRange)) {
							break;
						}
						blockDistance -= 1;
					}
					return blockDistance;
				}
			};
		});
	}

	abstract distance(anchor: IPosition, suggestion: CompletionItem): number;
}


