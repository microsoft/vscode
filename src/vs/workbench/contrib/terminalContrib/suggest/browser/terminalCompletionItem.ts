/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ISimpleCompletion, SimpleCompletionItem } from '../../../../services/suggest/browser/simpleCompletionItem.js';

export enum TerminalCompletionItemKind {
	File = 0,
	Folder = 1,
	Flag = 2,
	Method = 3,
	Argument = 4,
	Alias = 5,
	InlineSuggestion = 6,
	InlineSuggestionAlwaysOnTop = 7,
}

export interface ITerminalCompletion extends ISimpleCompletion {
	/**
	 * A custom string that should be input into the terminal when selecting this completion. This
	 * is only required if the label is not what's being input.
	 */
	inputData?: string;

	/**
	 * The kind of terminal completion item.
	 */
	kind?: TerminalCompletionItemKind;

	/**
	 * A flag that can be used to override the kind check and treat this completion as a file when
	 * it comes to sorting. For some pwsh completions come through as methods despite being files,
	 * this makes sure they're sorted correctly.
	 */
	isFileOverride?: boolean;

	/**
	 * Whether the completion is a keyword.
	 */
	isKeyword?: boolean;
}

export class TerminalCompletionItem extends SimpleCompletionItem {
	/**
	 * {@link labelLow} without the file extension.
	 */
	labelLowExcludeFileExt: string;

	/**
	 * The lowercase label, when the completion is a file or directory this has  normalized path
	 * separators (/) on Windows and no trailing separator for directories.
	 */
	labelLowNormalizedPath: string;

	/**
	 * A penalty that applies to files or folders starting with the underscore character.
	 */
	underscorePenalty: 0 | 1 = 0;

	/**
	 * The file extension part from {@link labelLow}.
	 */
	fileExtLow: string = '';

	constructor(
		override readonly completion: ITerminalCompletion
	) {
		super(completion);

		// ensure lower-variants (perf)
		this.labelLowExcludeFileExt = this.labelLow;
		this.labelLowNormalizedPath = this.labelLow;

		if (isFile(completion)) {
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

		if (isFile(completion) || completion.kind === TerminalCompletionItemKind.Folder) {
			if (isWindows) {
				this.labelLowNormalizedPath = this.labelLow.replaceAll('\\', '/');
			}
			if (completion.kind === TerminalCompletionItemKind.Folder) {
				this.labelLowNormalizedPath = this.labelLowNormalizedPath.replace(/\/$/, '');
			}
			this.underscorePenalty = basename(this.labelLowNormalizedPath).startsWith('_') ? 1 : 0;
		}
	}
}

function isFile(completion: ITerminalCompletion): boolean {
	return !!(completion.kind === TerminalCompletionItemKind.File || completion.isFileOverride);
}
