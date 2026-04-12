/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// First group matches a double quoted string
// Second group matches a single quoted string
// Third group matches a multi line comment
// Forth group matches a single line comment
// Fifth group matches a trailing comma
const regexp = /("[^"\\]*(?:\\.[^"\\]*)*")|('[^'\\]*(?:\\.[^'\\]*)*')|(\/\*[^\/\*]*(?:(?:\*|\/)[^\/\*]*)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))|(,\s*[}\]])/g;
/**
 * Strips single and multi line JavaScript comments from JSON
 * content. Ignores characters in strings BUT doesn't support
 * string continuation across multiple lines since it is not
 * supported in JSON.
 *
 * @param content the content to strip comments from
 * @returns the content without comments
*/
export function stripComments(content) {
    return content.replace(regexp, function (match, _m1, _m2, m3, m4, m5) {
        // Only one of m1, m2, m3, m4, m5 matches
        if (m3) {
            // A block comment. Replace with nothing
            return '';
        }
        else if (m4) {
            // Since m4 is a single line comment is is at least of length 2 (e.g. //)
            // If it ends in \r?\n then keep it.
            const length = m4.length;
            if (m4[length - 1] === '\n') {
                return m4[length - 2] === '\r' ? '\r\n' : '\n';
            }
            else {
                return '';
            }
        }
        else if (m5) {
            // Remove the trailing comma
            return match.substring(1);
        }
        else {
            // We match a string
            return match;
        }
    });
}
/**
 * A drop-in replacement for JSON.parse that can parse
 * JSON with comments and trailing commas.
 *
 * @param content the content to strip comments from
 * @returns the parsed content as JSON
*/
export function parse(content) {
    const commentsStripped = stripComments(content);
    try {
        return JSON.parse(commentsStripped);
    }
    catch (error) {
        const trailingCommasStriped = commentsStripped.replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(trailingCommasStriped);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianNvbmMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9qc29uYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyw2Q0FBNkM7QUFDN0MsOENBQThDO0FBQzlDLDJDQUEyQztBQUMzQyw0Q0FBNEM7QUFDNUMsdUNBQXVDO0FBQ3ZDLE1BQU0sTUFBTSxHQUFHLHlJQUF5SSxDQUFDO0FBRXpKOzs7Ozs7OztFQVFFO0FBQ0YsTUFBTSxVQUFVLGFBQWEsQ0FBQyxPQUFlO0lBQzVDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7UUFDbkUseUNBQXlDO1FBQ3pDLElBQUksRUFBRSxFQUFFLENBQUM7WUFDUix3Q0FBd0M7WUFDeEMsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO2FBQU0sSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUNmLHlFQUF5RTtZQUN6RSxvQ0FBb0M7WUFDcEMsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUN6QixJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sRUFBRSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ2hELENBQUM7aUJBQ0ksQ0FBQztnQkFDTCxPQUFPLEVBQUUsQ0FBQztZQUNYLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUNmLDRCQUE0QjtZQUM1QixPQUFPLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0IsQ0FBQzthQUFNLENBQUM7WUFDUCxvQkFBb0I7WUFDcEIsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQ7Ozs7OztFQU1FO0FBQ0YsTUFBTSxVQUFVLEtBQUssQ0FBSSxPQUFlO0lBQ3ZDLE1BQU0sZ0JBQWdCLEdBQUcsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBRWhELElBQUksQ0FBQztRQUNKLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2hCLE1BQU0scUJBQXFCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RSxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUMxQyxDQUFDO0FBQ0YsQ0FBQyJ9