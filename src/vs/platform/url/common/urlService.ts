/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import URI from 'vs/base/common/uri';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';

declare module Array {
	function from<T>(set: Set<T>): T[];
}

export class URLService implements IURLService {

	_serviceBrand: any;

	private handlers = new Set<IURLHandler>();

	async open(uri: URI): TPromise<boolean> {
		const handlers = Array.from(this.handlers);

		for (const handler of handlers) {
			if (await handler.handleURL(uri)) {
				return true;
			}
		}

		return false;
	}

	registerHandler(handler: IURLHandler): IDisposable {
		this.handlers.add(handler);
		return toDisposable(() => this.handlers.delete(handler));
	}
}

export class RelayURLService extends URLService implements IURLHandler {

	constructor(private urlService: IURLService) {
		super();
	}

	async open(uri: URI): TPromise<boolean> {
		return this.urlService.open(uri);
	}

	handleURL(uri: URI): TPromise<boolean> {
		return super.open(uri);
	}
}