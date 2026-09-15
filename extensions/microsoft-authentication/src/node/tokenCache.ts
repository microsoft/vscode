/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationResult, InteractionRequiredAuthError, InteractionRequiredAuthErrorCodes, PublicClientApplication, SilentFlowRequest, TokenCacheContext } from '@azure/msal-node';
import { SecretStorageCachePlugin } from '../common/cachePlugin';

/** Must run inside the PCA's sequencer so cache invalidation completes before the next cache read. */
export async function acquireTokenSilentWithCache(pca: PublicClientApplication, cachePlugin: SecretStorageCachePlugin, request: SilentFlowRequest): Promise<AuthenticationResult> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await pca.acquireTokenSilent(request);
		} catch (error) {
			if (!(error instanceof InteractionRequiredAuthError) || error.subError !== InteractionRequiredAuthErrorCodes.badToken) {
				throw error;
			}

			// MSAL removes a rejected refresh token from memory, but does not invoke
			// afterCacheAccess on this error path. Persist the removal before another
			// silent request reloads the rejected token from SecretStorage.
			const tokenCache = pca.getTokenCache();
			await cachePlugin.afterCacheFailure(new TokenCacheContext(tokenCache, tokenCache.hasChanged()));
			if (attempt > 0) {
				throw error;
			}
			// A fresh application refresh token can coexist with a rejected family
			// refresh token. Give MSAL one chance to use the remaining credential.
		}
	}
}
