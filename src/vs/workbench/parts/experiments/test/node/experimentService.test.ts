/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { ExperimentService, ExperimentActionType } from 'vs/workbench/parts/experiments/node/experimentSerivce';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TestLifecycleService } from 'vs/workbench/test/workbenchTestServices';
import { ExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/node/extensionsWorkbenchService';
import {
	IExtensionManagementService, DidInstallExtensionEvent, DidUninstallExtensionEvent, InstallExtensionEvent, IExtensionIdentifier,
	IExtensionEnablementService, ILocalExtension, LocalExtensionType
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService, getLocalExtensionIdFromManifest } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { Emitter } from 'vs/base/common/event';
import { TestExtensionEnablementService } from 'vs/platform/extensionManagement/test/common/extensionEnablementService.test';
import { URLService } from 'vs/platform/url/common/urlService';
import { IURLService } from 'vs/platform/url/common/url';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { assign } from 'vs/base/common/objects';
import URI from 'vs/base/common/uri';

let experimentData = {
	experiments: []
};

const local = aLocalExtension('installedExtension1', { version: '1.0.0' });

function aLocalExtension(name: string = 'someext', manifest: any = {}, properties: any = {}): ILocalExtension {
	const localExtension = <ILocalExtension>Object.create({ manifest: {} });
	assign(localExtension, { type: LocalExtensionType.User, manifest: {}, location: URI.file(`pub.${name}`) }, properties);
	assign(localExtension.manifest, { name, publisher: 'pub', version: '1.0.0' }, manifest);
	localExtension.identifier = { id: getLocalExtensionIdFromManifest(localExtension.manifest) };
	localExtension.metadata = { id: localExtension.identifier.id, publisherId: localExtension.manifest.publisher, publisherDisplayName: 'somename' };
	return localExtension;
}

export class TestExperimentService extends ExperimentService {
	public loadExperiments(experiments?: any[]): TPromise<any> {
		return super.loadExperiments(experimentData.experiments);
	}
}

suite('Experiment Service', () => {
	let instantiationService: TestInstantiationService;
	let extensionsWorkbenchService: IExtensionsWorkbenchService;
	let testConfigurationService: TestConfigurationService;
	let testObject: ExperimentService;
	let installEvent: Emitter<InstallExtensionEvent>,
		didInstallEvent: Emitter<DidInstallExtensionEvent>,
		uninstallEvent: Emitter<IExtensionIdentifier>,
		didUninstallEvent: Emitter<DidUninstallExtensionEvent>;

	suiteSetup(() => {
		instantiationService = new TestInstantiationService();
		installEvent = new Emitter<InstallExtensionEvent>();
		didInstallEvent = new Emitter<DidInstallExtensionEvent>();
		uninstallEvent = new Emitter<IExtensionIdentifier>();
		didUninstallEvent = new Emitter<DidUninstallExtensionEvent>();

		instantiationService.stub(IExtensionManagementService, ExtensionManagementService);
		instantiationService.stub(IExtensionManagementService, 'onInstallExtension', installEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidInstallExtension', didInstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onUninstallExtension', uninstallEvent.event);
		instantiationService.stub(IExtensionManagementService, 'onDidUninstallExtension', didUninstallEvent.event);
		instantiationService.stub(IExtensionEnablementService, new TestExtensionEnablementService(instantiationService));
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IURLService, URLService);
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
		testConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, testConfigurationService);
		instantiationService.stub(ILifecycleService, new TestLifecycleService());
		instantiationService.stub(IStorageService, { get: (a, b, c) => c, getBoolean: (a, b, c) => c, store: () => { } });
		extensionsWorkbenchService = instantiationService.createInstance(ExtensionsWorkbenchService);
		instantiationService.stub(IExtensionsWorkbenchService, extensionsWorkbenchService);

		setup(() => {
			instantiationService.stub(IEnvironmentService, {});
			instantiationService.stub(IStorageService, { get: (a, b, c) => c, getBoolean: (a, b, c) => c, store: () => { } });
		});

		teardown(() => {
			if (testObject) {
				testObject.dispose();
			}
		});
	});

	test('Simple Experiment Test', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1'
				},
				{
					id: 'experiment2',
					enabled: false
				},
				{
					id: 'experiment3',
					enabled: true
				},
				{
					id: 'experiment4',
					enabled: true,
					condition: {

					}
				},
				{
					id: 'experiment5',
					enabled: true,
					condition: {
						insidersOnly: true
					}
				}
			]
		};

		testObject = instantiationService.createInstance(TestExperimentService);
		const tests = [];
		tests.push(testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, false);
		}));
		tests.push(testObject.getExperimentById('experiment2').then(result => {
			assert.equal(result.enabled, false);
		}));
		tests.push(testObject.getExperimentById('experiment3').then(result => {
			assert.equal(result.enabled, true);
		}));
		tests.push(testObject.getExperimentById('experiment4').then(result => {
			assert.equal(result.enabled, true);
		}));
		tests.push(testObject.getExperimentById('experiment5').then(result => {
			assert.equal(result.enabled, true);
		}));

		return TPromise.join(tests);
	});

	test('Insiders only experiment shouldnt be enabled in stable', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: true,
					condition: {
						insidersOnly: true
					}
				}
			]
		};

		instantiationService.stub(IEnvironmentService, { appQuality: 'stable' });
		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, false);
		});
	});

	test('Experiment with no matching display language should be disabled', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: true,
					condition: {
						displayLanguage: 'somethingthat-nooneknows'
					}
				}
			]
		};

		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, false);
		});
	});

	test('Experiment with condition type InstalledExtensions is enabled when one of the expected extensions is installed', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: true,
					condition: {
						installedExtensions: {
							inlcudes: ['pub.installedExtension1', 'uninstalled-extention-id']
						}
					}
				}
			]
		};

		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, true);
		});
	});

	test('Experiment with condition type InstalledExtensions is disabled when none of the expected extensions is installed', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: true,
					condition: {
						installedExtensions: {
							includes: ['uninstalled-extention-id1', 'uninstalled-extention-id2']
						}
					}
				}
			]
		};

		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, false);
		});
	});

	test('Experiment with condition type InstalledExtensions is disabled when one of the exlcuded extensions is installed', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: true,
					condition: {
						installedExtensions: {
							excludes: ['pub.installedExtension1', 'uninstalled-extention-id2']
						}
					}
				}
			]
		};

		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, false);
		});
	});

	test('Experiment that is marked as complete should be disabled regardless of the conditions', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: true,
					condition: {
						installedExtensions: {
							includes: ['pub.installedExtension1', 'uninstalled-extention-id2']
						}
					}
				}
			]
		};

		instantiationService.stub(IStorageService, {
			get: (a, b, c) => a === 'experiments.experiment1' ? JSON.stringify({ isComplete: true }) : c,
			store: (a, b, c) => { }
		});

		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, false);
		});
	});

	test('Experiment with evaluate only once should read enablement from storage service', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: true,
					condition: {
						installedExtensions: {
							excludes: ['pub.installedExtension1', 'uninstalled-extention-id2']
						},
						evaluateOnlyOnce: true
					}
				}
			]
		};

		instantiationService.stub(IStorageService, {
			get: (a, b, c) => a === 'experiments.experiment1' ? JSON.stringify({ enabled: true }) : c,
			store: (a, b, c) => { }
		});
		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, true);
		});
	});

	test('Curated list should be available if experiment is enabled.', () => {
		const promptText = 'Hello there! Can you see this?';
		const curatedExtensionsKey = 'AzureDeploy';
		const curatedExtensionsList = ['uninstalled-extention-id1', 'uninstalled-extention-id2'];
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: true,
					action: {
						type: 'Prompt',
						properties: {
							promptText,
							commands: [
								{
									text: 'Search Marketplace',
									dontShowAgain: true,
									curatedExtensionsKey,
									curatedExtensionsList
								},
								{
									text: 'No'
								}
							]
						}
					}
				}
			]
		};

		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, true);
			return testObject.getCuratedExtensionsList(curatedExtensionsKey).then(curatedList => {
				assert.equal(curatedList, curatedExtensionsList);
			});
		});
	});

	test('Curated list shouldnt be available if experiment is disabled.', () => {
		const promptText = 'Hello there! Can you see this?';
		const curatedExtensionsKey = 'AzureDeploy';
		const curatedExtensionsList = ['uninstalled-extention-id1', 'uninstalled-extention-id2'];
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: false,
					action: {
						type: 'Prompt',
						properties: {
							promptText,
							commands: [
								{
									text: 'Search Marketplace',
									dontShowAgain: true,
									curatedExtensionsKey,
									curatedExtensionsList
								},
								{
									text: 'No'
								}
							]
						}
					}
				}
			]
		};

		testObject = instantiationService.createInstance(TestExperimentService);
		return testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, false);
			return testObject.getCuratedExtensionsList(curatedExtensionsKey).then(curatedList => {
				assert.equal(curatedList.length, 0);
			});
		});
	});

	test('Experiment that is disabled or deleted should be removed from storage', () => {
		experimentData = {
			experiments: [
				{
					id: 'experiment1',
					enabled: false
				},
				{
					id: 'experiment3',
					enabled: true
				}
			]
		};

		let storageDataExperiment1 = { enabled: true };
		let storageDataExperiment2 = { enabled: true };
		let storageDataAllExperiments = ['experiment1', 'experiment2', 'experiment3'];
		instantiationService.stub(IStorageService, {
			get: (a, b, c) => {
				switch (a) {
					case 'experiments.experiment1':
						return JSON.stringify(storageDataExperiment1);
					case 'experiments.experiment2':
						return JSON.stringify(storageDataExperiment2);
					case 'allExperiments':
						return JSON.stringify(storageDataAllExperiments);
					default:
						break;
				}
				return c;
			},
			store: (a, b, c) => {
				switch (a) {
					case 'experiments.experiment1':
						storageDataExperiment1 = JSON.parse(b);
						break;
					case 'experiments.experiment2':
						storageDataExperiment2 = JSON.parse(b);
						break;
					case 'allExperiments':
						storageDataAllExperiments = JSON.parse(b);
						break;
					default:
						break;
				}
			},
			remove: a => {
				switch (a) {
					case 'experiments.experiment1':
						storageDataExperiment1 = null;
						break;
					case 'experiments.experiment2':
						storageDataExperiment2 = null;
						break;
					case 'allExperiments':
						storageDataAllExperiments = null;
						break;
					default:
						break;
				}
			}
		});

		testObject = instantiationService.createInstance(TestExperimentService);
		const disabledExperiment = testObject.getExperimentById('experiment1').then(result => {
			assert.equal(result.enabled, false);
			assert.equal(!!storageDataExperiment1, false);
		});
		const deletedExperiment = testObject.getExperimentById('experiment2').then(result => {
			assert.equal(!!result, false);
			assert.equal(!!storageDataExperiment2, false);
		});
		return TPromise.join([disabledExperiment, deletedExperiment]).then(() => {
			assert.equal(storageDataAllExperiments.length, 1);
			assert.equal(storageDataAllExperiments[0], 'experiment3');
		});

	});

	test('getExperimentByType', () => {
		const customProperties = {
			some: 'random-value'
		};
		experimentData = {
			experiments: [
				{
					id: 'simple-experiment',
					enabled: true
				},
				{
					id: 'custom-experiment',
					enabled: true,
					action: {
						type: 'Custom',
						properties: customProperties
					}
				},
				{
					id: 'prompt-with-no-commands',
					enabled: true,
					action: {
						type: 'Prompt',
						properties: {
							promptText: 'someText'
						}
					}
				},
				{
					id: 'prompt-with-commands',
					enabled: true,
					action: {
						type: 'Prompt',
						properties: {
							promptText: 'someText',
							commands: [
								{
									text: 'Hello'
								}
							]
						}
					}
				}
			]
		};

		testObject = instantiationService.createInstance(TestExperimentService);
		const custom = testObject.getEligibleExperimentsByType(ExperimentActionType.Custom).then(result => {
			assert.equal(result.length, 2);
			assert.equal(result[0].id, 'simple-experiment');
			assert.equal(result[1].id, 'custom-experiment');
		});
		const prompt = testObject.getEligibleExperimentsByType(ExperimentActionType.Prompt).then(result => {
			assert.equal(result.length, 2);
			assert.equal(result[0].id, 'prompt-with-no-commands');
			assert.equal(result[1].id, 'prompt-with-commands');
		});
		return TPromise.join([custom, prompt]);
	});


	// test('Experiment with condition type FileEdit should increment editcount as appropriate', () => {

	// });

	// test('Experiment with condition type WorkspaceEdit should increment editcount as appropriate', () => {

	// });



});


