/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostService } from '../../native/common/native.js';
import { RequestFetch } from '../common/types.js';
import { createNodeFetchFactory, NodeFetchService } from '../node/fetchService.js';

export class SharedProcessGitHubFetchService extends NodeFetchService {
	constructor(
		fetchImpl: RequestFetch | undefined,
		env: NodeJS.ProcessEnv | undefined,
		@INativeHostService nativeHostService: INativeHostService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super(createNodeFetchFactory({
			resolveProxy: url => nativeHostService.resolveProxyForUtilityProcess(url),
			lookupAuthorization: authInfo => nativeHostService.lookupAuthorization(authInfo),
			lookupKerberosAuthorization: url => nativeHostService.lookupKerberosAuthorization(url),
			loadCertificates: () => nativeHostService.loadCertificates(),
		}, configurationService, logService, env), fetchImpl, logService);
	}
}
