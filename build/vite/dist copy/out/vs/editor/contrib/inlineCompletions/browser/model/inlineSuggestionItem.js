/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { observableSignal, observableValue } from '../../../../../base/common/observable.js';
import { commonPrefixLength, commonSuffixLength, splitLines } from '../../../../../base/common/strings.js';
import { applyEditsToRanges, StringEdit, StringReplacement } from '../../../../common/core/edits/stringEdit.js';
import { TextEdit, TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { Range } from '../../../../common/core/range.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { StringText } from '../../../../common/core/text/abstractText.js';
import { getPositionOffsetTransformerFromTextModel } from '../../../../common/core/text/getPositionOffsetTransformerFromTextModel.js';
import { TextLength } from '../../../../common/core/text/textLength.js';
import { linesDiffComputers } from '../../../../common/diff/linesDiffComputers.js';
import { InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { computeEditKind } from './editKind.js';
import { inlineCompletionIsVisible } from './inlineCompletionIsVisible.js';
import { InlineSuggestData } from './provideInlineCompletions.js';
import { InlineSuggestAlternativeAction } from './InlineSuggestAlternativeAction.js';
import { TextModelValueReference } from './textModelValueReference.js';
export var InlineSuggestionItem;
(function (InlineSuggestionItem) {
    function create(data, textModel, shouldDiffEdit = true) {
        if (!data.isInlineEdit && !data.action?.uri && data.action?.kind === 'edit') {
            return InlineCompletionItem.create(data, textModel, data.action);
        }
        else {
            return InlineEditItem.create(data, textModel, shouldDiffEdit);
        }
    }
    InlineSuggestionItem.create = create;
})(InlineSuggestionItem || (InlineSuggestionItem = {}));
function hashInlineSuggestionAction(action) {
    const obj = action?.kind === 'edit' ? {
        ...action, alternativeAction: InlineSuggestAlternativeAction.toString(action.alternativeAction),
        target: action?.target.uri.toString(),
    } : {
        ...action,
        target: action?.target.uri.toString(),
    };
    return JSON.stringify(obj);
}
class InlineSuggestionItemBase {
    constructor(_data, identity, hint, 
    /**
     * Reference to the text model this item targets.
     * For cross-file edits, this may differ from the current editor's model.
     */
    originalTextRef) {
        this._data = _data;
        this.identity = identity;
        this.hint = hint;
        this.originalTextRef = originalTextRef;
    }
    /**
     * A reference to the original inline completion list this inline completion has been constructed from.
     * Used for event data to ensure referential equality.
    */
    get source() { return this._data.source; }
    get isFromExplicitRequest() { return this._data.context.triggerKind === InlineCompletionTriggerKind.Explicit; }
    get forwardStable() { return this.source.inlineSuggestions.enableForwardStability ?? false; }
    get targetRange() {
        if (this.hint) {
            return this.hint.range;
        }
        if (this.action?.kind === 'edit') {
            return this.action.textReplacement.range;
        }
        else if (this.action?.kind === 'jumpTo') {
            return Range.fromPositions(this.action.position);
        }
        throw new BugIndicatingError('InlineSuggestionItem: Either hint or action must be set');
    }
    get semanticId() { return this.hash; }
    get gutterMenuLinkAction() { return this._sourceInlineCompletion.gutterMenuLinkAction; }
    get command() { return this._sourceInlineCompletion.command; }
    get supportsRename() { return this._data.supportsRename; }
    get warning() { return this._sourceInlineCompletion.warning; }
    get showInlineEditMenu() { return !!this._sourceInlineCompletion.showInlineEditMenu; }
    get hash() {
        return hashInlineSuggestionAction(this.action);
    }
    /** @deprecated */
    get shownCommand() { return this._sourceInlineCompletion.shownCommand; }
    get requestUuid() { return this._data.context.requestUuid; }
    get partialAccepts() { return this._data.partialAccepts; }
    /**
     * A reference to the original inline completion this inline completion has been constructed from.
     * Used for event data to ensure referential equality.
    */
    get _sourceInlineCompletion() { return this._data.sourceInlineCompletion; }
    addRef() {
        this.identity.addRef();
        this.source.addRef();
    }
    removeRef() {
        this.identity.removeRef();
        this.source.removeRef();
    }
    reportInlineEditShown(commandService, viewKind, viewData, model, timeWhenShown) {
        const insertText = this.action?.kind === 'edit' ? this.action.textReplacement.text : ''; // TODO@hediet support insertText === undefined
        this._data.reportInlineEditShown(commandService, insertText, viewKind, viewData, this.computeEditKind(model), timeWhenShown);
    }
    reportPartialAccept(acceptedCharacters, info, partialAcceptance) {
        this._data.reportPartialAccept(acceptedCharacters, info, partialAcceptance);
    }
    reportEndOfLife(reason) {
        this._data.reportEndOfLife(reason);
    }
    setEndOfLifeReason(reason) {
        this._data.setEndOfLifeReason(reason);
    }
    setIsPreceeded(item) {
        this._data.setIsPreceeded(item.partialAccepts);
    }
    setNotShownReasonIfNotSet(reason) {
        this._data.setNotShownReason(reason);
    }
    /**
     * Avoid using this method. Instead introduce getters for the needed properties.
    */
    getSourceCompletion() {
        return this._sourceInlineCompletion;
    }
    setRenameProcessingInfo(info) {
        this._data.setRenameProcessingInfo(info);
    }
    withAction(action) {
        return this._data.withAction(action);
    }
    addPerformanceMarker(marker) {
        this._data.addPerformanceMarker(marker);
    }
}
export class InlineSuggestionIdentity {
    constructor() {
        this._onDispose = observableSignal(this);
        this.onDispose = this._onDispose;
        this._jumpedTo = observableValue(this, false);
        this._refCount = 0;
        this.id = 'InlineCompletionIdentity' + InlineSuggestionIdentity.idCounter++;
    }
    static { this.idCounter = 0; }
    get jumpedTo() {
        return this._jumpedTo;
    }
    addRef() {
        this._refCount++;
    }
    removeRef() {
        this._refCount--;
        if (this._refCount === 0) {
            this._onDispose.trigger(undefined);
        }
    }
    setJumpTo(tx) {
        this._jumpedTo.set(true, tx);
    }
}
export class InlineSuggestHint {
    static create(hint) {
        return new InlineSuggestHint(Range.lift(hint.range), hint.content, hint.style);
    }
    constructor(range, content, style) {
        this.range = range;
        this.content = content;
        this.style = style;
    }
    withEdit(edit, positionOffsetTransformer) {
        const offsetRange = new OffsetRange(positionOffsetTransformer.getOffset(this.range.getStartPosition()), positionOffsetTransformer.getOffset(this.range.getEndPosition()));
        const newOffsetRange = applyEditsToRanges([offsetRange], edit)[0];
        if (!newOffsetRange) {
            return undefined;
        }
        const newRange = positionOffsetTransformer.getRange(newOffsetRange);
        return new InlineSuggestHint(newRange, this.content, this.style);
    }
}
export class InlineCompletionItem extends InlineSuggestionItemBase {
    static create(data, textModel, action) {
        const identity = new InlineSuggestionIdentity();
        const transformer = textModel.getTransformer();
        const insertText = action.insertText.replace(/\r\n|\r|\n/g, textModel.getEOL());
        const edit = reshapeInlineCompletion(new StringReplacement(transformer.getOffsetRange(action.range), insertText), textModel);
        const trimmedEdit = edit.removeCommonSuffixAndPrefix(textModel.getValue());
        const textEdit = transformer.getTextReplacement(edit);
        const displayLocation = data.hint ? InlineSuggestHint.create(data.hint) : undefined;
        return new InlineCompletionItem(edit, trimmedEdit, textEdit, textEdit.range, action.snippetInfo, data.additionalTextEdits, data, identity, displayLocation, textModel);
    }
    constructor(_edit, _trimmedEdit, _textEdit, _originalRange, snippetInfo, additionalTextEdits, data, identity, displayLocation, originalTextRef) {
        super(data, identity, displayLocation, originalTextRef);
        this._edit = _edit;
        this._trimmedEdit = _trimmedEdit;
        this._textEdit = _textEdit;
        this._originalRange = _originalRange;
        this.snippetInfo = snippetInfo;
        this.additionalTextEdits = additionalTextEdits;
        this.isInlineEdit = false;
    }
    get action() {
        return {
            kind: 'edit',
            textReplacement: this.getSingleTextEdit(),
            snippetInfo: this.snippetInfo,
            stringEdit: new StringEdit([this._trimmedEdit]),
            alternativeAction: undefined,
            target: this.originalTextRef,
        };
    }
    get hash() {
        return JSON.stringify(this._trimmedEdit.toJson());
    }
    getSingleTextEdit() { return this._textEdit; }
    withIdentity(identity) {
        return new InlineCompletionItem(this._edit, this._trimmedEdit, this._textEdit, this._originalRange, this.snippetInfo, this.additionalTextEdits, this._data, identity, this.hint, this.originalTextRef);
    }
    withEdit(textModelEdit, textModel) {
        // If the edit is to a different model than our target, it's a noop
        if (!this.originalTextRef.targets(textModel)) {
            return this; // unchanged
        }
        const newEditRange = applyEditsToRanges([this._edit.replaceRange], textModelEdit);
        if (newEditRange.length === 0) {
            return undefined;
        }
        const newEdit = new StringReplacement(newEditRange[0], this._textEdit.text);
        const positionOffsetTransformer = getPositionOffsetTransformerFromTextModel(textModel);
        const newTextEdit = positionOffsetTransformer.getTextReplacement(newEdit);
        let newDisplayLocation = this.hint;
        if (newDisplayLocation) {
            newDisplayLocation = newDisplayLocation.withEdit(textModelEdit, positionOffsetTransformer);
            if (!newDisplayLocation) {
                return undefined;
            }
        }
        const trimmedEdit = newEdit.removeCommonSuffixAndPrefix(textModel.getValue());
        return new InlineCompletionItem(newEdit, trimmedEdit, newTextEdit, this._originalRange, this.snippetInfo, this.additionalTextEdits, this._data, this.identity, newDisplayLocation, this.originalTextRef);
    }
    canBeReused(model, position) {
        // TODO@hediet I believe this can be simplified to `return true;`, as applying an edit should kick out this suggestion.
        const updatedRange = this._textEdit.range;
        const result = !!updatedRange
            && updatedRange.containsPosition(position)
            && this.isVisible(model, position)
            && TextLength.ofRange(updatedRange).isGreaterThanOrEqualTo(TextLength.ofRange(this._originalRange));
        return result;
    }
    isVisible(model, cursorPosition) {
        const singleTextEdit = this.getSingleTextEdit();
        return inlineCompletionIsVisible(singleTextEdit, this._originalRange, model, cursorPosition);
    }
    computeEditKind(model) {
        return computeEditKind(new StringEdit([this._edit]), model);
    }
    get editRange() { return this.getSingleTextEdit().range; }
    get insertText() { return this.getSingleTextEdit().text; }
}
export class InlineEditItem extends InlineSuggestionItemBase {
    static createForTest(textModel, range, newText) {
        const action = {
            kind: 'edit',
            snippetInfo: undefined,
            insertText: newText,
            range: range,
            uri: textModel.uri,
            alternativeAction: undefined,
        };
        return InlineEditItem.create(InlineSuggestData.createForTest(action, textModel.uri), textModel);
    }
    static create(data, textModel, shouldDiffEdit = true) {
        let action;
        let edits = [];
        if (data.action?.kind === 'edit') {
            const offsetEdit = shouldDiffEdit ? getDiffedStringEdit(textModel, data.action.range, data.action.insertText) : getStringEdit(textModel, data.action.range, data.action.insertText); // TODO compute async
            const textEdit = TextEdit.fromStringEdit(offsetEdit, textModel);
            const singleTextEdit = offsetEdit.isEmpty() ? new TextReplacement(new Range(1, 1, 1, 1), '') : textEdit.toReplacement(textModel); // FIXME: .toReplacement() can throw because offsetEdit is empty because we get an empty diff in getStringEdit after diffing
            edits = offsetEdit.replacements.map(edit => {
                const replacedRange = Range.fromPositions(textModel.getPositionAt(edit.replaceRange.start), textModel.getTransformer().getPosition(edit.replaceRange.endExclusive));
                const replacedText = textModel.getValueInRange(replacedRange);
                return SingleUpdatedNextEdit.create(edit, replacedText);
            });
            action = {
                kind: 'edit',
                snippetInfo: data.action.snippetInfo,
                stringEdit: offsetEdit,
                textReplacement: singleTextEdit,
                alternativeAction: data.action.alternativeAction,
                target: textModel,
            };
        }
        else if (data.action?.kind === 'jumpTo') {
            action = {
                kind: 'jumpTo',
                position: data.action.position,
                offset: textModel.getTransformer().getOffset(data.action.position),
                target: textModel,
            };
        }
        else {
            action = undefined;
            if (!data.hint) {
                throw new BugIndicatingError('InlineEditItem: action is undefined and no hint is provided');
            }
        }
        const identity = new InlineSuggestionIdentity();
        const hint = data.hint ? InlineSuggestHint.create(data.hint) : undefined;
        return new InlineEditItem(action, data, identity, edits, hint, false, textModel.getVersionId(), textModel);
    }
    constructor(_action, data, identity, _edits, hint, _lastChangePartOfInlineEdit = false, _inlineEditModelVersion, originalTextRef) {
        super(data, identity, hint, originalTextRef);
        this._action = _action;
        this._edits = _edits;
        this._lastChangePartOfInlineEdit = _lastChangePartOfInlineEdit;
        this._inlineEditModelVersion = _inlineEditModelVersion;
        this.snippetInfo = undefined;
        this.additionalTextEdits = [];
        this.isInlineEdit = true;
    }
    get updatedEditModelVersion() { return this._inlineEditModelVersion; }
    // public get updatedEdit(): StringEdit { return this._edit; }
    get action() {
        return this._action;
    }
    withIdentity(identity) {
        return new InlineEditItem(this._action, this._data, identity, this._edits, this.hint, this._lastChangePartOfInlineEdit, this._inlineEditModelVersion, this.originalTextRef);
    }
    canBeReused(model, position) {
        // TODO@hediet I believe this can be simplified to `return true;`, as applying an edit should kick out this suggestion.
        return this._lastChangePartOfInlineEdit && this.updatedEditModelVersion === model.getVersionId();
    }
    withEdit(textModelChanges, textModel) {
        // If the edit is to a different model than our target, it's a noop
        if (!this.originalTextRef.targets(textModel)) {
            return this; // unchanged
        }
        const edit = this._applyTextModelChanges(textModelChanges, this._edits, textModel);
        return edit;
    }
    _applyTextModelChanges(textModelChanges, edits, textModel) {
        const positionOffsetTransformer = getPositionOffsetTransformerFromTextModel(textModel);
        let lastChangePartOfInlineEdit = false;
        let inlineEditModelVersion = this._inlineEditModelVersion;
        let newAction;
        const updatedTarget = TextModelValueReference.snapshot(textModel);
        if (this.action?.kind === 'edit') { // TODO What about rename?
            edits = edits.map(innerEdit => innerEdit.applyTextModelChanges(textModelChanges));
            if (edits.some(edit => edit.edit === undefined)) {
                return undefined; // change is invalid, so we will have to drop the completion
            }
            const newTextModelVersion = textModel.getVersionId();
            lastChangePartOfInlineEdit = edits.some(edit => edit.lastChangeUpdatedEdit);
            if (lastChangePartOfInlineEdit) {
                inlineEditModelVersion = newTextModelVersion ?? -1;
            }
            if (newTextModelVersion === null || inlineEditModelVersion + 20 < newTextModelVersion) {
                return undefined; // the completion has been ignored for a while, remove it
            }
            edits = edits.filter(innerEdit => !innerEdit.edit.isEmpty);
            if (edits.length === 0) {
                return undefined; // the completion has been typed by the user
            }
            const newEdit = new StringEdit(edits.map(edit => edit.edit));
            const newTextEdit = positionOffsetTransformer.getTextEdit(newEdit).toReplacement(new TextModelText(textModel));
            newAction = {
                kind: 'edit',
                textReplacement: newTextEdit,
                snippetInfo: this.snippetInfo,
                stringEdit: newEdit,
                alternativeAction: this.action.alternativeAction,
                target: updatedTarget,
            };
        }
        else if (this.action?.kind === 'jumpTo') {
            const jumpToOffset = this.action.offset;
            const newJumpToOffset = textModelChanges.applyToOffsetOrUndefined(jumpToOffset);
            if (newJumpToOffset === undefined) {
                return undefined;
            }
            const newJumpToPosition = positionOffsetTransformer.getPosition(newJumpToOffset);
            newAction = {
                kind: 'jumpTo',
                position: newJumpToPosition,
                offset: newJumpToOffset,
                target: updatedTarget,
            };
        }
        else {
            newAction = undefined;
        }
        let newDisplayLocation = this.hint;
        if (newDisplayLocation) {
            newDisplayLocation = newDisplayLocation.withEdit(textModelChanges, positionOffsetTransformer);
            if (!newDisplayLocation) {
                return undefined;
            }
        }
        return new InlineEditItem(newAction, this._data, this.identity, edits, newDisplayLocation, lastChangePartOfInlineEdit, inlineEditModelVersion, updatedTarget);
    }
    computeEditKind(model) {
        const edit = this.action?.kind === 'edit' ? this.action.stringEdit : undefined;
        if (!edit) {
            return undefined;
        }
        return computeEditKind(edit, model);
    }
}
function getDiffedStringEdit(textModel, editRange, replaceText) {
    const eol = textModel.getEOL();
    const editOriginalText = textModel.getValueOfRange(editRange);
    const editReplaceText = replaceText.replace(/\r\n|\r|\n/g, eol);
    const diffAlgorithm = linesDiffComputers.getDefault();
    const lineDiffs = diffAlgorithm.computeDiff(splitLines(editOriginalText), splitLines(editReplaceText), {
        ignoreTrimWhitespace: false,
        computeMoves: false,
        extendToSubwords: true,
        maxComputationTimeMs: 50,
    });
    const innerChanges = lineDiffs.changes.flatMap(c => c.innerChanges ?? []);
    function addRangeToPos(pos, range) {
        const start = TextLength.fromPosition(range.getStartPosition());
        return TextLength.ofRange(range).createRange(start.addToPosition(pos));
    }
    const modifiedText = new StringText(editReplaceText);
    const offsetEdit = new StringEdit(innerChanges.map(c => {
        const rangeInModel = addRangeToPos(editRange.getStartPosition(), c.originalRange);
        const originalRange = textModel.getTransformer().getOffsetRange(rangeInModel);
        const replaceText = modifiedText.getValueOfRange(c.modifiedRange);
        const edit = new StringReplacement(originalRange, replaceText);
        const originalText = textModel.getValueOfRange(rangeInModel);
        return reshapeInlineEdit(edit, originalText, innerChanges.length, textModel);
    }));
    return offsetEdit;
}
function getStringEdit(textModel, editRange, replaceText) {
    return new StringEdit([new StringReplacement(textModel.getTransformer().getOffsetRange(editRange), replaceText)]);
}
class SingleUpdatedNextEdit {
    static create(edit, replacedText) {
        const prefixLength = commonPrefixLength(edit.newText, replacedText);
        const suffixLength = commonSuffixLength(edit.newText, replacedText);
        const trimmedNewText = edit.newText.substring(prefixLength, edit.newText.length - suffixLength);
        return new SingleUpdatedNextEdit(edit, trimmedNewText, prefixLength, suffixLength);
    }
    get edit() { return this._edit; }
    get lastChangeUpdatedEdit() { return this._lastChangeUpdatedEdit; }
    constructor(_edit, _trimmedNewText, _prefixLength, _suffixLength, _lastChangeUpdatedEdit = false) {
        this._edit = _edit;
        this._trimmedNewText = _trimmedNewText;
        this._prefixLength = _prefixLength;
        this._suffixLength = _suffixLength;
        this._lastChangeUpdatedEdit = _lastChangeUpdatedEdit;
    }
    applyTextModelChanges(textModelChanges) {
        const c = this._clone();
        c._applyTextModelChanges(textModelChanges);
        return c;
    }
    _clone() {
        return new SingleUpdatedNextEdit(this._edit, this._trimmedNewText, this._prefixLength, this._suffixLength, this._lastChangeUpdatedEdit);
    }
    _applyTextModelChanges(textModelChanges) {
        this._lastChangeUpdatedEdit = false; // TODO @benibenj make immutable
        if (!this._edit) {
            throw new BugIndicatingError('UpdatedInnerEdits: No edit to apply changes to');
        }
        const result = this._applyChanges(this._edit, textModelChanges);
        if (!result) {
            this._edit = undefined;
            return;
        }
        this._edit = result.edit;
        this._lastChangeUpdatedEdit = result.editHasChanged;
    }
    _applyChanges(edit, textModelChanges) {
        let editStart = edit.replaceRange.start;
        let editEnd = edit.replaceRange.endExclusive;
        let editReplaceText = edit.newText;
        let editHasChanged = false;
        const shouldPreserveEditShape = this._prefixLength > 0 || this._suffixLength > 0;
        for (let i = textModelChanges.replacements.length - 1; i >= 0; i--) {
            const change = textModelChanges.replacements[i];
            // INSERTIONS (only support inserting at start of edit)
            const isInsertion = change.newText.length > 0 && change.replaceRange.isEmpty;
            if (isInsertion && !shouldPreserveEditShape && change.replaceRange.start === editStart && editReplaceText.startsWith(change.newText)) {
                editStart += change.newText.length;
                editReplaceText = editReplaceText.substring(change.newText.length);
                editEnd += change.newText.length;
                editHasChanged = true;
                continue;
            }
            if (isInsertion && shouldPreserveEditShape && change.replaceRange.start === editStart + this._prefixLength && this._trimmedNewText.startsWith(change.newText)) {
                editEnd += change.newText.length;
                editHasChanged = true;
                this._prefixLength += change.newText.length;
                this._trimmedNewText = this._trimmedNewText.substring(change.newText.length);
                continue;
            }
            // DELETIONS
            const isDeletion = change.newText.length === 0 && change.replaceRange.length > 0;
            if (isDeletion && change.replaceRange.start >= editStart + this._prefixLength && change.replaceRange.endExclusive <= editEnd - this._suffixLength) {
                // user deleted text IN-BETWEEN the deletion range
                editEnd -= change.replaceRange.length;
                editHasChanged = true;
                continue;
            }
            // user did exactly the edit
            if (change.equals(edit)) {
                editHasChanged = true;
                editStart = change.replaceRange.endExclusive;
                editReplaceText = '';
                continue;
            }
            // MOVE EDIT
            if (change.replaceRange.start > editEnd) {
                // the change happens after the completion range
                continue;
            }
            if (change.replaceRange.endExclusive < editStart) {
                // the change happens before the completion range
                editStart += change.newText.length - change.replaceRange.length;
                editEnd += change.newText.length - change.replaceRange.length;
                continue;
            }
            // The change intersects the completion, so we will have to drop the completion
            return undefined;
        }
        // the resulting edit is a noop as the original and new text are the same
        if (this._trimmedNewText.length === 0 && editStart + this._prefixLength === editEnd - this._suffixLength) {
            return { edit: new StringReplacement(new OffsetRange(editStart + this._prefixLength, editStart + this._prefixLength), ''), editHasChanged: true };
        }
        return { edit: new StringReplacement(new OffsetRange(editStart, editEnd), editReplaceText), editHasChanged };
    }
}
function reshapeInlineCompletion(edit, textModel) {
    // If the insertion is a multi line insertion starting on the next line
    // Move it forwards so that the multi line insertion starts on the current line
    const eol = textModel.getEOL();
    if (edit.replaceRange.isEmpty && edit.newText.includes(eol)) {
        edit = reshapeMultiLineInsertion(edit, textModel);
    }
    return edit;
}
function reshapeInlineEdit(edit, originalText, totalInnerEdits, textModel) {
    // TODO: EOL are not properly trimmed by the diffAlgorithm #12680
    const eol = textModel.getEOL();
    if (edit.newText.endsWith(eol) && originalText.endsWith(eol)) {
        edit = new StringReplacement(edit.replaceRange.deltaEnd(-eol.length), edit.newText.slice(0, -eol.length));
    }
    // INSERTION
    // If the insertion ends with a new line and is inserted at the start of a line which has text,
    // we move the insertion to the end of the previous line if possible
    if (totalInnerEdits === 1 && edit.replaceRange.isEmpty && edit.newText.includes(eol)) {
        const startPosition = textModel.getTransformer().getPosition(edit.replaceRange.start);
        const hasTextOnInsertionLine = textModel.getLineLength(startPosition.lineNumber) !== 0;
        if (hasTextOnInsertionLine) {
            edit = reshapeMultiLineInsertion(edit, textModel);
        }
    }
    // The diff algorithm extended a simple edit to the entire word
    // shrink it back to a simple edit if it is deletion/insertion only
    if (totalInnerEdits === 1) {
        const prefixLength = commonPrefixLength(originalText, edit.newText);
        const suffixLength = commonSuffixLength(originalText.slice(prefixLength), edit.newText.slice(prefixLength));
        // reshape it back to an insertion
        if (prefixLength + suffixLength === originalText.length) {
            return new StringReplacement(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), edit.newText.substring(prefixLength, edit.newText.length - suffixLength));
        }
        // reshape it back to a deletion
        if (prefixLength + suffixLength === edit.newText.length) {
            return new StringReplacement(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), '');
        }
    }
    return edit;
}
function reshapeMultiLineInsertion(edit, textModel) {
    if (!edit.replaceRange.isEmpty) {
        throw new BugIndicatingError('Unexpected original range');
    }
    if (edit.replaceRange.start === 0) {
        return edit;
    }
    const eol = textModel.getEOL();
    const startPosition = textModel.getTransformer().getPosition(edit.replaceRange.start);
    const startColumn = startPosition.column;
    const startLineNumber = startPosition.lineNumber;
    // If the insertion ends with a new line and is inserted at the start of a line which has text,
    // we move the insertion to the end of the previous line if possible
    if (startColumn === 1 && startLineNumber > 1 && edit.newText.endsWith(eol) && !edit.newText.startsWith(eol)) {
        return new StringReplacement(edit.replaceRange.delta(-1), eol + edit.newText.slice(0, -eol.length));
    }
    return edit;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lU3VnZ2VzdGlvbkl0ZW0uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL2lubGluZVN1Z2dlc3Rpb25JdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBNkIsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRzNHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNoSCxPQUFPLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRXRGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx5Q0FBeUMsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBRXRJLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNuRixPQUFPLEVBQWdILDJCQUEyQixFQUE4QyxNQUFNLGlDQUFpQyxDQUFDO0FBRXhPLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUUxRSxPQUFPLEVBQUUsZUFBZSxFQUE0QixNQUFNLGVB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