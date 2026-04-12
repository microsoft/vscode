/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { convertLinkRangeToBuffer, getXtermLineContent } from './terminalLinkHelpers.js';
export class TerminalExternalLinkDetector {
    constructor(id, xterm, _provideLinks) {
        this.id = id;
        this.xterm = xterm;
        this._provideLinks = _provideLinks;
        this.maxLinkLength = 2000;
    }
    async detect(lines, startLine, endLine) {
        // Get the text representation of the wrapped line
        const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
        if (text === '' || text.length > this.maxLinkLength) {
            return [];
        }
        const externalLinks = await this._provideLinks(text);
        if (!externalLinks) {
            return [];
        }
        const result = externalLinks.map(link => {
            const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
                startColumn: link.startIndex + 1,
                startLineNumber: 1,
                endColumn: link.startIndex + link.length + 1,
                endLineNumber: 1
            }, startLine);
            const matchingText = text.substring(link.startIndex, link.startIndex + link.length) || '';
            const l = {
                text: matchingText,
                label: link.label,
                bufferRange,
                type: { id: this.id },
                activate: link.activate
            };
            return l;
        });
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFeHRlcm5hbExpbmtEZXRlY3Rvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy9icm93c2VyL3Rlcm1pbmFsRXh0ZXJuYWxMaW5rRGV0ZWN0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFJekYsTUFBTSxPQUFPLDRCQUE0QjtJQUd4QyxZQUNVLEVBQVUsRUFDVixLQUFlLEVBQ1AsYUFBMEU7UUFGbEYsT0FBRSxHQUFGLEVBQUUsQ0FBUTtRQUNWLFVBQUssR0FBTCxLQUFLLENBQVU7UUFDUCxrQkFBYSxHQUFiLGFBQWEsQ0FBNkQ7UUFMbkYsa0JBQWEsR0FBRyxJQUFJLENBQUM7SUFPOUIsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBb0IsRUFBRSxTQUFpQixFQUFFLE9BQWU7UUFDcEUsa0RBQWtEO1FBQ2xELE1BQU0sSUFBSSxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEcsSUFBSSxJQUFJLEtBQUssRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3JELE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDcEIsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUN2QyxNQUFNLFdBQVcsR0FBRyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUU7Z0JBQ3BFLFdBQVcsRUFBRSxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUM7Z0JBQ2hDLGVBQWUsRUFBRSxDQUFDO2dCQUNsQixTQUFTLEVBQUUsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUM7Z0JBQzVDLGFBQWEsRUFBRSxDQUFDO2FBQ2hCLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDZCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBRTFGLE1BQU0sQ0FBQyxHQUF3QjtnQkFDOUIsSUFBSSxFQUFFLFlBQVk7Z0JBQ2xCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDakIsV0FBVztnQkFDWCxJQUFJLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRTtnQkFDckIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO2FBQ3ZCLENBQUM7WUFDRixPQUFPLENBQUMsQ0FBQztRQUNWLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0NBQ0QifQ==