/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { TestEnvironmentService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import type { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { AbstractPathService } from '../../common/pathService.js';

suite('PathService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPathService(remoteOperatingSystem: OperatingSystem | undefined): AbstractPathService {
		const remoteAgentService = upcastPartial<IRemoteAgentService>({
			getEnvironment: async () => remoteOperatingSystem === undefined
				? null
				: upcastPartial<IRemoteAgentEnvironment>({ os: remoteOperatingSystem }),
		});
		return new class extends AbstractPathService {
			constructor() {
				super(URI.file('/home/test'), remoteAgentService, TestEnvironmentService, new TestContextService());
			}
		}();
	}

	test('resolves ambient vscode-remote semantics from the remote environment', async () => {
		const pathService = createPathService(OperatingSystem.Windows);
		const resource = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: '/workspace' });

		assert.deepStrictEqual({
			operatingSystem: await pathService.getOperatingSystem(resource),
			separator: (await pathService.getPath(resource))?.sep,
		}, {
			operatingSystem: OperatingSystem.Windows,
			separator: '\\',
		});
	});

	test('resolves mixed registered authorities and falls back when semantics are unknown', async () => {
		const pathService = createPathService(undefined);
		const first = disposables.add(pathService.registerPathProvider('test-remote', {
			getOperatingSystem: async resource => resource.authority === 'windows' ? OperatingSystem.Windows : undefined,
		}));
		const second = pathService.registerPathProvider('test-remote', {
			getOperatingSystem: async resource => resource.authority === 'linux' ? OperatingSystem.Linux : undefined,
		});
		const windows = URI.from({ scheme: 'test-remote', authority: 'windows', path: '/' });
		const linux = URI.from({ scheme: 'test-remote', authority: 'linux', path: '/' });
		const unknown = URI.from({ scheme: 'test-remote', authority: 'unknown', path: '/' });

		assert.deepStrictEqual({
			windows: {
				operatingSystem: await pathService.getOperatingSystem(windows),
				separator: (await pathService.getPath(windows))?.sep,
			},
			linux: {
				operatingSystem: await pathService.getOperatingSystem(linux),
				separator: (await pathService.getPath(linux))?.sep,
			},
			unknown: await pathService.getPath(unknown),
		}, {
			windows: {
				operatingSystem: OperatingSystem.Windows,
				separator: '\\',
			},
			linux: {
				operatingSystem: OperatingSystem.Linux,
				separator: '/',
			},
			unknown: undefined,
		});

		second.dispose();
		first.dispose();
	});
});
