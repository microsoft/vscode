/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { URI } from 'vs/base/common/uri';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { first } from 'vs/base/common/async';
import { values } from 'vs/base/common/map';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class URLService implements IURLService {

	_serviceBrand!: ServiceIdentifier<any>;

	private handlers = new Set<IURLHandler>();

	open(uri: URI): Promise<boolean> {
		const handlers = values(this.handlers);
		return first(handlers.map(h => () => h.handleURL(uri)), undefined, false).then(val => val || false);
	}

	registerHandler(handler: IURLHandler): IDisposable {
		this.handlers.add(handler);
		return toDisposable(() => this.handlers.delete(handler));
	}
}
