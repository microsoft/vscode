/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService, IURLHandler, IOpenURLOptions } from 'vs/platform/url/common/url';
import { URI, UriComponents } from 'vs/base/common/uri';
import { values } from 'vs/base/common/map';
import { first } from 'vs/base/common/async';
import { toDisposable, IDisposable, Disposable } from 'vs/base/common/lifecycle';

export abstract class AbstractURLService extends Disposable implements IURLService {

	_serviceBrand: undefined;

	private handlers = new Set<IURLHandler>();

	abstract create(options?: Partial<UriComponents>): URI;

	open(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
		const handlers = values(this.handlers);
		return first(handlers.map(h => () => h.handleURL(uri, options)), undefined, false).then(val => val || false);
	}

	registerHandler(handler: IURLHandler): IDisposable {
		this.handlers.add(handler);
		return toDisposable(() => this.handlers.delete(handler));
	}
}
