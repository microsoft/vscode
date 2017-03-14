/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import { DEBUG_SCHEME } from 'vs/workbench/parts/debug/common/debug';

export class Source {

	public uri: uri;

	constructor(public raw: DebugProtocol.Source, public presenationHint: string) {
		const path = raw.path || raw.name;
		this.uri = raw.sourceReference > 0 ? uri.parse(`${DEBUG_SCHEME}:${path}`) : uri.file(path);
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
		return this.uri.toString().indexOf(`${DEBUG_SCHEME}:`) === 0;
	}
}
