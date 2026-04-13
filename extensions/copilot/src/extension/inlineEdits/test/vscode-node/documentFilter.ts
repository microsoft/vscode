/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeAll, describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IIgnoreService, NullIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { URI } from '../../../../util/vs/base/common/uri';
import { DocumentFilter } from '../../vscode-node/parts/documentFilter';

describe('DocumentFilter', () => {

	const js = 'javascript';

	function createDoc(languageId: string): vscode.TextDocument {
		return {
			uri: URI.parse('file:///foo/bar'),
			languageId,
		} as vscode.TextDocument;
	}

	let ignoreService: IIgnoreService;

	beforeAll(() => {
		ignoreService = NullIgnoreService.Instance;
	});

	it('returns enabled for js by default', async () => {
		const defaultsConfigService = new DefaultsOnlyConfigurationService();
		const documentFilter = new DocumentFilter(ignoreService, defaultsConfigService);
		const doc = createDoc(js);
		const isEnabled = await documentFilter.isTrackingEnabled(doc);
		expect(isEnabled).toBe(true);
	});

	it('can react to copilot.enable config changes for off-by-default language id', async () => {
		const defaultsConfigService = new DefaultsOnlyConfigurationService();
		const defaultConfig = defaultsConfigService.getConfig(ConfigKey.Enable);
		const configService = new InMemoryConfigurationService(defaultsConfigService);
		const documentFilter = new DocumentFilter(ignoreService, configService);
		const doc = createDoc('markdown');

		const isEnabled0 = await documentFilter.isTrackingEnabled(doc);
		expect(isEnabled0).toBe(false);

		configService.setConfig(ConfigKey.Enable, {
			...defaultConfig,
			'markdown': true,
		});

		const isEnabled1 = await documentFilter.isTrackingEnabled(doc);
		expect(isEnabled1).toBe(true);
	});

	it('can react to copilot.enable config changes for javascript', async () => {
		const defaultsConfigService = new DefaultsOnlyConfigurationService();
		const defaultConfig = defaultsConfigService.getConfig(ConfigKey.Enable);
		const configService = new InMemoryConfigurationService(defaultsConfigService, new Map(
			[
				[ConfigKey.Enable, {
					...defaultConfig,
					[js]: false,
				}],
			]
		));
		const documentFilter = new DocumentFilter(ignoreService, configService);
		const doc = createDoc(js);

		const isEnabled0 = await documentFilter.isTrackingEnabled(doc);
		expect(isEnabled0).toBe(false);

		configService.setConfig(ConfigKey.Enable, {
			...defaultConfig,
			[js]: true,
		});

		const isEnabled1 = await documentFilter.isTrackingEnabled(doc);
		expect(isEnabled1).toBe(true);
	});
});
