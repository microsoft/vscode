// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { IAttachItem } from '../../../../client/debugger/extension/attachQuickPick/types';
import { WmicProcessParser } from '../../../../client/debugger/extension/attachQuickPick/wmicProcessParser';

suite('Attach to process - wmic process parser (Windows)', () => {
    test('Processes should be parsed correctly if it is valid input', () => {
        const input = `
CommandLine=\r\n\
Name=System\r\n\
ProcessId=4\r\n\
\r\n\
\r\n\
CommandLine=\r\n\
Name=svchost.exe\r\n\
ProcessId=5372\r\n\
\r\n\
\r\n\
CommandLine=sihost.exe\r\n\
Name=sihost.exe\r\n\
ProcessId=5728\r\n\
\r\n\
\r\n\
CommandLine=C:\\WINDOWS\\system32\\svchost.exe -k UnistackSvcGroup -s CDPUserSvc\r\n\
Name=svchost.exe\r\n\
ProcessId=5912\r\n\
\r\n\
\r\n\
CommandLine=C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/hello_world.py\r\n\
Name=python.exe\r\n\
ProcessId=6028\r\n\
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
                label: 'svchost.exe',
                description: '5372',
                detail: '',
                id: '5372',
                processName: 'svchost.exe',
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
        ];

        const output = WmicProcessParser.parseProcesses(input);

        assert.deepEqual(output, expectedOutput);
    });

    test('Incorrectly formatted lines should be skipped when parsing process list input', () => {
        const input = `
CommandLine=\r\n\
Name=System\r\n\
ProcessId=4\r\n\
\r\n\
\r\n\
CommandLine=\r\n\
Name=svchost.exe\r\n\
ProcessId=5372\r\n\
\r\n\
\r\n\
CommandLine=sihost.exe\r\n\
Name=sihost.exe\r\n\
ProcessId=5728\r\n\
\r\n\
\r\n\
CommandLine=C:\\WINDOWS\\system32\\svchost.exe -k UnistackSvcGroup -s CDPUserSvc\r\n\
Name=svchost.exe\r\n\
IncorrectKey=shouldnt.be.here\r\n\
ProcessId=5912\r\n\
\r\n\
\r\n\
CommandLine=C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/hello_world.py\r\n\
Name=python.exe\r\n\
ProcessId=6028\r\n\
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
                label: 'svchost.exe',
                description: '5372',
                detail: '',
                id: '5372',
                processName: 'svchost.exe',
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
        ];

        const output = WmicProcessParser.parseProcesses(input);

        assert.deepEqual(output, expectedOutput);
    });

    test('Command lines starting with a DOS device path prefix should be parsed correctly', () => {
        const input = `
CommandLine=\r\n\
Name=System\r\n\
ProcessId=4\r\n\
\r\n\
\r\n\
CommandLine=\\??\\C:\\WINDOWS\\system32\\conhost.exe\r\n\
Name=conhost.exe\r\n\
ProcessId=5912\r\n\
\r\n\
\r\n\
CommandLine=C:\\Users\\Contoso\\AppData\\Local\\Programs\\Python\\Python37\\python.exe c:/Users/Contoso/Documents/hello_world.py\r\n\
Name=python.exe\r\n\
ProcessId=6028\r\n\
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
                label: 'conhost.exe',
                description: '5912',
                detail: 'C:\\WINDOWS\\system32\\conhost.exe',
                id: '5912',
                processName: 'conhost.exe',
                commandLine: 'C:\\WINDOWS\\system32\\conhost.exe',
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
        ];

        const output = WmicProcessParser.parseProcesses(input);

        assert.deepEqual(output, expectedOutput);
    });
});
