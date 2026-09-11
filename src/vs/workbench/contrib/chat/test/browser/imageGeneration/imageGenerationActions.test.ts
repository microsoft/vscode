/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService, NotificationMessage } from '../../../../../../platform/notification/common/notification.js';
import { IInputOptions, IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { RemoveImageGenerationCredentialsAction, SetUpImageGenerationAction } from '../../../browser/imageGeneration/imageGenerationActions.js';
import { IImageGenerationConfiguration, IImageGenerationCredentialsService } from '../../../common/imageGeneration.js';

suite('ImageGenerationActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let answers: Array<string | undefined>;
	let inputs: IInputOptions[];
	let configurations: Array<{ configuration: IImageGenerationConfiguration; key: string }>;
	let cleared: number;
	let hidden: boolean;
	let configureError: Error | undefined;
	let notifications: NotificationMessage[];

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		answers = ['https://images.example.test', 'image-deployment', 'test-key'];
		inputs = [];
		configurations = [];
		cleared = 0;
		hidden = false;
		configureError = undefined;
		notifications = [];
		instantiationService.stub(IChatEntitlementService, { get sentiment() { return { hidden }; } });
		instantiationService.stub(IImageGenerationCredentialsService, {
			whenReady: Promise.resolve(),
			configuration: undefined,
			configure: async (configuration, key) => {
				if (configureError) {
					throw configureError;
				}
				configurations.push({ configuration, key });
			},
			clear: async () => { cleared++; },
		});
		instantiationService.stub(IQuickInputService, {
			input: async options => {
				if (options) {
					inputs.push(options);
				}
				return answers.shift();
			},
		});
		instantiationService.stub(INotificationService, { info: message => { notifications.push(...(Array.isArray(message) ? message : [message])); } });
	});

	for (const step of [0, 1, 2]) {
		test(`cancelling setup at step ${step + 1} leaves configuration untouched`, async () => {
			answers[step] = undefined;
			await instantiationService.invokeFunction(accessor => new SetUpImageGenerationAction().run(accessor));
			assert.deepStrictEqual({ configurations, cleared, inputCount: inputs.length }, { configurations: [], cleared: 0, inputCount: step + 1 });
		});
	}

	test('stages the complete setup and masks the key', async () => {
		await instantiationService.invokeFunction(accessor => new SetUpImageGenerationAction().run(accessor));
		assert.deepStrictEqual({
			configurations,
			password: inputs.map(input => input.password === true),
			disclosure: inputs[0].prompt?.includes('Azure subscription'),
		}, {
			configurations: [{ configuration: { endpoint: 'https://images.example.test', deployment: 'image-deployment' }, key: 'test-key' }],
			password: [false, false, true],
			disclosure: true,
		});
	});

	test('validates the endpoint without displaying credential-bearing input', async () => {
		answers[1] = undefined;
		await instantiationService.invokeFunction(accessor => new SetUpImageGenerationAction().run(accessor));
		const error = await inputs[0].validateInput?.('https://user:do-not-repeat@example.test');
		assert.deepStrictEqual({ error: typeof error, revealsInput: typeof error === 'string' && error.includes('do-not-repeat') }, { error: 'string', revealsInput: false });
	});

	test('removes the credentials through the owning service', async () => {
		await instantiationService.invokeFunction(accessor => new RemoveImageGenerationCredentialsAction().run(accessor));
		assert.deepStrictEqual({ cleared, inputCount: inputs.length }, { cleared: 1, inputCount: 0 });
	});

	test('does not show setup when AI is hidden', async () => {
		hidden = true;
		await assert.rejects(instantiationService.invokeFunction(accessor => new SetUpImageGenerationAction().run(accessor)), /disabled/);
		assert.deepStrictEqual({ configurations, inputCount: inputs.length }, { configurations: [], inputCount: 0 });
	});

	test('does not announce success when saving the connection fails', async () => {
		configureError = new Error('Unable to write to User Settings');
		await assert.rejects(instantiationService.invokeFunction(accessor => new SetUpImageGenerationAction().run(accessor)), /Unable to write/);
		assert.deepStrictEqual({ configurations, notifications }, { configurations: [], notifications: [] });
	});
});
