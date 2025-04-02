/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FontInfo } from '../config/fontInfo.js';
import { Position } from '../core/position.js';
import { ICustomFontChangeAccessor } from '../viewModel.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { FontDecoration, LineFontSegment } from '../textModelEvents.js';
import { FontSegmentTree, IFontSegmentTreeContext } from './fontSegmentTree.js';


export class CustomFontsManager extends Disposable {

	private readonly lineNumberToFontSegmentTree: Map<number, FontSegmentTree> = new Map();
	private readonly decorationIdToCustomFont: Map<string, FontDecoration> = new Map();

	constructor(private readonly defaultFontInfo: FontInfo) { super(); }

	public changeFonts(callback: (accessor: ICustomFontChangeAccessor) => void): void {
		const accessor: ICustomFontChangeAccessor = {
			insertOrChangeCustomFont: (decorationId: string, fontDecoration: FontDecoration): void => {
				this.insertOrChangeCustomFont(decorationId, fontDecoration);
			},
			removeCustomFonts: (decorationId: string): void => {
				this.removeCustomFont(decorationId);
			}
		};
		callback(accessor);
	}

	private insertOrChangeCustomFont(decorationId: string, fontDecoration: FontDecoration): void {
		this.removeCustomFont(decorationId);
		this.decorationIdToCustomFont.set(decorationId, fontDecoration);
		let tree = this.lineNumberToFontSegmentTree.get(fontDecoration.lineNumber);
		if (!tree) {
			const context: IFontSegmentTreeContext = {
				fontDecorationForId: (decorationId: string): FontDecoration | undefined => {
					return this.decorationIdToCustomFont.get(decorationId);
				}
			};
			tree = new FontSegmentTree(context, this.defaultFontInfo);
			this.lineNumberToFontSegmentTree.set(fontDecoration.lineNumber, tree);
		}
		tree.insert(decorationId, fontDecoration);
	}

	private removeCustomFont(decorationId: string): void {
		const font = this.decorationIdToCustomFont.get(decorationId);
		if (!font) {
			return;
		}
		const tree = this.lineNumberToFontSegmentTree.get(font.lineNumber);
		if (!tree) {
			this.decorationIdToCustomFont.delete(decorationId);
			return;
		}
		tree.remove(decorationId, font);
		this.decorationIdToCustomFont.delete(decorationId);

	}

	public getFontsOnLine(lineNumber: number): LineFontSegment[] {
		return this.lineNumberToFontSegmentTree.get(lineNumber)?.getSegments() ?? [];
	}

	public getFontForPosition(position: Position): FontInfo {
		return this.lineNumberToFontSegmentTree.get(position.lineNumber)?.getFontAtColumn(position.column) ?? this.defaultFontInfo;
	}

	public hasFontDecorations(lineNumber: number): boolean {
		const tree = this.lineNumberToFontSegmentTree.get(lineNumber);
		if (!tree) {
			return false;
		}
		return tree.getSegments().length > 0;
	}
}
