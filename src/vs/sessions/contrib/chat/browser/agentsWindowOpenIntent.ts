/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../common/devContainerAgentHostService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';

export function shouldPreferDevContainer(requested: unknown, configurationService: IConfigurationService): boolean {
	return requested === true
		&& configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId) === true;
}

export async function openNewSessionWithDevContainerPreference(
	folderUri: URI,
	providerId: string,
	sessionsService: ISessionsService,
	sessionsProvidersService: ISessionsProvidersService,
): Promise<void> {
	const result = await sessionsService.openNewSession({ folderUri, providerId, cancelRestore: true });
	const session = result.session;
	if (!session) {
		return;
	}
	const provider = sessionsProvidersService.getProvider(session.providerId);
	if (provider && isAgentHostProvider(provider)) {
		provider.preferDevContainer?.(session.sessionId);
	}
}
