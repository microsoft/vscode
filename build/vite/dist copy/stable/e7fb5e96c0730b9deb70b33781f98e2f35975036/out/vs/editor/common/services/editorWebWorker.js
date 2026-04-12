/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { stringDiff } from '../../../base/common/diff/diff.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { computeLinks } from '../languages/linkComputer.js';
import { BasicInplaceReplace } from '../languages/supports/inplaceReplaceSupport.js';
import { createMonacoBaseAPI } from './editorBaseApi.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { UnicodeTextModelHighlighter } from './unicodeTextModelHighlighter.js';
import { DiffComputer } from '../diff/legacyLinesDiffComputer.js';
import { DetailedLineRangeMapping } from '../diff/rangeMapping.js';
import { linesDiffComputers } from '../diff/linesDiffComputers.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { computeDefaultDocumentColors } from '../languages/defaultDocumentColorsComputer.js';
import { findSectionHeaders } from './findSectionHeaders.js';
import { WorkerTextModelSyncServer } from './textModelSync/textModelSync.impl.js';
import { StringText } from '../core/text/abstractText.js';
import { ensureDependenciesAreSet } from '../core/text/positionToOffset.js';
/**
 * @internal
 */
export class EditorWorker {
    constructor(_foreignModule = null) {
        this._foreignModule = _foreignModule;
        this._requestHandlerBrand = undefined;
        this._workerTextModelSyncServer = new WorkerTextModelSyncServer();
    }
    dispose() {
    }
    async $ping() {
        return 'pong';
    }
    _getModel(uri) {
        return this._workerTextModelSyncServer.getModel(uri);
    }
    getModels() {
        return this._workerTextModelSyncServer.getModels();
    }
    $acceptNewModel(data) {
        this._workerTextModelSyncServer.$acceptNewModel(data);
    }
    $acceptModelChanged(uri, e) {
        this._workerTextModelSyncServer.$acceptModelChanged(uri, e);
    }
    $acceptRemovedModel(uri) {
        this._workerTextModelSyncServer.$acceptRemovedModel(uri);
    }
    async $computeUnicodeHighlights(url, options, range) {
        const model = this._getModel(url);
        if (!model) {
            return { ranges: [], hasMore: false, ambiguousCharacterCount: 0, invisibleCharacterCount: 0, nonBasicAsciiCharacterCount: 0 };
        }
        return UnicodeTextModelHighlighter.computeUnicodeHighlights(model, options, range);
    }
    async $findSectionHeaders(url, options) {
        const model = this._getModel(url);
        if (!model) {
            return [];
        }
        return findSectionHeaders(model, options);
    }
    // ---- BEGIN diff --------------------------------------------------------------------------
    async $computeDiff(originalUrl, modifiedUrl, options, algorithm) {
        const original = this._getModel(originalUrl);
        const modified = this._getModel(modifiedUrl);
        if (!original || !modified) {
            return null;
        }
        const result = EditorWorker.computeDiff(original, modified, options, algorithm);
        return result;
    }
    static computeDiff(originalTextModel, modifiedTextModel, options, algorithm) {
        const diffAlgorithm = algorithm === 'advanced' ? linesDiffComputers.getDefault() : linesDiffComputers.getLegacy();
        const originalLines = originalTextModel.getLinesContent();
        const modifiedLines = modifiedTextModel.getLinesContent();
        const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, options);
        const identical = (result.changes.length > 0 ? false : this._modelsAreIdentical(originalTextModel, modifiedTextModel));
        function getLineChanges(changes) {
            return changes.map(m => ([m.original.startLineNumber, m.original.endLineNumberExclusive, m.modified.startLineNumber, m.modified.endLineNumberExclusive, m.innerChanges?.map(m => [
                    m.originalRange.startLineNumber,
                    m.originalRange.startColumn,
                    m.originalRange.endLineNumber,
                    m.originalRange.endColumn,
                    m.modifiedRange.startLineNumber,
                    m.modifiedRange.startColumn,
                    m.modifiedRange.endLineNumber,
                    m.modifiedRange.endColumn,
                ])]));
        }
        return {
            identical,
            quitEarly: result.hitTimeout,
            changes: getLineChanges(result.changes),
            moves: result.moves.map(m => ([
                m.lineRangeMapping.original.startLineNumber,
                m.lineRangeMapping.original.endLineNumberExclusive,
                m.lineRangeMapping.modified.startLineNumber,
                m.lineRangeMapping.modified.endLineNumberExclusive,
                getLineChanges(m.changes)
            ])),
        };
    }
    static _modelsAreIdentical(original, modified) {
        const originalLineCount = original.getLineCount();
        const modifiedLineCount = modified.getLineCount();
        if (originalLineCount !== modifiedLineCount) {
            return false;
        }
        for (let line = 1; line <= originalLineCount; line++) {
            const originalLine = original.getLineContent(line);
            const modifiedLine = modified.getLineContent(line);
            if (originalLine !== modifiedLine) {
                return false;
            }
        }
        return true;
    }
    async $computeDirtyDiff(originalUrl, modifiedUrl, ignoreTrimWhitespace) {
        const original = this._getModel(originalUrl);
        const modified = this._getModel(modifiedUrl);
        if (!original || !modified) {
            return null;
        }
        const originalLines = original.getLinesContent();
        const modifiedLines = modified.getLinesContent();
        const diffComputer = new DiffComputer(originalLines, modifiedLines, {
            shouldComputeCharChanges: false,
            shouldPostProcessCharChanges: false,
            shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
            shouldMakePrettyDiff: true,
            maxComputationTime: 1000
        });
        return diffComputer.computeDiff().changes;
    }
    $computeStringDiff(original, modified, options, algorithm) {
        return computeStringDiff(original, modified, options, algorithm).toJson();
    }
    // ---- END diff --------------------------------------------------------------------------
    // ---- BEGIN minimal edits ---------------------------------------------------------------
    static { this._diffLimit = 100000; }
    async $computeMoreMinimalEdits(modelUrl, edits, pretty) {
        const model = this._getModel(modelUrl);
        if (!model) {
            return edits;
        }
        const result = [];
        let lastEol = undefined;
        edits = edits.slice(0).sort((a, b) => {
            if (a.range && b.range) {
                return Range.compareRangesUsingStarts(a.range, b.range);
            }
            // eol only changes should go to the end
            const aRng = a.range ? 0 : 1;
            const bRng = b.range ? 0 : 1;
            return aRng - bRng;
        });
        // merge adjacent edits
        let writeIndex = 0;
        for (let readIndex = 1; readIndex < edits.length; readIndex++) {
            if (Range.getEndPosition(edits[writeIndex].range).equals(Range.getStartPosition(edits[readIndex].range))) {
                edits[writeIndex].range = Range.fromPositions(Range.getStartPosition(edits[writeIndex].range), Range.getEndPosition(edits[readIndex].range));
                edits[writeIndex].text += edits[readIndex].text;
            }
            else {
                writeIndex++;
                edits[writeIndex] = edits[readIndex];
            }
        }
        edits.length = writeIndex + 1;
        for (let { range, text, eol } of edits) {
            if (typeof eol === 'number') {
                lastEol = eol;
            }
            if (Range.isEmpty(range) && !text) {
                // empty change
                continue;
            }
            const original = model.getValueInRange(range);
            text = text.replace(/\r\n|\n|\r/g, model.eol);
            if (original === text) {
                // noop
                continue;
            }
            // make sure diff won't take too long
            if (Math.max(text.length, original.length) > EditorWorker._diffLimit) {
                result.push({ range, text });
                continue;
            }
            // compute diff between original and edit.text
            const changes = stringDiff(original, text, pretty);
            const editOffset = model.offsetAt(Range.lift(range).getStartPosition());
            for (const change of changes) {
                const start = model.positionAt(editOffset + change.originalStart);
                const end = model.positionAt(editOffset + change.originalStart + change.originalLength);
                const newEdit = {
                    text: text.substr(change.modifiedStart, change.modifiedLength),
                    range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }
                };
                if (model.getValueInRange(newEdit.range) !== newEdit.text) {
                    result.push(newEdit);
                }
            }
        }
        if (typeof lastEol === 'number') {
            result.push({ eol: lastEol, text: '', range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } });
        }
        return result;
    }
    $computeHumanReadableDiff(modelUrl, edits, options) {
        const model = this._getModel(modelUrl);
        if (!model) {
            return edits;
        }
        const result = [];
        let lastEol = undefined;
        edits = edits.slice(0).sort((a, b) => {
            if (a.range && b.range) {
                return Range.compareRangesUsingStarts(a.range, b.range);
            }
            // eol only changes should go to the end
            const aRng = a.range ? 0 : 1;
            const bRng = b.range ? 0 : 1;
            return aRng - bRng;
        });
        for (let { range, text, eol } of edits) {
            if (typeof eol === 'number') {
                lastEol = eol;
            }
            if (Range.isEmpty(range) && !text) {
                // empty change
                continue;
            }
            const original = model.getValueInRange(range);
            text = text.replace(/\r\n|\n|\r/g, model.eol);
            if (original === text) {
                // noop
                continue;
            }
            // make sure diff won't take too long
            if (Math.max(text.length, original.length) > EditorWorker._diffLimit) {
                result.push({ range, text });
                continue;
            }
            // compute diff between original and edit.text
            const originalLines = original.split(/\r\n|\n|\r/);
            const modifiedLines = text.split(/\r\n|\n|\r/);
            const diff = linesDiffComputers.getDefault().computeDiff(originalLines, modifiedLines, options);
            const start = Range.lift(range).getStartPosition();
            function addPositions(pos1, pos2) {
                return new Position(pos1.lineNumber + pos2.lineNumber - 1, pos2.lineNumber === 1 ? pos1.column + pos2.column - 1 : pos2.column);
            }
            function getText(lines, range) {
                const result = [];
                for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
                    const line = lines[i - 1];
                    if (i === range.startLineNumber && i === range.endLineNumber) {
                        result.push(line.substring(range.startColumn - 1, range.endColumn - 1));
                    }
                    else if (i === range.startLineNumber) {
                        result.push(line.substring(range.startColumn - 1));
                    }
                    else if (i === range.endLineNumber) {
                        result.push(line.substring(0, range.endColumn - 1));
                    }
                    else {
                        result.push(line);
                    }
                }
                return result;
            }
            for (const c of diff.changes) {
                if (c.innerChanges) {
                    for (const x of c.innerChanges) {
                        result.push({
                            range: Range.fromPositions(addPositions(start, x.originalRange.getStartPosition()), addPositions(start, x.originalRange.getEndPosition())),
                            text: getText(modifiedLines, x.modifiedRange).join(model.eol)
                        });
                    }
                }
                else {
                    throw new BugIndicatingError('The experimental diff algorithm always produces inner changes');
                }
            }
        }
        if (typeof lastEol === 'number') {
            result.push({ eol: lastEol, text: '', range: { startLineNumber: 0, startColumn: 0, endLineNumber: 0, endColumn: 0 } });
        }
        return result;
    }
    // ---- END minimal edits ---------------------------------------------------------------
    async $computeLinks(modelUrl) {
        const model = this._getModel(modelUrl);
        if (!model) {
            return null;
        }
        return computeLinks(model);
    }
    // --- BEGIN default document colors -----------------------------------------------------------
    async $computeDefaultDocumentColors(modelUrl) {
        const model = this._getModel(modelUrl);
        if (!model) {
            return null;
        }
        return computeDefaultDocumentColors(model);
    }
    // ---- BEGIN suggest --------------------------------------------------------------------------
    static { this._suggestionsLimit = 10000; }
    async $textualSuggest(modelUrls, leadingWord, wordDef, wordDefFlags) {
        const sw = new StopWatch();
        const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
        const seen = new Set();
        outer: for (const url of modelUrls) {
            const model = this._getModel(url);
            if (!model) {
                continue;
            }
            for (const word of model.words(wordDefRegExp)) {
                if (word === leadingWord || !isNaN(Number(word))) {
                    continue;
                }
                seen.add(word);
                if (seen.size > EditorWorker._suggestionsLimit) {
                    break outer;
                }
            }
        }
        return { words: Array.from(seen), duration: sw.elapsed() };
    }
    // ---- END suggest --------------------------------------------------------------------------
    //#region -- word ranges --
    async $computeWordRanges(modelUrl, range, wordDef, wordDefFlags) {
        const model = this._getModel(modelUrl);
        if (!model) {
            return Object.create(null);
        }
        const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
        const result = Object.create(null);
        for (let line = range.startLineNumber; line < range.endLineNumber; line++) {
            const words = model.getLineWords(line, wordDefRegExp);
            for (const word of words) {
                if (!isNaN(Number(word.word))) {
                    continue;
                }
                let array = result[word.word];
                if (!array) {
                    array = [];
                    result[word.word] = array;
                }
                array.push({
                    startLineNumber: line,
                    startColumn: word.startColumn,
                    endLineNumber: line,
                    endColumn: word.endColumn
                });
            }
        }
        return result;
    }
    //#endregion
    async $navigateValueSet(modelUrl, range, up, wordDef, wordDefFlags) {
        const model = this._getModel(modelUrl);
        if (!model) {
            return null;
        }
        const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
        if (range.startColumn === range.endColumn) {
            range = {
                startLineNumber: range.startLineNumber,
                startColumn: range.startColumn,
                endLineNumber: range.endLineNumber,
                endColumn: range.endColumn + 1
            };
        }
        const selectionText = model.getValueInRange(range);
        const wordRange = model.getWordAtPosition({ lineNumber: range.startLineNumber, column: range.startColumn }, wordDefRegExp);
        if (!wordRange) {
            return null;
        }
        const word = model.getValueInRange(wordRange);
        const result = BasicInplaceReplace.INSTANCE.navigateValueSet(range, selectionText, wordRange, word, up);
        return result;
    }
    // ---- BEGIN foreign module support --------------------------------------------------------------------------
    // foreign method request
    $fmr(method, args) {
        if (!this._foreignModule || typeof this._foreignModule[method] !== 'function') {
            return Promise.reject(new Error('Missing requestHandler or method: ' + method));
        }
        try {
            return Promise.resolve(this._foreignModule[method].apply(this._foreignModule, args));
        }
        catch (e) {
            return Promise.reject(e);
        }
    }
}
if (typeof importScripts === 'function') {
    // Running in a web worker
    globalThis.monaco = createMonacoBaseAPI();
}
/**
 * @internal
*/
export function computeStringDiff(original, modified, options, algorithm) {
    const diffAlgorithm = algorithm === 'advanced' ? linesDiffComputers.getDefault() : linesDiffComputers.getLegacy();
    ensureDependenciesAreSet();
    const originalText = new StringText(original);
    const originalLines = originalText.getLines();
    const modifiedText = new StringText(modified);
    const modifiedLines = modifiedText.getLines();
    const result = diffAlgorithm.computeDiff(originalLines, modifiedLines, { ignoreTrimWhitespace: false, maxComputationTimeMs: options.maxComputationTimeMs, computeMoves: false, extendToSubwords: false });
    const textEdit = DetailedLineRangeMapping.toTextEdit(result.changes, modifiedText);
    const strEdit = originalText.getTransformer().getStringEdit(textEdit);
    return strEdit;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yV2ViV29ya2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXZWJXb3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSS9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMvQyxPQUFPLEVBQVUsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFJakQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXJGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsMkJBQTJCLEVBQTZCLE1BQU0sa0NBQWtDLENBQUM7QUFDMUcsT0FBTyxFQUFFLFlBQVksRUFBVyxNQUFNLG9DQUFvQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRW5FLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdGLE9BQU8sRUFBMkMsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV0RyxPQUFPLEVBQWdCLHlCQUF5QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzFELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBa0M1RTs7R0FFRztBQUNILE1BQU0sT0FBTyxZQUFZO0lBS3hCLFlBQ2tCLGlCQUFpQyxJQUFJO1FBQXJDLG1CQUFjLEdBQWQsY0FBYyxDQUF1QjtRQUx2RCx5QkFBb0IsR0FBUyxTQUFTLENBQUM7UUFFdEIsK0JBQTBCLEdBQUcsSUFBSSx5QkFBeUIsRUFBRSxDQUFDO0lBSTFFLENBQUM7SUFFTCxPQUFPO0lBQ1AsQ0FBQztJQUVNLEtBQUssQ0FBQyxLQUFLO1FBQ2pCLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVTLFNBQVMsQ0FBQyxHQUFXO1FBQzlCLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRU0sU0FBUztRQUNmLE9BQU8sSUFBSSxDQUFDLDBCQUEwQixDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ3BELENBQUM7SUFFTSxlQUFlLENBQUMsSUFBbUI7UUFDekMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRU0sbUJBQW1CLENBQUMsR0FBVyxFQUFFLENBQXFCO1FBQzVELElBQUksQ0FBQywwQkFBMEIsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUVNLG1CQUFtQixDQUFDLEdBQVc7UUFDckMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFTSxLQUFLLENBQUMseUJBQXlCLENBQUMsR0FBVyxFQUFFLE9BQWtDLEVBQUUsS0FBYztRQUNyRyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQyxFQUFFLHVCQUF1QixFQUFFLENBQUMsRUFBRSwyQkFBMkIsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUMvSCxDQUFDO1FBQ0QsT0FBTywyQkFBMkIsQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3BGLENBQUM7SUFFTSxLQUFLLENBQUMsbUJBQW1CLENBQUMsR0FBVyxFQUFFLE9BQWlDO1FBQzlFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBQ0QsT0FBTyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUVELDZGQUE2RjtJQUV0RixLQUFLLENBQUMsWUFBWSxDQUFDLFdBQW1CLEVBQUUsV0FBbUIsRUFBRSxPQUFxQyxFQUFFLFNBQTRCO1FBQ3RJLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDN0MsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDNUIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoRixPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFTyxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUE0QyxFQUFFLGlCQUE0QyxFQUFFLE9BQXFDLEVBQUUsU0FBNEI7UUFDekwsTUFBTSxhQUFhLEdBQXVCLFNBQVMsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUV0SSxNQUFNLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUMxRCxNQUFNLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUUxRCxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFaEYsTUFBTSxTQUFTLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLENBQUMsQ0FBQztRQUV2SCxTQUFTLGNBQWMsQ0FBQyxPQUE0QztZQUNuRSxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLENBQUMsQ0FBQyxZQUFZLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2hMLENBQUMsQ0FBQyxhQUFhLENBQUMsZUFBZTtvQkFDL0IsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxXQUFXO29CQUMzQixDQUFDLENBQUMsYUFBYSxDQUFDLGFBQWE7b0JBQzdCLENBQUMsQ0FBQyxhQUFhLENBQUMsU0FBUztvQkFDekIsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxlQUFlO29CQUMvQixDQUFDLENBQUMsYUFBYSxDQUFDLFdBQVc7b0JBQzNCLENBQUMsQ0FBQyxhQUFhLENBQUMsYUFBYTtvQkFDN0IsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxTQUFTO2lCQUN6QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO1FBRUQsT0FBTztZQUNOLFNBQVM7WUFDVCxTQUFTLEVBQUUsTUFBTSxDQUFDLFVBQVU7WUFDNUIsT0FBTyxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDO1lBQ3ZDLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzdCLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsZUFBZTtnQkFDM0MsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxzQkFBc0I7Z0JBQ2xELENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsZUFBZTtnQkFDM0MsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxzQkFBc0I7Z0JBQ2xELGNBQWMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO2FBQ3pCLENBQUMsQ0FBQztTQUNILENBQUM7SUFDSCxDQUFDO0lBRU8sTUFBTSxDQUFDLG1CQUFtQixDQUFDLFFBQW1DLEVBQUUsUUFBbUM7UUFDMUcsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEQsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEQsSUFBSSxpQkFBaUIsS0FBSyxpQkFBaUIsRUFBRSxDQUFDO1lBQzdDLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELEtBQUssSUFBSSxJQUFJLEdBQUcsQ0FBQyxFQUFFLElBQUksSUFBSSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ3RELE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbkQsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuRCxJQUFJLFlBQVksS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVNLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxXQUFtQixFQUFFLFdBQW1CLEVBQUUsb0JBQTZCO1FBQ3JHLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDN0MsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDNUIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ2pELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUNqRCxNQUFNLFlBQVksR0FBRyxJQUFJLFlBQVksQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFO1lBQ25FLHdCQUF3QixFQUFFLEtBQUs7WUFDL0IsNEJBQTRCLEVBQUUsS0FBSztZQUNuQywwQkFBMEIsRUFBRSxvQkFBb0I7WUFDaEQsb0JBQW9CLEVBQUUsSUFBSTtZQUMxQixrQkFBa0IsRUFBRSxJQUFJO1NBQ3hCLENBQUMsQ0FBQztRQUNILE9BQU8sWUFBWSxDQUFDLFdBQVcsRUFBRSxDQUFDLE9BQU8sQ0FBQztJQUMzQyxDQUFDO0lBRU0sa0JBQWtCLENBQUMsUUFBZ0IsRUFBRSxRQUFnQixFQUFFLE9BQXlDLEVBQUUsU0FBNEI7UUFDcEksT0FBTyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxTQUFTLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUMzRSxDQUFDO0lBRUQsMkZBQTJGO0lBRzNGLDJGQUEyRjthQUVuRSxlQUFVLEdBQUcsTUFBTSxBQUFULENBQVU7SUFFckMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLFFBQWdCLEVBQUUsS0FBaUIsRUFBRSxNQUFlO1FBQ3pGLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQWUsRUFBRSxDQUFDO1FBQzlCLElBQUksT0FBTyxHQUFrQyxTQUFTLENBQUM7UUFFdkQsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ3BDLElBQUksQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3hCLE9BQU8sS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pELENBQUM7WUFDRCx3Q0FBd0M7WUFDeEMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0IsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0IsT0FBTyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ3BCLENBQUMsQ0FBQyxDQUFDO1FBRUgsdUJBQXVCO1FBQ3ZCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNuQixLQUFLLElBQUksU0FBUyxHQUFHLENBQUMsRUFBRSxTQUFTLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDO1lBQy9ELElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUMxRyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUM3SSxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsSUFBSSxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDakQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFVBQVUsRUFBRSxDQUFDO2dCQUNiLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdEMsQ0FBQztRQUNGLENBQUM7UUFDRCxLQUFLLENBQUMsTUFBTSxHQUFHLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFFOUIsS0FBSyxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUV4QyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUM3QixPQUFPLEdBQUcsR0FBRyxDQUFDO1lBQ2YsQ0FBQztZQUVELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNuQyxlQUFlO2dCQUNmLFNBQVM7WUFDVixDQUFDO1lBRUQsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM5QyxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRTlDLElBQUksUUFBUSxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUN2QixPQUFPO2dCQUNQLFNBQVM7WUFDVixDQUFDO1lBRUQscUNBQXFDO1lBQ3JDLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxZQUFZLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3RFLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztnQkFDN0IsU0FBUztZQUNWLENBQUM7WUFFRCw4Q0FBOEM7WUFDOUMsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDbkQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQztZQUV4RSxLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUM5QixNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ2xFLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsVUFBVSxHQUFHLE1BQU0sQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO2dCQUN4RixNQUFNLE9BQU8sR0FBYTtvQkFDekIsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxNQUFNLENBQUMsY0FBYyxDQUFDO29CQUM5RCxLQUFLLEVBQUUsRUFBRSxlQUFlLEVBQUUsS0FBSyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxhQUFhLEVBQUUsR0FBRyxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRTtpQkFDN0gsQ0FBQztnQkFFRixJQUFJLEtBQUssQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDM0QsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDdEIsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNqQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEgsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVNLHlCQUF5QixDQUFDLFFBQWdCLEVBQUUsS0FBaUIsRUFBRSxPQUFrQztRQUN2RyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNaLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE1BQU0sTUFBTSxHQUFlLEVBQUUsQ0FBQztRQUM5QixJQUFJLE9BQU8sR0FBa0MsU0FBUyxDQUFDO1FBRXZELEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNwQyxJQUFJLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUN4QixPQUFPLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN6RCxDQUFDO1lBQ0Qsd0NBQXdDO1lBQ3hDLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdCLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdCLE9BQU8sSUFBSSxHQUFHLElBQUksQ0FBQztRQUNwQixDQUFDLENBQUMsQ0FBQztRQUVILEtBQUssSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksS0FBSyxFQUFFLENBQUM7WUFFeEMsSUFBSSxPQUFPLEdBQUcsS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDN0IsT0FBTyxHQUFHLEdBQUcsQ0FBQztZQUNmLENBQUM7WUFFRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbkMsZUFBZTtnQkFDZixTQUFTO1lBQ1YsQ0FBQztZQUVELE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDOUMsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUU5QyxJQUFJLFFBQVEsS0FBSyxJQUFJLEVBQUUsQ0FBQztnQkFDdkIsT0FBTztnQkFDUCxTQUFTO1lBQ1YsQ0FBQztZQUVELHFDQUFxQztZQUNyQyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsWUFBWSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN0RSxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBQzdCLFNBQVM7WUFDVixDQUFDO1lBRUQsOENBQThDO1lBRTlDLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDbkQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUUvQyxNQUFNLElBQUksR0FBRyxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxXQUFXLENBQUMsYUFBYSxFQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUVoRyxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFFbkQsU0FBUyxZQUFZLENBQUMsSUFBYyxFQUFFLElBQWM7Z0JBQ25ELE9BQU8sSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pJLENBQUM7WUFFRCxTQUFTLE9BQU8sQ0FBQyxLQUFlLEVBQUUsS0FBWTtnQkFDN0MsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO2dCQUM1QixLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDbkUsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDMUIsSUFBSSxDQUFDLEtBQUssS0FBSyxDQUFDLGVBQWUsSUFBSSxDQUFDLEtBQUssS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDO3dCQUM5RCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN6RSxDQUFDO3lCQUFNLElBQUksQ0FBQyxLQUFLLEtBQUssQ0FBQyxlQUFlLEVBQUUsQ0FBQzt3QkFDeEMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDcEQsQ0FBQzt5QkFBTSxJQUFJLENBQUMsS0FBSyxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUM7d0JBQ3RDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNyRCxDQUFDO3lCQUFNLENBQUM7d0JBQ1AsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDbkIsQ0FBQztnQkFDRixDQUFDO2dCQUNELE9BQU8sTUFBTSxDQUFDO1lBQ2YsQ0FBQztZQUVELEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUM5QixJQUFJLENBQUMsQ0FBQyxZQUFZLEVBQUUsQ0FBQztvQkFDcEIsS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUM7d0JBQ2hDLE1BQU0sQ0FBQyxJQUFJLENBQUM7NEJBQ1gsS0FBSyxFQUFFLEtBQUssQ0FBQyxhQUFhLENBQ3pCLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEVBQ3ZELFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUNyRDs0QkFDRCxJQUFJLEVBQUUsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7eUJBQzdELENBQUMsQ0FBQztvQkFDSixDQUFDO2dCQUNGLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxNQUFNLElBQUksa0JBQWtCLENBQUMsK0RBQStELENBQUMsQ0FBQztnQkFDL0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNqQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEgsQ0FBQztRQUVELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELHlGQUF5RjtJQUVsRixLQUFLLENBQUMsYUFBYSxDQUFDLFFBQWdCO1FBQzFDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsT0FBTyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVELGdHQUFnRztJQUV6RixLQUFLLENBQUMsNkJBQTZCLENBQUMsUUFBZ0I7UUFDMUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLDRCQUE0QixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxnR0FBZ0c7YUFFeEUsc0JBQWlCLEdBQUcsS0FBSyxBQUFSLENBQVM7SUFFM0MsS0FBSyxDQUFDLGVBQWUsQ0FBQyxTQUFtQixFQUFFLFdBQStCLEVBQUUsT0FBZSxFQUFFLFlBQW9CO1FBRXZILE1BQU0sRUFBRSxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7UUFDM0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxNQUFNLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3hELE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFFL0IsS0FBSyxFQUFFLEtBQUssTUFBTSxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7WUFDcEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNsQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ1osU0FBUztZQUNWLENBQUM7WUFFRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQztnQkFDL0MsSUFBSSxJQUFJLEtBQUssV0FBVyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQ2xELFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNmLElBQUksSUFBSSxDQUFDLElBQUksR0FBRyxZQUFZLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztvQkFDaEQsTUFBTSxLQUFLLENBQUM7Z0JBQ2IsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztJQUM1RCxDQUFDO0lBR0QsOEZBQThGO0lBRTlGLDJCQUEyQjtJQUVwQixLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBZ0IsRUFBRSxLQUFhLEVBQUUsT0FBZSxFQUFFLFlBQW9CO1FBQ3JHLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFDRCxNQUFNLGFBQWEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDeEQsTUFBTSxNQUFNLEdBQWlDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakUsS0FBSyxJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsZUFBZSxFQUFFLElBQUksR0FBRyxLQUFLLENBQUMsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7WUFDM0UsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDdEQsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDL0IsU0FBUztnQkFDVixDQUFDO2dCQUNELElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzlCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDWixLQUFLLEdBQUcsRUFBRSxDQUFDO29CQUNYLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDO2dCQUMzQixDQUFDO2dCQUNELEtBQUssQ0FBQyxJQUFJLENBQUM7b0JBQ1YsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVztvQkFDN0IsYUFBYSxFQUFFLElBQUk7b0JBQ25CLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztpQkFDekIsQ0FBQyxDQUFDO1lBQ0osQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFRCxZQUFZO0lBRUwsS0FBSyxDQUFDLGlCQUFpQixDQUFDLFFBQWdCLEVBQUUsS0FBYSxFQUFFLEVBQVcsRUFBRSxPQUFlLEVBQUUsWUFBb0I7UUFDakgsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFeEQsSUFBSSxLQUFLLENBQUMsV0FBVyxLQUFLLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMzQyxLQUFLLEdBQUc7Z0JBQ1AsZUFBZSxFQUFFLEtBQUssQ0FBQyxlQUFlO2dCQUN0QyxXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVc7Z0JBQzlCLGFBQWEsRUFBRSxLQUFLLENBQUMsYUFBYTtnQkFDbEMsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQzthQUM5QixDQUFDO1FBQ0gsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFbkQsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxlQUFlLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxXQUFXLEVBQUUsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUMzSCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUM5QyxNQUFNLE1BQU0sR0FBRyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3hHLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELCtHQUErRztJQUUvRyx5QkFBeUI7SUFDbEIsSUFBSSxDQUFDLE1BQWMsRUFBRSxJQUFlO1FBQzFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxJQUFJLE9BQVEsSUFBSSxDQUFDLGNBQTBDLENBQUMsTUFBTSxDQUFDLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDNUcsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLG9DQUFvQyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDakYsQ0FBQztRQUVELElBQUksQ0FBQztZQUNKLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBRSxJQUFJLENBQUMsY0FBMkMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3BILENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFCLENBQUM7SUFDRixDQUFDOztBQVFGLElBQUksT0FBTyxhQUFhLEtBQUssVUFBVSxFQUFFLENBQUM7SUFDekMsMEJBQTBCO0lBQzFCLFVBQVUsQ0FBQyxNQUFNLEdBQUcsbUJBQW1CLEVBQUUsQ0FBQztBQUMzQyxDQUFDO0FBRUQ7O0VBRUU7QUFDRixNQUFNLFVBQVUsaUJBQWlCLENBQUMsUUFBZ0IsRUFBRSxRQUFnQixFQUFFLE9BQXlDLEVBQUUsU0FBNEI7SUFDNUksTUFBTSxhQUFhLEdBQXVCLFNBQVMsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUV0SSx3QkFBd0IsRUFBRSxDQUFDO0lBRTNCLE1BQU0sWUFBWSxHQUFHLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzlDLE1BQU0sYUFBYSxHQUFHLFlBQVksQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUM5QyxNQUFNLFlBQVksR0FBRyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM5QyxNQUFNLGFBQWEsR0FBRyxZQUFZLENBQUMsUUFBUSxFQUFFLENBQUM7SUFFOUMsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxvQkFBb0IsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFFMU0sTUFBTSxRQUFRLEdBQUcsd0JBQXdCLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDbkYsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLGNBQWMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUV0RSxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDIn0=