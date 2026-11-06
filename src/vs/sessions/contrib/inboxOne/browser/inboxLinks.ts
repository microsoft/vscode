/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';

export function openInboxLink(openerService: IOpenerService, uri: URI): Promise<boolean> {
	return openerService.open(uri, {
		fromUserGesture: true,
		...(uri.scheme === Schemas.https || uri.scheme === Schemas.http ? { openExternal: true, allowContributedOpeners: true } : {}),
	});
}
