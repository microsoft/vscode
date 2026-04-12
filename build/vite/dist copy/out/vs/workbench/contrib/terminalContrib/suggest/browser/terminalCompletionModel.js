/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isWindows } from '../../../../../base/common/platform.js';
import { count } from '../../../../../base/common/strings.js';
import { isString } from '../../../../../base/common/types.js';
import { SimpleCompletionModel } from '../../../../services/suggest/browser/simpleCompletionModel.js';
import { TerminalCompletionItemKind } from './terminalCompletionItem.js';
export class TerminalCompletionModel extends SimpleCompletionModel {
    constructor(items, lineContext) {
        super(items, lineContext, compareCompletionsFn);
    }
}
const compareCompletionsFn = (leadingLineContent, a, b) => {
    // Boost always on top inline completions
    if (a.completion.kind === TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop && a.completion.kind !== b.completion.kind) {
        return -1;
    }
    if (b.completion.kind === TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop && a.completion.kind !== b.completion.kind) {
        return 1;
    }
    // Sort by the score
    let score = b.score[0] - a.score[0];
    if (score !== 0) {
        return score;
    }
    // Boost inline completions
    if (a.completion.kind === TerminalCompletionItemKind.InlineSuggestion && a.completion.kind !== b.completion.kind) {
        return -1;
    }
    if (b.completion.kind === TerminalCompletionItemKind.InlineSuggestion && a.completion.kind !== b.completion.kind) {
        return 1;
    }
    if (a.punctuationPenalty !== b.punctuationPenalty) {
        // Sort by underscore penalty (eg. `__init__/` should be penalized)
        // Sort by punctuation penalty (eg. `;` should be penalized)
        return a.punctuationPenalty - b.punctuationPenalty;
    }
    // Sort files of the same name by extension
    const isArg = leadingLineContent.includes(' ');
    if (!isArg && a.completion.kind === TerminalCompletionItemKind.File && b.completion.kind === TerminalCompletionItemKind.File) {
        // If the file name excluding the extension is different, just do a regular sort
        if (a.labelLowExcludeFileExt !== b.labelLowExcludeFileExt) {
            return a.labelLowExcludeFileExt.localeCompare(b.labelLowExcludeFileExt, undefined, { ignorePunctuation: true });
        }
        // Then by label length ascending (excluding file extension if it's a file)
        score = a.labelLowExcludeFileExt.length - b.labelLowExcludeFileExt.length;
        if (score !== 0) {
            return score;
        }
        // If they're files at the start of the command line, boost extensions depending on the operating system
        score = fileExtScore(b.fileExtLow) - fileExtScore(a.fileExtLow);
        if (score !== 0) {
            return score;
        }
        // Then by file extension length ascending
        score = a.fileExtLow.length - b.fileExtLow.length;
        if (score !== 0) {
            return score;
        }
    }
    // Boost main and master branches for git commands
    // HACK: Currently this just matches leading line content, it should eventually check the
    //       completion type is a branch
    if (a.completion.kind === TerminalCompletionItemKind.Argument && b.completion.kind === TerminalCompletionItemKind.Argument && /^\s*git\b/.test(leadingLineContent)) {
        const aLabel = isString(a.completion.label) ? a.completion.label : a.completion.label.label;
        const bLabel = isString(b.completion.label) ? b.completion.label : b.completion.label.label;
        const aIsMainOrMaster = aLabel === 'main' || aLabel === 'master';
        const bIsMainOrMaster = bLabel === 'main' || bLabel === 'master';
        if (aIsMainOrMaster && !bIsMainOrMaster) {
            return -1;
        }
        if (bIsMainOrMaster && !aIsMainOrMaster) {
            return 1;
        }
    }
    // Sort by more detailed completions
    if (a.completion.kind === TerminalCompletionItemKind.Method && b.completion.kind === TerminalCompletionItemKind.Method) {
        if (!isString(a.completion.label) && a.completion.label.description && !isString(b.completion.label) && b.completion.label.description) {
            score = 0;
        }
        else if (!isString(a.completion.label) && a.completion.label.description) {
            score = -2;
        }
        else if (!isString(b.completion.label) && b.completion.label.description) {
            score = 2;
        }
        score += (b.completion.detail ? 1 : 0) + (b.completion.documentation ? 2 : 0) - (a.completion.detail ? 1 : 0) - (a.completion.documentation ? 2 : 0);
        if (score !== 0) {
            return score;
        }
    }
    // Sort by folder depth (eg. `vscode/` should come before `vscode-.../`)
    if (a.completion.kind === TerminalCompletionItemKind.Folder && b.completion.kind === TerminalCompletionItemKind.Folder) {
        if (a.labelLowNormalizedPath && b.labelLowNormalizedPath) {
            // Directories
            // Count depth of path (number of / or \ occurrences)
            score = count(a.labelLowNormalizedPath, '/') - count(b.labelLowNormalizedPath, '/');
            if (score !== 0) {
                return score;
            }
            // Ensure shorter prefixes appear first
            if (b.labelLowNormalizedPath.startsWith(a.labelLowNormalizedPath)) {
                return -1; // `a` is a prefix of `b`, so `a` should come first
            }
            if (a.labelLowNormalizedPath.startsWith(b.labelLowNormalizedPath)) {
                return 1; // `b` is a prefix of `a`, so `b` should come first
            }
        }
    }
    if (a.completion.kind !== b.completion.kind) {
        // Sort by kind
        if ((a.completion.kind === TerminalCompletionItemKind.Method || a.completion.kind === TerminalCompletionItemKind.Alias) && (b.completion.kind !== TerminalCompletionItemKind.Method && b.completion.kind !== TerminalCompletionItemKind.Alias)) {
            return -1; // Methods and aliases should come first
        }
        if ((b.completion.kind === TerminalCompletionItemKind.Method || b.completion.kind === TerminalCompletionItemKind.Alias) && (a.completion.kind !== TerminalCompletionItemKind.Method && a.completion.kind !== TerminalCompletionItemKind.Alias)) {
            return 1; // Methods and aliases should come first
        }
        if (a.completion.kind === TerminalCompletionItemKind.Argument && b.completion.kind !== TerminalCompletionItemKind.Argument) {
            return -1; // Arguments should come before other kinds
        }
        if (b.completion.kind === TerminalCompletionItemKind.Argument && a.completion.kind !== TerminalCompletionItemKind.Argument) {
            return 1; // Arguments should come before other kinds
        }
        if (isResourceKind(a.completion.kind) && !isResourceKind(b.completion.kind)) {
            return 1; // Resources should come last
        }
        if (isResourceKind(b.completion.kind) && !isResourceKind(a.completion.kind)) {
            return -1; // Resources should come last
        }
    }
    // Sort alphabetically, ignoring punctuation causes dot files to be mixed in rather than
    // all at the top
    return a.labelLow.localeCompare(b.labelLow, undefined, { ignorePunctuation: true });
};
const isResourceKind = (kind) => kind === TerminalCompletionItemKind.File ||
    kind === TerminalCompletionItemKind.Folder ||
    kind === TerminalCompletionItemKind.SymbolicLinkFile ||
    kind === TerminalCompletionItemKind.SymbolicLinkFolder;
// TODO: This should be based on the process OS, not the local OS
// File score boosts for specific file extensions on Windows. This only applies when the file is the
// _first_ part of the command line.
const fileExtScores = new Map(isWindows ? [
    // Windows - .ps1 > .exe > .bat > .cmd. This is the command precedence when running the files
    //           without an extension, tested manually in pwsh v7.4.4
    ['ps1', 0.09],
    ['exe', 0.08],
    ['bat', 0.07],
    ['cmd', 0.07],
    ['msi', 0.06],
    ['com', 0.06],
    // Non-Windows
    ['sh', -0.05],
    ['bash', -0.05],
    ['zsh', -0.05],
    ['fish', -0.05],
    ['csh', -0.06], // C shell
    ['ksh', -0.06], // Korn shell
    // Scripting language files are excluded here as the standard behavior on Windows will just open
    // the file in a text editor, not run the file
] : [
    // Pwsh
    ['ps1', 0.05],
    // Windows
    ['bat', -0.05],
    ['cmd', -0.05],
    ['exe', -0.05],
    // Non-Windows
    ['sh', 0.05],
    ['bash', 0.05],
    ['zsh', 0.05],
    ['fish', 0.05],
    ['csh', 0.04], // C shell
    ['ksh', 0.04], // Korn shell
    // Scripting languages
    ['py', 0.05], // Python
    ['pl', 0.05], // Perl
]);
function fileExtScore(ext) {
    return fileExtScores.get(ext) || 0;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb21wbGV0aW9uTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3Rlcm1pbmFsQ29tcGxldGlvbk1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSwrREFBK0QsQ0FBQztBQUN4SCxPQUFPLEVBQUUsMEJBQTBCLEVBQStCLE1BQU0sNkJBQTZCLENBQUM7QUFFdEcsTUFBTSxPQUFPLHVCQUF3QixTQUFRLHFCQUE2QztJQUN6RixZQUNDLEtBQStCLEVBQy9CLFdBQXdCO1FBRXhCLEtBQUssQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDakQsQ0FBQztDQUNEO0FBRUQsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLGtCQUEwQixFQUFFLENBQXlCLEVBQUUsQ0FBeUIsRUFBRSxFQUFFO0lBQ2pILHlDQUF5QztJQUN6QyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxLQUFLLDBCQUEwQixDQUFDLDJCQUEyQixJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDN0gsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNYLENBQUM7SUFDRCxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxLQUFLLDBCQUEwQixDQUFDLDJCQUEyQixJQUFJLENB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