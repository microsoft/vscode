/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DEFAULT_TERMINAL_OSX } from '../../common/externalTerminal.js';
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from '../../node/externalTerminalService.js';
const mockConfig = Object.freeze({
    terminal: {
        explorerKind: 'external',
        external: {
            windowsExec: 'testWindowsShell',
            osxExec: 'testOSXShell',
            linuxExec: 'testLinuxShell'
        }
    }
});
suite('ExternalTerminalService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test(`WinTerminalService - uses terminal from configuration`, done => {
        const testShell = 'cmd';
        const testCwd = 'path/to/workspace';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(command, testShell, 'shell should equal expected');
                strictEqual(args[args.length - 1], mockConfig.terminal.external.windowsExec);
                strictEqual(opts.cwd, testCwd);
                done();
                return {
                    on: (evt) => evt
                };
            }
        };
        const testService = new WindowsExternalTerminalService();
        testService.spawnTerminal(mockSpawner, mockConfig.terminal.external, testShell, testCwd);
    });
    test(`WinTerminalService - uses default terminal when configuration.terminal.external.windowsExec is undefined`, done => {
        const testShell = 'cmd';
        const testCwd = 'path/to/workspace';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(args[args.length - 1], WindowsExternalTerminalService.getDefaultTerminalWindows());
                done();
                return {
                    on: (evt) => evt
                };
            }
        };
        mockConfig.terminal.external.windowsExec = undefined;
        const testService = new WindowsExternalTerminalService();
        testService.spawnTerminal(mockSpawner, mockConfig.terminal.external, testShell, testCwd);
    });
    test(`WinTerminalService - cwd is correct regardless of case`, done => {
        const testShell = 'cmd';
        const testCwd = 'c:/foo';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(opts.cwd, 'C:/foo', 'cwd should be uppercase regardless of the case that\'s passed in');
                done();
                return {
                    on: (evt) => evt
                };
            }
        };
        const testService = new WindowsExternalTerminalService();
        testService.spawnTerminal(mockSpawner, mockConfig.terminal.external, testShell, testCwd);
    });
    test(`WinTerminalService - cmder should be spawned differently`, done => {
        const testShell = 'cmd';
        const testCwd = 'c:/foo';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                deepStrictEqual(args, ['C:/foo']);
                strictEqual(opts, undefined);
                done();
                return { on: (evt) => evt };
            }
        };
        const testService = new WindowsExternalTerminalService();
        testService.spawnTerminal(mockSpawner, { windowsExec: 'cmder' }, testShell, testCwd);
    });
    test(`WinTerminalService - windows terminal should open workspace directory`, done => {
        const testShell = 'wt';
        const testCwd = 'c:/foo';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(opts.cwd, 'C:/foo');
                done();
                return { on: (evt) => evt };
            }
        };
        const testService = new WindowsExternalTerminalService();
        testService.spawnTerminal(mockSpawner, mockConfig.terminal.external, testShell, testCwd);
    });
    test(`MacTerminalService - uses terminal from configuration`, done => {
        const testCwd = 'path/to/workspace';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(args[1], mockConfig.terminal.external.osxExec);
                done();
                return {
                    on: (evt) => evt
                };
            }
        };
        const testService = new MacExternalTerminalService();
        testService.spawnTerminal(mockSpawner, mockConfig.terminal.external, testCwd);
    });
    test(`MacTerminalService - uses default terminal when configuration.terminal.external.osxExec is undefined`, done => {
        const testCwd = 'path/to/workspace';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(args[1], DEFAULT_TERMINAL_OSX);
                done();
                return {
                    on: (evt) => evt
                };
            }
        };
        const testService = new MacExternalTerminalService();
        testService.spawnTerminal(mockSpawner, { osxExec: undefined }, testCwd);
    });
    test(`MacTerminalService - Ghostty.app should be spawned correctly`, done => {
        const testCwd = 'path/to/workspace';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(command, '/usr/bin/open');
                strictEqual(args[0], '-a');
                strictEqual(args[1], 'Ghostty.app');
                strictEqual(args[2], testCwd);
                strictEqual(opts.cwd, testCwd);
                done();
                return {
                    on: (evt) => evt
                };
            }
        };
        const testService = new MacExternalTerminalService();
        testService.spawnTerminal(mockSpawner, { osxExec: 'Ghostty.app' }, testCwd);
    });
    test(`LinuxTerminalService - uses terminal from configuration`, done => {
        const testCwd = 'path/to/workspace';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(command, mockConfig.terminal.external.linuxExec);
                strictEqual(opts.cwd, testCwd);
                done();
                return {
                    on: (evt) => evt
                };
            }
        };
        const testService = new LinuxExternalTerminalService();
        testService.spawnTerminal(mockSpawner, mockConfig.terminal.external, testCwd);
    });
    test(`LinuxTerminalService - Ghostty should be spawned with working directory`, done => {
        const testCwd = 'path/to/workspace';
        const mockSpawner = {
            spawn: (command, args, opts) => {
                strictEqual(command, 'ghostty');
                deepStrictEqual(args, [`--working-directory=${testCwd}`]);
                strictEqual(opts.cwd, testCwd);
                done();
                return {
                    on: (evt) => evt
                };
            }
        };
        const testService = new LinuxExternalTerminalService();
        testService.spawnTerminal(mockSpawner, { linuxExec: 'ghostty' }, testCwd);
    });
    test(`LinuxTerminalService - uses default terminal when configuration.terminal.external.linuxExec is undefined`, done => {
        LinuxExternalTerminalService.getDefaultTerminalLinuxReady().then(defaultTerminalLinux => {
            const testCwd = 'path/to/workspace';
            const mockSpawner = {
                spawn: (command, args, opts) => {
                    strictEqual(command, defaultTerminalLinux);
                    done();
                    return {
                        on: (evt) => evt
                    };
                }
            };
            mockConfig.terminal.external.linuxExec = undefined;
            const testService = new LinuxExternalTerminalService();
            testService.spawnTerminal(mockSpawner, mockConfig.terminal.external, testCwd);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVybmFsVGVybWluYWwvdGVzdC9ub2RlL2V4dGVybmFsVGVybWluYWxTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDdEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFrQyxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSwwQkFBMEIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWpKLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQWlDO0lBQ2hFLFFBQVEsRUFBRTtRQUNULFlBQVksRUFBRSxVQUFVO1FBQ3hCLFFBQVEsRUFBRTtZQUNULFdBQVcsRUFBRSxrQkFBa0I7WUFDL0IsT0FBTyxFQUFFLGNBQWM7WUFDdkIsU0FBUyxFQUFFLGdCQUFnQjtTQUMzQjtLQUNEO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsS0FBSyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsRUFBRTtJQUNyQyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyx1REFBdUQsRUFBRSxJQUFJLENBQUMsRUFBRTtRQUNwRSxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDeEIsTUFBTSxPQUFPLEdBQUcsbUJBQW1CLENBQUM7UUFDcEMsTUFBTSxXQUFXLEdBQVE7WUFDeEIsS0FBSyxFQUFFLENBQUMsT0FBWSxFQUFFLElBQVMsRUFBRSxJQUFTLEVBQUUsRUFBRTtnQkFDN0MsV0FBVyxDQUFDLE9BQU8sRUFBRSxT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