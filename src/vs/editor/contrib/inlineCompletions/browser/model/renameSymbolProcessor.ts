/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { LcsDiff, StringDiffSequence } from '../../../../../base/common/diff/diff.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../browser/editorExtensions.js';
import { IBulkEditService } from '../../../../browser/services/bulkEditService.js';
import { TextEdit } from '../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { StandardTokenType } from '../../../../common/encodedTokenAttributes.js';
import { Command, InlineCompletionHintStyle } from '../../../../common/languages.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { EditSources, TextModelEditSource } from '../../../../common/textModelEditSource.js';
import { prepareRename, rename } from '../../../rename/browser/rename.js';
import { renameSymbolCommandId } from '../controller/commandIds.js';
import { InlineSuggestHint, InlineSuggestionItem } from './inlineSuggestionItem.js';

type SingleEdits = {
	renames: { edits: TextEdit[]; position: Position; oldName: string; newName: string };
	others: { edits: TextEdit[] };
};

export class RenameSymbolProcessor extends Disposable {

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IBulkEditService bulkEditService: IBulkEditService,
	) {
		super();
		this._register(CommandsRegistry.registerCommand(renameSymbolCommandId, async (_: ServicesAccessor, textModel: ITextModel, position: Position, newName: string, source: TextModelEditSource) => {
			const result = await rename(this._languageFeaturesService.renameProvider, textModel, position, newName);
			if (result.rejectReason) {
				return;
			}
			bulkEditService.apply(result, { reason: source });
		}));
	}

	public async proposeRenameRefactoring(textModel: ITextModel, suggestItem: InlineSuggestionItem): Promise<InlineSuggestionItem> {
		if (!suggestItem.supportsRename) {
			return suggestItem;
		}

		const start = Date.now();

		const edits = this.createSingleEdits(textModel, suggestItem.editRange, suggestItem.insertText);
		if (edits === undefined || edits.renames.edits.length === 0) {
			return suggestItem;
		}

		const { oldName, newName, position } = edits.renames;
		let timedOut = false;
		const loc = await raceTimeout(prepareRename(this._languageFeaturesService.renameProvider, textModel, position), 1000, () => { timedOut = true; });
		const renamePossible = loc !== undefined && !loc.rejectReason && loc.text === oldName;

		suggestItem.setRenameProcessingInfo({ createdRename: renamePossible, duration: Date.now() - start, timedOut });

		if (!renamePossible) {
			return suggestItem;
		}

		const source = EditSources.inlineCompletionAccept({
			nes: suggestItem.isInlineEdit,
			requestUuid: suggestItem.requestUuid,
			providerId: suggestItem.source.provider.providerId,
			languageId: textModel.getLanguageId(),
		});
		const hintRange = edits.renames.edits[0].replacements[0].range;
		const label = localize('renameSymbol', "Rename '{0}' to '{1}'", oldName, newName);
		const command: Command = {
			id: renameSymbolCommandId,
			title: label,
			arguments: [textModel, position, newName, source],
		};
		const hint = InlineSuggestHint.create({ range: hintRange, content: label, style: InlineCompletionHintStyle.Code });
		return InlineSuggestionItem.create(suggestItem.withRename(command, hint), textModel);
	}

	private createSingleEdits(textModel: ITextModel, nesRange: Range, modifiedText: string): SingleEdits | undefined {
		const others: TextEdit[] = [];
		const renames: TextEdit[] = [];
		let oldName: string | undefined = undefined;
		let newName: string | undefined = undefined;
		let position: Position | undefined = undefined;

		const originalText = textModel.getValueInRange(nesRange);
		const nesOffset = textModel.getOffsetAt(nesRange.getStartPosition());

		const { changes } = (new LcsDiff(new StringDiffSequence(originalText), new StringDiffSequence(modifiedText))).ComputeDiff(true);
		if (changes.length === 0) {
			return undefined;
		}

		let tokenDiff: number = 0;
		for (const change of changes) {
			const startOffset = nesOffset + change.originalStart;
			const startPos = textModel.getPositionAt(startOffset);
			const wordRange = textModel.getWordAtPosition(startPos);
			// If we don't have a word range at the start position of the current document then we
			// don't treat it as a rename assuming that the rename refactoring will fail as well since
			// there can't be an identifier at that position.
			if (wordRange === null) {
				return undefined;
			}

			const endOffset = startOffset + change.originalLength;
			const endPos = textModel.getPositionAt(endOffset);
			const range = Range.fromPositions(startPos, endPos);
			const text = modifiedText.substring(change.modifiedStart, change.modifiedStart + change.modifiedLength);

			const tokenInfo = getTokenAtPosition(textModel, startPos);
			if (tokenInfo.type === StandardTokenType.Other) {

				let identifier = textModel.getValueInRange(tokenInfo.range);
				if (oldName === undefined) {
					oldName = identifier;
				} else if (oldName !== identifier) {
					return undefined;
				}

				// We assume that the new name starts at the same position as the old name from a token range perspective.
				const diff = text.length - change.originalLength;
				const tokenStartPos = textModel.getOffsetAt(tokenInfo.range.getStartPosition()) - nesOffset + tokenDiff;
				const tokenEndPos = textModel.getOffsetAt(tokenInfo.range.getEndPosition()) - nesOffset + tokenDiff;
				identifier = modifiedText.substring(tokenStartPos, tokenEndPos + diff);
				if (newName === undefined) {
					newName = identifier;
				} else if (newName !== identifier) {
					return undefined;
				}

				if (position === undefined) {
					position = tokenInfo.range.getStartPosition();
				}

				renames.push(TextEdit.replace(range, text));
				tokenDiff += diff;
			} else {
				others.push(TextEdit.replace(range, text));
			}
		}

		if (oldName === undefined || newName === undefined || position === undefined) {
			return undefined;
		}

		return {
			renames: { edits: renames, position, oldName, newName },
			others: { edits: others }
		};
	}
}

function getTokenAtPosition(textModel: ITextModel, position: Position): { type: StandardTokenType; range: Range } {
	textModel.tokenization.tokenizeIfCheap(position.lineNumber);
	const tokens = textModel.tokenization.getLineTokens(position.lineNumber);
	const idx = tokens.findTokenIndexAtOffset(position.column - 1);
	return {
		type: tokens.getStandardTokenType(idx),
		range: new Range(position.lineNumber, 1 + tokens.getStartOffset(idx), position.lineNumber, 1 + tokens.getEndOffset(idx))
	};
}
