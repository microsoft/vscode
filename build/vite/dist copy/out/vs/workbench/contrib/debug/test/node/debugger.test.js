/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { join, normalize } from '../../../../../base/common/path.js';
import * as platform from '../../../../../base/common/platform.js';
import { Debugger } from '../../common/debugger.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ExecutableDebugAdapter } from '../../node/debugAdapter.js';
import { TestTextResourcePropertiesService } from '../../../../../editor/test/common/services/testTextResourcePropertiesService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('Debug - Debugger', () => {
    let _debugger;
    const extensionFolderPath = '/a/b/c/';
    const debuggerContribution = {
        type: 'mock',
        label: 'Mock Debug',
        program: './out/mock/mockDebug.js',
        args: ['arg1', 'arg2'],
        configurationAttributes: {
            launch: {
                required: ['program'],
                properties: {
                    program: {
                        'type': 'string',
                        'description': 'Workspace relative path to a text file.',
                        'default': 'readme.md'
                    }
                }
            }
        },
        variables: null,
        initialConfigurations: [
            {
                name: 'Mock-Debug',
                type: 'mock',
                request: 'launch',
                program: 'readme.md'
            }
        ]
    };
    const extensionDescriptor0 = {
        id: 'adapter',
        identifier: new ExtensionIdentifier('adapter'),
        name: 'myAdapter',
        version: '1.0.0',
        publisher: 'vscode',
        extensionLocation: URI.file(extensionFolderPath),
        isBuiltin: false,
        isUserBuiltin: false,
        isUnderDevelopment: false,
        engines: null,
        targetPlatform: "undefined" /* TargetPlatform.UNDEFINED */,
        contributes: {
            'debuggers': [
                debuggerContribution
            ]
        },
        enabledApiProposals: undefined,
        preRelease: false,
    };
    const extensionDescriptor1 = {
        id: 'extension1',
        identifier: new ExtensionIdentifier('extension1'),
        name: 'extension1',
        version: '1.0.0',
        publisher: 'vscode',
        extensionLocation: URI.file('/e1/b/c/'),
        isBuiltin: false,
        isUserBuiltin: false,
        isUnderDevelopment: false,
        engines: null,
        targetPlatform: "undefined" /* TargetPlatform.UNDEFINED */,
        contributes: {
            'debuggers': [
                {
                    type: 'mock',
                    runtime: 'runtime',
                    runtimeArgs: ['rarg'],
                    program: 'mockprogram',
                    args: ['parg']
                }
            ]
        },
        enabledApiProposals: undefined,
        preRelease: false,
    };
    const extensionDescriptor2 = {
        id: 'extension2',
        identifier: new ExtensionIdentifier('extension2'),
        name: 'extension2',
        version: '1.0.0',
        publisher: 'vscode',
        extensionLocation: URI.file('/e2/b/c/'),
        isBuiltin: false,
        isUserBuiltin: false,
        isUnderDevelopment: false,
        engines: null,
        targetPlatform: "undefined" /* TargetPlatform.UNDEFINED */,
        contributes: {
            'debuggers': [
                {
                    type: 'mock',
                    win: {
                        runtime: 'winRuntime',
                        program: 'winProgram'
                    },
                    linux: {
                        runtime: 'linuxRuntime',
                        program: 'linuxProgram'
                    },
                    osx: {
                        runtime: 'osxRuntime',
                        program: 'osxProgram'
                    }
                }
            ]
        },
        enabledApiProposals: undefined,
        preRelease: false,
    };
    const adapterManager = {
        getDebugAdapterDescriptor(session, config) {
            return Promise.resolve(undefined);
        }
    };
    ensureNoDisposablesAreLeakedInTestSuite();
    const configurationService = new TestConfigurationService();
    const testResourcePropertiesService = new TestTextResourcePropertiesService(configurationService);
    setup(() => {
        _debugger = new Debugger(adapterManager, debuggerContribution, extensionDescriptor0, configurationService, testResourcePropertiesService, undefined, undefined, undefined, undefined, undefined);
    });
    teardown(() => {
        _debugger = null;
    });
    test('attributes', () => {
        assert.strictEqual(_debugger.type, debuggerContribution.type);
        assert.strictEqual(_debugger.label, debuggerContribution.label);
        const ae = ExecutableDebugAdapter.platformAdapterExecutable([extensionDescriptor0], 'mock');
        assert.strictEqual(ae.command, join(extensionFolderPath, debuggerContribution.program));
        assert.deepStrictEqual(ae.args, debuggerContribution.args);
    });
    test('merge platform specific attributes', function () {
        if (!process.versions.electron) {
            this.skip(); //TODO@debug this test fails when run in node.js environments
        }
        const ae = ExecutableDebugAdapter.platformAdapterExecutable([extensionDescriptor1, extensionDescriptor2], 'mock');
        assert.strictEqual(ae.command, platform.isLinux ? 'linuxRuntime' : (platform.isMacintosh ? 'osxRuntime' : 'winRuntime'));
        const xprogram = platform.isLinux ? 'linuxProgram' : (platform.isMacintosh ? 'osxProgram' : 'winProgram');
        assert.deepStrictEqual(ae.args, ['rarg', normalize('/e2/b/c/') + xprogram, 'parg']);
    });
    test('initial config file content', () => {
        const expected = ['{',
            '	// Use IntelliSense to learn about possible attributes.',
            '	// Hover to view descriptions of existing attributes.',
            '	// For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387',
            '	"version": "0.2.0",',
            '	"configurations": [',
            '		{',
            '			"name": "Mock-Debug",',
            '			"type": "mock",',
            '			"request": "launch",',
            '			"program": "readme.md"',
            '		}',
            '	]',
            '}'].join(testResourcePropertiesService.getEOL(URI.file('somefile')));
        return _debugger.getInitialConfigurationContent().then(content => {
            assert.strictEqual(content, expected);
        }, err => assert.fail(err));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdnZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL3Rlc3Qvbm9kZS9kZWJ1Z2dlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sS0FBSyxRQUFRLE1BQU0sd0NBQXdDLENBQUM7QUFFbkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNwRSxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxpRkFBaUYsQ0FBQztBQUNwSSxPQUFPLEVBQUUsbUJBQW1CLEVBQXlDLE1BQU0seURBQXlELENBQUM7QUFDckksT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtJQUM5QixJQUFJLFNBQW1CLENBQUM7SUFFeEIsTUFBTSxtQkFBbUIsR0FBRyxTQUFTLENBQUM7SUFDdEMsTUFBTSxvQkFBb0IsR0FBMEI7UUFDbkQsSUFBSSxFQUFFLE1BQU07UUFDWixLQUFLLEVBQUUsWUFBWTtRQUNuQixPQUFPLEVBQUUseUJBQXlCO1FBQ2xDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7UUFDdEIsdUJBQXVCLEVBQUU7WUFDeEIsTUFBTSxFQUFFO2dCQUNQLFFBQVEs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