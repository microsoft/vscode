"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVATAR_SIZE = void 0;
exports.getCommitHover = getCommitHover;
exports.getHistoryItemHover = getHistoryItemHover;
exports.getHoverCommitHashCommands = getHoverCommitHashCommands;
exports.processHoverRemoteCommands = processHoverRemoteCommands;
const vscode_1 = require("vscode");
const util_1 = require("./util");
const emoji_1 = require("./emoji");
exports.AVATAR_SIZE = 20;
function getCommitHover(authorAvatar, authorName, authorEmail, authorDate, message, shortStats, commands, coAuthors) {
    const markdownString = new vscode_1.MarkdownString('', true);
    markdownString.isTrusted = {
        enabledCommands: commands?.flat().map(c => c.command) ?? []
    };
    // Author, Subject | Message (escape image syntax)
    appendContent(markdownString, authorAvatar, authorName, authorEmail, authorDate, message, coAuthors);
    // Short stats
    if (shortStats) {
        appendShortStats(markdownString, shortStats);
    }
    // Commands
    if (commands && commands.length > 0) {
        appendCommands(markdownString, commands);
    }
    return markdownString;
}
function getHistoryItemHover(authorAvatar, authorName, authorEmail, authorDate, message, shortStats, commands, coAuthors) {
    const hoverContent = [];
    // Author, Subject | Message (escape image syntax)
    const authorMarkdownString = new vscode_1.MarkdownString('', true);
    appendContent(authorMarkdownString, authorAvatar, authorName, authorEmail, authorDate, message, coAuthors);
    hoverContent.push(authorMarkdownString);
    // Short stats
    if (shortStats) {
        const shortStatsMarkdownString = new vscode_1.MarkdownString('', true);
        shortStatsMarkdownString.supportHtml = true;
        appendShortStats(shortStatsMarkdownString, shortStats);
        hoverContent.push(shortStatsMarkdownString);
    }
    // Commands
    if (commands && commands.length > 0) {
        const commandsMarkdownString = new vscode_1.MarkdownString('', true);
        commandsMarkdownString.isTrusted = {
            enabledCommands: commands?.flat().map(c => c.command) ?? []
        };
        appendCommands(commandsMarkdownString, commands);
        hoverContent.push(commandsMarkdownString);
    }
    return hoverContent;
}
function appendContent(markdownString, authorAvatar, authorName, authorEmail, authorDate, message, coAuthors) {
    // Author
    if (authorName) {
        // Avatar
        if (authorAvatar) {
            markdownString.appendMarkdown('![');
            markdownString.appendText(authorName);
            markdownString.appendMarkdown('](');
            markdownString.appendText(authorAvatar);
            markdownString.appendMarkdown(`|width=${exports.AVATAR_SIZE},height=${exports.AVATAR_SIZE})`);
        }
        else {
            markdownString.appendMarkdown('$(account)');
        }
        // Email
        if (authorEmail) {
            markdownString.appendMarkdown(' [**');
            markdownString.appendText(authorName);
            markdownString.appendMarkdown('**](mailto:');
            markdownString.appendText(authorEmail);
            markdownString.appendMarkdown(')');
        }
        else {
            markdownString.appendMarkdown(' **');
            markdownString.appendText(authorName);
            markdownString.appendMarkdown('**');
        }
        // Date
        if (authorDate && !isNaN(new Date(authorDate).getTime())) {
            const dateString = new Date(authorDate).toLocaleString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric'
            });
            markdownString.appendMarkdown(', $(history)');
            markdownString.appendText(` ${(0, util_1.fromNow)(authorDate, true, true)} (${dateString})`);
        }
        markdownString.appendMarkdown('\n\n');
    }
    // Co-authors
    if (coAuthors && coAuthors.length > 0) {
        for (const coAuthor of coAuthors) {
            markdownString.appendMarkdown('$(account) ');
            if (coAuthor.email) {
                markdownString.appendMarkdown('[**');
                markdownString.appendText(coAuthor.name);
                markdownString.appendMarkdown('**](mailto:');
                markdownString.appendText(coAuthor.email);
                markdownString.appendMarkdown(')');
            }
            else {
                markdownString.appendMarkdown('**');
                markdownString.appendText(coAuthor.name);
                markdownString.appendMarkdown('**');
            }
            markdownString.appendMarkdown(` _(${vscode_1.l10n.t('Co-author')})_`);
            markdownString.appendMarkdown('\n\n');
        }
    }
    // Subject | Message (escape image syntax)
    markdownString.appendMarkdown(`${(0, emoji_1.emojify)(message.replace(/!\[/g, '&#33;&#91;').replace(/\r\n|\r|\n/g, '\n\n'))}`);
    markdownString.appendMarkdown(`\n\n---\n\n`);
}
function appendShortStats(markdownString, shortStats) {
    // Short stats
    markdownString.appendMarkdown(`<span>${shortStats.files === 1 ?
        vscode_1.l10n.t('{0} file changed', shortStats.files) :
        vscode_1.l10n.t('{0} files changed', shortStats.files)}</span>`);
    if (shortStats.insertions) {
        markdownString.appendMarkdown(`,&nbsp;<span style="color:var(--vscode-scmGraph-historyItemHoverAdditionsForeground);">${shortStats.insertions === 1 ?
            vscode_1.l10n.t('{0} insertion{1}', shortStats.insertions, '(+)') :
            vscode_1.l10n.t('{0} insertions{1}', shortStats.insertions, '(+)')}</span>`);
    }
    if (shortStats.deletions) {
        markdownString.appendMarkdown(`,&nbsp;<span style="color:var(--vscode-scmGraph-historyItemHoverDeletionsForeground);">${shortStats.deletions === 1 ?
            vscode_1.l10n.t('{0} deletion{1}', shortStats.deletions, '(-)') :
            vscode_1.l10n.t('{0} deletions{1}', shortStats.deletions, '(-)')}</span>`);
    }
    markdownString.appendMarkdown(`\n\n---\n\n`);
}
function appendCommands(markdownString, commands) {
    for (let index = 0; index < commands.length; index++) {
        if (index !== 0) {
            markdownString.appendMarkdown('&nbsp;&nbsp;|&nbsp;&nbsp;');
        }
        const commandsMarkdown = commands[index]
            .map(command => `[${command.title}](command:${command.command}?${encodeURIComponent(JSON.stringify(command.arguments))} "${command.tooltip}")`);
        markdownString.appendMarkdown(commandsMarkdown.join('&nbsp;'));
    }
}
function getHoverCommitHashCommands(documentUri, hash) {
    return [{
            title: `$(git-commit) ${(0, util_1.getCommitShortHash)(documentUri, hash)}`,
            tooltip: vscode_1.l10n.t('Open Commit'),
            command: 'git.viewCommit',
            arguments: [documentUri, hash, documentUri]
        }, {
            title: `$(copy)`,
            tooltip: vscode_1.l10n.t('Copy Commit Hash'),
            command: 'git.copyContentToClipboard',
            arguments: [hash]
        }];
}
function processHoverRemoteCommands(commands, hash) {
    return commands.map(command => ({
        ...command,
        arguments: [...command.arguments ?? [], hash]
    }));
}
//# sourceMappingURL=hover.js.map