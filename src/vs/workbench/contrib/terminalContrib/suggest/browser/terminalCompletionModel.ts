/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { count } from '../../../../../base/common/strings.js';
import { ISimpleCompletion, SimpleCompletionItem } from '../../../../services/suggest/browser/simpleCompletionItem.js';
import { SimpleCompletionModel, type LineContext } from '../../../../services/suggest/browser/simpleCompletionModel.js';

export class TerminalCompletionModel extends SimpleCompletionModel<TerminalCompletionItem> {
	constructor(
		items: TerminalCompletionItem[],
		lineContext: LineContext
	) {
		super(items, lineContext, compareCompletionsFn);
	}
}

const compareCompletionsFn = (leadingLineContent: string, a: TerminalCompletionItem, b: TerminalCompletionItem) => {
	// Sort by the score
	let score = b.score[0] - a.score[0];
	if (score !== 0) {
		return score;
	}

	// Sort by underscore penalty (eg. `__init__/` should be penalized)
	if (a.underscorePenalty !== b.underscorePenalty) {
		return a.underscorePenalty - b.underscorePenalty;
	}

	// Sort files of the same name by extension
	const isArg = leadingLineContent.includes(' ');
	if (!isArg && a.labelLowExcludeFileExt === b.labelLowExcludeFileExt) {
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

	// Sort by folder depth (eg. `vscode/` should come before `vscode-.../`)
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

	// Sort alphabetically, ignoring punctuation causes dot files to be mixed in rather than
	// all at the top
	return a.labelLow.localeCompare(b.labelLow, undefined, { ignorePunctuation: true });
};

// TODO: This should be based on the process OS, not the local OS
// File score boosts for specific file extensions on Windows. This only applies when the file is the
// _first_ part of the command line.
const fileExtScores = new Map<string, number>(isWindows ? [
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

function fileExtScore(ext: string): number {
	return fileExtScores.get(ext) || 0;
}

export enum TerminalCompletionItemKind {
	File = 0,
	Folder = 1,
	Flag = 2,
	Method = 3,
	Argument = 4,
	Alias = 5,
}

export interface ITerminalCompletion extends ISimpleCompletion {

	kind?: TerminalCompletionItemKind;

	/**
	 * Whether the completion is a file. Files with the same score will be sorted against each other
	 * first by extension length and then certain extensions will get a boost based on the OS.
	 */
	isFile?: boolean;

	/**
	 * Whether the completion is a directory.
	 */
	isDirectory?: boolean;

	/**
	 * Whether the completion is a keyword.
	 */
	isKeyword?: boolean;
}

export class TerminalCompletionItem extends SimpleCompletionItem {
	/**
	 * {@link labelLow} without the file extension.
	 */
	readonly labelLowExcludeFileExt: string;

	/**
	 * The lowercase label, when the completion is a file or directory this has  normalized path
	 * separators (/) on Windows and no trailing separator for directories.
	 */
	readonly labelLowNormalizedPath: string;

	/**
	 * A penalty that applies to files or folders starting with the underscore character.
	 */
	readonly underscorePenalty: 0 | 1 = 0;

	/**
	 * The file extension part from {@link labelLow}.
	 */
	readonly fileExtLow: string = '';

	constructor(
		override readonly completion: ITerminalCompletion
	) {
		super(completion);

		// ensure lower-variants (perf)
		this.labelLowExcludeFileExt = this.labelLow;
		this.labelLowNormalizedPath = this.labelLow;

		if (completion.isFile) {
			if (isWindows) {
				this.labelLow = this.labelLow.replaceAll('/', '\\');
			}
			// Don't include dotfiles as extensions when sorting
			const extIndex = this.labelLow.lastIndexOf('.');
			if (extIndex > 0) {
				this.labelLowExcludeFileExt = this.labelLow.substring(0, extIndex);
				this.fileExtLow = this.labelLow.substring(extIndex + 1);
			}
		}

		if (completion.isFile || completion.isDirectory) {
			if (isWindows) {
				this.labelLowNormalizedPath = this.labelLow.replaceAll('\\', '/');
			}
			if (completion.isDirectory) {
				this.labelLowNormalizedPath = this.labelLowNormalizedPath.replace(/\/$/, '');
			}
			this.underscorePenalty = basename(this.labelLowNormalizedPath).startsWith('_') ? 1 : 0;
		}
	}
}
