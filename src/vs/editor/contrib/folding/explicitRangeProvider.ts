/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { FoldingRegions } from 'vs/editor/contrib/folding/foldingRanges';
import { ITextModel } from 'vs/editor/common/model';
import { RangeProvider } from './folding';
import { CancellationToken } from 'vs/base/common/cancellation';
import { TPromise } from 'vs/base/common/winjs.base';
import { TFoldingExplicitMarkers, EDITOR_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { FoldingRangeKind } from 'vs/editor/common/modes';

export const ID_EXPLICIT_PROVIDER = 'explicit';

export class ExplicitRangeProvider implements RangeProvider {

	readonly id = ID_EXPLICIT_PROVIDER;

	private commentEnabled: boolean;
	private commentStart: RegExp;
	private commentEnd: RegExp;

	private regionEnabled: boolean;
	private regionStart: RegExp;
	private regionEnd: RegExp;

	constructor(private editorModel: ITextModel, configuration: TFoldingExplicitMarkers) {
		const foldingRules = LanguageConfigurationRegistry.getFoldingRules(this.editorModel.getLanguageIdentifier().id);

		if (typeof configuration === 'object' && typeof configuration.region === 'object') {
			this.regionEnabled = configuration.region.enabled;
			this.regionStart = configuration.region.start ? new RegExp(configuration.region.start)
				: foldingRules.markers.start ? foldingRules.markers.start
					: new RegExp((<{ region: { enabled: boolean, start: string, end: string } }>EDITOR_DEFAULTS.contribInfo.foldingExplicitMarkers).region.start)
				;
			this.regionEnd = configuration.region.end ? new RegExp(configuration.region.end)
				: foldingRules.markers.end ? foldingRules.markers.end
					: new RegExp((<{ region: { enabled: boolean, start: string, end: string } }>EDITOR_DEFAULTS.contribInfo.foldingExplicitMarkers).region.end)
				;
		} else {
			this.regionEnabled = true;
			this.regionStart = foldingRules.markers.start;
			this.regionEnd = foldingRules.markers.end;
		}

		const commentRules = LanguageConfigurationRegistry.getComments(this.editorModel.getLanguageIdentifier().id);

		if (typeof configuration === 'object' && typeof configuration.comment === 'object') {
			this.commentEnabled = configuration.comment.enabled;
			this.commentStart = new RegExp(
				configuration.comment.start ? configuration.comment.start
					: commentRules.blockCommentStartToken ? commentRules.blockCommentStartToken.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
						: (<{ comment: { enabled: boolean, start: string, end: string } }>EDITOR_DEFAULTS.contribInfo.foldingExplicitMarkers).comment.start
			);
			this.commentEnd = new RegExp(
				configuration.comment.end ? configuration.comment.end
					: commentRules.blockCommentEndToken ? commentRules.blockCommentEndToken.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
						: (<{ comment: { enabled: boolean, start: string, end: string } }>EDITOR_DEFAULTS.contribInfo.foldingExplicitMarkers).comment.end
			);
		} else {
			this.commentEnabled = true;
			this.commentStart = new RegExp(commentRules.blockCommentStartToken.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'));
			this.commentEnd = new RegExp(commentRules.blockCommentEndToken.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'));
		}
	}

	compute(cancelationToken: CancellationToken): Thenable<FoldingRegions> {
		return TPromise.as(this.computeRanges());
	}

	dispose() {
	}

	private computeRanges(): FoldingRegions {
		const startIndexes: Array<number> = [];
		const endIndexes: Array<number> = [];
		const types: Array<string> = [];

		const lineCount = this.editorModel.getLineCount();

		let i = 1;
		let line;
		while (i <= lineCount) {
			line = this.editorModel.getLineContent(i);
			if (this.commentEnabled && this.commentStart.test(line)) {
				i = this.computeCommentRange(lineCount, startIndexes, endIndexes, types, i);
			} else if (this.regionEnabled && this.regionStart.test(line)) {
				i = this.computeRegionRange(lineCount, startIndexes, endIndexes, types, i);
			} else {
				i++;
			}
		}

		const length = startIndexes.length;
		const startIndexesUINT32 = new Uint32Array(length);
		const endIndexesUINT32 = new Uint32Array(length);
		for (let i = 0; i < length; i++) {
			startIndexesUINT32[i] = startIndexes[i];
			endIndexesUINT32[i] = endIndexes[i];
		}

		return new FoldingRegions(startIndexesUINT32, endIndexesUINT32, types);
	}

	private computeCommentRange(lineCount, startIndexes, endIndexes, types, fromIndex) {
		let i = fromIndex + 1;
		let line;
		while (i <= lineCount) {
			line = this.editorModel.getLineContent(i);
			if (this.commentEnd.test(line)) {
				startIndexes.push(fromIndex);
				endIndexes.push(i);
				types.push(FoldingRangeKind.Comment);

				return i + 1;
			} else {
				i++;
			}
		}

		return i;
	}

	private computeRegionRange(lineCount, startIndexes, endIndexes, types, fromIndex) {
		let i = fromIndex + 1;
		let line;
		while (i <= lineCount) {
			line = this.editorModel.getLineContent(i);
			if (this.regionStart.test(line)) {
				i = this.computeRegionRange(lineCount, startIndexes, endIndexes, types, i);
			} else if (this.regionEnd.test(line)) {
				startIndexes.push(fromIndex);
				endIndexes.push(i);
				types.push(FoldingRangeKind.Region);

				return i + 1;
			} else if (this.commentEnabled && this.commentStart.test(line)) {
				i = this.computeCommentRange(lineCount, startIndexes, endIndexes, types, i);
			} else {
				i++;
			}
		}

		return i;
	}
}