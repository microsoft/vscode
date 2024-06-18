/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { notStrictEqual, strictEqual } from 'assert';
import { getActiveWindow } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { isLinux } from 'vs/base/common/platform';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ITerminalConfigurationService, LinuxDistro } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalConfigurationService } from 'vs/workbench/contrib/terminal/browser/terminalConfigurationService';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

class TestTerminalConfigurationService extends TerminalConfigurationService {
	get fontMetrics() { return this._fontMetrics; }
}

suite('Workbench - TerminalConfigurationService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;
	let terminalConfigurationService: ITerminalConfigurationService;

	setup(() => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
		terminalConfigurationService = instantiationService.get(ITerminalConfigurationService);
	});

	suite('config', () => {
		test('should update on any change to terminal.integrated', () => {
			const originalConfig = terminalConfigurationService.config;
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: configuration => configuration.startsWith('terminal.integrated'),
				affectedKeys: new Set(['terminal.integrated.fontWeight']),
				change: null!,
				source: ConfigurationTarget.USER
			});
			notStrictEqual(terminalConfigurationService.config, originalConfig, 'Object reference must change');
		});

		suite('onConfigChanged', () => {
			test('should fire on any change to terminal.integrated', async () => {
				await new Promise<void>(r => {
					store.add(terminalConfigurationService.onConfigChanged(() => r()));
					configurationService.onDidChangeConfigurationEmitter.fire({
						affectsConfiguration: configuration => configuration.startsWith('terminal.integrated'),
						affectedKeys: new Set(['terminal.integrated.fontWeight']),
						change: null!,
						source: ConfigurationTarget.USER
					});
				});
			});
		});
	});

	function createTerminalConfigationService(config: any, linuxDistro?: LinuxDistro): ITerminalConfigurationService {
		const instantiationService = new TestInstantiationService();
		instantiationService.set(IConfigurationService, new TestConfigurationService(config));
		const terminalConfigurationService = store.add(instantiationService.createInstance(TestTerminalConfigurationService));
		instantiationService.set(ITerminalConfigurationService, terminalConfigurationService);
		terminalConfigurationService.setPanelContainer(mainWindow.document.body);
		if (linuxDistro) {
			terminalConfigurationService.fontMetrics.linuxDistro = linuxDistro;
		}
		return terminalConfigurationService;
	}

	suite('getFont', () => {
		test('fontFamily', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				editor: { fontFamily: 'foo' },
				terminal: { integrated: { fontFamily: 'bar' } }
			});
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontFamily, 'bar, monospace', 'terminal.integrated.fontFamily should be selected over editor.fontFamily');
		});

		test('fontFamily (Linux Fedora)', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				editor: { fontFamily: 'foo' },
				terminal: { integrated: { fontFamily: null } }
			}, LinuxDistro.Fedora);
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontFamily, '\'DejaVu Sans Mono\', monospace', 'Fedora should have its font overridden when terminal.integrated.fontFamily not set');
		});

		test('fontFamily (Linux Ubuntu)', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				editor: { fontFamily: 'foo' },
				terminal: { integrated: { fontFamily: null } }
			}, LinuxDistro.Ubuntu);
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontFamily, '\'Ubuntu Mono\', monospace', 'Ubuntu should have its font overridden when terminal.integrated.fontFamily not set');
		});

		test('fontFamily (Linux Unknown)', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				editor: { fontFamily: 'foo' },
				terminal: { integrated: { fontFamily: null } }
			});
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontFamily, 'foo, monospace', 'editor.fontFamily should be the fallback when terminal.integrated.fontFamily not set');
		});

		test('fontSize 10', () => {
			const terminalConfigurationService = createTerminalConfigationService({
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
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontSize, 10, 'terminal.integrated.fontSize should be selected over editor.fontSize');
		});

		test('fontSize 0', () => {
			let terminalConfigurationService = createTerminalConfigationService({
				editor: {
					fontFamily: 'foo'
				},
				terminal: {
					integrated: {
						fontFamily: null,
						fontSize: 0
					}
				}
			}, LinuxDistro.Ubuntu);
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontSize, 8, 'The minimum terminal font size (with adjustment) should be used when terminal.integrated.fontSize less than it');

			terminalConfigurationService = createTerminalConfigationService({
				editor: {
					fontFamily: 'foo'
				},
				terminal: {
					integrated: {
						fontFamily: null,
						fontSize: 0
					}
				}
			});
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontSize, 6, 'The minimum terminal font size should be used when terminal.integrated.fontSize less than it');
		});

		test('fontSize 1500', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				editor: {
					fontFamily: 'foo'
				},
				terminal: {
					integrated: {
						fontFamily: 0,
						fontSize: 1500
					}
				}
			});
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontSize, 100, 'The maximum terminal font size should be used when terminal.integrated.fontSize more than it');
		});

		test('fontSize null', () => {
			let terminalConfigurationService = createTerminalConfigationService({
				editor: {
					fontFamily: 'foo'
				},
				terminal: {
					integrated: {
						fontFamily: 0,
						fontSize: null
					}
				}
			}, LinuxDistro.Ubuntu);
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontSize, EDITOR_FONT_DEFAULTS.fontSize + 2, 'The default editor font size (with adjustment) should be used when terminal.integrated.fontSize is not set');

			terminalConfigurationService = createTerminalConfigationService({
				editor: {
					fontFamily: 'foo'
				},
				terminal: {
					integrated: {
						fontFamily: 0,
						fontSize: null
					}
				}
			});
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).fontSize, EDITOR_FONT_DEFAULTS.fontSize, 'The default editor font size should be used when terminal.integrated.fontSize is not set');
		});

		test('lineHeight 2', () => {
			const terminalConfigurationService = createTerminalConfigationService({
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
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).lineHeight, 2, 'terminal.integrated.lineHeight should be selected over editor.lineHeight');
		});

		test('lineHeight 0', () => {
			const terminalConfigurationService = createTerminalConfigationService({
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
			strictEqual(terminalConfigurationService.getFont(getActiveWindow()).lineHeight, isLinux ? 1.1 : 1, 'editor.lineHeight should be the default when terminal.integrated.lineHeight not set');
		});
	});

	suite('configFontIsMonospace', () => {
		test('isMonospace monospace', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				terminal: {
					integrated: {
						fontFamily: 'monospace'
					}
				}
			});

			strictEqual(terminalConfigurationService.configFontIsMonospace(), true, 'monospace is monospaced');
		});

		test('isMonospace sans-serif', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				terminal: {
					integrated: {
						fontFamily: 'sans-serif'
					}
				}
			});
			strictEqual(terminalConfigurationService.configFontIsMonospace(), false, 'sans-serif is not monospaced');
		});

		test('isMonospace serif', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				terminal: {
					integrated: {
						fontFamily: 'serif'
					}
				}
			});
			strictEqual(terminalConfigurationService.configFontIsMonospace(), false, 'serif is not monospaced');
		});

		test('isMonospace monospace falls back to editor.fontFamily', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				editor: {
					fontFamily: 'monospace'
				},
				terminal: {
					integrated: {
						fontFamily: null
					}
				}
			});
			strictEqual(terminalConfigurationService.configFontIsMonospace(), true, 'monospace is monospaced');
		});

		test('isMonospace sans-serif falls back to editor.fontFamily', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				editor: {
					fontFamily: 'sans-serif'
				},
				terminal: {
					integrated: {
						fontFamily: null
					}
				}
			});
			strictEqual(terminalConfigurationService.configFontIsMonospace(), false, 'sans-serif is not monospaced');
		});

		test('isMonospace serif falls back to editor.fontFamily', () => {
			const terminalConfigurationService = createTerminalConfigationService({
				editor: {
					fontFamily: 'serif'
				},
				terminal: {
					integrated: {
						fontFamily: null
					}
				}
			});
			strictEqual(terminalConfigurationService.configFontIsMonospace(), false, 'serif is not monospaced');
		});
	});
});
