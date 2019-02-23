/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';

export class SimpleURLService implements IURLService {
	_serviceBrand: any;

	open(url: URI): Promise<boolean> {
		return Promise.resolve(false);
	}

	registerHandler(handler: IURLHandler): IDisposable {
		return Disposable.None;
	}
}