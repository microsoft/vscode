/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import { DEBUG_SCHEME } from 'vs/workbench/parts/debug/common/debug';

export class Source {

	public uri: uri;

	private static INTERNAL_URI_PREFIX = `${DEBUG_SCHEME}://internal/`;

	constructor(public raw: DebugProtocol.Source, public deemphasize: boolean) {
		const path = raw.path || raw.name;
		this.uri = raw.sourceReference > 0 ? uri.parse(Source.INTERNAL_URI_PREFIX + raw.sourceReference + '/' + path) : uri.file(path);
	}

	public get name() {
		return this.raw.name;
	}

	public get origin() {
		return this.raw.origin;
	}

	public get reference() {
		return this.raw.sourceReference;
	}

	public get inMemory() {
		return Source.isInMemory(this.uri);
	}

	public static isInMemory(uri: uri): boolean {
		return uri.toString().indexOf(Source.INTERNAL_URI_PREFIX) === 0;
	}

	public static getSourceReference(uri: uri): number {
		if (!Source.isInMemory(uri)) {
			return 0;
		}

		const uriStr = uri.toString();
		return parseInt(uriStr.substring(Source.INTERNAL_URI_PREFIX.length, uriStr.lastIndexOf('/')));
	}
}
