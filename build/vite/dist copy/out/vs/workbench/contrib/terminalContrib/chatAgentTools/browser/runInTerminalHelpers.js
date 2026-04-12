/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Separator } from '../../../../../base/common/actions.js';
import { coalesce } from '../../../../../base/common/arrays.js';
import { posix as pathPosix, win32 as pathWin32 } from '../../../../../base/common/path.js';
import { escapeRegExpCharacters, removeAnsiEscapeCodes } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { isAutoApproveRule } from './tools/commandLineAnalyzer/commandLineAnalyzer.js';
export function isPowerShell(envShell, os) {
    if (os === 1 /* OperatingSystem.Windows */) {
        return /^(?:powershell|pwsh)(?:-preview)?$/i.test(pathWin32.basename(envShell).replace(/\.exe$/i, ''));
    }
    return /^(?:powershell|pwsh)(?:-preview)?$/.test(pathPosix.basename(envShell));
}
export function isWindowsPowerShell(envShell) {
    return envShell.endsWith('System32\\WindowsPowerShell\\v1.0\\powershell.exe');
}
export function isZsh(envShell, os) {
    if (os === 1 /* OperatingSystem.Windows */) {
        return /^zsh(?:\.exe)?$/i.test(pathWin32.basename(envShell));
    }
    return /^zsh$/.test(pathPosix.basename(envShell));
}
export function isBash(envShell, os) {
    if (os === 1 /* OperatingSystem.Windows */) {
        return /^bash(?:\.exe)?$/i.test(pathWin32.basename(envShell));
    }
    return /^bash$/.test(pathPosix.basename(envShell));
}
export function isFish(envShell, os) {
    if (os === 1 /* OperatingSystem.Windows */) {
        return /^fish(?:\.exe)?$/i.test(pathWin32.basename(envShell));
    }
    return /^fish$/.test(pathPosix.basename(envShell));
}
// Maximum output length to prevent context overflow
const MAX_OUTPUT_LENGTH = 60000; // ~60KB limit to keep context manageable
export const TRUNCATION_MESSAGE = '\n\n[... PREVIOUS OUTPUT TRUNCATED ...]\n\n';
export function truncateOutputKeepingTail(output, maxLength) {
    if (output.length <= maxLength) {
        return output;
    }
    const truncationMessageLength = TRUNCATION_MESSAGE.length;
    if (truncationMessageLength >= maxLength) {
        return TRUNCATION_MESSAGE.slice(TRUNCATION_MESSAGE.length - maxLength);
    }
    const availableLength = maxLength - truncationMessageLength;
    const endPortion = output.slice(-availableLength);
    return TRUNCATION_MESSAGE + endPortion;
}
export function sanitizeTerminalOutput(output) {
    let sanitized = removeAnsiEscapeCodes(output)
        // Trim trailing \r\n characters
        .trimEnd();
    // Truncate if output is too long to prevent context overflow
    if (sanitized.length > MAX_OUTPUT_LENGTH) {
        sanitized = truncateOutputKeepingTail(sanitized, MAX_OUTPUT_LENGTH);
    }
    return sanitized;
}
/**
 * Normalizes command text for UI display by removing unnecessary quote and forward slash
 * escaping artifacts (for example: \" \' \/) commonly produced in streamed tool-call JSON.
 */
export function normalizeTerminalCommandForDisplay(commandLine) {
    return commandLine.replace(/\\(["'\/])/g, '$1');
}
/**
 * Builds a single-line display string for a terminal command, suitable for UI messages.
 * Normalizes escape artifacts, collapses newlines to spaces, and truncates to 80 characters.
 */
export function buildCommandDisplayText(command) {
    const normalized = normalizeTerminalCommandForDisplay(command).replace(/\r\n|\r|\n/g, ' ');
    return normalized.length > 80 ? normalized.substring(0, 77) + '...' : normalized;
}
/**
 * Normalizes a terminal command for execution by collapsing newlines to spaces.
 * This prevents multi-line input from being sent as multiple commands via sendText.
 */
export function normalizeCommandForExecution(command) {
    return command.replace(/\r\n|\r|\n/g, ' ').trim();
}
export function generateAutoApproveActions(commandLine, subCommands, autoApproveResult) {
    const actions = [];
    // We shouldn't offer configuring rules for commands that are explicitly denied since it
    // wouldn't get auto approved with a new rule
    const canCreateAutoApproval = (autoApproveResult.subCommandResults.every(e => e.result !== 'denied') &&
        autoApproveResult.commandLineResult.result !== 'denied');
    if (canCreateAutoApproval) {
        const unapprovedSubCommands = subCommands.filter((_, index) => {
            return autoApproveResult.subCommandResults[index].result !== 'approved';
        });
        // Some commands should not be recommended as they are too permissive generally. This only
        // applies to sub-commands, we still want to offer approving of the exact the command line
        // however as it's very specific.
        const neverAutoApproveCommands = new Set([
            // Shell interpreters
            'bash', 'sh', 'zsh', 'fish', 'ksh', 'csh', 'tcsh', 'dash',
            'pwsh', 'powershell', 'powershell.exe', 'cmd', 'cmd.exe',
            // Script interpreters
            'python', 'python3', 'node', 'ruby', 'perl', 'php', 'lua',
            // Direct execution commands
            'eval', 'exec', 'source', 'sudo', 'su', 'doas',
            // Network tools that can download and execute code
            'curl', 'wget', 'invoke-restmethod', 'invoke-webrequest', 'irm', 'iwr',
        ]);
        // Commands where we want to suggest the sub-command (eg. `foo bar` instead of `foo`)
        const commandsWithSubcommands = new Set(['git', 'npm', 'npx', 'yarn', 'docker', 'kubectl', 'cargo', 'dotnet', 'mvn', 'gradle']);
        // Commands where we want to suggest the sub-command of a sub-command (eg. `foo bar baz`
        // instead of `foo`)
        const commandsWithSubSubCommands = new Set(['npm run', 'yarn run']);
        // Helper function to find the first non-flag argument after a given index
        const findNextNonFlagArg = (parts, startIndex) => {
            for (let i = startIndex; i < parts.length; i++) {
                if (!parts[i].startsWith('-')) {
                    return i;
                }
            }
            return undefined;
        };
        // For each unapproved sub-command (within the overall command line), decide whether to
        // suggest new rules for the command, a sub-command, a sub-command of a sub-command or to
        // not suggest at all.
        //
        // This includes support for detecting flags between the commands, so `mvn -DskipIT test a`
        // would suggest `mvn -DskipIT test` as that's more useful than only suggesting the exact
        // command line.
        const subCommandsToSuggest = Array.from(new Set(coalesce(unapprovedSubCommands.map(command => {
            const parts = command.trim().split(/\s+/);
            const baseCommand = parts[0].toLowerCase();
            // Security check: Never suggest auto-approval for dangerous interpreter commands
            if (neverAutoApproveCommands.has(baseCommand)) {
                return undefined;
            }
            if (commandsWithSubcommands.has(baseCommand)) {
                // Find the first non-flag argument after the command
                const subCommandIndex = findNextNonFlagArg(parts, 1);
                if (subCommandIndex !== undefined) {
                    // Check if this is a sub-sub-command case
                    const baseSubCommand = `${parts[0]} ${parts[subCommandIndex]}`.toLowerCase();
                    if (commandsWithSubSubCommands.has(baseSubCommand)) {
                        // Look for the second non-flag argument after the first subcommand
                        const subSubCommandIndex = findNextNonFlagArg(parts, subCommandIndex + 1);
                        if (subSubCommandIndex !== undefined) {
                            // Include everything from command to sub-sub-command (including flags)
                            return parts.slice(0, subSubCommandIndex + 1).join(' ');
                        }
                        return undefined;
                    }
                    else {
                        // Include everything from command to subcommand (including flags)
                        return parts.slice(0, subCommandIndex + 1).join(' ');
                    }
                }
                return undefined;
            }
            else {
                return parts[0];
            }
        }))));
        if (subCommandsToSuggest.length > 0) {
            let subCommandLabel;
            if (subCommandsToSuggest.length === 1) {
                subCommandLabel = `\`${subCommandsToSuggest[0]} \u2026\``;
            }
            else {
                subCommandLabel = `Commands ${subCommandsToSuggest.map(e => `\`${e} \u2026\``).join(', ')}`;
            }
            actions.push({
                label: `Allow ${subCommandLabel} in this Session`,
                data: {
                    type: 'newRule',
                    rule: subCommandsToSuggest.map(key => ({
                        key,
                        value: true,
                        scope: 'session'
                    }))
                }
            });
            actions.push({
                label: `Allow ${subCommandLabel} in this Workspace`,
                data: {
                    type: 'newRule',
                    rule: subCommandsToSuggest.map(key => ({
                        key,
                        value: true,
                        scope: 'workspace'
                    }))
                }
            });
            actions.push({
                label: `Always Allow ${subCommandLabel}`,
                data: {
                    type: 'newRule',
                    rule: subCommandsToSuggest.map(key => ({
                        key,
                        value: true,
                        scope: 'user'
                    }))
                }
            });
        }
        if (actions.length > 0) {
            actions.push(new Separator());
        }
        // Allow exact command line, don't do this if it's just the first sub-command's first
        // word or if it's an exact match for special sub-commands
        const firstSubcommandFirstWord = unapprovedSubCommands.length > 0 ? unapprovedSubCommands[0].split(' ')[0] : '';
        if (firstSubcommandFirstWord !== commandLine &&
            !commandsWithSubcommands.has(commandLine) &&
            !commandsWithSubSubCommands.has(commandLine)) {
            actions.push({
                label: localize('autoApprove.exactCommand1', 'Allow Exact Command Line in this Session'),
                data: {
                    type: 'newRule',
                    rule: {
                        key: `/^${escapeRegExpCharacters(commandLine)}$/`,
                        value: {
                            approve: true,
                            matchCommandLine: true
                        },
                        scope: 'session'
                    }
                }
            });
            actions.push({
                label: localize('autoApprove.exactCommand2', 'Allow Exact Command Line in this Workspace'),
                data: {
                    type: 'newRule',
                    rule: {
                        key: `/^${escapeRegExpCharacters(commandLine)}$/`,
                        value: {
                            approve: true,
                            matchCommandLine: true
                        },
                        scope: 'workspace'
                    }
                }
            });
            actions.push({
                label: localize('autoApprove.exactCommand', 'Always Allow Exact Command Line'),
                data: {
                    type: 'newRule',
                    rule: {
                        key: `/^${escapeRegExpCharacters(commandLine)}$/`,
                        value: {
                            approve: true,
                            matchCommandLine: true
                        },
                        scope: 'user'
                    }
                }
            });
        }
    }
    if (actions.length > 0) {
        actions.push(new Separator());
    }
    // Allow all commands for this session
    actions.push({
        label: localize('allowSession', 'Allow All Commands in this Session'),
        tooltip: localize('allowSessionTooltip', 'Allow this tool to run in this session without confirmation.'),
        data: {
            type: 'sessionApproval'
        }
    });
    actions.push(new Separator());
    // Always show configure option
    actions.push({
        label: localize('autoApprove.configure', 'Configure Auto Approve...'),
        data: {
            type: 'configure'
        }
    });
    return actions;
}
export function dedupeRules(rules) {
    return rules.filter((result, index, array) => {
        if (!isAutoApproveRule(result.rule)) {
            return false;
        }
        const sourceText = result.rule.sourceText;
        return array.findIndex(r => isAutoApproveRule(r.rule) && r.rule.sourceText === sourceText) === index;
    });
}
/**
 * Extracts a cd prefix from a command line, returning the directory and remaining command.
 * Does not check if the directory matches the current cwd - just extracts the pattern.
 */
export function extractCdPrefix(commandLine, shell, os) {
    const isPwsh = isPowerShell(shell, os);
    const cdPrefixMatch = commandLine.match(isPwsh
        ? /^(?:cd(?: \/d)?|Set-Location(?: -Path)?) (?<dir>[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i
        : /^cd (?<dir>[^\s]+) &&\s+(?<suffix>.+)$/);
    const cdDir = cdPrefixMatch?.groups?.dir;
    const cdSuffix = cdPrefixMatch?.groups?.suffix;
    if (cdDir && cdSuffix) {
        // Remove any surrounding quotes
        let cdDirPath = cdDir;
        if (cdDirPath.startsWith('"') && cdDirPath.endsWith('"')) {
            cdDirPath = cdDirPath.slice(1, -1);
        }
        return { directory: cdDirPath, command: cdSuffix };
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuSW5UZXJtaW5hbEhlbHBlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci9ydW5JblRlcm1pbmFsSGVscGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxLQUFLLElBQUksU0FBUyxFQUFFLEtBQUssSUFBSSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU1RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFJakQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdkYsTUFBTSxVQUFVLFlBQVksQ0FBQyxRQUFnQixFQUFFLEVBQW1CO0lBQ2pFLElBQUksRUFBRSxvQ0FBNEIsRUFBRSxDQUFDO1FBQ3BDLE9BQU8scUNBQXFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBRXhHLENBQUM7SUFDRCxPQUFPLG9DQUFvQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFDaEYsQ0FBQztBQUVELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxRQUFnQjtJQUNuRCxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUMsbURBQW1ELENBQUMsQ0FBQztB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