/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from './core/range.js';
/**
 * @internal
 */
export function serializeFontTokenOptions() {
    return (annotation) => {
        return {
            fontFamily: annotation.fontFamily ?? '',
            fontSizeMultiplier: annotation.fontSizeMultiplier ?? 0,
            lineHeightMultiplier: annotation.lineHeightMultiplier ?? 0
        };
    };
}
/**
 * @internal
 */
export function deserializeFontTokenOptions() {
    return (annotation) => {
        return {
            fontFamily: annotation.fontFamily ? String(annotation.fontFamily) : undefined,
            fontSizeMultiplier: annotation.fontSizeMultiplier ? Number(annotation.fontSizeMultiplier) : undefined,
            lineHeightMultiplier: annotation.lineHeightMultiplier ? Number(annotation.lineHeightMultiplier) : undefined
        };
    };
}
/**
 * @internal
 */
export var RawContentChangedType;
(function (RawContentChangedType) {
    RawContentChangedType[RawContentChangedType["Flush"] = 1] = "Flush";
    RawContentChangedType[RawContentChangedType["LineChanged"] = 2] = "LineChanged";
    RawContentChangedType[RawContentChangedType["LinesDeleted"] = 3] = "LinesDeleted";
    RawContentChangedType[RawContentChangedType["LinesInserted"] = 4] = "LinesInserted";
    RawContentChangedType[RawContentChangedType["EOLChanged"] = 5] = "EOLChanged";
})(RawContentChangedType || (RawContentChangedType = {}));
/**
 * An event describing that a model has been reset to a new value.
 * @internal
 */
export class ModelRawFlush {
    constructor() {
        this.changeType = 1 /* RawContentChangedType.Flush */;
    }
}
/**
 * Represents text injected on a line
 * @internal
 */
export class LineInjectedText {
    static applyInjectedText(lineText, injectedTexts) {
        if (!injectedTexts || injectedTexts.length === 0) {
            return lineText;
        }
        let result = '';
        let lastOriginalOffset = 0;
        for (const injectedText of injectedTexts) {
            result += lineText.substring(lastOriginalOffset, injectedText.column - 1);
            lastOriginalOffset = injectedText.column - 1;
            result += injectedText.options.content;
        }
        result += lineText.substring(lastOriginalOffset);
        return result;
    }
    static fromDecorations(decorations) {
        const result = [];
        for (const decoration of decorations) {
            if (decoration.options.before && decoration.options.before.content.length > 0) {
                result.push(new LineInjectedText(decoration.ownerId, decoration.range.startLineNumber, decoration.range.startColumn, decoration.options.before, 0));
            }
            if (decoration.options.after && decoration.options.after.content.length > 0) {
                result.push(new LineInjectedText(decoration.ownerId, decoration.range.endLineNumber, decoration.range.endColumn, decoration.options.after, 1));
            }
        }
        result.sort((a, b) => {
            if (a.lineNumber === b.lineNumber) {
                if (a.column === b.column) {
                    return a.order - b.order;
                }
                return a.column - b.column;
            }
            return a.lineNumber - b.lineNumber;
        });
        return result;
    }
    constructor(ownerId, lineNumber, column, options, order) {
        this.ownerId = ownerId;
        this.lineNumber = lineNumber;
        this.column = column;
        this.options = options;
        this.order = order;
    }
    withText(text) {
        return new LineInjectedText(this.ownerId, this.lineNumber, this.column, { ...this.options, content: text }, this.order);
    }
}
/**
 * An event describing that a line has changed in a model.
 * @internal
 */
export class ModelRawLineChanged {
    constructor(lineNumber, lineNumberPostEdit) {
        this.changeType = 2 /* RawContentChangedType.LineChanged */;
        this.lineNumber = lineNumber;
        this.lineNumberPostEdit = lineNumberPostEdit;
    }
}
/**
 * An event describing that a line height has changed in the model.
 * @internal
 */
export class ModelLineHeightChanged {
    constructor(ownerId, decorationId, lineNumber, lineHeightMultiplier) {
        this.ownerId = ownerId;
        this.decorationId = decorationId;
        this.lineNumber = lineNumber;
        this.lineHeightMultiplier = lineHeightMultiplier;
    }
}
/**
 * An event describing that a line height has changed in the model.
 * @internal
 */
export class ModelFontChanged {
    constructor(ownerId, lineNumber) {
        this.ownerId = ownerId;
        this.lineNumber = lineNumber;
    }
}
/**
 * An event describing that line(s) have been deleted in a model.
 * @internal
 */
export class ModelRawLinesDeleted {
    constructor(fromLineNumber, toLineNumber, lastUntouchedLinePostEdit) {
        this.changeType = 3 /* RawContentChangedType.LinesDeleted */;
        this.fromLineNumber = fromLineNumber;
        this.toLineNumber = toLineNumber;
        this.lastUntouchedLinePostEdit = lastUntouchedLinePostEdit;
    }
}
/**
 * An event describing that line(s) have been inserted in a model.
 * @internal
 */
export class ModelRawLinesInserted {
    /**
     * `toLineNumber` - `fromLineNumber` + 1 denotes the number of lines that were inserted
     */
    get toLineNumber() {
        return this.fromLineNumber + this.count - 1;
    }
    /**
     * The actual end line number of the insertion in the updated buffer.
     */
    get toLineNumberPostEdit() {
        return this.fromLineNumberPostEdit + this.count - 1;
    }
    constructor(fromLineNumber, fromLineNumberPostEdit, count) {
        this.changeType = 4 /* RawContentChangedType.LinesInserted */;
        this.fromLineNumber = fromLineNumber;
        this.fromLineNumberPostEdit = fromLineNumberPostEdit;
        this.count = count;
    }
}
/**
 * An event describing that a model has had its EOL changed.
 * @internal
 */
export class ModelRawEOLChanged {
    constructor() {
        this.changeType = 5 /* RawContentChangedType.EOLChanged */;
    }
}
/**
 * An event describing a change in the text of a model.
 * @internal
 */
export class ModelRawContentChangedEvent {
    constructor(changes, versionId, isUndoing, isRedoing) {
        this.changes = changes;
        this.versionId = versionId;
        this.isUndoing = isUndoing;
        this.isRedoing = isRedoing;
        this.resultingSelection = null;
    }
    containsEvent(type) {
        for (let i = 0, len = this.changes.length; i < len; i++) {
            const change = this.changes[i];
            if (change.changeType === type) {
                return true;
            }
        }
        return false;
    }
    static merge(a, b) {
        const changes = [].concat(a.changes).concat(b.changes);
        const versionId = b.versionId;
        const isUndoing = (a.isUndoing || b.isUndoing);
        const isRedoing = (a.isRedoing || b.isRedoing);
        return new ModelRawContentChangedEvent(changes, versionId, isUndoing, isRedoing);
    }
}
/**
 * An event describing a change in injected text.
 * @internal
 */
export class ModelInjectedTextChangedEvent {
    constructor(changes) {
        this.changes = changes;
    }
}
/**
 * An event describing a change of a line height.
 * @internal
 */
export class ModelLineHeightChangedEvent {
    constructor(changes) {
        this.changes = changes;
    }
    affects(rangeOrPosition) {
        if (Range.isIRange(rangeOrPosition)) {
            for (const change of this.changes) {
                if (change.lineNumber >= rangeOrPosition.startLineNumber && change.lineNumber <= rangeOrPosition.endLineNumber) {
                    return true;
                }
            }
            return false;
        }
        else {
            for (const change of this.changes) {
                if (change.lineNumber === rangeOrPosition.lineNumber) {
                    return true;
                }
            }
            return false;
        }
    }
}
/**
 * An event describing a change in fonts.
 * @internal
 */
export class ModelFontChangedEvent {
    constructor(changes) {
        this.changes = changes;
    }
}
/**
 * @internal
 */
export class InternalModelContentChangeEvent {
    constructor(rawContentChangedEvent, contentChangedEvent) {
        this.rawContentChangedEvent = rawContentChangedEvent;
        this.contentChangedEvent = contentChangedEvent;
    }
    merge(other) {
        const rawContentChangedEvent = ModelRawContentChangedEvent.merge(this.rawContentChangedEvent, other.rawContentChangedEvent);
        const contentChangedEvent = InternalModelContentChangeEvent._mergeChangeEvents(this.contentChangedEvent, other.contentChangedEvent);
        return new InternalModelContentChangeEvent(rawContentChangedEvent, contentChangedEvent);
    }
    static _mergeChangeEvents(a, b) {
        const changes = [].concat(a.changes).concat(b.changes);
        const eol = b.eol;
        const versionId = b.versionId;
        const isUndoing = (a.isUndoing || b.isUndoing);
        const isRedoing = (a.isRedoing || b.isRedoing);
        const isFlush = (a.isFlush || b.isFlush);
        const isEolChange = a.isEolChange && b.isEolChange; // both must be true to not confuse listeners who skip such edits
        return {
            changes: changes,
            eol: eol,
            isEolChange: isEolChange,
            versionId: versionId,
            isUndoing: isUndoing,
            isRedoing: isRedoing,
            isFlush: isFlush,
            detailedReasons: a.detailedReasons.concat(b.detailedReasons),
            detailedReasonsChangeLengths: a.detailedReasonsChangeLengths.concat(b.detailedReasonsChangeLengths),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1vZGVsRXZlbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFVLEtBQUssRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBa0xoRDs7R0FFRztBQUNILE1BQU0sVUFBVSx5QkFBeUI7SUFDeEMsT0FBTyxDQUFDLFVBQTRCLEVBQUUsRUFBRTtRQUN2QyxPQUFPO1lBQ04sVUFBVSxFQUFFLFVBQVUsQ0FBQyxVQUFVLElBQUksRUFBRTtZQUN2QyxrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCLElBQUksQ0FBQztZQUN0RCxvQkFBb0IsRUFBRSxVQUFVLENBQUMsb0JBQW9CLElBQUksQ0FBQztTQUMxRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLDJCQUEyQjtJQUMxQyxPQUFPLENBQUMsVUFBNEIsRUFBRSxFQUFFO1FBQ3ZDLE9BQU87WUFDTixVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUM3RSxrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztZQUNyRyxvQkFBb0IsRUFBRSxVQUFVLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUMzRyxDQUFDO0lBQ0gsQ0FBQyxDQUFDO0FBQ0gsQ0FBQztBQVNEOztHQUVHO0FBQ0gsTUFB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