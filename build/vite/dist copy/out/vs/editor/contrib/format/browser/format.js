/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { asArray, isNonEmptyArray } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorStateCancellationTokenSource, TextModelCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { isCodeEditor } from '../../../browser/editorBrowser.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { IEditorWorkerService } from '../../../common/services/editorWorker.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { FormattingEdit } from './formattingEdit.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ExtensionIdentifierSet } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
export function getRealAndSyntheticDocumentFormattersOrdered(documentFormattingEditProvider, documentRangeFormattingEditProvider, model) {
    const result = [];
    const seen = new ExtensionIdentifierSet();
    // (1) add all document formatter
    const docFormatter = documentFormattingEditProvider.ordered(model);
    for (const formatter of docFormatter) {
        result.push(formatter);
        if (formatter.extensionId) {
            seen.add(formatter.extensionId);
        }
    }
    // (2) add all range formatter as document formatter (unless the same extension already did that)
    const rangeFormatter = documentRangeFormattingEditProvider.ordered(model);
    for (const formatter of rangeFormatter) {
        if (formatter.extensionId) {
            if (seen.has(formatter.extensionId)) {
                continue;
            }
            seen.add(formatter.extensionId);
        }
        result.push({
            displayName: formatter.displayName,
            extensionId: formatter.extensionId,
            provideDocumentFormattingEdits(model, options, token) {
                return formatter.provideDocumentRangeFormattingEdits(model, model.getFullModelRange(), options, token);
            }
        });
    }
    return result;
}
export var FormattingKind;
(function (FormattingKind) {
    FormattingKind[FormattingKind["File"] = 1] = "File";
    FormattingKind[FormattingKind["Selection"] = 2] = "Selection";
})(FormattingKind || (FormattingKind = {}));
export var FormattingMode;
(function (FormattingMode) {
    FormattingMode[FormattingMode["Explicit"] = 1] = "Explicit";
    FormattingMode[FormattingMode["Silent"] = 2] = "Silent";
})(FormattingMode || (FormattingMode = {}));
export class FormattingConflicts {
    static { this._selectors = new LinkedList(); }
    static setFormatterSelector(selector) {
        const remove = FormattingConflicts._selectors.unshift(selector);
        return { dispose: remove };
    }
    static async select(formatter, document, mode, kind) {
        if (formatter.length === 0) {
            return undefined;
        }
        const selector = Iterable.first(FormattingConflicts._selectors);
        if (selector) {
            return await selector(formatter, document, mode, kind);
        }
        return undefined;
    }
}
export async function formatDocumentRangesWithSelectedProvider(accessor, editorOrModel, rangeOrRanges, mode, progress, token, userGesture) {
    const instaService = accessor.get(IInstantiationService);
    const { documentRangeFormattingEditProvider: documentRangeFormattingEditProviderRegistry } = accessor.get(ILanguageFeaturesService);
    const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
    const provider = documentRangeFormattingEditProviderRegistry.ordered(model);
    const selected = await FormattingConflicts.select(provider, model, mode, 2 /* FormattingKind.Selection */);
    if (selected) {
        progress.report(selected);
        await instaService.invokeFunction(formatDocumentRangesWithProvider, selected, editorOrModel, rangeOrRanges, token, userGesture);
    }
}
export async function formatDocumentRangesWithProvider(accessor, provider, editorOrModel, rangeOrRanges, token, userGesture) {
    const workerService = accessor.get(IEditorWorkerService);
    const logService = accessor.get(ILogService);
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    let model;
    let cts;
    if (isCodeEditor(editorOrModel)) {
        model = editorOrModel.getModel();
        cts = new EditorStateCancellationTokenSource(editorOrModel, 1 /* CodeEditorStateFlag.Value */ | 4 /* CodeEditorStateFlag.Position */, undefined, token);
    }
    else {
        model = editorOrModel;
        cts = new TextModelCancellationTokenSource(editorOrModel, token);
    }
    // make sure that ranges don't overlap nor touch each other
    const ranges = [];
    let len = 0;
    for (const range of asArray(rangeOrRanges).sort(Range.compareRangesUsingStarts)) {
        if (len > 0 && Range.areIntersectingOrTouching(ranges[len - 1], range)) {
            ranges[len - 1] = Range.fromPositions(ranges[len - 1].getStartPosition(), range.getEndPosition());
        }
        else {
            len = ranges.push(range);
        }
    }
    const computeEdits = async (range) => {
        logService.trace(`[format][provideDocumentRangeFormattingEdits] (request)`, provider.extensionId?.value, range);
        const result = (await provider.provideDocumentRangeFormattingEdits(model, range, model.getFormattingOptions(), cts.token)) || [];
        logService.trace(`[format][provideDocumentRangeFormattingEdits] (response)`, provider.extensionId?.value, result);
        return result;
    };
    const hasIntersectingEdit = (a, b) => {
        if (!a.length || !b.length) {
            return false;
        }
        // quick exit if the list of ranges are completely unrelated [O(n)]
        const mergedA = a.reduce((acc, val) => { return Range.plusRange(acc, val.range); }, a[0].range);
        if (!b.some(x => { return Range.intersectRanges(mergedA, x.range); })) {
            return false;
        }
        // fallback to a complete check [O(n^2)]
        for (const edit of a) {
            for (const otherEdit of b) {
                if (Range.intersectRanges(edit.range, otherEdit.range)) {
                    return true;
                }
            }
        }
        return false;
    };
    const allEdits = [];
    const rawEditsList = [];
    try {
        if (typeof provider.provideDocumentRangesFormattingEdits === 'function') {
            logService.trace(`[format][provideDocumentRangeFormattingEdits] (request)`, provider.extensionId?.value, ranges);
            const result = (await provider.provideDocumentRangesFormattingEdits(model, ranges, model.getFormattingOptions(), cts.token)) || [];
            logService.trace(`[format][provideDocumentRangeFormattingEdits] (response)`, provider.extensionId?.value, result);
            rawEditsList.push(result);
        }
        else {
            for (const range of ranges) {
                if (cts.token.isCancellationRequested) {
                    return true;
                }
                rawEditsList.push(await computeEdits(range));
            }
            for (let i = 0; i < ranges.length; ++i) {
                for (let j = i + 1; j < ranges.length; ++j) {
                    if (cts.token.isCancellationRequested) {
                        return true;
                    }
                    if (hasIntersectingEdit(rawEditsList[i], rawEditsList[j])) {
                        // Merge ranges i and j into a single range, recompute the associated edits
                        const mergedRange = Range.plusRange(ranges[i], ranges[j]);
                        const edits = await computeEdits(mergedRange);
                        ranges.splice(j, 1);
                        ranges.splice(i, 1);
                        ranges.push(mergedRange);
                        rawEditsList.splice(j, 1);
                        rawEditsList.splice(i, 1);
                        rawEditsList.push(edits);
                        // Restart scanning
                        i = 0;
                        j = 0;
                    }
                }
            }
        }
        for (const rawEdits of rawEditsList) {
            if (cts.token.isCancellationRequested) {
                return true;
            }
            const minimalEdits = await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
            if (minimalEdits) {
                allEdits.push(...minimalEdits);
            }
        }
        if (cts.token.isCancellationRequested) {
            return true;
        }
    }
    finally {
        cts.dispose();
    }
    if (allEdits.length === 0) {
        return false;
    }
    if (isCodeEditor(editorOrModel)) {
        // use editor to apply edits
        FormattingEdit.execute(editorOrModel, allEdits, true);
        editorOrModel.revealPositionInCenterIfOutsideViewport(editorOrModel.getPosition(), 1 /* ScrollType.Immediate */);
    }
    else {
        // use model to apply edits
        const [{ range }] = allEdits;
        const initialSelection = new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
        model.pushEditOperations([initialSelection], allEdits.map(edit => {
            return {
                text: edit.text,
                range: Range.lift(edit.range),
                forceMoveMarkers: true
            };
        }), undoEdits => {
            for (const { range } of undoEdits) {
                if (Range.areIntersectingOrTouching(range, initialSelection)) {
                    return [new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)];
                }
            }
            return null;
        });
    }
    accessibilitySignalService.playSignal(AccessibilitySignal.format, { userGesture });
    return true;
}
export async function formatDocumentWithSelectedProvider(accessor, editorOrModel, mode, progress, token, userGesture) {
    const instaService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
    const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
    const selected = await FormattingConflicts.select(provider, model, mode, 1 /* FormattingKind.File */);
    if (selected) {
        progress.report(selected);
        await instaService.invokeFunction(formatDocumentWithProvider, selected, editorOrModel, mode, token, userGesture);
    }
}
export async function formatDocumentWithProvider(accessor, provider, editorOrModel, mode, token, userGesture) {
    const workerService = accessor.get(IEditorWorkerService);
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    let model;
    let cts;
    if (isCodeEditor(editorOrModel)) {
        model = editorOrModel.getModel();
        cts = new EditorStateCancellationTokenSource(editorOrModel, 1 /* CodeEditorStateFlag.Value */ | 4 /* CodeEditorStateFlag.Position */, undefined, token);
    }
    else {
        model = editorOrModel;
        cts = new TextModelCancellationTokenSource(editorOrModel, token);
    }
    let edits;
    try {
        const rawEdits = await provider.provideDocumentFormattingEdits(model, model.getFormattingOptions(), cts.token);
        edits = await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
        if (cts.token.isCancellationRequested) {
            return true;
        }
    }
    finally {
        cts.dispose();
    }
    if (!edits || edits.length === 0) {
        return false;
    }
    if (isCodeEditor(editorOrModel)) {
        // use editor to apply edits
        FormattingEdit.execute(editorOrModel, edits, mode !== 2 /* FormattingMode.Silent */);
        if (mode !== 2 /* FormattingMode.Silent */) {
            editorOrModel.revealPositionInCenterIfOutsideViewport(editorOrModel.getPosition(), 1 /* ScrollType.Immediate */);
        }
    }
    else {
        // use model to apply edits
        const [{ range }] = edits;
        const initialSelection = new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
        model.pushEditOperations([initialSelection], edits.map(edit => {
            return {
                text: edit.text,
                range: Range.lift(edit.range),
                forceMoveMarkers: true
            };
        }), undoEdits => {
            for (const { range } of undoEdits) {
                if (Range.areIntersectingOrTouching(range, initialSelection)) {
                    return [new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)];
                }
            }
            return null;
        });
    }
    accessibilitySignalService.playSignal(AccessibilitySignal.format, { userGesture });
    return true;
}
export async function getDocumentRangeFormattingEditsUntilResult(workerService, languageFeaturesService, model, range, options, token) {
    const providers = languageFeaturesService.documentRangeFormattingEditProvider.ordered(model);
    for (const provider of providers) {
        const rawEdits = await Promise.resolve(provider.provideDocumentRangeFormattingEdits(model, range, options, token)).catch(onUnexpectedExternalError);
        if (isNonEmptyArray(rawEdits)) {
            return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
        }
    }
    return undefined;
}
export async function getDocumentFormattingEditsUntilResult(workerService, languageFeaturesService, model, options, token) {
    const providers = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
    for (const provider of providers) {
        const rawEdits = await Promise.resolve(provider.provideDocumentFormattingEdits(model, options, token)).catch(onUnexpectedExternalError);
        if (isNonEmptyArray(rawEdits)) {
            return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
        }
    }
    return undefined;
}
export async function getDocumentFormattingEditsWithSelectedProvider(workerService, languageFeaturesService, editorOrModel, mode, token) {
    const model = isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel;
    const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
    const selected = await FormattingConflicts.select(provider, model, mode, 1 /* FormattingKind.File */);
    if (selected) {
        const rawEdits = await Promise.resolve(selected.provideDocumentFormattingEdits(model, model.getOptions(), token)).catch(onUnexpectedExternalError);
        return await workerService.computeMoreMinimalEdits(model.uri, rawEdits);
    }
    return undefined;
}
export function getOnTypeFormattingEdits(workerService, languageFeaturesService, model, position, ch, options, token) {
    const providers = languageFeaturesService.onTypeFormattingEditProvider.ordered(model);
    if (providers.length === 0) {
        return Promise.resolve(undefined);
    }
    if (providers[0].autoFormatTriggerCharacters.indexOf(ch) < 0) {
        return Promise.resolve(undefined);
    }
    return Promise.resolve(providers[0].provideOnTypeFormattingEdits(model, position, ch, options, token)).catch(onUnexpectedExternalError).then(edits => {
        return workerService.computeMoreMinimalEdits(model.uri, edits);
    });
}
function isFormattingOptions(obj) {
    const candidate = obj;
    return !!candidate && typeof candidate === 'object' && typeof candidate.tabSize === 'number' && typeof candidate.insertSpaces === 'boolean';
}
CommandsRegistry.registerCommand('_executeFormatRangeProvider', async function (accessor, ...args) {
    const [resource, range, options] = args;
    assertType(URI.isUri(resource));
    assertType(Range.isIRange(range));
    const resolverService = accessor.get(ITextModelService);
    const workerService = accessor.get(IEditorWorkerService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const reference = await resolverService.createModelReference(resource);
    try {
        return getDocumentRangeFormattingEditsUntilResult(workerService, languageFeaturesService, reference.object.textEditorModel, Range.lift(range), ensureFormattingOptions(options, reference), CancellationToken.None);
    }
    finally {
        reference.dispose();
    }
});
CommandsRegistry.registerCommand('_executeFormatDocumentProvider', async function (accessor, ...args) {
    const [resource, options] = args;
    assertType(URI.isUri(resource));
    const resolverService = accessor.get(ITextModelService);
    const workerService = accessor.get(IEditorWorkerService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const reference = await resolverService.createModelReference(resource);
    try {
        return getDocumentFormattingEditsUntilResult(workerService, languageFeaturesService, reference.object.textEditorModel, ensureFormattingOptions(options, reference), CancellationToken.None);
    }
    finally {
        reference.dispose();
    }
});
CommandsRegistry.registerCommand('_executeFormatOnTypeProvider', async function (accessor, ...args) {
    const [resource, position, ch, options] = args;
    assertType(URI.isUri(resource));
    assertType(Position.isIPosition(position));
    assertType(typeof ch === 'string');
    const resolverService = accessor.get(ITextModelService);
    const workerService = accessor.get(IEditorWorkerService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const reference = await resolverService.createModelReference(resource);
    try {
        return getOnTypeFormattingEdits(workerService, languageFeaturesService, reference.object.textEditorModel, Position.lift(position), ch, ensureFormattingOptions(options, reference), CancellationToken.None);
    }
    finally {
        reference.dispose();
    }
});
function ensureFormattingOptions(options, reference) {
    let validatedOptions;
    if (isFormattingOptions(options)) {
        validatedOptions = options;
    }
    else {
        const modelOptions = reference.object.textEditorModel.getOptions();
        validatedOptions = {
            tabSize: modelOptions.tabSize,
            insertSpaces: modelOptions.insertSpaces
        };
    }
    return validatedOptions;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9ybWF0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZm9ybWF0L2Jyb3dzZXIvZm9ybWF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLGlCQUFpQixFQUEyQixNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQXVCLGtDQUFrQyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDckosT0FBTyxFQUFxQixZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVwRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUk5RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRixPQUFPLEVBQTRCLGlCQUFpQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDMUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFr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