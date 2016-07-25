/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import {IReadOnlyModel} from 'vs/editor/common/editorCommon';
import {ILink, LinkProviderRegistry} from 'vs/editor/common/modes';
import {asWinJsPromise} from 'vs/base/common/async';
import {CommandsRegistry} from 'vs/platform/commands/common/commands';
import {IModelService} from 'vs/editor/common/services/modelService';

export function getLinks(model: IReadOnlyModel): TPromise<ILink[]> {

	let links: ILink[] = [];

	// ask all providers for links in parallel
	const promises = LinkProviderRegistry.ordered(model).reverse().map(support => {
		return asWinJsPromise(token => support.provideLinks(model, token)).then(result => {
			if (Array.isArray(result)) {
				links = union(links, result);
			}
		}, onUnexpectedError);
	});

	return TPromise.join(promises).then(() => {
		return links;
	});
}

function union(oldLinks: ILink[], newLinks: ILink[]): ILink[] {
	// reunite oldLinks with newLinks and remove duplicates
	var result: ILink[] = [],
		oldIndex: number,
		oldLen: number,
		newIndex: number,
		newLen: number,
		oldLink: ILink,
		newLink: ILink,
		comparisonResult: number;

	for (oldIndex = 0, newIndex = 0, oldLen = oldLinks.length, newLen = newLinks.length; oldIndex < oldLen && newIndex < newLen;) {
		oldLink = oldLinks[oldIndex];
		newLink = newLinks[newIndex];

		if (Range.areIntersectingOrTouching(oldLink.range, newLink.range)) {
			// Remove the oldLink
			oldIndex++;
			continue;
		}

		comparisonResult = Range.compareRangesUsingStarts(oldLink.range, newLink.range);

		if (comparisonResult < 0) {
			// oldLink is before
			result.push(oldLink);
			oldIndex++;
		} else {
			// newLink is before
			result.push(newLink);
			newIndex++;
		}
	}

	for (; oldIndex < oldLen; oldIndex++) {
		result.push(oldLinks[oldIndex]);
	}
	for (; newIndex < newLen; newIndex++) {
		result.push(newLinks[newIndex]);
	}

	return result;
}

CommandsRegistry.registerCommand('_executeLinkProvider', (accessor, ...args) => {

	const [uri] = args;
	if (!(uri instanceof URI)) {
		return;
	}

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return;
	}

	return getLinks(model);
});