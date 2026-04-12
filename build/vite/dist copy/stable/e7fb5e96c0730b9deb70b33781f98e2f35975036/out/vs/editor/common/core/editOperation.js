/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from './range.js';
export class EditOperation {
    static insert(position, text) {
        return {
            range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: text,
            forceMoveMarkers: true
        };
    }
    static delete(range) {
        return {
            range: range,
            text: null
        };
    }
    static replace(range, text) {
        return {
            range: range,
            text: text
        };
    }
    static replaceMove(range, text) {
        return {
            range: range,
            text: text,
            forceMoveMarkers: true
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdE9wZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFzQjNDLE1BQU0sT0FBTyxhQUFhO0lBRWxCLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBa0IsRUFBRSxJQUFZO1FBQ3BELE9BQU87WUFDTixLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxVQUFVLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUM1RixJQUFJLEVBQUUsSUFBSTtZQUNWLGdCQUFnQixFQUFFLElBQUk7U0FDdEIsQ0FBQztJQUNILENBQUM7SUFFTSxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQVk7UUFDaEMsT0FBTztZQUNOLEtBQUssRUFBRSxLQUFLO1lBQ1osSUFBSSxFQUFFLElBQUk7U0FDVixDQUFDO0lBQ0gsQ0FBQztJQUVNLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBWSxFQUFFLElBQW1CO1FBQ3RELE9BQU87WUFDTixLQUFLLEVBQUUsS0FBSztZQUNaLElBQUksRUFBRSxJQUFJO1NBQ1YsQ0FBQztJQUNILENBQUM7SUFFTSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQVksRUFBRSxJQUFtQjtRQUMxRCxPQUFPO1lBQ04sS0FBSyxFQUFFLEtBQUs7WUFDWixJQUFJLEVBQUUsSUFBSTtZQUNWLGdCQUFnQixFQUFFLElBQUk7U0FDdEIsQ0FBQztJQUNILENBQUM7Q0FDRCJ9