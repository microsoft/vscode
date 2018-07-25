/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EnableOfflineMode, DisableOfflineMode, offlineModeSetting, NotifyUnsupportedFeatureInOfflineMode, unSupportedInOfflineModeMsg } from 'vs/platform/actions/common/offlineMode';
import { IAction } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Emitter } from 'vs/base/common/event';
import { ConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';

suite('OfflineMode', () => {
	let instantiationService: TestInstantiationService;
	let offlineMode = false;
	let dontShowAgain = false;
	let promptShown = false;
	let configChangeEmitter = new Emitter<any>();
	let enableOfflineAction: IAction;
	let disableOfflineAction: IAction;

	suiteSetup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IConfigurationService, {
			onDidUpdateConfiguration: () => { },
			onDidChangeConfiguration: configChangeEmitter.event,
			getConfigurationData: () => ({}),
			getValue: key => {
				return key === offlineModeSetting ? offlineMode : undefined;
			},
			updateValue: (key, value) => {
				if (key === offlineModeSetting) {
					offlineMode = value;
				}
				return TPromise.as(null);
			}
		});
		instantiationService.stub(IStorageService, {
			getBoolean: key => {
				return key === 'workbench.offlineMode.disclaimer.dontShowAgain' ? dontShowAgain : undefined;
			},
			store: (key, value) => {
				if (key === 'workbench.offlineMode.disclaimer.dontShowAgain') {
					dontShowAgain = value;
				}
			}
		});
	});

	setup(() => {
		promptShown = false;
		dontShowAgain = false;
		instantiationService.stub(INotificationService, {
			prompt: (a, b, c) => {
				promptShown = true;
			}
		});

		enableOfflineAction = instantiationService.createInstance(EnableOfflineMode);
		disableOfflineAction = instantiationService.createInstance(DisableOfflineMode);

		offlineMode = false;
		configChangeEmitter.fire(new ConfigurationChangeEvent().change([offlineModeSetting]));
	});

	teardown(() => {
		enableOfflineAction.dispose();
		disableOfflineAction.dispose();
	});

	suiteTeardown(() => {
		configChangeEmitter.dispose();
	});

	test('Test Enablement of actions in online mode', () => {
		assert.equal(enableOfflineAction.enabled, true);
		assert.equal(disableOfflineAction.enabled, false);
	});

	test('Test Enablement of actions in offline mode', () => {
		offlineMode = true;
		configChangeEmitter.fire(new ConfigurationChangeEvent().change([offlineModeSetting]));

		assert.equal(enableOfflineAction.enabled, false);
		assert.equal(disableOfflineAction.enabled, true);
	});

	test('EnableOfflineMode action enables offline mode with prompt', () => {
		return enableOfflineAction.run().then(() => {
			assert.equal(offlineMode, true);
			assert.equal(promptShown, true);
			assert.equal(dontShowAgain, false);
		});
	});

	test('EnableOfflineMode action prompt choose dont show again', () => {
		instantiationService.stub(INotificationService, {
			prompt: (a, b, c) => {
				promptShown = true;
				if (c[0].label === 'Don\'t Show Again') {
					c[0].run();
				}
			}
		});
		enableOfflineAction.dispose();
		enableOfflineAction = instantiationService.createInstance(EnableOfflineMode);
		return enableOfflineAction.run().then(() => {
			assert.equal(offlineMode, true);
			assert.equal(promptShown, true);
			assert.equal(dontShowAgain, true);
		});
	});

	test('EnableOfflineMode action prompt dont show again if chosen so before', () => {
		dontShowAgain = true;
		return enableOfflineAction.run().then(() => {
			assert.equal(offlineMode, true);
			assert.equal(promptShown, false);
			assert.equal(dontShowAgain, true);
		});
	});

	test('DisableOfflineMode action enables offline mode', () => {
		offlineMode = true;
		configChangeEmitter.fire(new ConfigurationChangeEvent().change([offlineModeSetting]));
		return disableOfflineAction.run().then(() => {
			assert.equal(offlineMode, false);
		});
	});

	test('Notify Action shows prompt', () => {
		offlineMode = true;
		const notifyAction: IAction = instantiationService.createInstance(NotifyUnsupportedFeatureInOfflineMode);
		return notifyAction.run().then(() => {
			assert.equal(promptShown, true);
			assert.equal(offlineMode, true);
		});
	});

	test('Notify Action shows prompt that disables offline mode', () => {
		offlineMode = true;
		instantiationService.stub(INotificationService, {
			prompt: (a, b, c) => {
				promptShown = true;
				if (c[0].label === DisableOfflineMode.LABEL && b === unSupportedInOfflineModeMsg) {
					c[0].run();
				}
			}
		});
		const notifyAction: IAction = instantiationService.createInstance(NotifyUnsupportedFeatureInOfflineMode);
		return notifyAction.run().then(() => {
			assert.equal(promptShown, true);
			assert.equal(offlineMode, false);
		});
	});
});