/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostConfigProvider } from '../common/extHostConfiguration.js';

/** A PAC file replaces `http.proxy` and `http.noProxy`. Reads the effective value so a policy wins over any user value. */
export function hasProxyPacUrl(configProvider: ExtHostConfigProvider): boolean {
	return !!configProvider.getConfiguration().get<string>('http.proxyPacUrl')?.trim();
}
