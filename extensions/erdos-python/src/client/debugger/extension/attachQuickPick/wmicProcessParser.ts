// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { IAttachItem, ProcessListCommand } from './types';

export namespace WmicProcessParser {
    const wmicNameTitle = 'Name';
    const wmicCommandLineTitle = 'CommandLine';
    const wmicPidTitle = 'ProcessId';
    const defaultEmptyEntry: IAttachItem = {
        label: '',
        description: '',
        detail: '',
        id: '',
        processName: '',
        commandLine: '',
    };

    // Perf numbers on Win10:
    // | # of processes | Time (ms) |
    // |----------------+-----------|
    // |            309 |       413 |
    // |            407 |       463 |
    // |            887 |       746 |
    // |           1308 |      1132 |
    export const wmicCommand: ProcessListCommand = {
        command: 'wmic',
        args: ['process', 'get', 'Name,ProcessId,CommandLine', '/FORMAT:list'],
    };

    export function parseProcesses(processes: string): IAttachItem[] {
        const lines: string[] = processes.split('\r\n');
        const processEntries: IAttachItem[] = [];
        let entry = { ...defaultEmptyEntry };

        for (const line of lines) {
            if (!line.length) {
                continue;
            }

            parseLineFromWmic(line, entry);

            // Each entry of processes has ProcessId as the last line
            if (line.lastIndexOf(wmicPidTitle, 0) === 0) {
                processEntries.push(entry);
                entry = { ...defaultEmptyEntry };
            }
        }

        return processEntries;
    }

    function parseLineFromWmic(line: string, item: IAttachItem): IAttachItem {
        const splitter = line.indexOf('=');
        const currentItem = item;

        if (splitter > 0) {
            const key = line.slice(0, splitter).trim();
            let value = line.slice(splitter + 1).trim();

            if (key === wmicNameTitle) {
                currentItem.label = value;
                currentItem.processName = value;
            } else if (key === wmicPidTitle) {
                currentItem.description = value;
                currentItem.id = value;
            } else if (key === wmicCommandLineTitle) {
                const dosDevicePrefix = '\\??\\'; // DOS device prefix, see https://reverseengineering.stackexchange.com/a/15178
                if (value.lastIndexOf(dosDevicePrefix, 0) === 0) {
                    value = value.slice(dosDevicePrefix.length);
                }

                currentItem.detail = value;
                currentItem.commandLine = value;
            }
        }

        return currentItem;
    }
}
