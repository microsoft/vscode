/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MarkdownLoggable } from '../../../platform/inlineEdits/common/inlineEditLogContext';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { NesRebaseConfigs } from '../common/editRebase';
import { CachedOrRebasedEdit } from './nextEditCache';

export interface RebaseResult {
	readonly edit: CachedOrRebasedEdit | undefined;
	readonly failureInfo?: RebaseFailureInfo;
}

export class RebaseFailureInfo implements MarkdownLoggable {
	constructor(
		readonly originalDocument: string,
		readonly editWindow: OffsetRange | undefined,
		readonly originalEdits: readonly StringReplacement[],
		readonly userEditSince: StringEdit,
		readonly currentDocument: string,
		readonly currentSelection: readonly OffsetRange[],
		readonly nesRebaseConfigs: NesRebaseConfigs,
	) { }

	toMarkdown(): string {
		const lines: string[] = [];

		lines.push('### Original Document');
		lines.push('```');
		lines.push(this.originalDocument);
		lines.push('```');

		lines.push('');
		lines.push('### Suggested Edits');
		for (let i = 0; i < this.originalEdits.length; i++) {
			const edit = this.originalEdits[i];
			lines.push(`- **Edit ${i}**: \`${edit.toString()}\``);
			lines.push(`  - replaces: \`${JSON.stringify(edit.replaceRange.substring(this.originalDocument))}\``);
			lines.push(`  - with: \`${JSON.stringify(edit.newText)}\``);
		}

		if (this.editWindow) {
			lines.push('');
			lines.push(`### Edit Window: ${this.editWindow.toString()}`);
			lines.push(`Content: \`${JSON.stringify(this.editWindow.substring(this.originalDocument))}\``);
		}

		lines.push('');
		lines.push('### User Edit Since');
		for (const replacement of this.userEditSince.replacements) {
			lines.push(`- \`${replacement.toString()}\``);
			lines.push(`  - replaces: \`${JSON.stringify(replacement.replaceRange.substring(this.originalDocument))}\``);
			lines.push(`  - with: \`${JSON.stringify(replacement.newText)}\``);
		}

		lines.push('');
		lines.push('### Current Document (after user edits)');
		lines.push('```');
		lines.push(this.currentDocument);
		lines.push('```');

		if (this.currentSelection.length > 0) {
			lines.push('');
			lines.push(`### Cursor: ${this.currentSelection.map(s => s.toString()).join(', ')}`);
		}

		lines.push('');
		lines.push('### Document Intended After Suggested Edits');
		lines.push('```');
		try {
			const intended = new StringEdit(this.originalEdits.slice()).apply(this.originalDocument);
			lines.push(intended);
		} catch {
			lines.push('<could not compute>');
		}
		lines.push('```');

		lines.push('');
		lines.push('### Copy-Pasteable Test');
		lines.push('```typescript');
		lines.push(this._generateTest());
		lines.push('```');

		return lines.join('\n');
	}

	private _generateTest(): string {
		const lines: string[] = [];
		lines.push(`test('rebase failure (auto-generated)', () => {`);
		lines.push(`\tconst originalDocument = ${toBacktickLiteral(this.originalDocument)};`);

		lines.push('\tconst originalEdits = [');
		for (const edit of this.originalEdits) {
			lines.push(`\t\tStringReplacement.replace(new OffsetRange(${edit.replaceRange.start}, ${edit.replaceRange.endExclusive}), ${toBacktickLiteral(edit.newText)}),`);
		}
		lines.push('\t];');

		lines.push('\tconst userEditSince = StringEdit.create([');
		for (const replacement of this.userEditSince.replacements) {
			lines.push(`\t\tStringReplacement.replace(new OffsetRange(${replacement.replaceRange.start}, ${replacement.replaceRange.endExclusive}), ${toBacktickLiteral(replacement.newText)}),`);
		}
		lines.push('\t]);');

		lines.push(`\tconst currentDocumentContent = ${toBacktickLiteral(this.currentDocument)};`);

		if (this.editWindow) {
			lines.push(`\tconst editWindow = new OffsetRange(${this.editWindow.start}, ${this.editWindow.endExclusive});`);
		} else {
			lines.push('\tconst editWindow = undefined;');
		}

		lines.push(`\tconst currentSelection = [${this.currentSelection.map(s => `new OffsetRange(${s.start}, ${s.endExclusive})`).join(', ')}];`);

		const configEntries: string[] = [];
		if (this.nesRebaseConfigs.absorbSubsequenceTyping) {
			configEntries.push(`absorbSubsequenceTyping: ${this.nesRebaseConfigs.absorbSubsequenceTyping}`);
		}
		if (this.nesRebaseConfigs.reverseAgreement) {
			configEntries.push(`reverseAgreement: ${this.nesRebaseConfigs.reverseAgreement}`);
		}
		configEntries.push(`maxImperfectAgreementLength: ${this.nesRebaseConfigs.maxImperfectAgreementLength}`);
		lines.push(`\tconst nesConfigs = { ${configEntries.join(', ')} };`);

		lines.push('');
		lines.push('\tconst logger = new TestLogService();');
		lines.push('\texpect(userEditSince.apply(originalDocument)).toBe(currentDocumentContent);');

		const configsArg = ', nesConfigs';
		lines.push(`\texpect(tryRebase(originalDocument, editWindow, originalEdits, [], userEditSince, currentDocumentContent, currentSelection, 'strict', logger${configsArg})).toMatchInlineSnapshot();`);

		lines.push('});');

		return lines.join('\n');
	}
}

function toBacktickLiteral(value: string): string {
	const escaped = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
	return '`' + escaped + '`';
}
