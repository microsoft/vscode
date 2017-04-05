/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedExternalError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { IReadOnlyModel, IRange } from 'vs/editor/common/editorCommon';
import { ILink, LinkProvider, LinkProviderRegistry } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IModelService } from 'vs/editor/common/services/modelService';

export class Link implements ILink {

	private _link: ILink;
	private _provider: LinkProvider;

	constructor(link: ILink, provider: LinkProvider) {
		this._link = link;
		this._provider = provider;
	}

	get range(): IRange {
		return this._link.range;
	}

	get url(): string {
		return this._link.url;
	}

	resolve(): TPromise<URI> {
		if (this._link.url) {
			try {
				return TPromise.as(URI.parse(this._link.url));
			} catch (e) {
				return TPromise.wrapError('invalid');
			}
		}

		if (typeof this._provider.resolveLink === 'function') {
			return asWinJsPromise(token => this._provider.resolveLink(this._link, token)).then(value => {
				this._link = value || this._link;
				if (this._link.url) {
					// recurse
					return this.resolve();
				}

				return TPromise.wrapError('missing');
			});
		}

		return TPromise.wrapError('missing');
	}
}

export function getLinks(model: IReadOnlyModel): TPromise<Link[]> {

	let links: Link[] = [];

	// ask all providers for links in parallel
	const promises = LinkProviderRegistry.ordered(model).reverse().map(provider => {
		return asWinJsPromise(token => provider.provideLinks(model, token)).then(result => {
			if (Array.isArray(result)) {
				const newLinks = result.map(link => new Link(link, provider));
				links = union(links, newLinks);
			}
		}, onUnexpectedExternalError);
	});

	return TPromise.join(promises).then(() => {
		return links;
	});
}

function union(oldLinks: Link[], newLinks: Link[]): Link[] {
	// reunite oldLinks with newLinks and remove duplicates
	var result: Link[] = [],
		oldIndex: number,
		oldLen: number,
		newIndex: number,
		newLen: number,
		oldLink: Link,
		newLink: Link,
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
		return undefined;
	}

	const model = accessor.get(IModelService).getModel(uri);
	if (!model) {
		return undefined;
	}

	return getLinks(model);
});