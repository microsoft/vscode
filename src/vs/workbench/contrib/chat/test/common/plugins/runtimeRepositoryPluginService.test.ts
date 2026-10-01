/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IAgentHostRepositoryPluginContextResult } from '../../../../../../platform/agentHost/common/repositoryPluginContexts.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { RuntimeRepositoryPluginService } from '../../../common/plugins/runtimeRepositoryPluginService.js';

suite('RuntimeRepositoryPluginService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function result(path: string, enabled: boolean): IAgentHostRepositoryPluginContextResult {
		return {
			repositoryEnabledPlugins: { 'demo@market': enabled },
			repositoryPlugins: [{
				plugin: {
					name: 'demo',
					marketplace: 'market',
					enabled: false,
					installed_at: '2026-09-30T00:00:00Z',
					cache_path: path,
				},
				enabled,
			}],
			installResults: [],
			updateResults: [],
			warnings: [],
		};
	}

	function createService(): RuntimeRepositoryPluginService {
		return store.add(new RuntimeRepositoryPluginService(new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		}()));
	}

	test('keeps repository enablement scoped to its working directory', () => {
		const service = createService();
		const first = URI.file('/workspace/first');
		const second = URI.file('/workspace/second');
		const third = URI.file('/workspace/third');
		const plugin = { name: 'demo', marketplace: 'market' };

		service.setSnapshot(first, result('/plugins/demo', true));
		service.setSnapshot(second, result('/plugins/demo', false));

		assert.deepStrictEqual({
			first: service.getEnablement(plugin, true, first),
			second: service.getEnablement(plugin, true, second),
			duplicateSource: service.getEnablement(plugin, false, first),
			missingWorkspace: service.getEnablement(plugin, true, third),
			ambient: service.getEnablement(plugin, true, undefined),
		}, {
			first: true,
			second: false,
			duplicateSource: false,
			missingWorkspace: false,
			ambient: undefined,
		});
	});

	test('removes snapshots for workspace folders that are no longer present', () => {
		const service = createService();
		const first = URI.file('/workspace/first');
		const second = URI.file('/workspace/second');
		service.setSnapshot(first, result('/plugins/first', true));
		service.setSnapshot(second, result('/plugins/second', true));

		service.retainWorkingDirectories([second]);

		assert.deepStrictEqual(service.snapshots.get().map(snapshot => snapshot.workingDirectory.toString()), [second.toString()]);
	});

	test('removes only explicitly invalidated workspace snapshots', () => {
		const service = createService();
		const first = URI.file('/workspace/first');
		const second = URI.file('/workspace/second');
		service.setSnapshot(first, result('/plugins/first', true));
		service.setSnapshot(second, result('/plugins/second', true));

		service.removeSnapshots([first]);

		assert.deepStrictEqual(service.snapshots.get().map(snapshot => snapshot.workingDirectory.toString()), [second.toString()]);
	});

	test('replaces runtime snapshots and fails closed for error contexts', () => {
		const service = createService();
		const first = URI.file('/workspace/first');
		const second = URI.file('/workspace/second');

		service.applySnapshot({
			revision: 1,
			contexts: [
				{
					id: first.toString(),
					workingDirectory: first.toString(),
					state: 'ready',
					result: result('/plugins/first', true),
				},
				{
					id: second.toString(),
					workingDirectory: second.toString(),
					state: 'error',
					error: 'failed',
				},
			],
		});

		assert.deepStrictEqual(service.snapshots.get().map(snapshot => snapshot.workingDirectory.toString()), [first.toString()]);
	});
});
