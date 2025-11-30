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
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { StandardTokenType } from '../../../../common/encodedTokenAttributes.js';
import { Command } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { EditSources, TextModelEditSource } from '../../../../common/textModelEditSource.js';
import { hasProvider, prepareRename, rename } from '../../../rename/browser/rename.js';
import { renameSymbolCommandId } from '../controller/commandIds.js';
import { InlineSuggestionItem } from './inlineSuggestionItem.js';
import { IInlineSuggestDataActionEdit } from './provideInlineCompletions.js';

export type RenameEdits = {
	renames: { edits: TextReplacement[]; position: Position; oldName: string; newName: string };
	others: { edits: TextReplacement[] };
};

export class RenameInferenceEngine {

	public constructor() {
	}

	public inferRename(textModel: ITextModel, editRange: Range, insertText: string, wordDefinition: RegExp): RenameEdits | undefined {

		// Extend the edit range to full lines to capture prefix/suffix renames
		const extendedRange = new Range(editRange.startLineNumber, 1, editRange.endLineNumber, textModel.getLineMaxColumn(editRange.endLineNumber));
		const startDiff = editRange.startColumn - extendedRange.startColumn;
		const endDiff = extendedRange.endColumn - editRange.endColumn;

		const originalText = textModel.getValueInRange(extendedRange);
		const modifiedText =
			textModel.getValueInRange(new Range(extendedRange.startLineNumber, extendedRange.startColumn, extendedRange.startLineNumber, extendedRange.startColumn + startDiff)) +
			insertText +
			textModel.getValueInRange(new Range(extendedRange.endLineNumber, extendedRange.endColumn - endDiff, extendedRange.endLineNumber, extendedRange.endColumn));

		const others: TextReplacement[] = [];
		const renames: TextReplacement[] = [];
		let oldName: string | undefined = undefined;
		let newName: string | undefined = undefined;
		let position: Position | undefined = undefined;

		const nesOffset = textModel.getOffsetAt(extendedRange.getStartPosition());

		const { changes: originalChanges } = (new LcsDiff(new StringDiffSequence(originalText), new StringDiffSequence(modifiedText))).ComputeDiff(true);
		if (originalChanges.length === 0) {
			return undefined;
		}

		// Fold the changes to larger changes if the gap between two changes is a full word. This covers cases like renaming
		// `foo` to `abcfoobar`
		const changes: typeof originalChanges = [];
		for (const change of originalChanges) {
			if (changes.length === 0) {
				changes.push(change);
				continue;
			}

			const lastChange = changes[changes.length - 1];
			const gapOriginalLength = change.originalStart - (lastChange.originalStart + lastChange.originalLength);

			if (gapOriginalLength > 0) {
				const gapStartOffset = nesOffset + lastChange.originalStart + lastChange.originalLength;
				const gapStartPos = textModel.getPositionAt(gapStartOffset);
				const wordRange = textModel.getWordAtPosition(gapStartPos);

				if (wordRange) {
					const wordStartOffset = textModel.getOffsetAt(new Position(gapStartPos.lineNumber, wordRange.startColumn));
					const wordEndOffset = textModel.getOffsetAt(new Position(gapStartPos.lineNumber, wordRange.endColumn));
					const gapEndOffset = gapStartOffset + gapOriginalLength;

					if (wordStartOffset <= gapStartOffset && gapEndOffset <= wordEndOffset && wordStartOffset <= gapEndOffset && gapEndOffset <= wordEndOffset) {
						lastChange.originalLength = (change.originalStart + change.originalLength) - lastChange.originalStart;
						lastChange.modifiedLength = (change.modifiedStart + change.modifiedLength) - lastChange.modifiedStart;
						continue;
					}
				}
			}

			changes.push(change);
		}

		let tokenDiff: number = 0;
		for (const change of changes) {
			const originalTextSegment = originalText.substring(change.originalStart, change.originalStart + change.originalLength);
			// If the original text segment contains a whitespace character we don't consider this a rename since
			// identifiers in programming languages can't contain whitespace characters usually
			if (/\s/.test(originalTextSegment)) {
				return undefined;
			}
			if (originalTextSegment.length > 0) {
				wordDefinition.lastIndex = 0;
				const match = wordDefinition.exec(originalTextSegment);
				if (match === null || match.index !== 0 || match[0].length !== originalTextSegment.length) {
					return undefined;
				}
			}
			const insertedTextSegment = modifiedText.substring(change.modifiedStart, change.modifiedStart + change.modifiedLength);
			// If the inserted text contains a whitespace character we don't consider this a rename since identifiers in
			// programming languages can't contain whitespace characters usually
			if (/\s/.test(insertedTextSegment)) {
				return undefined;
			}
			if (insertedTextSegment.length > 0) {
				wordDefinition.lastIndex = 0;
				const match = wordDefinition.exec(insertedTextSegment);
				if (match === null || match.index !== 0 || match[0].length !== insertedTextSegment.length) {
					return undefined;
				}
			}

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

			const tokenInfo = this.getTokenAtPosition(textModel, startPos);
			if (tokenInfo.type === StandardTokenType.Other) {

				let identifier = textModel.getValueInRange(tokenInfo.range);
				if (oldName === undefined) {
					oldName = identifier;
				} else if (oldName !== identifier) {
					return undefined;
				}

				// We assume that the new name starts at the same position as the old name from a token range perspective.
				const diff = insertedTextSegment.length - change.originalLength;
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

				renames.push(new TextReplacement(range, insertedTextSegment));
				tokenDiff += diff;
			} else {
				others.push(new TextReplacement(range, insertedTextSegment));
				tokenDiff += insertedTextSegment.length - change.originalLength;
			}
		}

		if (oldName === undefined || newName === undefined || position === undefined || oldName.length === 0 || newName.length === 0 || oldName === newName) {
			return undefined;
		}

		wordDefinition.lastIndex = 0;
		let match = wordDefinition.exec(oldName);
		if (match === null || match.index !== 0 || match[0].length !== oldName.length) {
			return undefined;
		}

		wordDefinition.lastIndex = 0;
		match = wordDefinition.exec(newName);
		if (match === null || match.index !== 0 || match[0].length !== newName.length) {
			return undefined;
		}

		return {
			renames: { edits: renames, position, oldName, newName },
			others: { edits: others }
		};
	}


	protected getTokenAtPosition(textModel: ITextModel, position: Position): { type: StandardTokenType; range: Range } {
		textModel.tokenization.tokenizeIfCheap(position.lineNumber);
		const tokens = textModel.tokenization.getLineTokens(position.lineNumber);
		const idx = tokens.findTokenIndexAtOffset(position.column - 1);
		return {
			type: tokens.getStandardTokenType(idx),
			range: new Range(position.lineNumber, 1 + tokens.getStartOffset(idx), position.lineNumber, 1 + tokens.getEndOffset(idx))
		};
	}
}

export class RenameSymbolProcessor extends Disposable {

	private readonly _renameInferenceEngine = new RenameInferenceEngine();

	constructor(
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
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
		if (!suggestItem.supportsRename || suggestItem.action?.kind !== 'edit') {
			return suggestItem;
		}

		if (!hasProvider(this._languageFeaturesService.renameProvider, textModel)) {
			return suggestItem;
		}

		const edit = suggestItem.action.textReplacement;

		const start = Date.now();

		const languageConfiguration = this._languageConfigurationService.getLanguageConfiguration(textModel.getLanguageId());

		const edits = this._renameInferenceEngine.inferRename(textModel, edit.range, edit.text, languageConfiguration.wordDefinition);
		if (edits === undefined || edits.renames.edits.length === 0) {
			return suggestItem;
		}

		const { oldName, newName, position, edits: renameEdits } = edits.renames;
		let timedOut = false;
		const loc = await raceTimeout(prepareRename(this._languageFeaturesService.renameProvider, textModel, position), 1000, () => { timedOut = true; });
		const renamePossible = loc !== undefined && !loc.rejectReason && loc.text === oldName;

		suggestItem.setRenameProcessingInfo({
			createdRename: renamePossible,
			duration: Date.now() - start,
			timedOut,
			droppedOtherEdits: renamePossible ? edits.others.edits.length : undefined,
			droppedRenameEdits: renamePossible ? renameEdits.length - 1 : undefined,
		});

		if (!renamePossible) {
			return suggestItem;
		}

		const source = EditSources.inlineCompletionAccept({
			nes: suggestItem.isInlineEdit,
			requestUuid: suggestItem.requestUuid,
			providerId: suggestItem.source.provider.providerId,
			languageId: textModel.getLanguageId(),
		});
		const command: Command = {
			id: renameSymbolCommandId,
			title: localize('rename', "Rename"),
			arguments: [textModel, position, newName, source],
		};
		const textReplacement = renameEdits[0];
		const renameAction: IInlineSuggestDataActionEdit = {
			kind: 'edit',
			range: textReplacement.range,
			insertText: textReplacement.text,
			snippetInfo: suggestItem.snippetInfo,
			alternativeAction: command,
			uri: textModel.uri
		};
		return InlineSuggestionItem.create(suggestItem.withAction(renameAction), textModel);
	}
}
