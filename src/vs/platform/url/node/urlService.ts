/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {IURLService} from 'vs/platform/url/common/url';

export class URLService implements IURLService {

	private _onOpenUrl = new Emitter<string>();
	onOpenUrl: Event<string> = this._onOpenUrl.event;

	constructor() {

	}
}