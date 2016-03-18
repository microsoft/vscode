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

	constructor(public raw: DebugProtocol.Source, available = true) {
		this.uri = raw.path ? uri.file(raw.path) : uri.parse(Source.INTERNAL_URI_PREFIX + raw.name);
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

	public static toRawSource(uri: uri, model: IModel): DebugProtocol.Source {
		if (model) {
			// first try to find the raw source amongst the stack frames - since that represenation has more data (source reference),
			const threads = model.getThreads();
			for (let threadId in threads) {
				if (threads.hasOwnProperty(threadId) && threads[threadId].getCachedCallStack()) {
					const found = threads[threadId].getCachedCallStack().filter(sf => sf.source.uri.toString() === uri.toString()).pop();
					if (found) {
						return found.source.raw;
					}
				}
			}
		}

		// did not find the raw source amongst the stack frames, construct the raw stack frame from the limited data you have.
		return Source.isInMemory(uri) ? { name: Source.getName(uri) } :
			{ path: paths.normalize(uri.fsPath, true) };
	}

	private static getName(uri: uri): string {
		const uriStr = uri.toString();
		return uriStr.substr(uriStr.lastIndexOf('/') + 1);
	}

	private static isInMemory(uri: uri): boolean {
		return uri.toString().indexOf(Source.INTERNAL_URI_PREFIX) === 0;
	}
}
