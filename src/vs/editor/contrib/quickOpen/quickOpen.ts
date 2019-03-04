/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { DocumentSymbol, DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CancellationToken } from 'vs/base/common/cancellation';

export function getDocumentSymbols(model: ITextModel, flat: boolean, token: CancellationToken): Promise<DocumentSymbol[]> {

	let roots: DocumentSymbol[] = [];

	let promises = DocumentSymbolProviderRegistry.all(model).map(support => {

		return Promise.resolve(support.provideDocumentSymbols(model, token)).then(result => {
			if (Array.isArray(result)) {
				roots.push(...result);
			}
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return Promise.all(promises).then(() => {
		let flatEntries: DocumentSymbol[] = [];
		if (token.isCancellationRequested) {
			return flatEntries;
		}
		if (flat) {
			flatten(flatEntries, roots, '');
		} else {
			flatEntries = roots;
		}
		flatEntries.sort(compareEntriesUsingStart);
		return flatEntries;
	});
}

function compareEntriesUsingStart(a: DocumentSymbol, b: DocumentSymbol): number {
	return Range.compareRangesUsingStarts(a.range, b.range);
}

function flatten(bucket: DocumentSymbol[], entries: DocumentSymbol[], overrideContainerLabel: string): void {
	for (let entry of entries) {
		bucket.push({
			kind: entry.kind,
			name: entry.name,
			detail: entry.detail,
			containerName: entry.containerName || overrideContainerLabel,
			range: entry.range,
			selectionRange: entry.selectionRange,
			children: undefined, // we flatten it...
		});
		if (entry.children) {
			flatten(bucket, entry.children, entry.name);
		}
	}
}


registerLanguageCommand('_executeDocumentSymbolProvider', function (accessor, args) {
	const { resource } = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument('resource');
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}
	return getDocumentSymbols(model, false, CancellationToken.None);
});
