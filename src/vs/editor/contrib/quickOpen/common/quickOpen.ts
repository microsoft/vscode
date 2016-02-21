/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {illegalArgument, onUnexpectedError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import {IModel} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IOutlineEntry, IOutlineSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {IModelService} from 'vs/editor/common/services/modelService';

const OutlineRegistry = new LanguageFeatureRegistry<IOutlineSupport>('outlineSupport');

export {
	OutlineRegistry,
	IOutlineEntry,
	IOutlineSupport
}

export interface IOutline {
	entries: IOutlineEntry[];
	outlineGroupLabel: { [n: string]: string; };
}

export function getOutlineEntries(model: IModel): TPromise<IOutline> {

	let groupLabels: { [n: string]: string } = Object.create(null);
	let entries: IOutlineEntry[] = [];

	let promises = OutlineRegistry.all(model).map(support => {

		if (support.outlineGroupLabel) {
			for (var key in support.outlineGroupLabel) {
				if (Object.prototype.hasOwnProperty.call(support.outlineGroupLabel, key)) {
					groupLabels[key] = support.outlineGroupLabel[key];
				}
			}
		}

		return support.getOutline(model.getAssociatedResource()).then(result => {
			if (Array.isArray(result)) {
				entries.push(...result);
			}
		}, err => {
			onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(() => {
		let flatEntries: IOutlineEntry[] = [];
		flatten(flatEntries, entries, '');
		flatEntries.sort(compareEntriesUsingStart);

		return {
			entries: flatEntries,
			outlineGroupLabel: groupLabels
		};
	});
}

function compareEntriesUsingStart(a: IOutlineEntry, b: IOutlineEntry): number{
	return Range.compareRangesUsingStarts(a.range, b.range);
}

function flatten(bucket: IOutlineEntry[], entries: IOutlineEntry[], overrideContainerLabel: string): void {
	for (let entry of entries) {
		bucket.push({
			type: entry.type,
			range: entry.range,
			label: entry.label,
			icon: entry.icon,
			containerLabel: entry.containerLabel || overrideContainerLabel
		});
		if (entry.children) {
			flatten(bucket, entry.children, entry.label);
		}
	}
}


CommonEditorRegistry.registerLanguageCommand('_executeDocumentSymbolProvider', function(accessor, args) {
	const {resource} = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument('resource');
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}
	return getOutlineEntries(model);
});