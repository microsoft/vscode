/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var StringEOL;
(function (StringEOL) {
    StringEOL[StringEOL["Unknown"] = 0] = "Unknown";
    StringEOL[StringEOL["Invalid"] = 3] = "Invalid";
    StringEOL[StringEOL["LF"] = 1] = "LF";
    StringEOL[StringEOL["CRLF"] = 2] = "CRLF";
})(StringEOL || (StringEOL = {}));
export function countEOL(text) {
    let eolCount = 0;
    let firstLineLength = 0;
    let lastLineStart = 0;
    let eol = 0 /* StringEOL.Unknown */;
    for (let i = 0, len = text.length; i < len; i++) {
        const chr = text.charCodeAt(i);
        if (chr === 13 /* CharCode.CarriageReturn */) {
            if (eolCount === 0) {
                firstLineLength = i;
            }
            eolCount++;
            if (i + 1 < len && text.charCodeAt(i + 1) === 10 /* CharCode.LineFeed */) {
                // \r\n... case
                eol |= 2 /* StringEOL.CRLF */;
                i++; // skip \n
            }
            else {
                // \r... case
                eol |= 3 /* StringEOL.Invalid */;
            }
            lastLineStart = i + 1;
        }
        else if (chr === 10 /* CharCode.LineFeed */) {
            // \n... case
            eol |= 1 /* StringEOL.LF */;
            if (eolCount === 0) {
                firstLineLength = i;
            }
            eolCount++;
            lastLineStart = i + 1;
        }
    }
    if (eolCount === 0) {
        firstLineLength = text.length;
    }
    return [eolCount, firstLineLength, text.length - lastLineStart, eol];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW9sQ291bnRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vY29yZS9taXNjL2VvbENvdW50ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsTUFBTSxDQUFOLElBQWtCLFNBS2pCO0FBTEQsV0FBa0IsU0FBUztJQUMxQiwrQ0FBVyxDQUFBO0lBQ1gsK0NBQVcsQ0FBQTtJQUNYLHFDQUFNLENBQUE7SUFDTix5Q0FBUSxDQUFBO0FBQ1QsQ0FBQyxFQUxpQixTQUFTLEtBQVQsU0FBUyxRQUsxQjtBQUVELE1BQU0sVUFBVSxRQUFRLENBQUMsSUFBWTtJQUNwQyxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFDakIsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDO0lBQ3hCLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztJQUN0QixJQUFJLEdBQUcsNEJBQStCLENBQUM7SUFDdkMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ2pELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0IsSUFBSSxHQUFHLHFDQUE0QixFQUFFLENBQUM7WUFDckMsSUFBSSxRQUFRLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3BCLGVBQWUsR0FBRyxDQUFDLENBQUM7WUFDckIsQ0FBQztZQUNELFFBQVEsRUFBRSxDQUFDO1lBQ1gsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsK0JBQXNCLEVBQUUsQ0FBQztnQkFDakUsZUFBZTtnQkFDZixHQUFHLDBCQUFrQixDQUFDO2dCQUN0QixDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVU7WUFDaEIsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLGFBQWE7Z0JBQ2IsR0FBRyw2QkFBcUIsQ0FBQztZQUMxQixDQUFDO1lBQ0QsYUFBYSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkIsQ0FBQzthQUFNLElBQUksR0FBRywrQkFBc0IsRUFBRSxDQUFDO1lBQ3RDLGFBQWE7WUFDYixHQUFHLHdCQUFnQixDQUFDO1lBQ3BCLElBQUksUUFBUSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNwQixlQUFlLEdBQUcsQ0FBQyxDQUFDO1lBQ3JCLENBQUM7WUFDRCxRQUFRLEVBQUUsQ0FBQztZQUNYLGFBQWEsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZCLENBQUM7SUFDRixDQUFDO0lBQ0QsSUFBSSxRQUFRLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDcEIsZUFBZSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDL0IsQ0FBQztJQUNELE9BQU8sQ0FBQyxRQUFRLEVBQUUsZUFBZSxFQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsYUFBYSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ3RFLENBQUMifQ==