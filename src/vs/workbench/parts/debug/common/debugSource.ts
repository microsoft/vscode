/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import { IModel } from 'vs/workbench/parts/debug/common/debug';

export class Source {

	public uri: uri;
	public available: boolean;

	private static INTERNAL_URI_PREFIX = 'debug://internal/';

	constructor(public name: string, uriStr: string, public reference = 0) {
		this.uri = uri.parse(uriStr);
		this.available = true;
	}

	public get inMemory() {
		return Source.isInMemory(this.uri);
	}

	public static toRawSource(uri: uri, model: IModel): DebugProtocol.Source {
		// First try to find the raw source amongst the stack frames - since that represenation has more data (source reference),
		const threads = model.getThreads();
		for (var threadId in threads) {
			if (threads.hasOwnProperty(threadId) && threads[threadId].callStack) {
				const found = threads[threadId].callStack.filter(sf => sf.source.uri.toString() === uri.toString()).pop();

				if (found) {
					return {
						name: found.source.name,
						path: found.source.inMemory ? null : found.source.uri.fsPath,
						sourceReference: found.source.reference
					}
				}
			}
		}

		// Did not find the raw source amongst the stack frames, construct the raw stack frame from the limited data you have.
		return Source.isInMemory(uri) ? { name: Source.getName(uri) } :
			{ path: paths.normalize(uri.fsPath, true) };
	}

	public static fromRawSource(rawSource: DebugProtocol.Source): Source {
		var uriStr = rawSource.path ? uri.file(rawSource.path).toString() : Source.INTERNAL_URI_PREFIX + rawSource.name;
		return new Source(rawSource.name, uriStr, rawSource.sourceReference);
	}

	public static fromUri(uri: uri): Source {
		return new Source(Source.getName(uri), uri.toString());
	}

	private static getName(uri: uri): string {
		var uriStr = uri.toString();
		return uriStr.substr(uriStr.lastIndexOf('/') + 1);
	}

	private static isInMemory(uri: uri): boolean {
		return uri.toString().indexOf(Source.INTERNAL_URI_PREFIX) === 0;
	}
}
