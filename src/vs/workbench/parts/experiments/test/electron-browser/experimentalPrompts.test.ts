/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';

import { IExperiment, ExperimentActionType, IExperimentService, ExperimentState } from 'vs/workbench/parts/experiments/node/experimentService';

import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter } from 'vs/base/common/event';
import { TestExperimentService } from 'vs/workbench/parts/experiments/test/node/experimentService.test';
import { ExperimentalPrompts } from 'vs/workbench/parts/experiments/electron-browser/experimentalPrompt';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { INotificationService, Severity, IPromptChoice } from 'vs/platform/notification/common/notification';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { TestLifecycleService } from 'vs/workbench/test/workbenchTestServices';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { TPromise } from 'vs/base/common/winjs.base';

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
						dontShowAgain: true
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


	test('Show experimental prompt if experiment should be run. Choosing an option should mark experiment as complete', () => {

		storageData = {
			enabled: true,
			state: ExperimentState.Run
		};

		instantiationService.stub(INotificationService, {
			prompt: (a: Severity, b: string, c: IPromptChoice[], d) => {
				assert.equal(b, promptText);
				assert.equal(c.length, 2);
				c[0].run();
			}
		});

		experimentalPrompt = instantiationService.createInstance(ExperimentalPrompts);
		onExperimentEnabledEvent.fire(experiment);

		return TPromise.as(null).then(result => {
			assert.equal(storageData['state'], ExperimentState.Complete);
		});

	});
});