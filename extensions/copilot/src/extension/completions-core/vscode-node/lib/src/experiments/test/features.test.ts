/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ICompletionModelInformation } from '../../../../../../../platform/endpoint/common/endpointProvider';
import { TokenizerType } from '../../../../../../../util/common/tokenizer';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsCopilotTokenManager, CopilotToken } from '../../auth/copilotTokenManager';
import { ConfigKey, ICompletionsConfigProvider, InMemoryConfigProvider } from '../../config';
import { AvailableModelsManager, ICompletionsModelManagerService } from '../../openai/model';
import { extractRepoInfoInBackground } from '../../prompt/repository';
import { TelemetryData } from '../../telemetry';
import { createLibTestingContext } from '../../test/context';
import { FakeCopilotTokenManager } from '../../test/copilotTokenManager';
import { Filter } from '../filters';
import { makeFsUri } from '../../util/uri';
import { ICompletionsFeaturesService } from '../featuresService';

suite('updateExPValuesAndAssignments', function () {
	let accessor: ServicesAccessor;

	const filenameUri = makeFsUri(__filename);

	setup(async function () {
		accessor = createLibTestingContext().createTestingAccessor();
		// Trigger extractRepoInfoInBackground early + add a sleep to force repo info to be available
		extractRepoInfoInBackground(accessor, filenameUri);
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	test('If no options are provided, repo filters should be empty and there should be no telemetry properties or measurements', async function () {
		const featuresService = accessor.get(ICompletionsFeaturesService);
		const telemetry = await featuresService.updateExPValuesAndAssignments();

		assert.deepStrictEqual(telemetry.properties, {});
		assert.deepStrictEqual(telemetry.measurements, {});

		const filters = telemetry.filtersAndExp.filters.toHeaders();
		assert.deepStrictEqual(filters['X-Copilot-Repository'], undefined);
		assert.deepStrictEqual(filters['X-Copilot-FileType'], undefined);
	});

	test('If telemetry data is passed as a parameter, it should be used in the resulting telemetry object', async function () {
		const telemetryData = TelemetryData.createAndMarkAsIssued({ foo: 'bar' }, { baz: 42 });

		const featuresService = accessor.get(ICompletionsFeaturesService);
		const telemetry = await featuresService.updateExPValuesAndAssignments(undefined, telemetryData);

		assert.deepStrictEqual(telemetry.properties, { foo: 'bar' });
		assert.deepStrictEqual(telemetry.measurements, { baz: 42 });

		const filters = telemetry.filtersAndExp.filters.toHeaders();
		assert.deepStrictEqual(filters['X-Copilot-Repository'], undefined);
		assert.deepStrictEqual(filters['X-Copilot-FileType'], undefined);
	});

	test('selected custom completion model does not require a Copilot token', async function () {
		const serviceCollection = createLibTestingContext();
		serviceCollection.define(ICompletionsCopilotTokenManager, new ThrowingCopilotTokenManager());
		const customAccessor = serviceCollection.createTestingAccessor();
		const configProvider = customAccessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'local-model',
			url: 'http://127.0.0.1:11434/v1',
		}]);
		configProvider.setConfig(ConfigKey.UserSelectedCompletionModel, 'local-model');

		const featuresService = customAccessor.get(ICompletionsFeaturesService);
		const telemetry = await featuresService.updateExPValuesAndAssignments();

		const filters = telemetry.filtersAndExp.filters.toHeaders();
		assert.strictEqual(filters[Filter.CopilotEngine], 'local-model');
		assert.strictEqual(filters[Filter.CopilotTrackingId], undefined);
	});

	test('selected custom completion model collision uses Copilot token path', async function () {
		const serviceCollection = createLibTestingContext();
		const tokenManager = new TrackingCopilotTokenManager();
		serviceCollection.define(ICompletionsCopilotTokenManager, tokenManager);
		const customAccessor = serviceCollection.createTestingAccessor();
		const configProvider = customAccessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'gpt-41-copilot',
			url: 'http://127.0.0.1:11434/v1',
		}]);
		configProvider.setConfig(ConfigKey.UserSelectedCompletionModel, 'gpt-41-copilot');
		const modelManager = customAccessor.get(ICompletionsModelManagerService) as AvailableModelsManager;
		modelManager.fetchedModelData = [hostedCompletionModel('gpt-41-copilot')];

		const featuresService = customAccessor.get(ICompletionsFeaturesService);
		await featuresService.updateExPValuesAndAssignments();

		assert.strictEqual(tokenManager.getTokenCalled, true);
	});
});

class ThrowingCopilotTokenManager implements ICompletionsCopilotTokenManager {
	declare _serviceBrand: undefined;

	get token(): CopilotToken | undefined {
		throw new Error('Unexpected token getter call');
	}

	primeToken(): Promise<boolean> {
		throw new Error('Unexpected primeToken call');
	}

	getToken(): Promise<CopilotToken> {
		throw new Error('Unexpected getToken call');
	}

	resetToken(): void { }

	getLastToken(): Omit<CopilotToken, 'token'> | undefined {
		return undefined;
	}
}

class TrackingCopilotTokenManager extends FakeCopilotTokenManager {
	getTokenCalled = false;

	override get token(): CopilotToken | undefined {
		return undefined;
	}

	override async getToken(): Promise<CopilotToken> {
		this.getTokenCalled = true;
		return super.getToken();
	}
}

function hostedCompletionModel(id: string): ICompletionModelInformation {
	return {
		id,
		vendor: 'github',
		name: id,
		model_picker_enabled: true,
		preview: false,
		is_chat_default: false,
		is_chat_fallback: false,
		version: '1',
		capabilities: {
			type: 'completion',
			family: id,
			tokenizer: TokenizerType.O200K,
		},
	};
}
