/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService } from '../../../platform/workspace/common/workspace.js';
import { ExcludeResourceGlobMatcher, ResourceGlobMatcher } from '../../common/resources.js';
import { TestContextService } from './workbenchTestServices.js';

suite('ResourceGlobMatcher', () => {

	const SETTING = 'test.matcher';

	let contextService: IWorkspaceContextService;
	let configurationService: TestConfigurationService;

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		contextService = new TestContextService();
		configurationService = new TestConfigurationService({
			[SETTING]: {
				'**/*.md': true,
				'**/*.txt': false
			}
		});
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

	test('Exclude exceptions', async () => {
		await configurationService.setUserConfiguration(SETTING, {
			'**/node_modules/**': true,
			'!**/node_modules/@types/**': true
		});
		const matcher = disposables.add(new ResourceGlobMatcher(() => configurationService.getValue(SETTING), e => e.affectsConfiguration(SETTING), contextService, configurationService));
		const excludeMatcher = disposables.add(new ExcludeResourceGlobMatcher(() => configurationService.getValue(SETTING), e => e.affectsConfiguration(SETTING), contextService, configurationService));
		const resources = [URI.file('/foo/node_modules/a.js'), URI.file('/foo/node_modules/@types/a.d.ts')];

		assert.deepStrictEqual({
			literal: resources.map(resource => matcher.matches(resource)),
			exceptions: resources.map(resource => excludeMatcher.matches(resource)),
		}, {
			literal: [true, true],
			exceptions: [true, false],
		});
	});

	test('Exclude exceptions also apply when an absolute pattern matches', async () => {
		await configurationService.setUserConfiguration(SETTING, {
			'C:/testWorkspace/src/**': true,
			'/testWorkspace/src/**': true,
			'!src/keep.txt': true
		});
		const excludeMatcher = disposables.add(new ExcludeResourceGlobMatcher(() => configurationService.getValue(SETTING), e => e.affectsConfiguration(SETTING), contextService, configurationService));
		const folder = contextService.getWorkspace().folders[0].uri;

		assert.deepStrictEqual([excludeMatcher.matches(URI.joinPath(folder, 'src', 'keep.txt')), excludeMatcher.matches(URI.joinPath(folder, 'src', 'drop.txt'))], [false, true]);
	});

});
