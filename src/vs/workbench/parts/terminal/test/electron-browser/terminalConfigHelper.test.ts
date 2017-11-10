/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { IConfigurationService, getConfigurationValue, IConfigurationOverrides } from 'vs/platform/configuration/common/configuration';
import { TPromise } from 'vs/base/common/winjs.base';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { isFedora } from 'vs/workbench/parts/terminal/electron-browser/terminal';

class MockConfigurationService implements IConfigurationService {
	public _serviceBrand: any;
	public serviceId = IConfigurationService;
	public constructor(private configuration: any = {}) { }
	public inspect<T>(key: string, overrides?: IConfigurationOverrides): any { return { value: getConfigurationValue<T>(this.getValue(), key), default: getConfigurationValue<T>(this.getValue(), key), user: getConfigurationValue<T>(this.getValue(), key), workspace: void 0, workspaceFolder: void 0 }; }
	public keys() { return { default: [] as string[], user: [] as string[], workspace: [] as string[], workspaceFolder: [] as string[] }; }
	public getValue(): any { return this.configuration; }
	public updateValue(): TPromise<void> { return null; }
	public getConfigurationData(): any { return null; }
	public onDidChangeConfiguration() { return { dispose() { } }; }
	public reloadConfiguration(): TPromise<void> { return null; }
}

suite('Workbench - TerminalConfigHelper', () => {
	let fixture: HTMLElement;

	setup(() => {
		fixture = document.body;
	});

	test('TerminalConfigHelper - getFont fontFamily', function () {
		let configurationService: IConfigurationService;
		let configHelper: TerminalConfigHelper;

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: 'bar'
				}
			}
		});
		configHelper = new TerminalConfigHelper(configurationService, null, null, null);
		configHelper.panelContainer = fixture;
		assert.equal(configHelper.getFont().fontFamily, 'bar', 'terminal.integrated.fontFamily should be selected over editor.fontFamily');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: 0
				}
			}
		});
		configHelper = new TerminalConfigHelper(configurationService, null, null, null);
		configHelper.panelContainer = fixture;
		if (isFedora) {
			assert.equal(configHelper.getFont().fontFamily, '\'DejaVu Sans Mono\'', 'Fedora should have its font overridden when terminal.integrated.fontFamily not set');
		} else {
			assert.equal(configHelper.getFont().fontFamily, 'foo', 'editor.fontFamily should be the fallback when terminal.integrated.fontFamily not set');
		}
	});

	test('TerminalConfigHelper - getFont fontSize', function () {
		let configurationService: IConfigurationService;
		let configHelper: TerminalConfigHelper;

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
				fontSize: 9
			},
			terminal: {
				integrated: {
					fontFamily: 'bar',
					fontSize: 10
				}
			}
		});
		configHelper = new TerminalConfigHelper(configurationService, null, null, null);
		configHelper.panelContainer = fixture;
		assert.equal(configHelper.getFont().fontSize, 10, 'terminal.integrated.fontSize should be selected over editor.fontSize');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo'
			},
			terminal: {
				integrated: {
					fontFamily: 0,
					fontSize: 0
				}
			}
		});
		configHelper = new TerminalConfigHelper(configurationService, null, null, null);
		configHelper.panelContainer = fixture;
		assert.equal(configHelper.getFont().fontSize, 6, 'The minimum terminal font size should be used when terminal.integrated.fontSize less than it');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
			},
			terminal: {
				integrated: {
					fontFamily: 0,
					fontSize: null
				}
			}
		});
		configHelper = new TerminalConfigHelper(configurationService, null, null, null);
		configHelper.panelContainer = fixture;
		assert.equal(configHelper.getFont().fontSize, EDITOR_FONT_DEFAULTS.fontSize, 'The default editor font size should be used when terminal.integrated.fontSize is not set');
	});

	test('TerminalConfigHelper - getFont lineHeight', function () {
		let configurationService: IConfigurationService;
		let configHelper: TerminalConfigHelper;

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
				lineHeight: 1
			},
			terminal: {
				integrated: {
					fontFamily: 0,
					lineHeight: 2
				}
			}
		});
		configHelper = new TerminalConfigHelper(configurationService, null, null, null);
		configHelper.panelContainer = fixture;
		assert.equal(configHelper.getFont().lineHeight, 2, 'terminal.integrated.lineHeight should be selected over editor.lineHeight');

		configurationService = new MockConfigurationService({
			editor: {
				fontFamily: 'foo',
				lineHeight: 1
			},
			terminal: {
				integrated: {
					fontFamily: 0,
					lineHeight: 0
				}
			}
		});
		configHelper = new TerminalConfigHelper(configurationService, null, null, null);
		configHelper.panelContainer = fixture;
		assert.equal(configHelper.getFont().lineHeight, 1, 'editor.lineHeight should be 1 when terminal.integrated.lineHeight not set');
	});
});