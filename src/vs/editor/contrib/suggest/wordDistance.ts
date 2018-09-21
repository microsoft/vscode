/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { binarySearch } from 'vs/base/common/arrays';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IPosition } from 'vs/editor/common/core/position';


export abstract class WordDistance {

	static create(service: IEditorWorkerService, editor: ICodeEditor): Thenable<WordDistance> {

		const model = editor.getModel();
		const position = editor.getPosition();

		return service.getWordRanges(model.uri, position).then(data => {

			return new class extends WordDistance {
				distance(anchor: IPosition, word: string) {
					if (!data || !position.equals(editor.getPosition())) {
						return 0;
					}

					let lineNumbers = new Map<string, number[]>();
					if (!lineNumbers.has(word)) {
						let wordLineNumbers: number[];
						let ranges = data[word];
						if (ranges) {
							wordLineNumbers = ranges.map(range => range.startLineNumber);
							wordLineNumbers = wordLineNumbers.sort();
						}
						lineNumbers.set(word, wordLineNumbers);
						delete data[word];
					}

					let offset = lineNumbers.get(word);
					if (!offset) {
						return Number.MAX_VALUE;
					}

					let idx = binarySearch(offset, anchor.lineNumber, (a, b) => a - b);
					if (idx >= 0) {
						return 0;
					} else {
						idx = ~idx;
						idx %= offset.length;
						return Math.abs(offset[idx] - anchor.lineNumber);
					}
				}
			};
		});
	}

	abstract distance(anchor: IPosition, word: string): number;
}


