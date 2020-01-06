/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';
import { URI } from 'vs/base/common/uri';
import { basename } from 'vs/base/common/resources';

export interface NotebookSelector {
	readonly filenamePattern?: string;
}

export class NotebookProviderInfo {

	public readonly id: string;
	public readonly displayName: string;
	public readonly selector: readonly NotebookSelector[];

	constructor(descriptor: {
		readonly id: string;
		readonly displayName: string;
		readonly selector: readonly NotebookSelector[];
	}) {
		this.id = descriptor.id;
		this.displayName = descriptor.displayName;
		this.selector = descriptor.selector;
	}

	matches(resource: URI): boolean {
		return this.selector.some(selector => NotebookProviderInfo.selectorMatches(selector, resource));
	}

	static selectorMatches(selector: NotebookSelector, resource: URI): boolean {
		if (selector.filenamePattern) {
			if (glob.match(selector.filenamePattern.toLowerCase(), basename(resource).toLowerCase())) {
				return true;
			}
		}
		return false;
	}
}
