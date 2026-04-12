/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileOperationError } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { areFunctions, isUndefinedOrNull } from '../../../../base/common/types.js';
export const ITextFileService = createDecorator('textFileService');
export var TextFileOperationResult;
(function (TextFileOperationResult) {
    TextFileOperationResult[TextFileOperationResult["FILE_IS_BINARY"] = 0] = "FILE_IS_BINARY";
})(TextFileOperationResult || (TextFileOperationResult = {}));
export class TextFileOperationError extends FileOperationError {
    static isTextFileOperationError(obj) {
        return obj instanceof Error && !isUndefinedOrNull(obj.textFileOperationResult);
    }
    constructor(message, textFileOperationResult, options) {
        super(message, 10 /* FileOperationResult.FILE_OTHER_ERROR */);
        this.textFileOperationResult = textFileOperationResult;
        this.options = options;
    }
}
/**
 * States the text file editor model can be in.
 */
export var TextFileEditorModelState;
(function (TextFileEditorModelState) {
    /**
     * A model is saved.
     */
    TextFileEditorModelState[TextFileEditorModelState["SAVED"] = 0] = "SAVED";
    /**
     * A model is dirty.
     */
    TextFileEditorModelState[TextFileEditorModelState["DIRTY"] = 1] = "DIRTY";
    /**
     * A model is currently being saved but this operation has not completed yet.
     */
    TextFileEditorModelState[TextFileEditorModelState["PENDING_SAVE"] = 2] = "PENDING_SAVE";
    /**
     * A model is in conflict mode when changes cannot be saved because the
     * underlying file has changed. Models in conflict mode are always dirty.
     */
    TextFileEditorModelState[TextFileEditorModelState["CONFLICT"] = 3] = "CONFLICT";
    /**
     * A model is in orphan state when the underlying file has been deleted.
     */
    TextFileEditorModelState[TextFileEditorModelState["ORPHAN"] = 4] = "ORPHAN";
    /**
     * Any error that happens during a save that is not causing the CONFLICT state.
     * Models in error mode are always dirty.
     */
    TextFileEditorModelState[TextFileEditorModelState["ERROR"] = 5] = "ERROR";
})(TextFileEditorModelState || (TextFileEditorModelState = {}));
export var TextFileResolveReason;
(function (TextFileResolveReason) {
    TextFileResolveReason[TextFileResolveReason["EDITOR"] = 1] = "EDITOR";
    TextFileResolveReason[TextFileResolveReason["REFERENCE"] = 2] = "REFERENCE";
    TextFileResolveReason[TextFileResolveReason["OTHER"] = 3] = "OTHER";
})(TextFileResolveReason || (TextFileResolveReason = {}));
export var EncodingMode;
(function (EncodingMode) {
    /**
     * Instructs the encoding support to encode the object with the provided encoding
     */
    EncodingMode[EncodingMode["Encode"] = 0] = "Encode";
    /**
     * Instructs the encoding support to decode the object with the provided encoding
     */
    EncodingMode[EncodingMode["Decode"] = 1] = "Decode";
})(EncodingMode || (EncodingMode = {}));
export function isTextFileEditorModel(model) {
    const candidate = model;
    return areFunctions(candidate.setEncoding, candidate.getEncoding, candidate.save, candidate.revert, candidate.isDirty, candidate.getLanguageId);
}
export function snapshotToString(snapshot) {
    const chunks = [];
    let chunk;
    while (typeof (chunk = snapshot.read()) === 'string') {
        chunks.push(chunk);
    }
    return chunks.join('');
}
export function stringToSnapshot(value) {
    let done = false;
    return {
        read() {
            if (!done) {
                done = true;
                return value;
            }
            return null;
        }
    };
}
export function toBufferOrReadable(value) {
    if (typeof value === 'undefined') {
        return undefined;
    }
    if (typeof value === 'string') {
        return VSBuffer.fromString(value);
    }
    return {
        read: () => {
            const chunk = value.read();
            if (typeof chunk === 'string') {
                return VSBuffer.fromString(chunk);
            }
            return null;
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dGZpbGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFPaEcsT0FBTyxFQUF1RSxrQkFBa0IsRUFBZ0UsTUFBTSw0Q0FBNEMsQ0FBQztBQUNuTixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHN0YsT0FBTyxFQUFFLFFBQVEsRUFBNEMsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RyxPQUFPLEVBQUUsWUFBWSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFPbkYsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsZUFBZSxDQUFtQixpQkFBaUIsQ0FBQyxDQUFDO0FBZ0tyRixNQUFNLENBQU4sSUFBa0IsdUJBRWpCO0FBRkQsV0FBa0IsdUJBQXVCO0lBQ3hDLHlGQUFjLENBQUE7QUFDZixDQUFDLEVBRmlCLHVCQUF1QixLQUF2Qix1QkFBdUIsUUFFeEM7QUFFRCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsa0JBQWtCO0lBRTdELE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxHQUFZO1FBQzNDLE9BQU8sR0FBRyxZQUFZLEtBQUssSUFBSSxDQUFDLGlCQUFpQixDQUFFLEdBQThCLENBQUMsdUJBQXVCLENBQUMsQ0FBQztJQUM1RyxDQUFDO0lBSUQsWUFDQyxPQUFlLEVBQ1IsdUJBQWdELEVBQ3ZELE9BQXNEO1FBRXRELEtBQUssQ0FBQyxPQUFPLGdEQUF1QyxDQUFDO1FBSDlDLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBeUI7UUFLdkQsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDeEIsQ0FBQztDQUNEO0FBdUJEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLHdCQWlDakI7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