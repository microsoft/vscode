/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ExperimentalPrompts } from 'vs/workbench/parts/experiments/electron-browser/experimentalPrompt';
import { ExperimentActionType, ExperimentState, IExperiment, IExperimentActionPromptProperties, IExperimentService } from 'vs/workbench/parts/experiments/node/experimentService';
import { TestExperimentService } from 'vs/workbench/parts/experiments/test/electron-browser/experimentService.test';
import { TestLifecycleService } from 'vs/workbench/test/workbenchTestServices';

suite('Experimental Prompts', () => {
	let instantiationService: TestInstantiationService;
	let experimentService: TestExperimentService;
	let experimentalPrompt: ExperimentalPrompts;
	let onExperimentEnabledEvent: Emitter<IExperiment>;

	let storageData = {};
	const promptText = 'Hello there! Can you see this?';
	const experiment: IExperiment =
	{
		id: 'experiment1',
		enabled: true,
		state: ExperimentState.Run,
		action: {
			type: ExperimentActionType.Prompt,
			properties: {
				promptText,
				commands: [
					{
						text: 'Yes',
						externalLink: 'https://code.visualstudio.com'
					},
					{
						text: 'No'
					}
				]
			}
		}
	};

	suiteSetup(() => {
		instantiationService = new TestInstantiationService();

		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		onExperimentEnabledEvent = new Emitter<IExperiment>();

	});

	setup(() => {
		storageData = {};
		instantiationService.stub(IStorageService, {
			get: (a, b, c) => a === 'experiments.experiment1' ? JSON.stringify(storageData) : c,
			store: (a, b, c) => {
				if (a === 'experiments.experiment1') {
					storageData = JSON.parse(b);
				}
			}
		});
		instantiationService.stub(INotificationService, new TestNotificationService());
		experimentService = instantiationService.createInstance(TestExperimentService);
		experimentService.onExperimentEnabled = onExperimentEnabledEvent.event;
		instantiationService.stub(IExperimentService, experimentService);
	});

	teardown(() => {
		if (experimentService) {
			experimentService.dispose();
		}
		if (experimentalPrompt) {
			experimentalPrompt.dispose();
		}
	});


	test('Show experimental prompt if experiment should be run. Choosing option with link should mark experiment as complete', () => {

		storageData = {
			enabled: true,
			state: ExperimentState.Run
		};

		instantiationService.stub(INotificationService, {
			prompt: (a: Severity, b: string, c: IPromptChoice[], options) => {
				assert.equal(b, promptText);
				assert.equal(c.length, 2);
				c[0].run();
			}
		});

		experimentalPrompt = instantiationService.createInstance(ExperimentalPrompts);
		onExperimentEnabledEvent.fire(experiment);

		return Promise.resolve(null).then(result => {
			assert.equal(storageData['state'], ExperimentState.Complete);
		});

	});

	test('Show experimental prompt if experiment should be run. Choosing negative option should mark experiment as complete', () => {

		storageData = {
			enabled: true,
			state: ExperimentState.Run
		};

		instantiationService.stub(INotificationService, {
			prompt: (a: Severity, b: string, c: IPromptChoice[], options) => {
				assert.equal(b, promptText);
				assert.equal(c.length, 2);
				c[1].run();
			}
		});

		experimentalPrompt = instantiationService.createInstance(ExperimentalPrompts);
		onExperimentEnabledEvent.fire(experiment);

		return Promise.resolve(null).then(result => {
			assert.equal(storageData['state'], ExperimentState.Complete);
		});

	});

	test('Show experimental prompt if experiment should be run. Cancelling should mark experiment as complete', () => {

		storageData = {
			enabled: true,
			state: ExperimentState.Run
		};

		instantiationService.stub(INotificationService, {
			prompt: (a: Severity, b: string, c: IPromptChoice[], options) => {
				assert.equal(b, promptText);
				assert.equal(c.length, 2);
				options.onCancel();
			}
		});

		experimentalPrompt = instantiationService.createInstance(ExperimentalPrompts);
		onExperimentEnabledEvent.fire(experiment);

		return Promise.resolve(null).then(result => {
			assert.equal(storageData['state'], ExperimentState.Complete);
		});

	});

	test('Test getPromptText', () => {
		const simpleTextCase: IExperimentActionPromptProperties = {
			promptText: 'My simple prompt',
			commands: []
		};
		const multipleLocaleCase: IExperimentActionPromptProperties = {
			promptText: {
				en: 'My simple prompt for en',
				de: 'My simple prompt for de',
				'en-au': 'My simple prompt for Austrailian English',
				'en-us': 'My simple prompt for US English'
			},
			commands: []
		};
		const englishUSTextCase: IExperimentActionPromptProperties = {
			promptText: {
				'en-us': 'My simple prompt for en'
			},
			commands: []
		};
		const noEnglishTextCase: IExperimentActionPromptProperties = {
			promptText: {
				'de-de': 'My simple prompt for German'
			},
			commands: []
		};

		assert.equal(ExperimentalPrompts.getLocalizedText(simpleTextCase.promptText, 'any-language'), simpleTextCase.promptText);
		assert.equal(ExperimentalPrompts.getLocalizedText(multipleLocaleCase.promptText, 'en'), multipleLocaleCase.promptText['en']);
		assert.equal(ExperimentalPrompts.getLocalizedText(multipleLocaleCase.promptText, 'de'), multipleLocaleCase.promptText['de']);
		assert.equal(ExperimentalPrompts.getLocalizedText(multipleLocaleCase.promptText, 'en-au'), multipleLocaleCase.promptText['en-au']);
		assert.equal(ExperimentalPrompts.getLocalizedText(multipleLocaleCase.promptText, 'en-gb'), multipleLocaleCase.promptText['en']);
		assert.equal(ExperimentalPrompts.getLocalizedText(multipleLocaleCase.promptText, 'fr'), multipleLocaleCase.promptText['en']);
		assert.equal(ExperimentalPrompts.getLocalizedText(englishUSTextCase.promptText, 'fr'), englishUSTextCase.promptText['en-us']);
		assert.equal(!!ExperimentalPrompts.getLocalizedText(noEnglishTextCase.promptText, 'fr'), false);
	});
});