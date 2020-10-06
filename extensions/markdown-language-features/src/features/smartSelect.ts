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
	public async provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[], _token: vscode.CancellationToken): Promise<vscode.SelectionRange[]> {
		let blockRegions = await Promise.all([
			await this.getBlockSelectionRanges(document, positions)
		]);
		return flatten(blockRegions);
	}

	private async getBlockSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]): Promise<vscode.SelectionRange[]> {
		let position = positions[0];
		const tokens = await this.engine.parse(document);
		let nearbyTokens = tokens.filter(token => token.map && (token.map[0] <= position.line && token.map[1] >= position.line));
		let poss = nearbyTokens.map(token => {
			let start = token.map[0];
			let end = token.map[1];
			let startPos = new vscode.Position(start, 0);
			let endPos = new vscode.Position(end, 0);
			return new vscode.SelectionRange(new vscode.Range(startPos, endPos));
		});
		return poss;
	}
}
