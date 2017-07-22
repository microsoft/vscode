/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import uri from 'vs/base/common/uri';
import { DEBUG_SCHEME } from 'vs/workbench/parts/debug/common/debug';

const UNKNOWN_SOURCE_LABEL = nls.localize('unknownSource', "Unknown Source");

export class Source {

	public uri: uri;
	public available: boolean;

	constructor(public raw: DebugProtocol.Source) {
		if (!raw) {
			this.raw = { name: UNKNOWN_SOURCE_LABEL };
		}
		const path = this.raw.path || this.raw.name;
		this.available = this.raw.name !== UNKNOWN_SOURCE_LABEL;
		this.uri = this.raw.sourceReference > 0 ? uri.parse(`${DEBUG_SCHEME}:${path}`) : uri.file(path);
	}

	public get name() {
		return this.raw.name;
	}

	public get origin() {
		return this.raw.origin;
	}

	public get presentationHint() {
		return this.raw.presentationHint;
	}

	public get reference() {
		return this.raw.sourceReference;
	}

	public get inMemory() {
		return this.uri.toString().indexOf(`${DEBUG_SCHEME}:`) === 0;
	}
}
