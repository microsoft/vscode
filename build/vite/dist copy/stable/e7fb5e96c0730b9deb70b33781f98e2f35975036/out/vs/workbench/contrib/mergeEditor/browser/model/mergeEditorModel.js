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
import { CompareResult, equals } from '../../../../../base/common/arrays.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { autorunHandleChanges, derived, keepObserved, observableValue, transaction, waitForState } from '../../../../../base/common/observable.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { localize } from '../../../../../nls.js';
import { IUndoRedoService, UndoRedoGroup } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { EditorModel } from '../../../../common/editor/editorModel.js';
import { MergeEditorLineRange } from './lineRange.js';
import { DocumentLineRangeMap, DocumentRangeMap, LineRangeMapping } from './mapping.js';
import { TextModelDiffs } from './textModelDiffs.js';
import { leftJoin } from '../utils.js';
import { ModifiedBaseRange, ModifiedBaseRangeState, ModifiedBaseRangeStateKind } from './modifiedBaseRange.js';
let MergeEditorModel = class MergeEditorModel extends EditorModel {
    constructor(base, input1, input2, resultTextModel, diffComputer, options, telemetry, languageService, undoRedoService) {
        super();
        this.base = base;
        this.input1 = input1;
        this.input2 = input2;
        this.resultTextModel = resultTextModel;
        this.diffComputer = diffComputer;
        this.options = options;
        this.telemetry = telemetry;
        this.languageService = languageService;
        this.undoRedoService = undoRedoService;
        this.input1TextModelDiffs = this._register(new TextModelDiffs(this.base, this.input1.textModel, this.diffComputer));
        this.input2TextModelDiffs = this._register(new TextModelDiffs(this.base, this.input2.textModel, this.diffComputer));
        this.resultTextModelDiffs = this._register(new TextModelDiffs(this.base, this.resultTextModel, this.diffComputer));
        this.modifiedBaseRanges = derived(this, (reader) => {
            const input1Diffs = this.input1TextModelDiffs.diffs.read(reader);
            const input2Diffs = this.input2TextModelDiffs.diffs.read(reader);
            return ModifiedBaseRange.fromDiffs(input1Diffs, input2Diffs, this.base, this.input1.textModel, this.input2.textModel);
        });
        this.modifiedBaseRangeResultStates = derived(this, reader => {
            const map = new Map(this.modifiedBaseRanges.read(reader).map((s) => [
                s, new ModifiedBaseRangeData(s)
            ]));
            return map;
        });
        this.resultSnapshot = this.resultTextModel.createSnapshot();
        this.baseInput1Diffs = this.input1TextModelDiffs.diffs;
        this.baseInput2Diffs = this.input2TextModelDiffs.diffs;
        this.baseResultDiffs = this.resultTextModelDiffs.diffs;
        this.input1ResultMapping = derived(this, reader => {
            return this.getInputResultMapping(this.baseInput1Diffs.read(reader), this.baseResultDiffs.read(reader), this.input1.textModel.getLineCount());
        });
        this.resultInput1Mapping = derived(this, reader => this.input1ResultMapping.read(reader).reverse());
        this.input2ResultMapping = derived(this, reader => {
            return this.getInputResultMapping(this.baseInput2Diffs.read(reader), this.baseResultDiffs.read(reader), this.input2.textModel.getLineCount());
        });
        this.resultInput2Mapping = derived(this, reader => this.input2ResultMapping.read(reader).reverse());
        this.baseResultMapping = derived(this, reader => {
            const map = new DocumentLineRangeMap(this.baseResultDiffs.read(reader), -1);
            return new DocumentLineRangeMap(map.lineRangeMappings.map((m) => m.inputRange.isEmpty || m.outputRange.isEmpty
                ? new LineRangeMapping(
                // We can do this because two adjacent diffs have one line in between.
                m.inputRange.deltaStart(-1), m.outputRange.deltaStart(-1))
                : m), map.inputLineCount);
        });
        this.resultBaseMapping = derived(this, reader => this.baseResultMapping.read(reader).reverse());
        this.diffComputingState = derived(this, reader => {
            const states = [
                this.input1TextModelDiffs,
                this.input2TextModelDiffs,
                this.resultTextModelDiffs,
            ].map((s) => s.state.read(reader));
            if (states.some((s) => s === 1 /* TextModelDiffState.initializing */)) {
                return 1 /* MergeEditorModelState.initializing */;
            }
            if (states.some((s) => s === 3 /* TextModelDiffState.updating */)) {
                return 3 /* MergeEditorModelState.updating */;
            }
            return 2 /* MergeEditorModelState.upToDate */;
        });
        this.inputDiffComputingState = derived(this, reader => {
            const states = [
                this.input1TextModelDiffs,
                this.input2TextModelDiffs,
            ].map((s) => s.state.read(reader));
            if (states.some((s) => s === 1 /* TextModelDiffState.initializing */)) {
                return 1 /* MergeEditorModelState.initializing */;
            }
            if (states.some((s) => s === 3 /* TextModelDiffState.updating */)) {
                return 3 /* MergeEditorModelState.updating */;
            }
            return 2 /* MergeEditorModelState.upToDate */;
        });
        this.isUpToDate = derived(this, reader => this.diffComputingState.read(reader) === 2 /* MergeEditorModelState.upToDate */);
        this.firstRun = true;
        this.unhandledConflictsCount = derived(this, reader => {
            const map = this.modifiedBaseRangeResultStates.read(reader);
            let unhandledCount = 0;
            for (const [_key, value] of map) {
                if (!value.handled.read(reader)) {
                    unhandledCount++;
                }
            }
            return unhandledCount;
        });
        this.hasUnhandledConflicts = this.unhandledConflictsCount.map(value => /** @description hasUnhandledConflicts */ value > 0);
        this._register(keepObserved(this.modifiedBaseRangeResultStates));
        this._register(keepObserved(this.input1ResultMapping));
        this._register(keepObserved(this.input2ResultMapping));
        const initializePromise = this.initialize();
        this.onInitialized = waitForState(this.diffComputingState, state => state === 2 /* MergeEditorModelState.upToDate */).then(async () => {
            await initializePromise;
        });
        initializePromise.then(() => {
            let shouldRecomputeHandledFromAccepted = true;
            this._register(autorunHandleChanges({
                changeTracker: {
                    createChangeSummary: () => undefined,
                    handleChange: (ctx) => {
                        if (ctx.didChange(this.modifiedBaseRangeResultStates)) {
                            shouldRecomputeHandledFromAccepted = true;
                        }
                        return ctx.didChange(this.resultTextModelDiffs.diffs)
                            // Ignore non-text changes as we update the state directly
                            ? ctx.change === 1 /* TextModelDiffChangeReason.textChange */
                            : true;
                    },
                }
            }, (reader) => {
                /** @description Merge Editor Model: Recompute State From Result */
                const states = this.modifiedBaseRangeResultStates.read(reader);
                if (!this.isUpToDate.read(reader)) {
                    return;
                }
                const resultDiffs = this.resultTextModelDiffs.diffs.read(reader);
                transaction(tx => {
                    /** @description Merge Editor Model: Recompute State */
                    this.updateBaseRangeAcceptedState(resultDiffs, states, tx);
                    if (shouldRecomputeHandledFromAccepted) {
                        shouldRecomputeHandledFromAccepted = false;
                        for (const [_range, observableState] of states) {
                            const state = observableState.accepted.read(undefined);
                            const handled = !(state.kind === ModifiedBaseRangeStateKind.base || state.kind === ModifiedBaseRangeStateKind.unrecognized);
                            observableState.handledInput1.set(handled, tx);
                            observableState.handledInput2.set(handled, tx);
                        }
                    }
                });
            }));
        });
    }
    async initialize() {
        if (this.options.resetResult) {
            await this.reset();
        }
    }
    async reset() {
        await waitForState(this.inputDiffComputingState, state => state === 2 /* MergeEditorModelState.upToDate */);
        const states = this.modifiedBaseRangeResultStates.get();
        transaction(tx => {
            /** @description Set initial state */
            for (const [range, state] of states) {
                let newState;
                let handled = false;
                if (range.input1Diffs.length === 0) {
                    newState = ModifiedBaseRangeState.base.withInputValue(2, true);
                    handled = true;
                }
                else if (range.input2Diffs.length === 0) {
                    newState = ModifiedBaseRangeState.base.withInputValue(1, true);
                    handled = true;
                }
                else if (range.isEqualChange) {
                    newState = ModifiedBaseRangeState.base.withInputValue(1, true);
                    handled = true;
                }
                else {
                    newState = ModifiedBaseRangeState.base;
                    handled = false;
                }
                state.accepted.set(newState, tx);
                state.computedFromDiffing = false;
                state.previousNonDiffingState = undefined;
                state.handledInput1.set(handled, tx);
                state.handledInput2.set(handled, tx);
            }
            this.resultTextModel.pushEditOperations(null, [{
                    range: new Range(1, 1, Number.MAX_SAFE_INTEGER, 1),
                    text: this.computeAutoMergedResult()
                }], () => null);
        });
    }
    computeAutoMergedResult() {
        const baseRanges = this.modifiedBaseRanges.get();
        const baseLines = this.base.getLinesContent();
        const input1Lines = this.input1.textModel.getLinesContent();
        const input2Lines = this.input2.textModel.getLinesContent();
        const resultLines = [];
        function appendLinesToResult(source, lineRange) {
            for (let i = lineRange.startLineNumber; i < lineRange.endLineNumberExclusive; i++) {
                resultLines.push(source[i - 1]);
            }
        }
        let baseStartLineNumber = 1;
        for (const baseRange of baseRanges) {
            appendLinesToResult(baseLines, MergeEditorLineRange.fromLineNumbers(baseStartLineNumber, baseRange.baseRange.startLineNumber));
            baseStartLineNumber = baseRange.baseRange.endLineNumberExclusive;
            if (baseRange.input1Diffs.length === 0) {
                appendLinesToResult(input2Lines, baseRange.input2Range);
            }
            else if (baseRange.input2Diffs.length === 0) {
                appendLinesToResult(input1Lines, baseRange.input1Range);
            }
            else if (baseRange.isEqualChange) {
                appendLinesToResult(input1Lines, baseRange.input1Range);
            }
            else {
                appendLinesToResult(baseLines, baseRange.baseRange);
            }
        }
        appendLinesToResult(baseLines, MergeEditorLineRange.fromLineNumbers(baseStartLineNumber, baseLines.length + 1));
        return resultLines.join(this.resultTextModel.getEOL());
    }
    hasBaseRange(baseRange) {
        return this.modifiedBaseRangeResultStates.get().has(baseRange);
    }
    get isApplyingEditInResult() { return this.resultTextModelDiffs.isApplyingChange; }
    getInputResultMapping(inputLinesDiffs, resultDiffs, inputLineCount) {
        const map = DocumentLineRangeMap.betweenOutputs(inputLinesDiffs, resultDiffs, inputLineCount);
        return new DocumentLineRangeMap(map.lineRangeMappings.map((m) => m.inputRange.isEmpty || m.outputRange.isEmpty
            ? new LineRangeMapping(
            // We can do this because two adjacent diffs have one line in between.
            m.inputRange.deltaStart(-1), m.outputRange.deltaStart(-1))
            : m), map.inputLineCount);
    }
    translateInputRangeToBase(input, range) {
        const baseInputDiffs = input === 1 ? this.baseInput1Diffs.get() : this.baseInput2Diffs.get();
        const map = new DocumentRangeMap(baseInputDiffs.flatMap(d => d.rangeMappings), 0).reverse();
        return map.projectRange(range).outputRange;
    }
    translateBaseRangeToInput(input, range) {
        const baseInputDiffs = input === 1 ? this.baseInput1Diffs.get() : this.baseInput2Diffs.get();
        const map = new DocumentRangeMap(baseInputDiffs.flatMap(d => d.rangeMappings), 0);
        return map.projectRange(range).outputRange;
    }
    getLineRangeInResult(baseRange, reader) {
        return this.resultTextModelDiffs.getResultLineRange(baseRange, reader);
    }
    translateResultRangeToBase(range) {
        const map = new DocumentRangeMap(this.baseResultDiffs.get().flatMap(d => d.rangeMappings), 0).reverse();
        return map.projectRange(range).outputRange;
    }
    translateBaseRangeToResult(range) {
        const map = new DocumentRangeMap(this.baseResultDiffs.get().flatMap(d => d.rangeMappings), 0);
        return map.projectRange(range).outputRange;
    }
    findModifiedBaseRangesInRange(rangeInBase) {
        // TODO use binary search
        return this.modifiedBaseRanges.get().filter(r => r.baseRange.intersectsOrTouches(rangeInBase));
    }
    updateBaseRangeAcceptedState(resultDiffs, states, tx) {
        const baseRangeWithStoreAndTouchingDiffs = leftJoin(states, resultDiffs, (baseRange, diff) => baseRange[0].baseRange.intersectsOrTouches(diff.inputRange)
            ? CompareResult.neitherLessOrGreaterThan
            : MergeEditorLineRange.compareByStart(baseRange[0].baseRange, diff.inputRange));
        for (const row of baseRangeWithStoreAndTouchingDiffs) {
            const newState = this.computeState(row.left[0], row.rights);
            const data = row.left[1];
            const oldState = data.accepted.get();
            if (!oldState.equals(newState)) {
                if (!this.firstRun && !data.computedFromDiffing) {
                    // Don't set this on the first run - the first run might be used to restore state.
                    data.computedFromDiffing = true;
                    data.previousNonDiffingState = oldState;
                }
                data.accepted.set(newState, tx);
            }
        }
        if (this.firstRun) {
            this.firstRun = false;
        }
    }
    computeState(baseRange, conflictingDiffs) {
        if (conflictingDiffs.length === 0) {
            return ModifiedBaseRangeState.base;
        }
        const conflictingEdits = conflictingDiffs.map((d) => d.getLineEdit());
        function editsAgreeWithDiffs(diffs) {
            return equals(conflictingEdits, diffs.map((d) => d.getLineEdit()), (a, b) => a.equals(b));
        }
        if (editsAgreeWithDiffs(baseRange.input1Diffs)) {
            return ModifiedBaseRangeState.base.withInputValue(1, true);
        }
        if (editsAgreeWithDiffs(baseRange.input2Diffs)) {
            return ModifiedBaseRangeState.base.withInputValue(2, true);
        }
        const states = [
            ModifiedBaseRangeState.base.withInputValue(1, true).withInputValue(2, true, true),
            ModifiedBaseRangeState.base.withInputValue(2, true).withInputValue(1, true, true),
            ModifiedBaseRangeState.base.withInputValue(1, true).withInputValue(2, true, false),
            ModifiedBaseRangeState.base.withInputValue(2, true).withInputValue(1, true, false),
        ];
        for (const s of states) {
            const { edit } = baseRange.getEditForBase(s);
            if (edit) {
                const resultRange = this.resultTextModelDiffs.getResultLineRange(baseRange.baseRange);
                const existingLines = resultRange.getLines(this.resultTextModel);
                if (equals(edit.newLines, existingLines, (a, b) => a === b)) {
                    return s;
                }
            }
        }
        return ModifiedBaseRangeState.unrecognized;
    }
    getState(baseRange) {
        const existingState = this.modifiedBaseRangeResultStates.get().get(baseRange);
        if (!existingState) {
            throw new BugIndicatingError('object must be from this instance');
        }
        return existingState.accepted;
    }
    setState(baseRange, state, _markInputAsHandled, tx, _pushStackElement = false) {
        if (!this.isUpToDate.get()) {
            throw new BugIndicatingError('Cannot set state while updating');
        }
        const existingState = this.modifiedBaseRangeResultStates.get().get(baseRange);
        if (!existingState) {
            throw new BugIndicatingError('object must be from this instance');
        }
        const conflictingDiffs = this.resultTextModelDiffs.findTouchingDiffs(baseRange.baseRange);
        const group = new UndoRedoGroup();
        if (conflictingDiffs) {
            this.resultTextModelDiffs.removeDiffs(conflictingDiffs, tx, group);
        }
        const { edit, effectiveState } = baseRange.getEditForBase(state);
        existingState.accepted.set(effectiveState, tx);
        existingState.previousNonDiffingState = undefined;
        existingState.computedFromDiffing = false;
        const input1Handled = existingState.handledInput1.get();
        const input2Handled = existingState.handledInput2.get();
        if (!input1Handled || !input2Handled) {
            this.undoRedoService.pushElement(new MarkAsHandledUndoRedoElement(this.resultTextModel.uri, new WeakRef(this), new WeakRef(existingState), input1Handled, input2Handled), group);
        }
        if (edit) {
            this.resultTextModel.pushStackElement();
            this.resultTextModelDiffs.applyEditRelativeToOriginal(edit, tx, group);
            this.resultTextModel.pushStackElement();
        }
        // always set conflict as handled
        existingState.handledInput1.set(true, tx);
        existingState.handledInput2.set(true, tx);
    }
    resetDirtyConflictsToBase() {
        transaction(tx => {
            /** @description Reset Unknown Base Range States */
            this.resultTextModel.pushStackElement();
            for (const range of this.modifiedBaseRanges.get()) {
                if (this.getState(range).get().kind === ModifiedBaseRangeStateKind.unrecognized) {
                    this.setState(range, ModifiedBaseRangeState.base, false, tx, false);
                }
            }
            this.resultTextModel.pushStackElement();
        });
    }
    isHandled(baseRange) {
        return this.modifiedBaseRangeResultStates.get().get(baseRange).handled;
    }
    isInputHandled(baseRange, inputNumber) {
        const state = this.modifiedBaseRangeResultStates.get().get(baseRange);
        return inputNumber === 1 ? state.handledInput1 : state.handledInput2;
    }
    setInputHandled(baseRange, inputNumber, handled, tx) {
        const state = this.modifiedBaseRangeResultStates.get().get(baseRange);
        if (state.handled.get() === handled) {
            return;
        }
        const dataRef = new WeakRef(ModifiedBaseRangeData);
        const modelRef = new WeakRef(this);
        this.undoRedoService.pushElement({
            type: 0 /* UndoRedoElementType.Resource */,
            resource: this.resultTextModel.uri,
            code: 'setInputHandled',
            label: localize('setInputHandled', "Set Input Handled"),
            redo() {
                const model = modelRef.deref();
                const data = dataRef.deref();
                if (model && !model.isDisposed() && data) {
                    transaction(tx => {
                        if (inputNumber === 1) {
                            state.handledInput1.set(handled, tx);
                        }
                        else {
                            state.handledInput2.set(handled, tx);
                        }
                    });
                }
            },
            undo() {
                const model = modelRef.deref();
                const data = dataRef.deref();
                if (model && !model.isDisposed() && data) {
                    transaction(tx => {
                        if (inputNumber === 1) {
                            state.handledInput1.set(!handled, tx);
                        }
                        else {
                            state.handledInput2.set(!handled, tx);
                        }
                    });
                }
            },
        });
        if (inputNumber === 1) {
            state.handledInput1.set(handled, tx);
        }
        else {
            state.handledInput2.set(handled, tx);
        }
    }
    setHandled(baseRange, handled, tx) {
        const state = this.modifiedBaseRangeResultStates.get().get(baseRange);
        if (state.handled.get() === handled) {
            return;
        }
        state.handledInput1.set(handled, tx);
        state.handledInput2.set(handled, tx);
    }
    setLanguageId(languageId, source) {
        const language = this.languageService.createById(languageId);
        this.base.setLanguage(language, source);
        this.input1.textModel.setLanguage(language, source);
        this.input2.textModel.setLanguage(language, source);
        this.resultTextModel.setLanguage(language, source);
    }
    getInitialResultValue() {
        const chunks = [];
        while (true) {
            const chunk = this.resultSnapshot.read();
            if (chunk === null) {
                break;
            }
            chunks.push(chunk);
        }
        return chunks.join();
    }
    async getResultValueWithConflictMarkers() {
        await waitForState(this.diffComputingState, state => state === 2 /* MergeEditorModelState.upToDate */);
        if (this.unhandledConflictsCount.get() === 0) {
            return this.resultTextModel.getValue();
        }
        const resultLines = this.resultTextModel.getLinesContent();
        const input1Lines = this.input1.textModel.getLinesContent();
        const input2Lines = this.input2.textModel.getLinesContent();
        const states = this.modifiedBaseRangeResultStates.get();
        const outputLines = [];
        function appendLinesToResult(source, lineRange) {
            for (let i = lineRange.startLineNumber; i < lineRange.endLineNumberExclusive; i++) {
                outputLines.push(source[i - 1]);
            }
        }
        let resultStartLineNumber = 1;
        for (const [range, state] of states) {
            if (state.handled.get()) {
                continue;
            }
            const resultRange = this.resultTextModelDiffs.getResultLineRange(range.baseRange);
            appendLinesToResult(resultLines, MergeEditorLineRange.fromLineNumbers(resultStartLineNumber, Math.max(resultStartLineNumber, resultRange.startLineNumber)));
            resultStartLineNumber = resultRange.endLineNumberExclusive;
            outputLines.push('<<<<<<<');
            if (state.accepted.get().kind === ModifiedBaseRangeStateKind.unrecognized) {
                // to prevent loss of data, use modified result as "ours"
                appendLinesToResult(resultLines, resultRange);
            }
            else {
                appendLinesToResult(input1Lines, range.input1Range);
            }
            outputLines.push('=======');
            appendLinesToResult(input2Lines, range.input2Range);
            outputLines.push('>>>>>>>');
        }
        appendLinesToResult(resultLines, MergeEditorLineRange.fromLineNumbers(resultStartLineNumber, resultLines.length + 1));
        return outputLines.join('\n');
    }
    get conflictCount() {
        return arrayCount(this.modifiedBaseRanges.get(), r => r.isConflicting);
    }
    get combinableConflictCount() {
        return arrayCount(this.modifiedBaseRanges.get(), r => r.isConflicting && r.canBeCombined);
    }
    get conflictsResolvedWithBase() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => r.isConflicting &&
            s.accepted.get().kind === ModifiedBaseRangeStateKind.base);
    }
    get conflictsResolvedWithInput1() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => r.isConflicting &&
            s.accepted.get().kind === ModifiedBaseRangeStateKind.input1);
    }
    get conflictsResolvedWithInput2() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => r.isConflicting &&
            s.accepted.get().kind === ModifiedBaseRangeStateKind.input2);
    }
    get conflictsResolvedWithSmartCombination() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.both && state.smartCombination;
        });
    }
    get manuallySolvedConflictCountThatEqualNone() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => r.isConflicting &&
            s.accepted.get().kind === ModifiedBaseRangeStateKind.unrecognized);
    }
    get manuallySolvedConflictCountThatEqualSmartCombine() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.both && state.smartCombination;
        });
    }
    get manuallySolvedConflictCountThatEqualInput1() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.input1;
        });
    }
    get manuallySolvedConflictCountThatEqualInput2() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.input2;
        });
    }
    get manuallySolvedConflictCountThatEqualNoneAndStartedWithBase() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.base;
        });
    }
    get manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.input1;
        });
    }
    get manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.input2;
        });
    }
    get manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.both && !s.previousNonDiffingState?.smartCombination;
        });
    }
    get manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart() {
        return arrayCount(this.modifiedBaseRangeResultStates.get().entries(), ([r, s]) => {
            const state = s.accepted.get();
            return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.both && s.previousNonDiffingState?.smartCombination;
        });
    }
};
MergeEditorModel = __decorate([
    __param(7, ILanguageService),
    __param(8, IUndoRedoService)
], MergeEditorModel);
export { MergeEditorModel };
function arrayCount(array, predicate) {
    let count = 0;
    for (const value of array) {
        if (predicate(value)) {
            count++;
        }
    }
    return count;
}
class ModifiedBaseRangeData {
    constructor(baseRange) {
        this.baseRange = baseRange;
        this.accepted = observableValue(`BaseRangeState${this.baseRange.baseRange}`, ModifiedBaseRangeState.base);
        this.handledInput1 = observableValue(`BaseRangeHandledState${this.baseRange.baseRange}.Input1`, false);
        this.handledInput2 = observableValue(`BaseRangeHandledState${this.baseRange.baseRange}.Input2`, false);
        this.computedFromDiffing = false;
        this.previousNonDiffingState = undefined;
        this.handled = derived(this, reader => this.handledInput1.read(reader) && this.handledInput2.read(reader));
    }
}
export var MergeEditorModelState;
(function (MergeEditorModelState) {
    MergeEditorModelState[MergeEditorModelState["initializing"] = 1] = "initializing";
    MergeEditorModelState[MergeEditorModelState["upToDate"] = 2] = "upToDate";
    MergeEditorModelState[MergeEditorModelState["updating"] = 3] = "updating";
})(MergeEditorModelState || (MergeEditorModelState = {}));
class MarkAsHandledUndoRedoElement {
    constructor(resource, mergeEditorModelRef, stateRef, input1Handled, input2Handled) {
        this.resource = resource;
        this.mergeEditorModelRef = mergeEditorModelRef;
        this.stateRef = stateRef;
        this.input1Handled = input1Handled;
        this.input2Handled = input2Handled;
        this.code = 'undoMarkAsHandled';
        this.label = localize('undoMarkAsHandled', 'Undo Mark As Handled');
        this.type = 0 /* UndoRedoElementType.Resource */;
    }
    redo() {
        const mergeEditorModel = this.mergeEditorModelRef.deref();
        if (!mergeEditorModel || mergeEditorModel.isDisposed()) {
            return;
        }
        const state = this.stateRef.deref();
        if (!state) {
            return;
        }
        transaction(tx => {
            state.handledInput1.set(true, tx);
            state.handledInput2.set(true, tx);
        });
    }
    undo() {
        const mergeEditorModel = this.mergeEditorModelRef.deref();
        if (!mergeEditorModel || mergeEditorModel.isDisposed()) {
            return;
        }
        const state = this.stateRef.deref();
        if (!state) {
            return;
        }
        transaction(tx => {
            state.handledInput1.set(this.input1Handled, tx);
            state.handledInput2.set(this.input2Handled, tx);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVyZ2VFZGl0b3JNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbW9kZWwvbWVyZ2VFZGl0b3JNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxPQUFPLEVBQTJELFlBQVksRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTVNLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUV0RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUE0QixnQkFBZ0IsRUFBdUIsYUFBYSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckosT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3RELE9BQU8sRUFBNEIsb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDbEgsT0FBTyxFQUE2QixjQUFjLEVBQXNCLE1BQU0scUJBQXFCLENBQUM7QUFFcEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN2QyxPQUFPLEVBQWUsaUJBQWlCLEVBQUUsc0JBQXNCLEVBQUUsMEJBQTBCLEVBQUUs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