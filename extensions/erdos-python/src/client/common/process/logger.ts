// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { traceLog } from '../../logging';
import { IWorkspaceService } from '../application/types';
import { isCI, isTestExecution } from '../constants';
import { getOSType, getUserHomeDir, OSType } from '../utils/platform';
import { IProcessLogger, SpawnOptions } from './types';
import { escapeRegExp } from 'lodash';
import { replaceAll } from '../stringUtils';
import { identifyShellFromShellPath } from '../terminal/shellDetectors/baseShellDetector';
import '../../common/extensions';

@injectable()
export class ProcessLogger implements IProcessLogger {
    constructor(@inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService) {}

    public logProcess(fileOrCommand: string, args?: string[], options?: SpawnOptions) {
        if (!isTestExecution() && isCI && process.env.UITEST_DISABLE_PROCESS_LOGGING) {
            // Added to disable logging of process execution commands during UI Tests.
            // Used only during UI Tests (hence this setting need not be exposed as a valid setting).
            return;
        }
        let command = args
            ? [fileOrCommand, ...args].map((e) => e.trimQuotes().toCommandArgumentForPythonExt()).join(' ')
            : fileOrCommand;
        const info = [`> ${this.getDisplayCommands(command)}`];
        if (options?.cwd) {
            const cwd: string = typeof options?.cwd === 'string' ? options?.cwd : options?.cwd?.toString();
            info.push(`cwd: ${this.getDisplayCommands(cwd)}`);
        }
        if (typeof options?.shell === 'string') {
            info.push(`shell: ${identifyShellFromShellPath(options?.shell)}`);
        }

        info.forEach((line) => {
            traceLog(line);
        });
    }

    /**
     * Formats command strings for display by replacing common paths with symbols.
     * - Replaces the workspace folder path with '.' if there's exactly one workspace folder
     * - Replaces the user's home directory path with '~'
     * @param command The command string to format
     * @returns The formatted command string with paths replaced by symbols
     */
    private getDisplayCommands(command: string): string {
        if (this.workspaceService.workspaceFolders && this.workspaceService.workspaceFolders.length === 1) {
            command = replaceMatchesWithCharacter(command, this.workspaceService.workspaceFolders[0].uri.fsPath, '.');
        }
        const home = getUserHomeDir();
        if (home) {
            command = replaceMatchesWithCharacter(command, home, '~');
        }
        return command;
    }
}

/**
 * Finds case insensitive matches in the original string and replaces it with character provided.
 */
function replaceMatchesWithCharacter(original: string, match: string, character: string): string {
    // Backslashes, plus signs, brackets and other characters have special meaning in regexes,
    // we need to escape using an extra backlash so it's not considered special.
    function getRegex(match: string) {
        let pattern = escapeRegExp(match);
        if (getOSType() === OSType.Windows) {
            // Match both forward and backward slash versions of 'match' for Windows.
            pattern = replaceAll(pattern, '\\\\', '(\\\\|/)');
        }
        let regex = new RegExp(pattern, 'ig');
        return regex;
    }

    function isPrevioustoMatchRegexALetter(chunk: string, index: number) {
        return chunk[index].match(/[a-z]/);
    }

    let chunked = original.split(' ');

    for (let i = 0; i < chunked.length; i++) {
        let regex = getRegex(match);
        const regexResult = regex.exec(chunked[i]);
        if (regexResult) {
            const regexIndex = regexResult.index;
            if (regexIndex > 0 && isPrevioustoMatchRegexALetter(chunked[i], regexIndex - 1))
                regex = getRegex(match.substring(1));
            chunked[i] = chunked[i].replace(regex, character);
        }
    }
    return chunked.join(' ');
}
