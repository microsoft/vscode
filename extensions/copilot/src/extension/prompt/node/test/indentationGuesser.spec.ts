/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigurationScope } from 'vscode';
import { describe, expect, it } from 'vitest';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { resolveIndentationDefaults, transformIndentation } from '../indentationGuesser';

describe('identationGuesser', () => {
	it('transformIndentation', () => {
		expect(transformIndentation('  hello()', { insertSpaces: true, tabSize: 2 }, { insertSpaces: false, tabSize: 2 })).toBe('\thello()');

		// 4 spaces to 2-space indent
		expect(transformIndentation('    hello()', { insertSpaces: true, tabSize: 4 }, { insertSpaces: true, tabSize: 2 })).toBe('  hello()');
		// tab to 4 spaces
		expect(transformIndentation('\thello()', { insertSpaces: false, tabSize: 4 }, { insertSpaces: true, tabSize: 4 })).toBe('    hello()');
		// 8 spaces to tab (tabSize 4)
		expect(transformIndentation('        hello()', { insertSpaces: true, tabSize: 4 }, { insertSpaces: false, tabSize: 4 })).toBe('\t\thello()');
		// 2 tabs to 4 spaces (tabSize 2)
		expect(transformIndentation('\t\thello()', { insertSpaces: false, tabSize: 2 }, { insertSpaces: true, tabSize: 4 })).toBe('        hello()');
		// No indentation change
		expect(transformIndentation('hello()', { insertSpaces: true, tabSize: 2 }, { insertSpaces: true, tabSize: 2 })).toBe('hello()');
		expect(transformIndentation(' \thello()', { insertSpaces: false, tabSize: 4 }, { insertSpaces: true, tabSize: 2 })).toBe(' \thello()');
	});
});

describe('resolveIndentationDefaults', () => {
	class FakeConfigurationService extends DefaultsOnlyConfigurationService {
		readonly scopes: (ConfigurationScope | undefined)[] = [];

		constructor(private readonly values: Record<string, unknown>) {
			super();
		}

		override getNonExtensionConfig<T>(configKey: string, scope?: ConfigurationScope): T | undefined {
			this.scopes.push(scope);
			return this.values[configKey] as T | undefined;
		}
	}

	const scope = { languageId: 'json' };

	it('falls back to tabs with size 4 when nothing is configured', () => {
		expect(resolveIndentationDefaults(new FakeConfigurationService({}), scope)).toEqual({ insertSpaces: false, tabSize: 4 });
	});

	it('uses editor.insertSpaces and editor.tabSize', () => {
		expect(resolveIndentationDefaults(new FakeConfigurationService({ 'editor.insertSpaces': true, 'editor.tabSize': 2, 'editor.indentSize': 'tabSize' }), scope)).toEqual({ insertSpaces: true, tabSize: 2 });
	});

	it('prefers a numeric editor.indentSize when indenting with spaces', () => {
		expect(resolveIndentationDefaults(new FakeConfigurationService({ 'editor.insertSpaces': true, 'editor.tabSize': 8, 'editor.indentSize': 2 }), scope)).toEqual({ insertSpaces: true, tabSize: 2 });
	});

	it('ignores editor.indentSize when indenting with tabs', () => {
		expect(resolveIndentationDefaults(new FakeConfigurationService({ 'editor.insertSpaces': false, 'editor.tabSize': 8, 'editor.indentSize': 2 }), scope)).toEqual({ insertSpaces: false, tabSize: 8 });
	});

	it('ignores invalid values', () => {
		expect(resolveIndentationDefaults(new FakeConfigurationService({ 'editor.insertSpaces': 'yes', 'editor.tabSize': 0, 'editor.indentSize': -2 }), scope)).toEqual({ insertSpaces: false, tabSize: 4 });
	});

	it('resolves every setting in the given scope', () => {
		const configurationService = new FakeConfigurationService({});
		resolveIndentationDefaults(configurationService, scope);
		expect(configurationService.scopes).toEqual([scope, scope, scope]);
	});
});
