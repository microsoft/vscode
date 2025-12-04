/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { LcsDiff, StringDiffSequence } from '../../../../../base/common/diff/diff.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../browser/editorExtensions.js';
import { IBulkEditService } from '../../../../browser/services/bulkEditService.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { StandardTokenType } from '../../../../common/encodedTokenAttributes.js';
import { Command, type Rejection, type WorkspaceEdit } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { EditSources, TextModelEditSource } from '../../../../common/textModelEditSource.js';
import { hasProvider, rawRename } from '../../../rename/browser/rename.js';
import { renameSymbolCommandId } from '../controller/commandIds.js';
import { InlineSuggestionItem } from './inlineSuggestionItem.js';
import { IInlineSuggestDataActionEdit } from './provideInlineCompletions.js';
import { InlineSuggestAlternativeAction } from './InlineSuggestAlternativeAction.js';
import { Codicon } from '../../../../../base/common/codicons.js';

enum RenameKind {
	no = 'no',
	yes = 'yes',
	maybe = 'maybe'
}

namespace RenameKind {
	export function fromString(value: string): RenameKind {
		switch (value) {
			case 'no': return RenameKind.no;
			case 'yes': return RenameKind.yes;
			case 'maybe': return RenameKind.maybe;
			default: return RenameKind.no;
		}
	}
}

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

		// console.log(`Original: ${originalText} \nmodified: ${modifiedText}`);
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
			const insertedTextSegment = modifiedText.substring(change.modifiedStart, change.modifiedStart + change.modifiedLength);

			const startOffset = nesOffset + change.originalStart;
			const startPos = textModel.getPositionAt(startOffset);

			const endOffset = startOffset + change.originalLength;
			const endPos = textModel.getPositionAt(endOffset);

			const range = Range.fromPositions(startPos, endPos);

			const diff = insertedTextSegment.length - change.originalLength;

			// If the original text segment contains a whitespace character we don't consider this a rename since
			// identifiers in programming languages can't contain whitespace characters usually
			if (/\s/.test(originalTextSegment)) {
				others.push(new TextReplacement(range, insertedTextSegment));
				tokenDiff += diff;
				continue;
			}
			if (originalTextSegment.length > 0) {
				wordDefinition.lastIndex = 0;
				const match = wordDefinition.exec(originalTextSegment);
				if (match === null || match.index !== 0 || match[0].length !== originalTextSegment.length) {
					others.push(new TextReplacement(range, insertedTextSegment));
					tokenDiff += diff;
					continue;
				}
			}
			// If the inserted text contains a whitespace character we don't consider this a rename since identifiers in
			// programming languages can't contain whitespace characters usually
			if (/\s/.test(insertedTextSegment)) {
				others.push(new TextReplacement(range, insertedTextSegment));
				tokenDiff += diff;
				continue;
			}
			if (insertedTextSegment.length > 0) {
				wordDefinition.lastIndex = 0;
				const match = wordDefinition.exec(insertedTextSegment);
				if (match === null || match.index !== 0 || match[0].length !== insertedTextSegment.length) {
					others.push(new TextReplacement(range, insertedTextSegment));
					tokenDiff += diff;
					continue;
				}
			}

			const wordRange = textModel.getWordAtPosition(startPos);
			// If we don't have a word range at the start position of the current document then we
			// don't treat it as a rename assuming that the rename refactoring will fail as well since
			// there can't be an identifier at that position.
			if (wordRange === null) {
				others.push(new TextReplacement(range, insertedTextSegment));
				tokenDiff += diff;
				continue;
			}
			const originalStartColumn = change.originalStart + 1;
			const isInsertion = change.originalLength === 0 && change.modifiedLength > 0;
			let tokenInfo: { type: StandardTokenType; range: Range };
			// Word info is left aligned whereas token info is right aligned for insertions.
			// We prefer a suffix insertion for renames so we take the word range for the token info.
			if (isInsertion && originalStartColumn === wordRange.endColumn && wordRange.endColumn > wordRange.startColumn) {
				tokenInfo = this.getTokenAtPosition(textModel, new Position(startPos.lineNumber, wordRange.startColumn));
			} else {
				tokenInfo = this.getTokenAtPosition(textModel, startPos);
			}
			if (wordRange.startColumn !== tokenInfo.range.startColumn || wordRange.endColumn !== tokenInfo.range.endColumn) {
				others.push(new TextReplacement(range, insertedTextSegment));
				tokenDiff += diff;
				continue;
			}
			if (tokenInfo.type === StandardTokenType.Other) {

				let identifier = textModel.getValueInRange(tokenInfo.range);
				if (identifier.length === 0) {
					others.push(new TextReplacement(range, insertedTextSegment));
					tokenDiff += diff;
					continue;
				}
				if (oldName === undefined) {
					oldName = identifier;
				} else if (oldName !== identifier) {
					others.push(new TextReplacement(range, insertedTextSegment));
					tokenDiff += diff;
					continue;
				}

				// We assume that the new name starts at the same position as the old name from a token range perspective.
				const tokenStartPos = textModel.getOffsetAt(tokenInfo.range.getStartPosition()) - nesOffset + tokenDiff;
				const tokenEndPos = textModel.getOffsetAt(tokenInfo.range.getEndPosition()) - nesOffset + tokenDiff;
				identifier = modifiedText.substring(tokenStartPos, tokenEndPos + diff);
				if (identifier.length === 0) {
					others.push(new TextReplacement(range, insertedTextSegment));
					tokenDiff += diff;
					continue;
				}
				if (newName === undefined) {
					newName = identifier;
				} else if (newName !== identifier) {
					others.push(new TextReplacement(range, insertedTextSegment));
					tokenDiff += diff;
					continue;
				}

				if (position === undefined) {
					position = tokenInfo.range.getStartPosition();
				}

				if (oldName !== undefined && newName !== undefined && oldName.length > 0 && newName.length > 0 && oldName !== newName) {
					renames.push(new TextReplacement(tokenInfo.range, newName));
				} else {
					renames.push(new TextReplacement(range, insertedTextSegment));
				}
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

class RenameSymbolRunnable {

	private readonly _cancellationTokenSource: CancellationTokenSource;
	private readonly _promise: Promise<WorkspaceEdit & Rejection>;
	private _result: WorkspaceEdit & Rejection | undefined = undefined;

	constructor(languageFeaturesService: ILanguageFeaturesService, textModel: ITextModel, position: Position, newName: string) {
		this._cancellationTokenSource = new CancellationTokenSource();
		this._promise = rawRename(languageFeaturesService.renameProvider, textModel, position, newName, this._cancellationTokenSource.token);
	}

	public cancel(): void {
		this._cancellationTokenSource.cancel();
	}

	public async getCount(): Promise<number> {
		const result = await this.getResult();
		if (result === undefined) {
			return 0;
		}

		return result.edits.length;
	}

	public async getWorkspaceEdit(): Promise<WorkspaceEdit | undefined> {
		return this.getResult();
	}

	private async getResult(): Promise<WorkspaceEdit | undefined> {
		if (this._result === undefined) {
			this._result = await this._promise;
		}
		if (this._result.rejectReason) {
			return undefined;
		}
		return this._result;
	}
}

export class RenameSymbolProcessor extends Disposable {

	private readonly _renameInferenceEngine = new RenameInferenceEngine();

	private _renameRunnable: { id: string; runnable: RenameSymbolRunnable } | undefined;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@IBulkEditService bulkEditService: IBulkEditService,
	) {
		super();
		const self = this;
		this._register(CommandsRegistry.registerCommand(renameSymbolCommandId, async (_: ServicesAccessor, textModel: ITextModel, position: Position, newName: string, source: TextModelEditSource, id: string) => {
			if (self._renameRunnable === undefined) {
				return;
			}
			let workspaceEdit: WorkspaceEdit | undefined;
			if (self._renameRunnable.id !== id) {
				self._renameRunnable.runnable.cancel();
				self._renameRunnable = undefined;
				const runnable = new RenameSymbolRunnable(self._languageFeaturesService, textModel, position, newName);
				workspaceEdit = await runnable.getWorkspaceEdit();
			} else {
				workspaceEdit = await self._renameRunnable.runnable.getWorkspaceEdit();
				self._renameRunnable = undefined;
			}
			if (workspaceEdit === undefined) {
				return;
			}
			bulkEditService.apply(workspaceEdit, { reason: source });
		}));
	}

	public async proposeRenameRefactoring(textModel: ITextModel, suggestItem: InlineSuggestionItem): Promise<InlineSuggestionItem> {
		if (!suggestItem.supportsRename || suggestItem.action?.kind !== 'edit') {
			return suggestItem;
		}

		if (!hasProvider(this._languageFeaturesService.renameProvider, textModel)) {
			return suggestItem;
		}

		const start = Date.now();
		const edit = suggestItem.action.textReplacement;
		const languageConfiguration = this._languageConfigurationService.getLanguageConfiguration(textModel.getLanguageId());

		// Check synchronously if a rename is possible
		const edits = this._renameInferenceEngine.inferRename(textModel, edit.range, edit.text, languageConfiguration.wordDefinition);
		if (edits === undefined || edits.renames.edits.length === 0) {
			return suggestItem;
		}

		const { oldName, newName, position, edits: renameEdits } = edits.renames;

		// Check asynchronously if a rename is possible
		let timedOut = false;
		const check = await raceTimeout<RenameKind>(this.checkRenamePrecondition(suggestItem, textModel, position, oldName, newName), 100, () => { timedOut = true; });
		const renamePossible = check === RenameKind.yes || check === RenameKind.maybe;

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

		// Prepare the rename edits
		const id = suggestItem.identity.id;
		if (this._renameRunnable !== undefined) {
			this._renameRunnable.runnable.cancel();
			this._renameRunnable = undefined;
		}
		const runnable = new RenameSymbolRunnable(this._languageFeaturesService, textModel, position, newName);
		this._renameRunnable = { id, runnable };

		// Create alternative action
		const source = EditSources.inlineCompletionAccept({
			nes: suggestItem.isInlineEdit,
			requestUuid: suggestItem.requestUuid,
			providerId: suggestItem.source.provider.providerId,
			languageId: textModel.getLanguageId(),
			correlationId: suggestItem.getSourceCompletion().correlationId,
		});
		const command: Command = {
			id: renameSymbolCommandId,
			title: localize('rename', "Rename"),
			arguments: [textModel, position, newName, source, id],
		};
		const alternativeAction: InlineSuggestAlternativeAction = {
			label: localize('rename', "Rename"),
			icon: Codicon.replaceAll,
			command,
			count: runnable.getCount(),
		};
		const renameAction: IInlineSuggestDataActionEdit = {
			kind: 'edit',
			range: renameEdits[0].range,
			insertText: renameEdits[0].text,
			snippetInfo: suggestItem.snippetInfo,
			alternativeAction,
			uri: textModel.uri
		};

		return InlineSuggestionItem.create(suggestItem.withAction(renameAction), textModel, false);
	}

	private async checkRenamePrecondition(suggestItem: InlineSuggestionItem, textModel: ITextModel, position: Position, oldName: string, newName: string): Promise<RenameKind> {
		// const result = await prepareRename(this._languageFeaturesService.renameProvider, textModel, position, CancellationToken.None);
		// if (result === undefined || result.rejectReason) {
		// 	return RenameKind.no;
		// }
		// return oldName === result.text ? RenameKind.yes : RenameKind.no;

		try {
			const result = await this._commandService.executeCommand<RenameKind>('github.copilot.nes.prepareRename', textModel.uri, position, oldName, newName, suggestItem.requestUuid);
			if (result === undefined) {
				return RenameKind.no;
			} else {
				return RenameKind.fromString(result);
			}
		} catch (error) {
			return RenameKind.no;
		}
	}
}
