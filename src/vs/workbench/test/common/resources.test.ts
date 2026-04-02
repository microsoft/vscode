/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { ResourceGlobMatcher } from '../../common/resources.js';
import { TestContextService } from './workbenchTestServices.js';
import { testWorkspace } from '../../../platform/workspace/test/common/testWorkspace.js';
import { isWindows } from '../../../base/common/platform.js';

suite('ResourceGlobMatcher', () => {

	const SETTING = 'test.matcher';

	let contextService: IWorkspaceContextService;
	let configurationService: TestConfigurationService;

	const disposables = new DisposableStore();

	setup(() => {
		contextService = new TestContextService();
		configurationService = new TestConfigurationService({
			[SETTING]: {
				'**/*.md': true,
				'**/*.txt': false
			}
		});
	});

	teardown(() => {
		disposables.clear();
	});

	test('Basics', async () => {
		const matcher = disposables.add(new ResourceGlobMatcher(() => configurationService.getValue(SETTING), e => e.affectsConfiguration(SETTING), contextService, configurationService));

		// Matching
		assert.equal(matcher.matches(URI.file('/foo/bar')), false);
		assert.equal(matcher.matches(URI.file('/foo/bar.md')), true);
		assert.equal(matcher.matches(URI.file('/foo/bar.txt')), false);

		// Events
		let eventCounter = 0;
		disposables.add(matcher.onExpressionChange(() => eventCounter++));

		await configurationService.setUserConfiguration(SETTING, { '**/*.foo': true });
		// eslint-disable-next-line local/code-no-any-casts
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === SETTING } as any);
		assert.equal(eventCounter, 1);

		assert.equal(matcher.matches(URI.file('/foo/bar.md')), false);
		assert.equal(matcher.matches(URI.file('/foo/bar.foo')), true);

		await configurationService.setUserConfiguration(SETTING, undefined);
		// eslint-disable-next-line local/code-no-any-casts
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === SETTING } as any);
		assert.equal(eventCounter, 2);

		assert.equal(matcher.matches(URI.file('/foo/bar.md')), false);
		assert.equal(matcher.matches(URI.file('/foo/bar.foo')), false);

		await configurationService.setUserConfiguration(SETTING, {
			'**/*.md': true,
			'**/*.txt': false,
			'C:/bar/**': true,
			'/bar/**': true
		});
		// eslint-disable-next-line local/code-no-any-casts
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === SETTING } as any);

		assert.equal(matcher.matches(URI.file('/bar/foo.1')), true);
		assert.equal(matcher.matches(URI.file('C:/bar/foo.1')), true);
	});

	test("relative path prefix ./ is normalized (issue #304130)", async () => {
		// Regression test: patterns like './src/**' in files.readonlyInclude must behave
		// the same as 'src/**'. The ResourceGlobMatcher used to leave the leading './' in
		// place, so the glob never matched the workspace-relative resource path.
		const wsRoot = isWindows ? 'C:\\testWorkspace' : '/testWorkspace';
		const workspaceCtx = new TestContextService(testWorkspace(URI.file(wsRoot)));
		await configurationService.setUserConfiguration(SETTING, { ["./src/**"]: true });
		// eslint-disable-next-line local/code-no-any-casts
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === SETTING } as any);
		const resource = URI.file(wsRoot + (isWindows ? '\\src\\file.ts' : '/src/file.ts'));
		const matcher = disposables.add(new ResourceGlobMatcher(() => configurationService.getValue(SETTING), e => e.affectsConfiguration(SETTING), workspaceCtx, configurationService));
		assert.equal(matcher.matches(resource), true, '"./src/**" should match a resource under src/ within the workspace');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
