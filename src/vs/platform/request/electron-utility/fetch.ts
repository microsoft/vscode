/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostService } from '../../native/common/native.js';
import { createFetch as createNodeFetch } from '../node/fetch.js';

/** Resolves proxy settings for the utility process rather than a renderer window. */
export function createFetch(nativeHostService: INativeHostService, configurationService: IConfigurationService, logService: ILogService, env?: NodeJS.ProcessEnv, fetchImpl?: typeof globalThis.fetch): typeof globalThis.fetch {
	return createNodeFetch({
		resolveProxy: url => nativeHostService.resolveProxyForUtilityProcess(url),
		lookupAuthorization: authInfo => nativeHostService.lookupAuthorization(authInfo),
		lookupKerberosAuthorization: url => nativeHostService.lookupKerberosAuthorization(url),
		loadCertificates: () => nativeHostService.loadCertificates(),
	}, configurationService, logService, env, fetchImpl);
}
