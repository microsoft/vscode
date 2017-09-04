/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as sinon from 'sinon';
import URI from 'vs/base/common/uri';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IConfigurationRegistry, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { MainThreadConfiguration } from 'vs/workbench/api/electron-browser/mainThreadConfiguration';
import { ConfigurationTarget, IConfigurationEditingService } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ConfigurationEditingService } from 'vs/workbench/services/configuration/node/configurationEditingService';
import { OneGetThreadService } from './testThreadService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';

suite('ExtHostConfiguration', function () {

	let instantiationService: TestInstantiationService;
	let target: sinon.SinonSpy;

	suiteSetup(() => {
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
			'id': 'extHostConfiguration',
			'title': 'a',
			'type': 'object',
			'properties': {
				'extHostConfiguration.resource': {
					'description': 'extHostConfiguration.resource',
					'type': 'boolean',
					'default': true,
					'scope': ConfigurationScope.RESOURCE
				},
				'extHostConfiguration.window': {
					'description': 'extHostConfiguration.resource',
					'type': 'boolean',
					'default': true,
					'scope': ConfigurationScope.WINDOW
				}
			}
		});
	});

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IConfigurationService, new TestConfigurationService());

		target = sinon.spy();
		instantiationService.stub(IConfigurationEditingService, ConfigurationEditingService);
		instantiationService.stub(IConfigurationEditingService, 'writeConfiguration', target);
	});

	test('update resource configuration without configuration target defaults to workspace in multi root workspace when no resource is provided', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => true });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(null, 'extHostConfiguration.resource', 'value', null);

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('update resource configuration without configuration target defaults to workspace in folder workspace when resource is provider', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(null, 'extHostConfiguration.resource', 'value', URI.file('abc'));

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('update resource configuration without configuration target defaults to workspace in folder workspace when no resource is provider', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(null, 'extHostConfiguration.resource', 'value', null);

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('update window configuration without configuration target defaults to workspace in multi root workspace when no resource is provided', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => true });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(null, 'extHostConfiguration.window', 'value', null);

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('update window configuration without configuration target defaults to workspace in multi root workspace when resource is provided', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => true });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(null, 'extHostConfiguration.window', 'value', URI.file('abc'));

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('update window configuration without configuration target defaults to workspace in folder workspace when resource is provider', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(null, 'extHostConfiguration.window', 'value', URI.file('abc'));

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('update window configuration without configuration target defaults to workspace in folder workspace when no resource is provider', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(null, 'extHostConfiguration.window', 'value', null);

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('update resource configuration without configuration target defaults to folder', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => true });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(null, 'extHostConfiguration.resource', 'value', URI.file('abc'));

		assert.equal(ConfigurationTarget.FOLDER, target.args[0][0]);
	});

	test('update configuration with user configuration target', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(ConfigurationTarget.USER, 'extHostConfiguration.window', 'value', URI.file('abc'));

		assert.equal(ConfigurationTarget.USER, target.args[0][0]);
	});

	test('update configuration with workspace configuration target', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(ConfigurationTarget.WORKSPACE, 'extHostConfiguration.window', 'value', URI.file('abc'));

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('update configuration with folder configuration target', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$updateConfigurationOption(ConfigurationTarget.FOLDER, 'extHostConfiguration.window', 'value', URI.file('abc'));

		assert.equal(ConfigurationTarget.FOLDER, target.args[0][0]);
	});

	test('remove resource configuration without configuration target defaults to workspace in multi root workspace when no resource is provided', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => true });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$removeConfigurationOption(null, 'extHostConfiguration.resource', null);

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('remove resource configuration without configuration target defaults to workspace in folder workspace when resource is provider', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$removeConfigurationOption(null, 'extHostConfiguration.resource', URI.file('abc'));

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('remove resource configuration without configuration target defaults to workspace in folder workspace when no resource is provider', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$removeConfigurationOption(null, 'extHostConfiguration.resource', null);

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('remove window configuration without configuration target defaults to workspace in multi root workspace when no resource is provided', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => true });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$removeConfigurationOption(null, 'extHostConfiguration.window', null);

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('remove window configuration without configuration target defaults to workspace in multi root workspace when resource is provided', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => true });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$removeConfigurationOption(null, 'extHostConfiguration.window', URI.file('abc'));

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('remove window configuration without configuration target defaults to workspace in folder workspace when resource is provider', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$removeConfigurationOption(null, 'extHostConfiguration.window', URI.file('abc'));

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('remove window configuration without configuration target defaults to workspace in folder workspace when no resource is provider', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => false });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$removeConfigurationOption(null, 'extHostConfiguration.window', null);

		assert.equal(ConfigurationTarget.WORKSPACE, target.args[0][0]);
	});

	test('remove configuration without configuration target defaults to folder', function () {
		instantiationService.stub(IWorkspaceContextService, <IWorkspaceContextService>{ hasMultiFolderWorkspace: () => true });
		const testObject: MainThreadConfiguration = instantiationService.createInstance(MainThreadConfiguration, OneGetThreadService(null));

		testObject.$removeConfigurationOption(null, 'extHostConfiguration.resource', URI.file('abc'));

		assert.equal(ConfigurationTarget.FOLDER, target.args[0][0]);
	});
});
