/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { DEBUG_SCHEME } from 'vs/workbench/parts/debug/common/debug';

export class Source {

	public uri: uri;
	public available: boolean;

	private static INTERNAL_URI_PREFIX = `${DEBUG_SCHEME}://internal/`;

	constructor(public raw: DebugProtocol.Source, available = true) {
		this.uri = raw.path ? uri.file(paths.normalize(raw.path)) : uri.parse(Source.INTERNAL_URI_PREFIX + raw.sourceReference + '/' + raw.name);
		this.available = available;
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
}
