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

	function createDoc(languageId: string, uri = 'file:///foo/bar'): vscode.TextDocument {
		return {
			uri: URI.parse(uri),
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

	it('tracks documents of every scheme except ignored ones (issue #337933)', async () => {
		const documentFilter = new DocumentFilter(ignoreService, new DefaultsOnlyConfigurationService());
		const uris = [
			'file:///a.ts',
			'untitled:Untitled-1',
			'vscode-notebook-cell:/a.ipynb#W0sZmlsZQ%3D%3D',
			'memfs:/a.ts',
			'zowe-ds:/profile/USER.COBOL(MEMBER)',
			'vscode-remote://ssh-remote%2Bhost/a.ts',
			'vscode-userdata:/Users/u/Library/Application%20Support/Code/User/settings.json',
			'output:extension-output-1',
			'git:/a.ts?%7B%7D',
			'vscode-chat-code-block:/1',
			'chatSessionInput:/1',
			'vscode-chat-terminal-output:/terminal/1/out.txt',
		];

		const tracked = Object.fromEntries(await Promise.all(uris.map(async uri => [uri, await documentFilter.isTrackingEnabled(createDoc(js, uri))])));

		expect(tracked).toEqual({
			'file:///a.ts': true,
			'untitled:Untitled-1': true,
			'vscode-notebook-cell:/a.ipynb#W0sZmlsZQ%3D%3D': true,
			'memfs:/a.ts': true,
			'zowe-ds:/profile/USER.COBOL(MEMBER)': true,
			'vscode-remote://ssh-remote%2Bhost/a.ts': true,
			'vscode-userdata:/Users/u/Library/Application%20Support/Code/User/settings.json': true,
			'output:extension-output-1': false,
			'git:/a.ts?%7B%7D': false,
			'vscode-chat-code-block:/1': false,
			'chatSessionInput:/1': false,
			'vscode-chat-terminal-output:/terminal/1/out.txt': false,
		});
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

	it('respects a per-language disablement even when the global setting is enabled (issue #323753)', async () => {
		const defaultsConfigService = new DefaultsOnlyConfigurationService();
		const configService = new InMemoryConfigurationService(defaultsConfigService);
		configService.setConfig(ConfigKey.Enable, { '*': true, 'markdown': false });
		const documentFilter = new DocumentFilter(ignoreService, configService);

		expect(documentFilter.isLanguageEnabled('markdown')).toBe(false);
		expect(documentFilter.isLanguageEnabled(js)).toBe(true);
		expect(await documentFilter.isTrackingEnabled(createDoc('markdown'))).toBe(false);
	});

	it('ignoreCompletionsDisablement overrides only the global disablement, not a per-language one', () => {
		const defaultsConfigService = new DefaultsOnlyConfigurationService();
		const configService = new InMemoryConfigurationService(defaultsConfigService);
		configService.setConfig(ConfigKey.Enable, { '*': false, 'markdown': false });
		configService.setConfig(ConfigKey.TeamInternal.InlineEditsIgnoreCompletionsDisablement, true);
		const documentFilter = new DocumentFilter(ignoreService, configService);

		// a language without an explicit setting falls back to the (overridden) global setting
		expect(documentFilter.isLanguageEnabled(js)).toBe(true);
		// an explicit per-language disablement is still respected
		expect(documentFilter.isLanguageEnabled('markdown')).toBe(false);
	});
});
