/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import htmlWorker = require('vs/languages/html/common/htmlWorker');
import htmlTags = require('vs/languages/html/common/htmlTags');

export function getRazorTagProvider() : htmlTags.IHTMLTagProvider {
	var customTags : { [tag:string]: string[]} = {
		a: ['asp-action', 'asp-controller', 'asp-fragment', 'asp-host', 'asp-protocol', 'asp-route'],
		div: ['asp-validation-summary'],
		form: ['asp-action', 'asp-controller', 'asp-anti-forgery'],
		input: ['asp-for', 'asp-format'],
		label: ['asp-for'],
		select: ['asp-for', 'asp-items'],
		span: ['asp-validation-for']
	};

	return {
		getId: () => 'razor',
		collectTags: (collector: (tag: string) => void) => {
			// no extra tags
		},
		collectAttributes: (tag: string, collector: (attribute: string, type: string) => void) => {
			if (tag) {
				var attributes = customTags[tag];
				if (attributes) {
					attributes.forEach(a => collector(a, null));
				}
			}
		},
		collectValues: (tag: string, attribute: string, collector: (value: string) => void) => {
			// no values
		}
	};
}

export class RAZORWorker extends htmlWorker.HTMLWorker {

	protected addCustomTagProviders(providers: htmlTags.IHTMLTagProvider[]): void {
		// don't call super and don't add the angular provider for now
		providers.push(getRazorTagProvider());
	}

}