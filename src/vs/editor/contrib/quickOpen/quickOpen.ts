/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { DocumentSymbol } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { OutlineModel, OutlineElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { values } from 'vs/base/common/collections';

export async function getDocumentSymbols(document: ITextModel, flat: boolean, token: CancellationToken): Promise<DocumentSymbol[]> {

	const model = await OutlineModel.create(document, token);
	const roots: DocumentSymbol[] = [];
	for (const child of values(model.children)) {
		if (child instanceof OutlineElement) {
			roots.push(child.symbol);
		} else {
			roots.push(...values(child.children).map(child => child.symbol));
		}
	}

	let flatEntries: DocumentSymbol[] = [];
	if (token.isCancellationRequested) {
		return flatEntries;
	}
	if (flat) {
		flatten(flatEntries, roots, '');
	} else {
		flatEntries = roots;
	}

	return flatEntries.sort(compareEntriesUsingStart);
}

function compareEntriesUsingStart(a: DocumentSymbol, b: DocumentSymbol): number {
	return Range.compareRangesUsingStarts(a.range, b.range);
}

function flatten(bucket: DocumentSymbol[], entries: DocumentSymbol[], overrideContainerLabel: string): void {
	for (let entry of entries) {
		bucket.push({
			kind: entry.kind,
			tags: entry.tags,
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
	if (model) {
		return getDocumentSymbols(model, false, CancellationToken.None);
	}

	return accessor.get(ITextModelService).createModelReference(resource).then(reference => {
		return new Promise((resolve, reject) => {
			try {
				const result = getDocumentSymbols(reference.object.textEditorModel, false, CancellationToken.None);
				resolve(result);
			} catch (err) {
				reject(err);
			}
		}).finally(() => {
			reference.dispose();
		});
	});
});
