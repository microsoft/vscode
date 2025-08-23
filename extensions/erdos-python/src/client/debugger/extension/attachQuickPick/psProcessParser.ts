// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { IAttachItem, ProcessListCommand } from './types';

export namespace PsProcessParser {
    const secondColumnCharacters = 50;
    const commColumnTitle = ''.padStart(secondColumnCharacters, 'a');

    // Perf numbers:
    // OS X 10.10
    // | # of processes | Time (ms) |
    // |----------------+-----------|
    // |            272 |        52 |
    // |            296 |        49 |
    // |            384 |        53 |
    // |            784 |       116 |
    //
    // Ubuntu 16.04
    // | # of processes | Time (ms) |
    // |----------------+-----------|
    // |            232 |        26 |
    // |            336 |        34 |
    // |            736 |        62 |
    // |           1039 |       115 |
    // |           1239 |       182 |

    // ps outputs as a table. With the option "ww", ps will use as much width as necessary.
    // However, that only applies to the right-most column. Here we use a hack of setting
    // the column header to 50 a's so that the second column will have at least that many
    // characters. 50 was chosen because that's the maximum length of a "label" in the
    // QuickPick UI in VS Code.

    // the BSD version of ps uses '-c' to have 'comm' only output the executable name and not
    // the full path. The Linux version of ps has 'comm' to only display the name of the executable
    // Note that comm on Linux systems is truncated to 16 characters:
    // https://bugzilla.redhat.com/show_bug.cgi?id=429565
    // Since 'args' contains the full path to the executable, even if truncated, searching will work as desired.
    export const psLinuxCommand: ProcessListCommand = {
        command: 'ps',
        args: ['axww', '-o', `pid=,comm=${commColumnTitle},args=`],
    };
    export const psDarwinCommand: ProcessListCommand = {
        command: 'ps',
        args: ['axww', '-o', `pid=,comm=${commColumnTitle},args=`, '-c'],
    };

    export function parseProcesses(processes: string): IAttachItem[] {
        const lines: string[] = processes.split('\n');
        return parseProcessesFromPsArray(lines);
    }

    function parseProcessesFromPsArray(processArray: string[]): IAttachItem[] {
        const processEntries: IAttachItem[] = [];

        // lines[0] is the header of the table
        for (let i = 1; i < processArray.length; i += 1) {
            const line = processArray[i];
            if (!line) {
                continue;
            }

            const processEntry = parseLineFromPs(line);
            if (processEntry) {
                processEntries.push(processEntry);
            }
        }

        return processEntries;
    }

    function parseLineFromPs(line: string): IAttachItem | undefined {
        // Explanation of the regex:
        //   - any leading whitespace
        //   - PID
        //   - whitespace
        //   - executable name --> this is PsAttachItemsProvider.secondColumnCharacters - 1 because ps reserves one character
        //     for the whitespace separator
        //   - whitespace
        //   - args (might be empty)
        const psEntry: RegExp = new RegExp(`^\\s*([0-9]+)\\s+(.{${secondColumnCharacters - 1}})\\s+(.*)$`);
        const matches = psEntry.exec(line);

        if (matches?.length === 4) {
            const pid = matches[1].trim();
            const executable = matches[2].trim();
            const cmdline = matches[3].trim();

            return {
                label: executable,
                description: pid,
                detail: cmdline,
                id: pid,
                processName: executable,
                commandLine: cmdline,
            };
        }
    }
}
