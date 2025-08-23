// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import { PsProcessParser } from '../../../../client/debugger/extension/attachQuickPick/psProcessParser';
import { IAttachItem } from '../../../../client/debugger/extension/attachQuickPick/types';

suite('Attach to process - ps process parser (POSIX)', () => {
    test('Processes should be parsed correctly if it is valid input', () => {
        const input = `\
      aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\
    1 launchd                                            launchd\n\
   41 syslogd                                            syslogd\n\
   42 UserEventAgent                                     UserEventAgent (System)\n\
   45 uninstalld                                         uninstalld\n\
  146 kextd                                              kextd\n\
31896 python                                             python script.py\
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
                label: 'UserEventAgent',
                description: '42',
                detail: 'UserEventAgent (System)',
                id: '42',
                processName: 'UserEventAgent',
                commandLine: 'UserEventAgent (System)',
            },
            {
                label: 'uninstalld',
                description: '45',
                detail: 'uninstalld',
                id: '45',
                processName: 'uninstalld',
                commandLine: 'uninstalld',
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
                label: 'python',
                description: '31896',
                detail: 'python script.py',
                id: '31896',
                processName: 'python',
                commandLine: 'python script.py',
            },
        ];

        const output = PsProcessParser.parseProcesses(input);

        assert.deepEqual(output, expectedOutput);
    });

    test('Empty lines should be skipped when parsing process list input', () => {
        const input = `\
        aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\
        1 launchd                                            launchd\n\
       41 syslogd                                            syslogd\n\
       42 UserEventAgent                                     UserEventAgent (System)\n\
\n\
      146 kextd                                              kextd\n\
    31896 python                                             python script.py\
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
                label: 'UserEventAgent',
                description: '42',
                detail: 'UserEventAgent (System)',
                id: '42',
                processName: 'UserEventAgent',
                commandLine: 'UserEventAgent (System)',
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
                label: 'python',
                description: '31896',
                detail: 'python script.py',
                id: '31896',
                processName: 'python',
                commandLine: 'python script.py',
            },
        ];

        const output = PsProcessParser.parseProcesses(input);

        assert.deepEqual(output, expectedOutput);
    });

    test('Incorrectly formatted lines should be skipped when parsing process list input', () => {
        const input = `\
        aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n\
        1 launchd                                            launchd\n\
       41 syslogd                                            syslogd\n\
       42 UserEventAgent                                     UserEventAgent (System)\n\
       45 uninstalld                      uninstalld\n\
      146 kextd                                              kextd\n\
    31896 python                                             python script.py\
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
                label: 'UserEventAgent',
                description: '42',
                detail: 'UserEventAgent (System)',
                id: '42',
                processName: 'UserEventAgent',
                commandLine: 'UserEventAgent (System)',
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
                label: 'python',
                description: '31896',
                detail: 'python script.py',
                id: '31896',
                processName: 'python',
                commandLine: 'python script.py',
            },
        ];

        const output = PsProcessParser.parseProcesses(input);

        assert.deepEqual(output, expectedOutput);
    });
});
