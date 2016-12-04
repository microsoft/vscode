/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { IModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { SymbolInformation, DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { asWinJsPromise } from 'vs/base/common/async';

export interface IOutline {
	entries: SymbolInformation[];
}

export function getDocumentSymbols(model: IModel): TPromise<IOutline> {

	let entries: SymbolInformation[] = [];

	let promises = DocumentSymbolProviderRegistry.all(model).map(support => {

		return asWinJsPromise((token) => {
			return support.provideDocumentSymbols(model, token);
		}).then(result => {
			if (Array.isArray(result)) {
				entries.push(...result);
			}
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(() => {
		let flatEntries: SymbolInformation[] = [];
		flatten(flatEntries, entries, '');
		flatEntries.sort(compareEntriesUsingStart);

		return {
			entries: flatEntries,
		};
	});
}

function compareEntriesUsingStart(a: SymbolInformation, b: SymbolInformation): number {
	return Range.compareRangesUsingStarts(Range.lift(a.location.range), Range.lift(b.location.range));
}

function flatten(bucket: SymbolInformation[], entries: SymbolInformation[], overrideContainerLabel: string): void {
	for (let entry of entries) {
		bucket.push({
			kind: entry.kind,
			location: entry.location,
			name: entry.name,
			containerName: entry.containerName || overrideContainerLabel
		});
	}
}


CommonEditorRegistry.registerLanguageCommand('_executeDocumentSymbolProvider', function (accessor, args) {
	const {resource} = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument('resource');
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}
	return getDocumentSymbols(model);
});