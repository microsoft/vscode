/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { StringEdit, StringReplacement } from '../edits/stringEdit.js';
import { TextEdit, TextReplacement } from '../edits/textEdit.js';
import { _setPositionOffsetTransformerDependencies } from './positionToOffsetImpl.js';
import { TextLength } from './textLength.js';
export { PositionOffsetTransformerBase, PositionOffsetTransformer } from './positionToOffsetImpl.js';
_setPositionOffsetTransformerDependencies({
    StringEdit: StringEdit,
    StringReplacement: StringReplacement,
    TextReplacement: TextReplacement,
    TextEdit: TextEdit,
    TextLength: TextLength,
});
// TODO@hediet this is dept and needs to go. See https://github.com/microsoft/vscode/issues/251126.
export function ensureDependenciesAreSet() {
    // Noop
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9zaXRpb25Ub09mZnNldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vY29yZS90ZXh0L3Bvc2l0aW9uVG9PZmZzZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDakUsT0FBTyxFQUFFLHlDQUF5QyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDdEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRTdDLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRXJHLHlDQUF5QyxDQUFDO0lBQ3pDLFVBQVUsRUFBRSxVQUFVO0lBQ3RCLGlCQUFpQixFQUFFLGlCQUFpQjtJQUNwQyxlQUFlLEVBQUUsZUFBZTtJQUNoQyxRQUFRLEVBQUUsUUFBUTtJQUNsQixVQUFVLEVBQUUsVUFBVTtDQUN0QixDQUFDLENBQUM7QUFFSCxtR0FBbUc7QUFDbkcsTUFBTSxVQUFVLHdCQUF3QjtJQUN2QyxPQUFPO0FBQ1IsQ0FBQyJ9