/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../../editor/common/core/range.js';
import { PieceTreeTextBufferBuilder } from '../../../../editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { SearchParams } from '../../../../editor/common/model/textModelSearch.js';
export class CellSearchModel extends Disposable {
    constructor(_source, _inputTextBuffer, _outputs) {
        super();
        this._source = _source;
        this._inputTextBuffer = _inputTextBuffer;
        this._outputs = _outputs;
        this._outputTextBuffers = undefined;
    }
    _getFullModelRange(buffer) {
        const lineCount = buffer.getLineCount();
        return new Range(1, 1, lineCount, this._getLineMaxColumn(buffer, lineCount));
    }
    _getLineMaxColumn(buffer, lineNumber) {
        if (lineNumber < 1 || lineNumber > buffer.getLineCount()) {
            throw new Error('Illegal value for lineNumber');
        }
        return buffer.getLineLength(lineNumber) + 1;
    }
    get inputTextBuffer() {
        if (!this._inputTextBuffer) {
            const builder = new PieceTreeTextBufferBuilder();
            builder.acceptChunk(this._source);
            const bufferFactory = builder.finish(true);
            const { textBuffer, disposable } = bufferFactory.create(1 /* DefaultEndOfLine.LF */);
            this._inputTextBuffer = textBuffer;
            this._register(disposable);
        }
        return this._inputTextBuffer;
    }
    get outputTextBuffers() {
        if (!this._outputTextBuffers) {
            this._outputTextBuffers = this._outputs.map((output) => {
                const builder = new PieceTreeTextBufferBuilder();
                builder.acceptChunk(output);
                const bufferFactory = builder.finish(true);
                const { textBuffer, disposable } = bufferFactory.create(1 /* DefaultEndOfLine.LF */);
                this._register(disposable);
                return textBuffer;
            });
        }
        return this._outputTextBuffers;
    }
    findInInputs(target) {
        const searchParams = new SearchParams(target, false, false, null);
        const searchData = searchParams.parseSearchRequest();
        if (!searchData) {
            return [];
        }
        const fullInputRange = this._getFullModelRange(this.inputTextBuffer);
        return this.inputTextBuffer.findMatchesLineByLine(fullInputRange, searchData, true, 5000);
    }
    findInOutputs(target) {
        const searchParams = new SearchParams(target, false, false, null);
        const searchData = searchParams.parseSearchRequest();
        if (!searchData) {
            return [];
        }
        return this.outputTextBuffers.map(buffer => {
            const matches = buffer.findMatchesLineByLine(this._getFullModelRange(buffer), searchData, true, 5000);
            if (matches.length === 0) {
                return undefined;
            }
            return {
                textBuffer: buffer,
                matches
            };
        }).filter((item) => !!item);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbFNlYXJjaE1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9jZWxsU2VhcmNoTW9kZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVoRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtRkFBbUYsQ0FBQztBQUMvSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFPbEYsTUFBTSxPQUFPLGVBQWdCLFNBQVEsVUFBVTtJQUU5QyxZQUFxQixPQUFlLEVBQVUsZ0JBQWlELEVBQVUsUUFBa0I7UUFDMUgsS0FBSyxFQUFFLENBQUM7UUFEWSxZQUFPLEdBQVAsT0FBTyxDQUFRO1FBQVUscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFpQztRQUFVLGFBQVEsR0FBUixRQUFRLENBQVU7UUFEbkgsdUJBQWtCLEdBQXNDLFNBQVMsQ0FBQztJQUcxRSxDQUFDO0lBRU8sa0JBQWtCLENBQUMsTUFBMkI7UUFDckQsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3hDLE9BQU8sSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFFTyxpQkFBaUIsQ0FBQyxNQUEyQixFQUFFLFVBQWtCO1FBQ3hFLElBQUksVUFBVSxHQUFHLENBQUMsSUFBSSxVQUFVLEdBQUcsTUFBTSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUM7WUFDMUQsTUFBTSxJQUFJLEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFRCxJQUFJLGVBQWU7UUFDbEIsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzVCLE1BQU0sT0FBTyxHQUFHLElBQUksMEJBQTBCLEVBQUUsQ0FBQztZQUNqRCxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNsQyxNQUFNLGFBQWEsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzNDLE1BQU0sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEdBQUcsYUFBYSxDQUFDLE1BQU0sNkJBQXFCLENBQUM7WUFDN0UsSUFBSSxDQUFDLGdCQUFnQixHQUFHLFVBQVUsQ0FBQztZQUNuQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUM5QixDQUFDO0lBRUQsSUFBSSxpQkFBaUI7UUFDcEIsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO2dCQUN0RCxNQUFNLE9BQU8sR0FBRyxJQUFJLDBCQUEwQixFQUFFLENBQUM7Z0JBQ2pELE9BQU8sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzVCLE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzNDLE1BQU0sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEdBQUcsYUFBYSxDQUFDLE1BQU0sNkJBQXFCLENBQUM7Z0JBQzdFLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQzNCLE9BQU8sVUFBVSxDQUFDO1lBQ25CLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDO0lBQ2hDLENBQUM7SUFFRCxZQUFZLENBQUMsTUFBYztRQUMxQixNQUFNLFlBQVksR0FBRyxJQUFJLFlBQVksQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRSxNQUFNLFVBQVUsR0FBRyxZQUFZLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUNyRCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDakIsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBQ0QsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRSxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMscUJBQXFCLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDM0YsQ0FBQztJQUVELGFBQWEsQ0FBQyxNQUFjO1FBQzNCLE1BQU0sWUFBWSxHQUFHLElBQUksWUFBWSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2xFLE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ3JELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDMUMsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLHFCQUFxQixDQUMzQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLEVBQy9CLFVBQVUsRUFDVixJQUFJLEVBQ0osSUFBSSxDQUNKLENBQUM7WUFDRixJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLE9BQU8sU0FBUyxDQUFDO1lBQ2xCLENBQUM7WUFDRCxPQUFPO2dCQUNOLFVBQVUsRUFBRSxNQUFNO2dCQUNsQixPQUFPO2FBQ1AsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBOEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN6RCxDQUFDO0NBQ0QifQ==