/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID, IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../../common/devContainerAgentHostService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsService, IOpenNewSessionOptions } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { openNewSessionWithDevContainerPreference, shouldPreferDevContainer } from '../../browser/agentsWindowOpenIntent.js';

suite('Agents Window open intent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function providersService(provider: ISessionsProvider): ISessionsProvidersService {
		return new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return providerId === provider.id ? provider as T : undefined;
			}
		}();
	}

	test('gates the Dev Container preference on the Agents Window setting', () => {
		const configurationService = (enabled: boolean) => new TestConfigurationService({
			[DevContainerAgentHostEnabledSettingId]: enabled,
		});

		assert.deepStrictEqual({
			requestedAndEnabled: shouldPreferDevContainer(true, configurationService(true)),
			requestedAndDisabled: shouldPreferDevContainer(true, configurationService(false)),
			notRequestedAndEnabled: shouldPreferDevContainer(false, configurationService(true)),
			invalidRequestAndEnabled: shouldPreferDevContainer('true', configurationService(true)),
		}, {
			requestedAndEnabled: true,
			requestedAndDisabled: false,
			notRequestedAndEnabled: false,
			invalidRequestAndEnabled: false,
		});
	});

	test('opens the local folder and applies the Dev Container preference to its draft', async () => {
		const folderUri = URI.file('/workspace');
		const session = upcastPartial<ISession>({
			sessionId: 'new-session',
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
		});
		let openOptions: IOpenNewSessionOptions | undefined;
		const sessionsService = upcastPartial<ISessionsService>({
			openNewSession: async options => {
				openOptions = options;
				return { session, trustDeclined: false };
			},
		});
		const preferred: string[] = [];
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: LOCAL_AGENT_HOST_PROVIDER_ID,
			preferDevContainer: sessionId => preferred.push(sessionId),
		});
		const sessionsProvidersService = providersService(provider);

		await openNewSessionWithDevContainerPreference(folderUri, LOCAL_AGENT_HOST_PROVIDER_ID, sessionsService, sessionsProvidersService);

		assert.deepStrictEqual({
			folderUri: openOptions?.folderUri?.toString(),
			providerId: openOptions?.providerId,
			cancelRestore: openOptions?.cancelRestore,
			preferred,
		}, {
			folderUri: folderUri.toString(),
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			cancelRestore: true,
			preferred: ['new-session'],
		});
	});

	test('does not apply the preference without a local Agent Host draft', async () => {
		const preferred: string[] = [];
		const provider = upcastPartial<IAgentHostSessionsProvider>({
			id: LOCAL_AGENT_HOST_PROVIDER_ID,
			preferDevContainer: sessionId => preferred.push(sessionId),
		});
		const sessionsProvidersService = providersService(provider);
		const noSessionService = upcastPartial<ISessionsService>({
			openNewSession: async () => ({ session: undefined, trustDeclined: true }),
		});
		await openNewSessionWithDevContainerPreference(URI.file('/declined'), LOCAL_AGENT_HOST_PROVIDER_ID, noSessionService, sessionsProvidersService);

		const otherSessionService = upcastPartial<ISessionsService>({
			openNewSession: async () => ({
				session: upcastPartial<ISession>({ sessionId: 'other', providerId: 'other-provider' }),
				trustDeclined: false,
			}),
		});
		const otherProviderService = providersService(upcastPartial<ISessionsProvider>({ id: 'other-provider' }));
		await openNewSessionWithDevContainerPreference(URI.file('/other'), 'other-provider', otherSessionService, otherProviderService);

		assert.deepStrictEqual(preferred, []);
	});
});
