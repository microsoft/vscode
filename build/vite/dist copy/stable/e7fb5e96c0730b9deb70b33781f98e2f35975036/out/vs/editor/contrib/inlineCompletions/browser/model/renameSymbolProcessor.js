/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { raceTimeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { LcsDiff, StringDiffSequence } from '../../../../../base/common/diff/diff.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../browser/services/bulkEditService.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { EditSources } from '../../../../common/textModelEditSource.js';
import { hasProvider, rawRename } from '../../../rename/browser/rename.js';
import { renameSymbolCommandId } from '../controller/commandIds.js';
import { InlineSuggestionItem } from './inlineSuggestionItem.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IRenameSymbolTrackerService } from '../../../../browser/services/renameSymbolTrackerService.js';
import { ICodeEditorService } from '../../../../browser/services/codeEditorService.js';
import { TextModelValueReference } from './textModelValueReference.js';
var RenameKind;
(function (RenameKind) {
    RenameKind["no"] = "no";
    RenameKind["yes"] = "yes";
    RenameKind["maybe"] = "maybe";
})(RenameKind || (RenameKind = {}));
(function (RenameKind) {
    function fromString(value) {
        switch (value) {
            case 'no': return RenameKind.no;
            case 'yes': return RenameKind.yes;
            case 'maybe': return RenameKind.maybe;
            default: return RenameKind.no;
        }
    }
    RenameKind.fromString = fromString;
})(RenameKind || (RenameKind = {}));
export class RenameInferenceEngine {
    constructor() {
    }
    inferRename(textModel, editRange, insertText, wordDefinition) {
        // Extend the edit range to full lines to capture prefix/suffix renames
        const extendedRange = new Range(editRange.startLineNumber, 1, editRange.endLineNumber, textModel.getLineMaxColumn(editRange.endLineNumber));
        const startDiff = editRange.startColumn - extendedRange.startColumn;
        const endDiff = extendedRange.endColumn - editRange.endColumn;
        const originalText = textModel.getValueInRange(extendedRange);
        const modifiedText = textModel.getValueInRange(new Range(extendedRange.startLineNumber, extendedRange.startColumn, extendedRange.startLineNumber, extendedRange.startColumn + startDiff)) +
            insertText +
            textModel.getValueInRange(new Range(extendedRange.endLineNumber, extendedRange.endColumn - endDiff, extendedRange.endLineNumber, extendedRange.endColumn));
        // console.log(`Original: ${originalText} \nmodified: ${modifiedText}`);
        const others = [];
        const renames = [];
        let oldName = undefined;
        let newName = undefined;
        let position = undefined;
        const nesOffset = textModel.getOffsetAt(extendedRange.getStartPosition());
        const { changes: originalChanges } = (new LcsDiff(new StringDiffSequence(originalText), new StringDiffSequence(modifiedText))).ComputeDiff(true);
        if (originalChanges.length === 0) {
            return undefined;
        }
        // Fold the changes to larger changes if the gap between two changes is a full word. This covers cases like renaming
        // `foo` to `abcfoobar`
        const changes = [];
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
        let tokenDiff = 0;
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
            let tokenInfo;
            // Word info is left aligned whereas token info is right aligned for insertions.
            // We prefer a suffix insertion for renames so we take the word range for the token info.
            if (isInsertion && originalStartColumn === wordRange.endColumn && wordRange.endColumn > wordRange.startColumn) {
                tokenInfo = this.getTokenAtPosition(textModel, new Position(startPos.lineNumber, wordRange.startColumn));
            }
            else {
                tokenInfo = this.getTokenAtPosition(textModel, startPos);
            }
            if (wordRange.startColumn !== tokenInfo.range.startColumn || wordRange.endColumn !== tokenInfo.range.endColumn) {
                others.push(new TextReplacement(range, insertedTextSegment));
                tokenDiff += diff;
                continue;
            }
            if (tokenInfo.type === 0 /* StandardTokenType.Other */) {
                let identifier = textModel.getValueInRange(tokenInfo.range);
                if (identifier.length === 0) {
                    others.push(new TextReplacement(range, insertedTextSegment));
                    tokenDiff += diff;
                    continue;
                }
                if (oldName === undefined) {
                    oldName = identifier;
                }
                else if (oldName !== identifier) {
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
                }
                else if (newName !== identifier) {
                    others.push(new TextReplacement(range, insertedTextSegment));
                    tokenDiff += diff;
                    continue;
                }
                if (position === undefined) {
                    position = tokenInfo.range.getStartPosition();
                }
                if (oldName !== undefined && newName !== undefined && oldName.length > 0 && newName.length > 0 && oldName !== newName) {
                    renames.push(new TextReplacement(tokenInfo.range, newName));
                }
                else {
                    renames.push(new TextReplacement(range, insertedTextSegment));
                }
                tokenDiff += diff;
            }
            else {
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
    getTokenAtPosition(textModel, position) {
        textModel.tokenization.tokenizeIfCheap(position.lineNumber);
        const tokens = textModel.tokenization.getLineTokens(position.lineNumber);
        const idx = tokens.findTokenIndexAtOffset(position.column - 1);
        return {
            type: tokens.getStandardTokenType(idx),
            range: new Range(position.lineNumber, 1 + tokens.getStartOffset(idx), position.lineNumber, 1 + tokens.getEndOffset(idx))
        };
    }
}
class EditorState {
    static create(codeEditorService, textModel) {
        const editor = codeEditorService.getFocusedCodeEditor();
        if (editor === null) {
            return undefined;
        }
        if (editor.getModel() !== textModel) {
            return undefined;
        }
        return new EditorState(editor, textModel.getVersionId());
    }
    constructor(editor, versionId) {
        this.editor = editor;
        this.versionId = versionId;
    }
    equals(other) {
        if (other === undefined) {
            return false;
        }
        return this.editor === other.editor && this.versionId === other.versionId;
    }
}
class RenameSymbolRunnable {
    constructor(languageFeaturesService, commandService, requestUuid, textModel, state, position, newName, lastSymbolRename, oldName) {
        this._result = undefined;
        this._commandService = commandService;
        this._textModel = textModel;
        this._state = state;
        this._requestUuid = requestUuid;
        this._cancellationTokenSource = new CancellationTokenSource();
        if (lastSymbolRename === undefined || oldName === undefined) {
            this._promise = rawRename(languageFeaturesService.renameProvider, textModel, position, newName, this._cancellationTokenSource.token);
            return;
        }
        else {
            this._promise = this.sendNesRenameRequest(textModel, position, oldName, newName, lastSymbolRename);
        }
    }
    get requestUuid() {
        return this._requestUuid;
    }
    isValid(codeEditorService) {
        return this._state.equals(EditorState.create(codeEditorService, this._textModel));
    }
    cancel() {
        this._cancellationTokenSource.cancel();
    }
    async getCount() {
        if (this._cancellationTokenSource.token.isCancellationRequested) {
            return 0;
        }
        const result = await this.getResult();
        if (result === undefined || this._cancellationTokenSource.token.isCancellationRequested) {
            return 0;
        }
        return result.edits.length;
    }
    async getWorkspaceEdit() {
        return this.getResult();
    }
    async getResult() {
        if (this._cancellationTokenSource.token.isCancellationRequested) {
            return undefined;
        }
        if (this._result === undefined) {
            this._result = await this._promise;
        }
        if (this._result.rejectReason || this._cancellationTokenSource.token.isCancellationRequested) {
            return undefined;
        }
        return this._result;
    }
    async sendNesRenameRequest(textModel, position, oldName, newName, lastSymbolRename) {
        try {
            const result = await this._commandService.executeCommand('github.copilot.nes.postRename', textModel.uri, position, oldName, newName, lastSymbolRename);
            if (result === undefined) {
                return { rejectReason: 'Rename failed', edits: [] };
            }
            const edits = [];
            for (const item of result) {
                for (const change of item.changes) {
                    const range = new Range(change.range.start.line + 1, change.range.start.character + 1, change.range.end.line + 1, change.range.end.character + 1);
                    const edit = new ResourceTextEdit(item.file, new TextReplacement(range, change.newText ?? newName));
                    edits.push(edit);
                }
            }
            return { edits };
        }
        catch (error) {
            return { rejectReason: 'Rename failed', edits: [] };
        }
    }
}
let RenameSymbolProcessor = class RenameSymbolProcessor extends Disposable {
    constructor(_commandService, _languageFeaturesService, _languageConfigurationService, bulkEditService, _renameSymbolTrackerService, _codeEditorService) {
        super();
        this._commandService = _commandService;
        this._languageFeaturesService = _languageFeaturesService;
        this._languageConfigurationService = _languageConfigurationService;
        this._renameSymbolTrackerService = _renameSymbolTrackerService;
        this._codeEditorService = _codeEditorService;
        this._renameInferenceEngine = new RenameInferenceEngine();
        this._renameRunnable = undefined;
        this._register(CommandsRegistry.registerCommand(renameSymbolCommandId, async (_, source, renameRunnable) => {
            if (renameRunnable === undefined || !renameRunnable.isValid(this._codeEditorService)) {
                return;
            }
            try {
                const workspaceEdit = await renameRunnable.getWorkspaceEdit();
                if (workspaceEdit === undefined) {
                    return;
                }
                bulkEditService.apply(workspaceEdit, { reason: source });
            }
            finally {
                if (this._renameRunnable === renameRunnable) {
                    this._renameRunnable = undefined;
                }
            }
        }));
    }
    async proposeRenameRefactoring(textModel, suggestItem, context) {
        if (!suggestItem.supportsRename || suggestItem.action?.kind !== 'edit' || context.selectedSuggestionInfo) {
            return suggestItem;
        }
        if (!hasProvider(this._languageFeaturesService.renameProvider, textModel)) {
            return suggestItem;
        }
        const state = EditorState.create(this._codeEditorService, textModel);
        if (state === undefined) {
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
        const trackedWord = this._renameSymbolTrackerService.trackedWord.get();
        let lastSymbolRename = undefined;
        if (trackedWord !== undefined && trackedWord.model === textModel && trackedWord.originalWord === oldName && trackedWord.currentWord === newName) {
            lastSymbolRename = trackedWord.currentRange;
        }
        // Check asynchronously if a rename is possible
        let timedOut = false;
        const check = await raceTimeout(this.checkRenamePrecondition(suggestItem, textModel, position, oldName, newName, lastSymbolRename), 100, () => { timedOut = true; });
        const renamePossible = this.isRenamePossible(suggestItem, check, state, textModel);
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
        if (this._renameRunnable === undefined) {
            this._renameRunnable = new RenameSymbolRunnable(this._languageFeaturesService, this._commandService, suggestItem.requestUuid, textModel, state, position, newName, lastSymbolRename, lastSymbolRename !== undefined ? oldName : undefined);
        }
        // Create alternative action
        const source = EditSources.inlineCompletionAccept({
            nes: suggestItem.isInlineEdit,
            requestUuid: suggestItem.requestUuid,
            providerId: suggestItem.source.provider.providerId,
            languageId: textModel.getLanguageId(),
            correlationId: suggestItem.getSourceCompletion().correlationId,
        });
        const command = {
            id: renameSymbolCommandId,
            title: localize('rename', "Rename"),
            arguments: [source, this._renameRunnable],
        };
        const alternativeAction = {
            label: localize('rename', "Rename"),
            icon: Codicon.replaceAll,
            command,
            count: this._renameRunnable.getCount(),
        };
        const renameAction = {
            kind: 'edit',
            range: renameEdits[0].range,
            insertText: renameEdits[0].text,
            snippetInfo: suggestItem.snippetInfo,
            alternativeAction,
            uri: textModel.uri
        };
        const ref = TextModelValueReference.snapshot(textModel);
        return InlineSuggestionItem.create(suggestItem.withAction(renameAction), ref, false);
    }
    async checkRenamePrecondition(suggestItem, textModel, position, oldName, newName, lastSymbolRename) {
        const no = { canRename: RenameKind.no, timedOut: false };
        try {
            const result = await this._commandService.executeCommand('github.copilot.nes.prepareRename', textModel.uri, position, oldName, newName, suggestItem.requestUuid, lastSymbolRename);
            if (result === undefined) {
                return no;
            }
            else if (typeof result === 'string') {
                const canRename = RenameKind.fromString(result);
                if (canRename === RenameKind.yes || canRename === RenameKind.maybe) {
                    return {
                        canRename,
                        oldName,
                        onOldState: false,
                    };
                }
                else {
                    return {
                        canRename,
                        timedOut: false,
                    };
                }
            }
            else {
                return result;
            }
        }
        catch (error) {
            return no;
        }
    }
    isRenamePossible(suggestItem, check, state, textModel) {
        if (check === undefined || check.canRename === RenameKind.no) {
            return false;
        }
        if (!state.equals(EditorState.create(this._codeEditorService, textModel))) {
            return false;
        }
        if (this._renameRunnable === undefined) {
            return true;
        }
        if (this._renameRunnable.requestUuid === suggestItem.requestUuid) {
            return false;
        }
        else {
            this._renameRunnable.cancel();
            this._renameRunnable = undefined;
            return true;
        }
    }
};
RenameSymbolProcessor = __decorate([
    __param(0, ICommandService),
    __param(1, ILanguageFeaturesService),
    __param(2, ILanguageConfigurationService),
    __param(3, IBulkEditService),
    __param(4, IRenameSymbolTrackerService),
    __param(5, ICodeEditorService)
], RenameSymbolProcessor);
export { RenameSymbolProcessor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVuYW1lU3ltYm9sUHJvY2Vzc29yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC9yZW5hbWVTeW1ib2xQcm9jZXNzb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUV4RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxLQUFLLEVBQWUsTUFBTSxrQ0FBa0MsQ0FBQztBQUd0RSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUU5RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsV0FBVyxFQUF1QixNQUFNLDJDQUEyQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0Us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