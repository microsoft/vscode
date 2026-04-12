/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
/**
 * Resolves a URI from tool input. Accepts either a full URI string or a
 * workspace-relative file path.
 */
export function resolveToolUri(input, workspaceContextService) {
    if (input.uri) {
        return URI.parse(input.uri);
    }
    if (input.filePath) {
        const folders = workspaceContextService.getWorkspace().folders;
        if (folders.length === 1) {
            return folders[0].toResource(input.filePath);
        }
        // try each folder, return the first
        for (const folder of folders) {
            return folder.toResource(input.filePath);
        }
    }
    return undefined;
}
/**
 * Finds the line number in the model that matches the given line content.
 * Whitespace is normalized so that extra spaces in the input still match.
 *
 * @returns The 1-based line number, or `undefined` if not found.
 */
export function findLineNumber(model, lineContent) {
    const parts = lineContent.trim().split(/\s+/);
    const pattern = parts.map(escapeRegExpCharacters).join('\\s+');
    const matches = model.findMatches(pattern, false, true, false, null, false, 1);
    if (matches.length === 0) {
        return undefined;
    }
    return matches[0].range.startLineNumber;
}
/**
 * Finds the 1-based column of a symbol within a line of text using word
 * boundary matching.
 *
 * @returns The 1-based column, or `undefined` if not found.
 */
export function findSymbolColumn(lineText, symbol) {
    const pattern = new RegExp(`\\b${escapeRegExpCharacters(symbol)}\\b`);
    const match = pattern.exec(lineText);
    if (match) {
        return match.index + 1; // 1-based column
    }
    return undefined;
}
/**
 * Creates an error tool result with the given message as both the content
 * and the tool result message.
 */
export function errorResult(message) {
    const result = createToolSimpleTextResult(message);
    result.toolResultMessage = new MarkdownString(message);
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbEhlbHBlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdG9vbHMvdG9vbEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUl4RCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQVM1Rjs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsY0FBYyxDQUFDLEtBQXVCLEVBQUUsdUJBQWlEO0lBQ3hHLElBQUksS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ2YsT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBQ0QsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDcEIsTUFBTSxPQUFPLEdBQUcsdUJBQXVCLENBQUMsWUFBWSxFQUFFLENBQUMsT0FBTyxDQUFDO1FBQy9ELElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMxQixPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFDRCxvQ0FBb0M7UUFDcEMsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUM5QixPQUFPLE1BQU0sQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQztBQUVEOzs7OztHQUtHO0FBQ0gsTUFBTSxVQUFVLGNBQWMsQ0FBQyxLQUFpQixFQUFFLFdBQW1CO0lBQ3BFLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDOUMsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUMvRCxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9FLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMxQixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBQ0QsT0FBTyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQztBQUN6QyxDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsUUFBZ0IsRUFBRSxNQUFjO0lBQ2hFLE1BQU0sT0FBTyxHQUFHLElBQUksTUFBTSxDQUFDLE1BQU0sc0JBQXNCLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3RFLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDckMsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNYLE9BQU8sS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxpQkFBaUI7SUFDMUMsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ2xCLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsV0FBVyxDQUFDLE9BQWU7SUFDMUMsTUFBTSxNQUFNLEdBQUcsMEJBQTBCLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbkQsTUFBTSxDQUFDLGlCQUFpQixHQUFHLElBQUksY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQyJ9