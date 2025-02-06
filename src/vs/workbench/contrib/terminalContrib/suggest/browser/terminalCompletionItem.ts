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
}

export interface ITerminalCompletion extends ISimpleCompletion {
	/**
	 * The kind of terminal completion item.
	 */
	kind: TerminalCompletionItemKind;

	/**
	 * Whether the completion is a file. Files with the same score will be sorted against each other
	 * first by extension length and then certain extensions will get a boost based on the OS.
	 */
	isFile?: boolean;

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

		if (completion.isFile || completion.kind === TerminalCompletionItemKind.Folder) {
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
