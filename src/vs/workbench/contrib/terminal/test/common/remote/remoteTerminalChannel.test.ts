/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { IChannel } from '../../../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestContextService, TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { EnvironmentVariableMutatorType, type IEnvironmentVariableCollection } from '../../../../../../platform/terminal/common/environmentVariable.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkbenchConfigurationService } from '../../../../../services/configuration/common/configuration.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IRemoteAuthorityResolverService } from '../../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IEnvironmentVariableService } from '../../../common/environmentVariable.js';
import { EnvironmentVariableService } from '../../../common/environmentVariableService.js';
import { ITerminalLogService, type ITerminalProcessOptions } from '../../../../../../platform/terminal/common/terminal.js';
import { RemoteTerminalChannelClient, type ICreateTerminalProcessArguments } from '../../../common/remote/remoteTerminalChannel.js';
import { RemoteTerminalChannelRequest } from '../../../common/remote/terminal.js';
import type { ICompleteTerminalConfiguration } from '../../../common/terminal.js';

class CapturingChannel implements IChannel {
	createRequest: ICreateTerminalProcessArguments | undefined;

	call<T>(command: string, arg?: unknown): Promise<T> {
		if (command === RemoteTerminalChannelRequest.CreateProcess && isCreateTerminalProcessArguments(arg)) {
			this.createRequest = arg;
		}
		return Promise.resolve(undefined!);
	}

	listen<T>(): Event<T> {
		return Event.None;
	}
}

function isCreateTerminalProcessArguments(value: unknown): value is ICreateTerminalProcessArguments {
	return typeof value === 'object' && value !== null && 'envVariableCollections' in value;
}

suite('RemoteTerminalChannelClient', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('serializes only target-eligible PATH mutations while retaining non-PATH mutations', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(IWorkbenchConfigurationService, {
			whenRemoteConfigurationLoaded: async () => { }
		});
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IConfigurationResolverService, {
			resolveAsync: async () => {
				throw new Error('No configuration variables are resolved by this focused request test');
			}
		});
		const environmentVariableService = store.add(instantiationService.createInstance(EnvironmentVariableService));
		const foreignCollection: IEnvironmentVariableCollection & { readonly remoteAuthority: string; readonly persistent: boolean } = {
			remoteAuthority: 'ssh-remote+other-host',
			persistent: false,
			map: new Map([
				['foreign-path', { variable: 'PATH', value: ':/foreign/bin', type: EnvironmentVariableMutatorType.Append }],
				['foreign-mixed', { variable: 'Path', value: 'mixed', type: EnvironmentVariableMutatorType.Replace }],
				['foreign-lower', { variable: 'path', value: 'lower', type: EnvironmentVariableMutatorType.Replace }],
				['shared-value', { variable: 'SHARED_VALUE', value: 'available', type: EnvironmentVariableMutatorType.Replace }]
			])
		};
		environmentVariableService.set('foreign.extension', foreignCollection);
		environmentVariableService.set('target.extension', {
			remoteAuthority: 'SSH-REMOTE+TARGET-HOST',
			persistent: false,
			map: new Map([
				['target-path', { variable: 'PATH', value: ':/target/bin', type: EnvironmentVariableMutatorType.Append }],
				['target-value', { variable: 'TARGET_VALUE', value: 'available', type: EnvironmentVariableMutatorType.Replace }]
			])
		});
		instantiationService.stub(IEnvironmentVariableService, environmentVariableService);
		instantiationService.stub(IRemoteAuthorityResolverService, {
			resolveAuthority: async () => ({
				authority: {
					authority: 'ssh-remote+target-host',
					connectTo: { type: 0, host: 'target-host', port: 22 },
					connectionToken: undefined
				}
			})
		});
		instantiationService.stub(ITerminalLogService, {
			error: () => { }
		});
		instantiationService.stub(IEditorService, {
			activeEditor: undefined
		});
		instantiationService.stub(ILabelService, {
			getWorkspaceLabel: () => 'workspace'
		});
		instantiationService.stub(IWorkbenchEnvironmentService, {
			debugExtensionHost: { port: null, break: false, env: {} }
		});

		const channel = new CapturingChannel();
		const client = instantiationService.createInstance(RemoteTerminalChannelClient, 'ssh-remote+target-host', channel);
		const configuration: ICompleteTerminalConfiguration = {
			'terminal.integrated.env.windows': {},
			'terminal.integrated.env.osx': {},
			'terminal.integrated.env.linux': {},
			'terminal.integrated.cwd': '',
			'terminal.integrated.detectLocale': 'auto'
		};
		const options: ITerminalProcessOptions = {
			shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' },
			windowsUseConptyDll: false,
			environmentVariableCollections: [],
			workspaceFolder: undefined,
			isScreenReaderOptimized: false
		};

		await client.createProcess({}, configuration, undefined, options, false, 80, 24, '6', OperatingSystem.Linux);

		deepStrictEqual(channel.createRequest?.envVariableCollections, [[
			'foreign.extension',
			[
				['foreign-mixed', { variable: 'Path', value: 'mixed', type: EnvironmentVariableMutatorType.Replace }],
				['foreign-lower', { variable: 'path', value: 'lower', type: EnvironmentVariableMutatorType.Replace }],
				['shared-value', { variable: 'SHARED_VALUE', value: 'available', type: EnvironmentVariableMutatorType.Replace }]
			],
			[]
		], [
			'target.extension',
			[
				['target-path', { variable: 'PATH', value: ':/target/bin', type: EnvironmentVariableMutatorType.Append }],
				['target-value', { variable: 'TARGET_VALUE', value: 'available', type: EnvironmentVariableMutatorType.Replace }]
			],
			[]
		]]);

		await client.createProcess({}, configuration, undefined, options, false, 80, 24, '6', OperatingSystem.Windows);
		deepStrictEqual(channel.createRequest?.envVariableCollections[0][1].map(([, mutator]) => mutator.variable), ['SHARED_VALUE']);

		await client.createProcess({}, configuration, undefined, { ...options, environmentVariableCollections: undefined }, false, 80, 24, '6', OperatingSystem.Linux);
		deepStrictEqual(channel.createRequest?.envVariableCollections, []);
	});
});
