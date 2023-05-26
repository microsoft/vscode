/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';

suite('ResourceGlobMatcher', () => {

	const SETTING = 'test.matcher';

	let contextService: IWorkspaceContextService;
	let configurationService: TestConfigurationService;

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
		const matcher = new ResourceGlobMatcher(() => configurationService.getValue(SETTING), e => e.affectsConfiguration(SETTING), contextService, configurationService);

		// Matching
		assert.equal(matcher.matches(URI.file('/foo/bar')), false);
		assert.equal(matcher.matches(URI.file('/foo/bar.md')), true);
		assert.equal(matcher.matches(URI.file('/foo/bar.txt')), false);

		// Events
		let eventCounter = 0;
		matcher.onExpressionChange(() => eventCounter++);

		await configurationService.setUserConfiguration(SETTING, { '**/*.foo': true });
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === SETTING } as any);
		assert.equal(eventCounter, 1);

		assert.equal(matcher.matches(URI.file('/foo/bar.md')), false);
		assert.equal(matcher.matches(URI.file('/foo/bar.foo')), true);

		await configurationService.setUserConfiguration(SETTING, undefined);
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
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === SETTING } as any);

		assert.equal(matcher.matches(URI.file('/bar/foo.1')), true);
		assert.equal(matcher.matches(URI.file('C:/bar/foo.1')), true);
	});
});
