/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { NotSignedUpError, SubscriptionExpiredError } from '../../../platform/authentication/vscode-node/copilotTokenManager';
import { AuthProviderId, ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogger } from '../../../platform/log/common/logService';
import { isClientBYOKAllowed } from '../common/byokProvider';

const clientBYOKEnterprisePolicyCachePrefix = 'github.copilot.clientByokEnterprisePolicy';
const clientBYOKEnterprisePolicyMemoryCaches = new WeakMap<IVSCodeExtensionContext, Map<string, boolean | undefined>>();

function normalizeEndpointUrl(url: string | undefined): string | undefined {
	return url?.replace(/\/$/, '');
}

function getClientBYOKEnterprisePolicyCacheKey(authService: IAuthenticationService, configurationService: IConfigurationService): string {
	const authProvider = configurationService.getConfig(ConfigKey.Shared.AuthProvider);
	const accountId = authService.anyGitHubSession?.account.id;
	const source = [
		accountId,
		authProvider,
		authProvider === AuthProviderId.GitHubEnterprise ? configurationService.getNonExtensionConfig<string>('github-enterprise.uri') : undefined,
	];
	// Authenticated policy comes from the GitHub account's Copilot token. Endpoint overrides only
	// distinguish static/test sources that do not expose an account identity.
	if (!accountId) {
		source.push(
			normalizeEndpointUrl(configurationService.getConfig(ConfigKey.Shared.DebugOverrideProxyUrl)),
			normalizeEndpointUrl(configurationService.getConfig(ConfigKey.Shared.DebugOverrideCAPIUrl)),
			configurationService.getConfig(ConfigKey.Shared.DebugOverrideAuthType),
		);
	}
	const serializedSource = JSON.stringify(source);
	const sourceHash = createHash('sha256').update(serializedSource).digest('hex');
	return `${clientBYOKEnterprisePolicyCachePrefix}.${sourceHash}`;
}

function getCachedClientBYOKEnterprisePolicy(extensionContext: IVSCodeExtensionContext, cacheKey: string): boolean | undefined {
	const memoryCache = clientBYOKEnterprisePolicyMemoryCaches.get(extensionContext);
	if (memoryCache?.has(cacheKey)) {
		return memoryCache.get(cacheKey);
	}
	return extensionContext.globalState.get<boolean>(cacheKey);
}

async function updateCachedClientBYOKEnterprisePolicy(extensionContext: IVSCodeExtensionContext, logService: ILogger, cacheKey: string, allowed: boolean | undefined, isCurrent: () => boolean): Promise<void> {
	if (!isCurrent()) {
		return;
	}
	let memoryCache = clientBYOKEnterprisePolicyMemoryCaches.get(extensionContext);
	if (!memoryCache) {
		memoryCache = new Map();
		clientBYOKEnterprisePolicyMemoryCaches.set(extensionContext, memoryCache);
	}
	memoryCache.set(cacheKey, allowed);
	try {
		await extensionContext.globalState.update(cacheKey, allowed);
	} catch (error) {
		logService.error(error instanceof Error ? error : String(error), 'Failed to update cached BYOK enterprise policy.');
	}
}

/**
 * Live token policy wins. Known non-managed states clear stale enterprise policy, while unknown
 * failures use the last policy observed for the current account and otherwise allow independent BYOK.
 */
export async function resolveClientBYOKAllowed(authService: IAuthenticationService, extensionContext: IVSCodeExtensionContext, logService: ILogger, configurationService: IConfigurationService, isCurrent: () => boolean = () => true): Promise<boolean> {
	if (!authService.hasCopilotTokenSource) {
		return true;
	}

	const cacheKey = getClientBYOKEnterprisePolicyCacheKey(authService, configurationService);
	try {
		const copilotToken = await authService.getCopilotToken();
		const allowed = isClientBYOKAllowed(true, copilotToken);
		const managedPolicy = copilotToken.isInternal || copilotToken.isIndividual ? undefined : allowed;
		await updateCachedClientBYOKEnterprisePolicy(extensionContext, logService, cacheKey, managedPolicy, isCurrent);
		return allowed;
	} catch (error) {
		if (error instanceof NotSignedUpError || error instanceof SubscriptionExpiredError) {
			await updateCachedClientBYOKEnterprisePolicy(extensionContext, logService, cacheKey, undefined, isCurrent);
			return true;
		}
		return getCachedClientBYOKEnterprisePolicy(extensionContext, cacheKey) ?? true;
	}
}
