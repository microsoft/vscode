/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');

export class Source {

	public uri: uri;
	public inMemory: boolean;
	public available: boolean;

	private static INTERNAL_URI_PREFIX = 'debug://internal/';

	constructor(public name: string, uriStr: string, public reference = 0) {
		this.uri = uri.parse(uriStr);
		this.inMemory = uriStr.indexOf(Source.INTERNAL_URI_PREFIX) === 0;
		this.available = true;
	}

	public toRawSource(): DebugProtocol.Source {
		return this.inMemory ? { name: this.name } :
			{ path: paths.normalize(this.uri.fsPath, true) };
	}

	public static fromRawSource(rawSource: DebugProtocol.Source): Source {
		var uriStr = rawSource.path ? uri.file(rawSource.path).toString() : Source.INTERNAL_URI_PREFIX + rawSource.name;
		return new Source(rawSource.name, uriStr, rawSource.sourceReference);
	}

	public static fromUri(uri: uri): Source {
		var uriStr = uri.toString();
		return new Source(uriStr.substr(uriStr.lastIndexOf('/') + 1), uriStr);
	}
}
