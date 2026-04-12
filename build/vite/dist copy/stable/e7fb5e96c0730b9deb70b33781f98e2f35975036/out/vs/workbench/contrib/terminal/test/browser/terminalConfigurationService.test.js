/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { notStrictEqual, ok, strictEqual } from 'assert';
import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { isLinux } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EDITOR_FONT_DEFAULTS } from '../../../../../editor/common/config/fontInfo.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITerminalConfigurationService } from '../../browser/terminal.js';
import { TestTerminalConfigurationService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
suite('Workbench - TerminalConfigurationService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let configurationService;
    let terminalConfigurationService;
    setup(() => {
        const instantiationService = workbenchInstantiationService(undefined, store);
        configurationService = instantiationService.get(IConfigurationService);
        terminalConfigurationService = instantiationService.get(ITerminalConfigurationService);
    });
    suite('config', () => {
        test('should update on any change to terminal.integrated', () => {
            const originalConfig = terminalConfigurationService.config;
            configurationService.onDidChangeConfigurationEmitter.fire({
                affectsConfiguration: configuration => configuration.startsWith('terminal.integrated'),
                affectedKeys: new Set(['terminal.integrated.fontWeight']),
                change: null,
                source: 2 /* ConfigurationTarget.USER */
            });
            notStrictEqual(terminalConfigurationService.config, originalConfig, 'Object reference must change');
        });
        suite('onConfigChanged', () => {
            test('should fire on any change to terminal.integrated', async () => {
                await new Promise(r => {
                    store.add(terminalConfigurationService.onConfigChanged(() => r()));
                    configurationService.onDidChangeConfigurationEmitter.fire({
                        affectsConfiguration: configuration => configuration.startsWith('terminal.integrated'),
                        affectedKeys: new Set(['terminal.integrated.fontWeight']),
                        change: null,
                        source: 2 /* ConfigurationTarget.USER */
                    });
                });
            });
        });
    });
    function createTerminalConfigationService(config, linuxDistro) {
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
            ok(terminalConfigurationService.getFont(getActiveWindow()).fontFamily.startsWith('bar'), 'terminal.integrated.fontFamily should be selected over editor.fontFamily');
        });
        test('fontFamily (Linux Fedora)', () => {
            const terminalConfigurationService = createTerminalConfigationService({
                editor: { fontFamily: 'foo' },
                terminal: { integrated: { fontFamily: null } }
            }, 2 /* LinuxDistro.Fedora */);
            ok(terminalConfigurationService.getFont(getActiveWindow()).fontFamily.startsWith('\'DejaVu Sans Mono\''), 'Fedora should have its font overridden when terminal.integrated.fontFamily not set');
        });
        test('fontFamily (Linux Ubuntu)', () => {
            const terminalConfigurationService = createTerminalConfigationService({
                editor: { fontFamily: 'foo' },
                terminal: { integrated: { fontFamily: null } }
            }, 3 /* LinuxDistro.Ubuntu */);
            ok(terminalConfigurationService.getFont(getActiveWindow()).fontFamily.startsWith('\'Ubuntu Mono\''), 'Ubuntu should have its font overridden when terminal.integrated.fontFamily not set');
        });
        test('fontFamily (Linux Unknown)', () => {
            const terminalConfigurationService = createTerminalConfigationService({
                editor: { fontFamily: 'foo' },
                terminal: { integrated: { fontFamily: null } }
            });
            ok(terminalConfigurationService.getFont(getActiveWindow()).fontFamily.startsWith('foo'), 'editor.fontFamily should be the fallback when terminal.integrated.fontFamily not set');
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
            }, 3 /* LinuxDistro.Ubuntu */);
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
            }, 3 /* LinuxDistro.Ubuntu */);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvdGVzdC9icm93c2VyL3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDdkYsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzNILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSw2QkFBNkIsRUFBZSxNQUFNLDJCQUEyQixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXBJLEtBQUssQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7SUFDdEQsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUV4RCxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksNEJBQTJELENBQUM7SUFFaEUsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLE1BQU0sb0JBQW9CLEdBQUcsNkJBQTZCLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdFLG9CQUFvQixHQUFHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBNkIsQ0FBQztRQUNuRyw0QkFBNEIsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztJQUN4RixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyxRQUFRLEVBQUUsR0FBRyxFQUFFO1FBQ3BCLElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDL0QsTUFBTSxjQUFjLEdBQUcsNEJBQTRCLENBQUMsTUFBTSxDQUFDO1lBQzNELG9CQUFvQixDQUFDLCtCQUErQixDQUFDLElBQUksQ0FBQztnQkFDekQsb0JBQW9CLEVBQUUsYUFBYSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDO2dCQUN0RixZQUFZLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO2dCQUN6RCxNQUFNLEVBQUUsSUFBSztnQkFDYixNQUFNLGtDQUEwQjthQUNoQyxDQUFDLENBQUM7WUFDSCxjQUFjLENBQUMsNEJBQTRCLENBQUMsTUFBTSxFQUFFLGNBQWMsRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1FBQ3JHLENBQUMsQ0FBQyxDQUFDO1FBRUgsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtZQUM3QixJQUFJLENBQUMsa0RBQWtELEVBQUUsS0FBSyxJQUFJLEVBQUU7Z0JBQ25FLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxDQUFDLEVBQUU7b0JBQzNCLEtBQUssQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDbkUsb0JBQW9CLENBQUMsK0JBQStCLENBQUMsSUFBSSxDQUFDO3dCQUN6RCxvQkFBb0IsRUFBRSxhQUFhLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMscUJBQXFCLENBQUM7d0JBQ3RGLFlBQVksRUFBRSxJQUFJLEdBQUcsQ0FBQyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7d0JBQ3pELE1BQU0sRUFBRSxJQUFLO3dCQUNiLE1BQU0sa0NBQTBCO3FCQUNoQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxTQUFTLGdDQUFnQyxDQUFDLE1BQVcsRUFBRSxXQUF5QjtRQUMvRSxNQUFNLG9CQUFvQixHQUFHLElBQUksd0JBQXdCLEVBQUUsQ0FBQztRQUM1RCxvQkFBb0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsSUFBSSx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sNEJBQTRCLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsZ0NBQWdDLENBQUMsQ0FBQyxDQUFDO1FBQ3RILG9CQUFvQixDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3RGLDRCQUE0QixDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekUsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNqQiw0QkFBNEIsQ0FBQyxXQUFXLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztRQUNwRSxDQUFDO1FBQ0QsT0FBTyw0QkFBNEIsQ0FBQztJQUNyQyxDQUFDO0lBRUQsS0FBSyxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7UUFDckIsSUFBSSxDQUFDLFlBQVksRUFBRSxHQUFHLEVBQUU7WUFDdkIsTUFBTSw0QkFBNEIsR0FBRyxnQ0FBZ0MsQ0FBQztnQkFDckUsTUFBTSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRTtnQkFDN0IsUUFBUSxFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxFQUFFO2FBQy9DLENBQUMsQ0FBQztZQUNILEVBQUUsQ0FBQyw0QkFBNEIsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxFQUFFLDBFQUEwRSxDQUFDLENBQUM7UUFDdEssQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO1lBQ3RDLE1BQU0sNEJBQTRCLEdBQUcsZ0NBQWdDLENBQUM7Z0JBQ3JFLE1BQU0sRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7Z0JBQzdCLFFBQVEsRUFBRSxFQUFFLFVBQVUsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsRUFBRTthQUM5Qyw2QkFBcUIsQ0FBQztZQUN2QixFQUFFLENBQUMsNEJBQTRCLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLG9GQUFvRixDQUFDLENBQUM7UUFDak0sQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO1lBQ3RDLE1BQU0sNEJBQTRCLEdBQUcsZ0NBQWdDLENBQUM7Z0JBQ3JFLE1BQU0sRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7Z0JBQzdCLFFBQVEsRUFBRSxFQUFFLFVBQVUsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsRUFBRTthQUM5Qyw2QkFBcUIsQ0FBQztZQUN2QixFQUFFLENBQUMsNEJBQTRCLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLG9GQUFvRixDQUFDLENBQUM7UUFDNUwsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO1lBQ3ZDLE1BQU0sNEJBQTRCLEdBQUcsZ0NBQWdDLENBQUM7Z0JBQ3JFLE1BQU0sRUFBRSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUU7Z0JBQzdCLFFBQVEsRUFBRSxFQUFFLFVBQVUsRUFBRSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsRUFBRTthQUM5QyxDQUFDLENBQUM7WUFDSCxFQUFFLENBQUMsNEJBQTRCLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRSxzRkFBc0YsQ0FBQyxDQUFDO1FBQ2xMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGFBQWEsRUFBRSxHQUFHLEVBQUU7WUFDeEIsTUFBTSw0QkFBNEIsR0FBRyxnQ0FBZ0MsQ0FBQztnQkFDckUsTUFBTSxFQUFFO29CQUNQLFVBQVUsRUFBRSxLQUFLO29CQUNqQixRQUFRLEVBQUUsQ0FBQztpQkFDWDtnQkFDRCxRQUFRLEVBQUU7b0JBQ1QsVUFBVSxFQUFFO3dCQUNYLFVBQVUsRUFBRSxLQUFLO3dCQUNqQixRQUFRLEVBQUUsRUFBRTtxQkFDWjtpQkFDRDthQUNELENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxFQUFFLHNFQUFzRSxDQUFDLENBQUM7UUFDM0osQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtZQUN2QixJQUFJLDRCQUE0QixHQUFHLGdDQUFnQyxDQUFDO2dCQUNuRSxNQUFNLEVBQUU7b0JBQ1AsVUFBVSxFQUFFLEtBQUs7aUJBQ2pCO2dCQUNELFFBQVEsRUFBRTtvQkFDVCxVQUFVLEVBQUU7d0JBQ1gsVUFBVSxFQUFFLElBQUk7d0JBQ2hCLFFBQVEsRUFBRSxDQUFDO3FCQUNYO2lCQUNEO2FBQ0QsNkJBQXFCLENBQUM7WUFDdkIsV0FBVyxDQUFDLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsZ0hBQWdILENBQUMsQ0FBQztZQUVuTSw0QkFBNEIsR0FBRyxnQ0FBZ0MsQ0FBQztnQkFDL0QsTUFBTSxFQUFFO29CQUNQLFVBQVUsRUFBRSxLQUFLO2lCQUNqQjtnQkFDRCxRQUFRLEVBQUU7b0JBQ1QsVUFBVSxFQUFFO3dCQUNYLFVBQVUsRUFBRSxJQUFJO3dCQUNoQixRQUFRLEVBQUUsQ0FBQztxQkFDWDtpQkFDRDthQUNELENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLDhGQUE4RixDQUFDLENBQUM7UUFDbEwsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtZQUMxQixNQUFNLDRCQUE0QixHQUFHLGdDQUFnQyxDQUFDO2dCQUNyRSxNQUFNLEVBQUU7b0JBQ1AsVUFBVSxFQUFFLEtBQUs7aUJBQ2pCO2dCQUNELFFBQVEsRUFBRTtvQkFDVCxVQUFVLEVBQUU7d0JBQ1gsVUFBVSxFQUFFLENBQUM7d0JBQ2IsUUFBUSxFQUFFLElBQUk7cUJBQ2Q7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFDSCxXQUFXLENBQUMsNEJBQTRCLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRSw4RkFBOEYsQ0FBQyxDQUFDO1FBQ3BMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7WUFDMUIsSUFBSSw0QkFBNEIsR0FBRyxnQ0FBZ0MsQ0FBQztnQkFDbkUsTUFBTSxFQUFFO29CQUNQLFVBQVUsRUFBRSxLQUFLO2lCQUNqQjtnQkFDRCxRQUFRLEVBQUU7b0JBQ1QsVUFBVSxFQUFFO3dCQUNYLFVBQVUsRUFBRSxDQUFDO3dCQUNiLFFBQVEsRUFBRSxJQUFJO3FCQUNkO2lCQUNEO2FBQ0QsNkJBQXFCLENBQUM7WUFDdkIsV0FBVyxDQUFDLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxvQkFBb0IsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFLDRHQUE0RyxDQUFDLENBQUM7WUFFL04sNEJBQTRCLEdBQUcsZ0NBQWdDLENBQUM7Z0JBQy9ELE1BQU0sRUFBRTtvQkFDUCxVQUFVLEVBQUUsS0FBSztpQkFDakI7Z0JBQ0QsUUFBUSxFQUFFO29CQUNULFVBQVUsRUFBRTt3QkFDWCxVQUFVLEVBQUUsQ0FBQzt3QkFDYixRQUFRLEVBQUUsSUFBSTtxQkFDZDtpQkFDRDthQUNELENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsb0JBQW9CLENBQUMsUUFBUSxFQUFFLDBGQUEwRixDQUFDLENBQUM7UUFDMU0sQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtZQUN6QixNQUFNLDRCQUE0QixHQUFHLGdDQUFnQyxDQUFDO2dCQUNyRSxNQUFNLEVBQUU7b0JBQ1AsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLFVBQVUsRUFBRSxDQUFDO2lCQUNiO2dCQUNELFFBQVEsRUFBRTtvQkFDVCxVQUFVLEVBQUU7d0JBQ1gsVUFBVSxFQUFFLENBQUM7d0JBQ2IsVUFBVSxFQUFFLENBQUM7cUJBQ2I7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFDSCxXQUFXLENBQUMsNEJBQTRCLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSwwRUFBMEUsQ0FBQyxDQUFDO1FBQ2hLLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7WUFDekIsTUFBTSw0QkFBNEIsR0FBRyxnQ0FBZ0MsQ0FBQztnQkFDckUsTUFBTSxFQUFFO29CQUNQLFVBQVUsRUFBRSxLQUFLO29CQUNqQixVQUFVLEVBQUUsQ0FBQztpQkFDYjtnQkFDRCxRQUFRLEVBQUU7b0JBQ1QsVUFBVSxFQUFFO3dCQUNYLFVBQVUsRUFBRSxDQUFDO3dCQUNiLFVBQVUsRUFBRSxDQUFDO3FCQUNiO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBQ0gsV0FBVyxDQUFDLDRCQUE0QixDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLHFGQUFxRixDQUFDLENBQUM7UUFDM0wsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7UUFDbkMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtZQUNsQyxNQUFNLDRCQUE0QixHQUFHLGdDQUFnQyxDQUFDO2dCQUNyRSxRQUFRLEVBQUU7b0JBQ1QsVUFBVSxFQUFFO3dCQUNYLFVBQVUsRUFBRSxXQUFXO3FCQUN2QjtpQkFDRDthQUNELENBQUMsQ0FBQztZQUVILFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLElBQUksRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3BHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtZQUNuQyxNQUFNLDRCQUE0QixHQUFHLGdDQUFnQyxDQUFDO2dCQUNyRSxRQUFRLEVBQUU7b0JBQ1QsVUFBVSxFQUFFO3dCQUNYLFVBQVUsRUFBRSxZQUFZO3FCQUN4QjtpQkFDRDthQUNELENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLEtBQUssRUFBRSw4QkFBOEIsQ0FBQyxDQUFDO1FBQzFHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtZQUM5QixNQUFNLDRCQUE0QixHQUFHLGdDQUFnQyxDQUFDO2dCQUNyRSxRQUFRLEVBQUU7b0JBQ1QsVUFBVSxFQUFFO3dCQUNYLFVBQVUsRUFBRSxPQUFPO3FCQUNuQjtpQkFDRDthQUNELENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3JHLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEdBQUcsRUFBRTtZQUNsRSxNQUFNLDRCQUE0QixHQUFHLGdDQUFnQyxDQUFDO2dCQUNyRSxNQUFNLEVBQUU7b0JBQ1AsVUFBVSxFQUFFLFdBQVc7aUJBQ3ZCO2dCQUNELFFBQVEsRUFBRTtvQkFDVCxVQUFVLEVBQUU7d0JBQ1gsVUFBVSxFQUFFLElBQUk7cUJBQ2hCO2lCQUNEO2FBQ0QsQ0FBQyxDQUFDO1lBQ0gsV0FBVyxDQUFDLDRCQUE0QixDQUFDLHFCQUFxQixFQUFFLEVBQUUsSUFBSSxFQUFFLHlCQUF5QixDQUFDLENBQUM7UUFDcEcsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsd0RBQXdELEVBQUUsR0FBRyxFQUFFO1lBQ25FLE1BQU0sNEJBQTRCLEdBQUcsZ0NBQWdDLENBQUM7Z0JBQ3JFLE1BQU0sRUFBRTtvQkFDUCxVQUFVLEVBQUUsWUFBWTtpQkFDeEI7Z0JBQ0QsUUFBUSxFQUFFO29CQUNULFVBQVUsRUFBRTt3QkFDWCxVQUFVLEVBQUUsSUFBSTtxQkFDaEI7aUJBQ0Q7YUFDRCxDQUFDLENBQUM7WUFDSCxXQUFXLENBQUMsNEJBQTRCLENBQUMscUJBQXFCLEVBQUUsRUFBRSxLQUFLLEVBQUUsOEJBQThCLENBQUMsQ0FBQztRQUMxRyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7WUFDOUQsTUFBTSw0QkFBNEIsR0FBRyxnQ0FBZ0MsQ0FBQztnQkFDckUsTUFBTSxFQUFFO29CQUNQLFVBQVUsRUFBRSxPQUFPO2lCQUNuQjtnQkFDRCxRQUFRLEVBQUU7b0JBQ1QsVUFBVSxFQUFFO3dCQUNYLFVBQVUsRUFBRSxJQUFJO3FCQUNoQjtpQkFDRDthQUNELENBQUMsQ0FBQztZQUNILFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3JHLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9