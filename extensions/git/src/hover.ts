/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, l10n, MarkdownString, Uri } from 'vscode';
import { fromNow, getCommitShortHash } from './util';
import { emojify } from './emoji';
import { CoAuthor, CommitShortStat } from './git';

export const AVATAR_SIZE = 20;

export function getCommitHover(authorAvatar: string | undefined, authorName: string | undefined, authorEmail: string | undefined, authorDate: Date | number | undefined, message: string, shortStats: CommitShortStat | undefined, commands: Command[][] | undefined, coAuthors?: CoAuthor[]): MarkdownString {
	const markdownString = new MarkdownString('', true);
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

export function getHistoryItemHover(authorAvatar: string | undefined, authorName: string | undefined, authorEmail: string | undefined, authorDate: Date | number | undefined, message: string, shortStats: CommitShortStat | undefined, commands: Command[][] | undefined, coAuthors?: CoAuthor[]): MarkdownString[] {
	const hoverContent: MarkdownString[] = [];

	// Author, Subject | Message (escape image syntax)
	const authorMarkdownString = new MarkdownString('', true);
	appendContent(authorMarkdownString, authorAvatar, authorName, authorEmail, authorDate, message, coAuthors);
	hoverContent.push(authorMarkdownString);

	// Short stats
	if (shortStats) {
		const shortStatsMarkdownString = new MarkdownString('', true);
		shortStatsMarkdownString.supportHtml = true;
		appendShortStats(shortStatsMarkdownString, shortStats);
		hoverContent.push(shortStatsMarkdownString);
	}

	// Commands
	if (commands && commands.length > 0) {
		const commandsMarkdownString = new MarkdownString('', true);
		commandsMarkdownString.isTrusted = {
			enabledCommands: commands?.flat().map(c => c.command) ?? []
		};
		appendCommands(commandsMarkdownString, commands);
		hoverContent.push(commandsMarkdownString);
	}

	return hoverContent;
}

function appendContent(markdownString: MarkdownString, authorAvatar: string | undefined, authorName: string | undefined, authorEmail: string | undefined, authorDate: Date | number | undefined, message: string, coAuthors?: CoAuthor[]): void {
	// Author
	if (authorName) {
		// Avatar
		if (authorAvatar) {
			markdownString.appendMarkdown('![');
			markdownString.appendText(authorName);
			markdownString.appendMarkdown('](');
			markdownString.appendText(authorAvatar);
			markdownString.appendMarkdown(`|width=${AVATAR_SIZE},height=${AVATAR_SIZE})`);
		} else {
			markdownString.appendMarkdown('$(account)');
		}

		// Email
		if (authorEmail) {
			markdownString.appendMarkdown(' [**');
			markdownString.appendText(authorName);
			markdownString.appendMarkdown('**](mailto:');
			markdownString.appendText(authorEmail);
			markdownString.appendMarkdown(')');
		} else {
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
			markdownString.appendText(` ${fromNow(authorDate, true, true)} (${dateString})`);
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
			} else {
				markdownString.appendMarkdown('**');
				markdownString.appendText(coAuthor.name);
				markdownString.appendMarkdown('**');
			}
			markdownString.appendMarkdown(` _(${l10n.t('Co-author')})_`);
			markdownString.appendMarkdown('\n\n');
		}
	}

	// Subject | Message (escape image syntax, HTML tags)
	markdownString.appendMarkdown(`${emojify(escapeHtmlTags(message).replace(/!\[/g, '&#33;&#91;').replace(/\r\n|\r|\n/g, '\n\n'))}`);
	markdownString.appendMarkdown(`\n\n---\n\n`);
}

/**
 * Escapes `<` characters that would start an HTML tag (ex: `<div>`, `Foo<T>`) so that they
 * are rendered literally instead of being dropped by the markdown renderer. Code spans, code
 * blocks, and autolinks are left untouched as they are already rendered as expected.
 */
export function escapeHtmlTags(message: string): string {
	let fence: string | undefined;

	return message.split(/\r\n|\r|\n/).map(line => {
		// Fenced code block
		const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
		if (fence !== undefined) {
			if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
				fence = undefined;
			}
			return line;
		}
		if (fenceMatch) {
			fence = fenceMatch[1];
			return line;
		}

		// Indented code block
		if (/^( {4}|\t)/.test(line)) {
			return line;
		}

		// Skip code spans, and autolinks (ex: <https://example.com>, <user@example.com>)
		return line.replace(/(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)|<(?=[a-zA-Z/!?])(?![a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*>|[^\s<>@]+@[^\s<>]+>)/g,
			match => match === '<' ? '&lt;' : match);
	}).join('\n');
}

function appendShortStats(markdownString: MarkdownString, shortStats: { files: number; insertions: number; deletions: number }): void {
	// Short stats
	markdownString.appendMarkdown(`<span>${shortStats.files === 1 ?
		l10n.t('{0} file changed', shortStats.files) :
		l10n.t('{0} files changed', shortStats.files)}</span>`);

	if (shortStats.insertions) {
		markdownString.appendMarkdown(`,&nbsp;<span style="color:var(--vscode-scmGraph-historyItemHoverAdditionsForeground);">${shortStats.insertions === 1 ?
			l10n.t('{0} insertion{1}', shortStats.insertions, '(+)') :
			l10n.t('{0} insertions{1}', shortStats.insertions, '(+)')}</span>`);
	}

	if (shortStats.deletions) {
		markdownString.appendMarkdown(`,&nbsp;<span style="color:var(--vscode-scmGraph-historyItemHoverDeletionsForeground);">${shortStats.deletions === 1 ?
			l10n.t('{0} deletion{1}', shortStats.deletions, '(-)') :
			l10n.t('{0} deletions{1}', shortStats.deletions, '(-)')}</span>`);
	}

	markdownString.appendMarkdown(`\n\n---\n\n`);
}

function appendCommands(markdownString: MarkdownString, commands: Command[][]): void {
	for (let index = 0; index < commands.length; index++) {
		if (index !== 0) {
			markdownString.appendMarkdown('&nbsp;&nbsp;|&nbsp;&nbsp;');
		}

		const commandsMarkdown = commands[index]
			.map(command => `[${command.title}](command:${command.command}?${encodeURIComponent(JSON.stringify(command.arguments))} "${command.tooltip}")`);
		markdownString.appendMarkdown(commandsMarkdown.join('&nbsp;'));
	}
}

export function getHoverCommitHashCommands(documentUri: Uri, hash: string): Command[] {
	return [{
		title: `$(git-commit) ${getCommitShortHash(documentUri, hash)}`,
		tooltip: l10n.t('Open Commit'),
		command: 'git.viewCommit',
		arguments: [documentUri, hash, documentUri]
	}, {
		title: `$(copy)`,
		tooltip: l10n.t('Copy Commit Hash'),
		command: 'git.copyContentToClipboard',
		arguments: [hash]
	}] satisfies Command[];
}

export function processHoverRemoteCommands(commands: Command[], hash: string): Command[] {
	return commands.map(command => ({
		...command,
		arguments: [...command.arguments ?? [], hash]
	} satisfies Command));
}
