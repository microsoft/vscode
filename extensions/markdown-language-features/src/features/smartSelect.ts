/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { flatten } from '../util/arrays';

export default class MarkdownSmartSelect implements vscode.SelectionRangeProvider {

	constructor(
		private readonly engine: MarkdownEngine
	) { }
	public async provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[], token: vscode.CancellationToken): Promise<vscode.SelectionRange[]> {
		let blockRegions = await Promise.all([
			await this.getBlockSelectionRanges(document, positions)
		]);
		return flatten(blockRegions);
	}

	private async getBlockSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]): Promise<vscode.SelectionRange[]> {
		let position = positions[0];
		const tokens = await this.engine.parse(document);
		let tokes = tokens.filter(token => token.map && (token.meta || token.content));
		let poss = tokes.map(token => {
			const start = token.map[0];
			let startPos = new vscode.Position(position.line, start);
			let endPos = new vscode.Position(getEndLine(token.meta ? token.meta : token.content), getEndPos(token.meta ? token.meta : token.content));
			return new vscode.SelectionRange(new vscode.Range(startPos, endPos));
		});
		return poss;
	}
}

let getEndLine = (meta: string) => {
	let numLines = 0;
	for (let i = 0; i < meta.length; i++) {
		if (meta[i] === '\n') {
			numLines++;
		}
	}
	return numLines;
};

let getEndPos = (meta: string) => {
	let maxLineLength = 0;
	let currMax = 0;
	for (let i = 0; i < meta.length; i++) {
		if (meta[i] === '\n') {
			currMax = 0;
		} else {
			currMax++;
			if (currMax > maxLineLength) {
				maxLineLength = currMax;
			}
		}
	}
	return maxLineLength;
};
