// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { expect } from 'chai';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { PlatformService } from '../../../../client/common/platform/platformService';
import { IPlatformService } from '../../../../client/common/platform/types';
import { ProcessService } from '../../../../client/common/process/proc';
import { ProcessServiceFactory } from '../../../../client/common/process/processFactory';
import { IProcessService, IProcessServiceFactory } from '../../../../client/common/process/types';
import { OSType } from '../../../../client/common/utils/platform';
import { AttachProcessProvider } from '../../../../client/debugger/extension/attachQuickPick/provider';
import { PsProcessParser } from '../../../../client/debugger/extension/attachQuickPick/psProcessParser';
import { IAttachItem } from '../../../../client/debugger/extension/attachQuickPick/types';
import { WmicProcessParser } from '../../../../client/debugger/extension/attachQuickPick/wmicProcessParser';

suite('Attach to process - process provider', () => {
    let platformService: IPlatformService;
    let processService: IProcessService;
    let processServiceFactory: IProcessServiceFactory;

    let provider: AttachProcessProvider;

    setup(() => {
        platformService = mock(PlatformService);
        processService = mock(ProcessService);
        processServiceFactory = mock(ProcessServiceFactory);
        when(processServiceFactory.create()).thenResolve(instance(processService));

        provider = new AttachProcessProvider(instance(platformService), instance(processServiceFactory));
    });

    test('The Linux process list command should be called if the platform is Linux', async () => {
        when(platformService.isMac).thenReturn(false);
        when(platformService.isLinux).thenReturn(true);
        const psOutput = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
1 launchd                                            launchd
41 syslogd                                            syslogd
146 kextd                                              kextd
`;
        const expectedOutput: IAttachItem[] = [
            {
                label: 'launchd',
                description: '1',
                detail: 'launchd',
                id: '1',
                processName: 'launchd',
                commandLine: 'launchd',
            },
            {
                label: 'syslogd',
                description: '41',
                detail: 'syslogd',
                id: '41',
                processName: 'syslogd',
                commandLine: 'syslogd',
            },
            {
                label: 'kextd',
                description: '146',
                detail: 'kextd',
                id: '146',
                processName: 'kextd',
                commandLine: 'kextd',
            },
        ];
        when(processService.exec(PsProcessParser.psLinuxCommand.command, anything(), anything())).thenResolve({
            stdout: psOutput,
        });

        const attachItems = await provider._getInternalProcessEntries();

        verify(
            processService.exec(
                PsProcessParser.psLinuxCommand.command,
                PsProcessParser.psLinuxCommand.args,
                anything(),
            ),
        ).once();
        assert.deepEqual(attachItems, expectedOutput);
    });

    test('The macOS process list command should be called if the platform is macOS', async () => {
        when(platformService.isMac).thenReturn(true);
        const psOutput = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
1 launchd                                            launchd
41 syslogd                                            syslogd
146 kextd                                              kextd
`;
        const expectedOutput: IAttachItem[] = [
            {
                label: 'launchd',
                description: '1',
                detail: 'launchd',
                id: '1',
                processName: 'launchd',
                commandLine: 'launchd',
            },
            {
                label: 'syslogd',
                description: '41',
                detail: 'syslogd',
                id: '41',
                processName: 'syslogd',
                commandLine: 'syslogd',
            },
            {
                label: 'kextd',
                description: '146',
                detail: 'kextd',
                id: '146',
                processName: 'kextd',
                commandLine: 'kextd',
            },
        ];
        when(processService.exec(PsProcessParser.psDarwinCommand.command, anything(), anything())).thenResolve({
            stdout: psOutput,
        });

        const attachItems = await provider._getInternalProcessEntries();

        verify(
            processService.exec(
                PsProcessParser.psDarwinCommand.command,
                PsProcessParser.psDarwinCommand.args,
                anything(),
            ),
        ).once();
        assert.deepEqual(attachItems, expectedOutput);
    });

    test('The Windows process list command should be called if the platform is Windows', async () => {
        const windowsOutput = `CommandLine=\r
Name=System\r
ProcessId=4\r
\r
\r
CommandLine=sihost.exe\r
Name=sihost.exe\r
ProcessId=5728\r
\r
\r
CommandLine=C:\\WINDOWS\\system32\\svchost.exe -k UnistackSvcGroup -s CDPUserSvc\r
Name=svchost.exe\r
ProcessId=5912\r
`;
        const expectedOutput: IAttachItem[] = [
            {
                label: 'System',
                description: '4',
                detail: '',
                id: '4',
                processName: 'System',
                commandLine: '',
            },
            {
                label: 'sihost.exe',
                description: '5728',
                detail: 'sihost.exe',
                id: '5728',
                processName: 'sihost.exe',
                commandLine: 'sihost.exe',
            },
            {
                label: 'svchost.exe',
                description: '5912',
                detail: 'C:\\WINDOWS\\system32\\svchost.exe -k UnistackSvcGroup -s CDPUserSvc',
                id: '5912',
                processName: 'svchost.exe',
                commandLine: 'C:\\WINDOWS\\system32\\svchost.exe -k UnistackSvcGroup -s CDPUserSvc',
            },
        ];
        when(platformService.isMac).thenReturn(false);
        when(platformService.isLinux).thenReturn(false);
        when(platformService.isWindows).thenReturn(true);
        when(processService.exec(WmicProcessParser.wmicCommand.command, anything(), anything())).thenResolve({
            stdout: windowsOutput,
        });

        const attachItems = await provider._getInternalProcessEntries();

        verify(
            processService.exec(WmicProcessParser.wmicCommand.command, WmicProcessParser.wmicCommand.args, anything()),
        ).once();
        assert.deepEqual(attachItems, expectedOutput);
    });

    test('An error should be thrown if the platform is neither Linux, macOS or Windows', async () => {
        when(platformService.isMac).thenReturn(false);
        when(platformService.isLinux).thenReturn(false);
        when(platformService.isWindows).thenReturn(false);
        when(platformService.osType).thenReturn(OSType.Unknown);

        const promise = provider._getInternalProcessEntries();

        await expect(promise).to.eventually.be.rejectedWith(`Operating system '${OSType.Unknown}' not supported.`);
    });

    suite('POSIX getAttachItems (Linux)', () => {
        setup(() => {
            when(platformService.isMac).thenReturn(false);
            when(platformService.isLinux).thenReturn(true);
        });

        test('Items returned by getAttachItems should be sorted alphabetically', async () => {
            const psOutput = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    1 launchd                                            launchd
    41 syslogd                                            syslogd
    146 kextd                                              kextd
`;
            const expectedOutput: IAttachItem[] = [
                {
                    label: 'kextd',
                    description: '146',
                    detail: 'kextd',
                    id: '146',
                    processName: 'kextd',
                    commandLine: 'kextd',
                },
                {
                    label: 'launchd',
                    description: '1',
                    detail: 'launchd',
                    id: '1',
                    processName: 'launchd',
                    commandLine: 'launchd',
                },
                {
                    label: 'syslogd',
                    description: '41',
                    detail: 'syslogd',
                    id: '41',
                    processName: 'syslogd',
                    commandLine: 'syslogd',
                },
            ];
            when(processService.exec(PsProcessParser.psLinuxCommand.command, anything(), anything())).thenResolve({
                stdout: psOutput,
            });

            const output = await provider.getAttachItems();

            assert.deepEqual(output, expectedOutput);
        });

        test('Python processes should be at the top of the list returned by getAttachItems', async () => {
            const psOutput = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
     1 launchd                                            launchd
    41 syslogd                                            syslogd
    96 python                                             python
   146 kextd                                              kextd
 31896 python                                             python script.py
`;
            const expectedOutput: IAttachItem[] = [
                {
                    label: 'python',
                    description: '96',
                    detail: 'python',
                    id: '96',
                    processName: 'python',
                    commandLine: 'python',
                },
                {
                    label: 'python',
                    description: '31896',
                    detail: 'python script.py',
                    id: '31896',
                    processName: 'python',
                    commandLine: 'python script.py',
                },
                {
                    label: 'kextd',
                    description: '146',
                    detail: 'kextd',
                    id: '146',
                    processName: 'kextd',
                    commandLine: 'kextd',
                },
                {
                    label: 'launchd',
                    description: '1',
                    detail: 'launchd',
                    id: '1',
                    processName: 'launchd',
                    commandLine: 'launchd',
                },
                {
                    label: 'syslogd',
                    description: '41',
                    detail: 'syslogd',
                    id: '41',
                    processName: 'syslogd',
                    commandLine: 'syslogd',
                },
            ];
            when(processService.exec(PsProcessParser.psLinuxCommand.command, anything(), anything())).thenResolve({
                stdout: psOutput,
            });

            const output = await provider.getAttachItems();

            assert.deepEqual(output, expectedOutput);
        });
    });

    suite('Windows getAttachItems', () => {
        setup(() => {
            when(platformService.isMac).thenReturn(false);
            when(platformService.isLinux).thenReturn(false);
            when(platformService.isWindows).thenReturn(true);
        });

        test('Items returned by getAttachItems should be sorted alphabetically', async () => {
            const windowsOutput = `CommandLine=\r
Name=System\r
ProcessId=4\r
\r
\r
CommandLine=\r
Name=svchost.exe\r
ProcessId=5372\r
\r
\r
CommandLine=sihost.exe\r
Name=sihost.exe\r
ProcessId=5728\r
`;
            const expectedOutput: IAttachItem[] = [
                {
                    label: 'sihost.exe',
                    description: '5728',
                    detail: 'sihost.exe',
                    id: '5728',
                    processName: 'sihost.exe',
                    commandLine: 'sihost.exe',
                },
                {
                    label: 'svchost.exe',
                    description: '5372',
                    detail: '',
                    id: '5372',
                    processName: 'svchost.exe',
                    commandLine: '',
                },
                {
                    label: 'System',
                    description: '4',
                    detail: '',
                    id: '4',
                    processName: 'System',
                    commandLine: '',
                },
            ];
            when(processService.exec(WmicProcessParser.wmicCommand.command, anything(), anything())).thenResolve({
                stdout: windowsOutput,
            });

            const output = await provider.getAttachItems();

            assert.deepEqual(output, expectedOutput);
        });

        test('Python processes should be at the top of the list returned by getAttachItems', async () => {
            const windowsOutput = `CommandLine=\r
Name=System\r
ProcessId=4\r
\r
\r
CommandLine=\r
Name=svchost.exe\r
ProcessId=5372\r
\r
\r
CommandLine=sihost.exe\r
Name=sihost.exe\r
ProcessId=5728\r
\r
\r
CommandLine=C:\\WINDOWS\\system32\\svchost.exe -k UnistackSvcGroup -s CDPUserSvc\r
Name=svchost.exe\r
ProcessId=5912\r
\r
\r
CommandLine=C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/hello_world.py\r
Name=python.exe\r
ProcessId=6028\r
\r
\r
CommandLine=C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/foo_bar.py\r
Name=python.exe\r
ProcessId=8026\r
            `;
            const expectedOutput: IAttachItem[] = [
                {
                    label: 'python.exe',
                    description: '8026',
                    detail:
                        'C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/foo_bar.py',
                    id: '8026',
                    processName: 'python.exe',
                    commandLine:
                        'C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/foo_bar.py',
                },
                {
                    label: 'python.exe',
                    description: '6028',
                    detail:
                        'C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/hello_world.py',
                    id: '6028',
                    processName: 'python.exe',
                    commandLine:
                        'C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/hello_world.py',
                },
                {
                    label: 'sihost.exe',
                    description: '5728',
                    detail: 'sihost.exe',
                    id: '5728',
                    processName: 'sihost.exe',
                    commandLine: 'sihost.exe',
                },
                {
                    label: 'svchost.exe',
                    description: '5372',
                    detail: '',
                    id: '5372',
                    processName: 'svchost.exe',
                    commandLine: '',
                },
                {
                    label: 'svchost.exe',
                    description: '5912',
                    detail: 'C:\\WINDOWS\\system32\\svchost.exe -k UnistackSvcGroup -s CDPUserSvc',
                    id: '5912',
                    processName: 'svchost.exe',
                    commandLine: 'C:\\WINDOWS\\system32\\svchost.exe -k UnistackSvcGroup -s CDPUserSvc',
                },
                {
                    label: 'System',
                    description: '4',
                    detail: '',
                    id: '4',
                    processName: 'System',
                    commandLine: '',
                },
            ];
            when(processService.exec(WmicProcessParser.wmicCommand.command, anything(), anything())).thenResolve({
                stdout: windowsOutput,
            });

            const output = await provider.getAttachItems();

            assert.deepEqual(output, expectedOutput);
        });
    });
});
