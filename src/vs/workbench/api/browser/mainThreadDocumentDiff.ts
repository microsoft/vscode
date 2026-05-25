/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from '../../../editor/common/core/range.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IEditorWorkerService } from '../../../editor/common/services/editorWorker.js';
import { IDocumentDiffLineChangeDto, IDocumentDiffResultDto, MainContext, MainThreadDocumentDiffShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';

@extHostNamedCustomer(MainContext.MainThreadDocumentDiff)
export class MainThreadDocumentDiff implements MainThreadDocumentDiffShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
	}

	async $computeDocumentDiff(originalUri: UriComponents, modifiedUri: UriComponents, ignoreTrimWhitespace: boolean, maxComputationTimeMs: number, computeMoves: boolean): Promise<IDocumentDiffResultDto | null> {
		const original = URI.revive(originalUri);
		const modified = URI.revive(modifiedUri);
		const result = await this._editorWorkerService.computeDiff(original, modified, {
			ignoreTrimWhitespace,
			maxComputationTimeMs,
			computeMoves,
		}, 'advanced');
		if (!result) {
			return null;
		}
		const toLineRange = (r: { startLineNumber: number; endLineNumberExclusive: number }): IRange => ({
			startLineNumber: r.startLineNumber,
			startColumn: 1,
			endLineNumber: r.endLineNumberExclusive,
			endColumn: 1,
		});

		const mapChange = (c: typeof result.changes[0]): IDocumentDiffLineChangeDto => ({
			originalRange: toLineRange(c.original),
			modifiedRange: toLineRange(c.modified),
			innerChanges: c.innerChanges?.map(ic => ({
				originalRange: ic.originalRange,
				modifiedRange: ic.modifiedRange,
			})),
		});

		return {
			identical: result.identical,
			quitEarly: result.quitEarly,
			changes: result.changes.map(mapChange),
			moves: result.moves.map(m => ({
				originalRange: toLineRange(m.lineRangeMapping.original),
				modifiedRange: toLineRange(m.lineRangeMapping.modified),
				changes: m.changes.map(mapChange),
			})),
		};
	}

	dispose(): void {
		// nothing to dispose
	}
}
