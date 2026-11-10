/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Extension } from 'vscode';
import { getExperimentationServiceFromConfig, IExperimentationService } from 'vscode-tas-client';
import { mock } from '../../../../util/common/test/simpleMock';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { CopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { IEnvService } from '../../../env/common/envService';
import { IVSCodeExtensionContext } from '../../../extContext/common/extensionContext';
import { ILogService } from '../../../log/common/logService';
import { IFetcherService } from '../../../networking/common/fetcherService';
import { MockExtensionContext } from '../../../test/node/extensionContext';
import { ITelemetryService } from '../../common/telemetry';
import { MicrosoftExperimentationService } from '../microsoftExperimentationService';

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	env: { appRoot: '', devDeviceId: 'test-device' },
}));

vi.mock('vscode-tas-client', () => ({
	TargetPopulation: { Public: 'public', Insiders: 'insider' },
	getExperimentationServiceFromConfig: vi.fn(),
}));

class MockTASClient extends mock<IExperimentationService>() {
	override readonly initializePromise = Promise.resolve();
	override readonly initialFetch = Promise.resolve();
	override async getTreatmentVariableAsync() { return undefined; }
	override readonly dispose = vi.fn();
}

class ExperimentationExtensionContext extends mock<IVSCodeExtensionContext>() {
	override extension = new class extends mock<Extension<void>>() {
		override id = 'GitHub.copilot-chat';
		override packageJSON = { version: '1.0.0' };
	}();
	override globalState = Object.assign(new MockExtensionContext().globalState, { setKeysForSync: () => { } });
}

describe('MicrosoftExperimentationService endpoint routing', () => {
	const store = new DisposableStore();

	beforeEach(() => {
		vi.mocked(getExperimentationServiceFromConfig).mockClear();
		vi.mocked(getExperimentationServiceFromConfig).mockImplementation(() => new MockTASClient());
	});

	afterEach(() => store.clear());

	function createService(token?: CopilotToken) {
		const tokens = store.add(new CopilotTokenStore());
		tokens.copilotToken = token;
		const env = new class extends mock<IEnvService>() {
			override isPreRelease() { return false; }
		}();
		const log = new class extends mock<ILogService>() {
			override trace(): void { }
			override warn(): void { }
		}();
		const service = store.add(new MicrosoftExperimentationService(
			new class extends mock<ITelemetryService>() { }(),
			new ExperimentationExtensionContext(),
			env,
			tokens,
			new class extends mock<IConfigurationService>() { }(),
			new class extends mock<IFetcherService>() { }(),
			log,
		));
		return { service, tokens };
	}

	for (const token of [undefined, new CopilotToken(createTestExtendedTokenInfo({ endpoints: undefined }))]) {
		it(`configures the individual assignments endpoint ${token ? 'without a token endpoint' : 'when signed out'}`, async () => {
			const { service } = createService(token);
			await service.hasTreatments();
			const configs = vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => ({
				endpoint: config.assignmentsEndpoint,
				hasLegacyFilters: !!config.filterProviders?.length,
				hasAssignmentsFilters: !!config.assignmentsFilterProviders?.length,
				hasTransport: typeof config.fetch === 'function',
			}));
			expect(configs).toEqual([{
				endpoint: 'https://exp.individual.githubcopilot.com/api/v1/assignments',
				hasLegacyFilters: true,
				hasAssignmentsFilters: true,
				hasTransport: true,
			}]);
		});
	}

	it('switches to the account endpoint on sign-in and back to the individual endpoint on sign-out', async () => {
		const { service, tokens } = createService();
		await service.hasTreatments();
		tokens.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ endpoints: { exp: 'https://exp.business.githubcopilot.com///' } }));
		await service.hasTreatments();
		tokens.copilotToken = undefined;
		await service.hasTreatments();
		expect(vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => config.assignmentsEndpoint)).toEqual([
			'https://exp.individual.githubcopilot.com/api/v1/assignments',
			'https://exp.business.githubcopilot.com/api/v1/assignments',
			'https://exp.individual.githubcopilot.com/api/v1/assignments',
		]);
	});
});
