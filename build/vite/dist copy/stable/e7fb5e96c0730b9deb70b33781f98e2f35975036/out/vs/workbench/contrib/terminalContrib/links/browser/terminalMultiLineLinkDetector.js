/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { convertLinkRangeToBuffer, getXtermLineContent } from './terminalLinkHelpers.js';
import { getTerminalLinkType } from './terminalLocalLinkDetector.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
var Constants;
(function (Constants) {
    /**
     * The max line length to try extract word links from.
     */
    Constants[Constants["MaxLineLength"] = 2000] = "MaxLineLength";
    /**
     * The maximum length of a link to resolve against the file system. This limit is put in place
     * to avoid sending excessive data when remote connections are in place.
     */
    Constants[Constants["MaxResolvedLinkLength"] = 1024] = "MaxResolvedLinkLength";
})(Constants || (Constants = {}));
const lineNumberPrefixMatchers = [
    // Ripgrep:
    //   /some/file
    //   16:searchresult
    //   16:    searchresult
    // Eslint:
    //   /some/file
    //     16:5  error ...
    /^ *(?<link>(?<line>\d+):(?<col>\d+)?)/
];
const gitDiffMatchers = [
    // --- a/some/file
    // +++ b/some/file
    // @@ -8,11 +8,11 @@ file content...
    /^(?<link>@@ .+ \+(?<toFileLine>\d+),(?<toFileCount>\d+) @@)/
];
let TerminalMultiLineLinkDetector = class TerminalMultiLineLinkDetector {
    static { this.id = 'multiline'; }
    constructor(xterm, _processManager, _linkResolver, _logService, _uriIdentityService, _workspaceContextService) {
        this.xterm = xterm;
        this._processManager = _processManager;
        this._linkResolver = _linkResolver;
        this._logService = _logService;
        this._uriIdentityService = _uriIdentityService;
        this._workspaceContextService = _workspaceContextService;
        // This was chosen as a reasonable maximum line length given the tradeoff between performance
        // and how likely it is to encounter such a large line length. Some useful reference points:
        // - Window old max length: 260 ($MAX_PATH)
        // - Linux max length: 4096 ($PATH_MAX)
        this.maxLinkLength = 500;
    }
    async detect(lines, startLine, endLine) {
        const links = [];
        // Get the text representation of the wrapped line
        const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
        if (text === '' || text.length > 2000 /* Constants.MaxLineLength */) {
            return [];
        }
        this._logService.trace('terminalMultiLineLinkDetector#detect text', text);
        // Match against the fallback matchers which are mainly designed to catch paths with spaces
        // that aren't possible using the regular mechanism.
        for (const matcher of lineNumberPrefixMatchers) {
            const match = text.match(matcher);
            const group = match?.groups;
            if (!group) {
                continue;
            }
            const link = group?.link;
            const line = group?.line;
            const col = group?.col;
            if (!link || line === undefined) {
                continue;
            }
            // Don't try resolve any links of excessive length
            if (link.length > 1024 /* Constants.MaxResolvedLinkLength */) {
                continue;
            }
            this._logService.trace('terminalMultiLineLinkDetector#detect candidate', link);
            // Scan up looking for the first line that could be a path
            let possiblePath;
            for (let index = startLine - 1; index >= 0; index--) {
                // Ignore lines that aren't at the beginning of a wrapped line
                if (this.xterm.buffer.active.getLine(index).isWrapped) {
                    continue;
                }
                const text = getXtermLineContent(this.xterm.buffer.active, index, index, this.xterm.cols);
                if (!text.match(/^\s*\d/)) {
                    possiblePath = text;
                    break;
                }
            }
            if (!possiblePath) {
                continue;
            }
            // Check if the first non-matching line is an absolute or relative link
            const linkStat = await this._linkResolver.resolveLink(this._processManager, possiblePath);
            if (linkStat) {
                const type = getTerminalLinkType(linkStat.uri, linkStat.isDirectory, this._uriIdentityService, this._workspaceContextService);
                // Convert the entire line's text string index into a wrapped buffer range
                const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
                    startColumn: 1,
                    startLineNumber: 1,
                    endColumn: 1 + text.length,
                    endLineNumber: 1
                }, startLine);
                const simpleLink = {
                    text: link,
                    uri: linkStat.uri,
                    selection: {
                        startLineNumber: parseInt(line),
                        startColumn: col ? parseInt(col) : 1
                    },
                    disableTrimColon: true,
                    bufferRange: bufferRange,
                    type
                };
                this._logService.trace('terminalMultiLineLinkDetector#detect verified link', simpleLink);
                links.push(simpleLink);
                // Break on the first match
                break;
            }
        }
        if (links.length === 0) {
            for (const matcher of gitDiffMatchers) {
                const match = text.match(matcher);
                const group = match?.groups;
                if (!group) {
                    continue;
                }
                const link = group?.link;
                const toFileLine = group?.toFileLine;
                const toFileCount = group?.toFileCount;
                if (!link || toFileLine === undefined) {
                    continue;
                }
                // Don't try resolve any links of excessive length
                if (link.length > 1024 /* Constants.MaxResolvedLinkLength */) {
                    continue;
                }
                this._logService.trace('terminalMultiLineLinkDetector#detect candidate', link);
                // Scan up looking for the first line that could be a path
                let possiblePath;
                for (let index = startLine - 1; index >= 0; index--) {
                    // Ignore lines that aren't at the beginning of a wrapped line
                    if (this.xterm.buffer.active.getLine(index).isWrapped) {
                        continue;
                    }
                    const text = getXtermLineContent(this.xterm.buffer.active, index, index, this.xterm.cols);
                    const match = text.match(/\+\+\+ b\/(?<path>.+)/);
                    if (match) {
                        possiblePath = match.groups?.path;
                        break;
                    }
                }
                if (!possiblePath) {
                    continue;
                }
                // Check if the first non-matching line is an absolute or relative link
                const linkStat = await this._linkResolver.resolveLink(this._processManager, possiblePath);
                if (linkStat) {
                    const type = getTerminalLinkType(linkStat.uri, linkStat.isDirectory, this._uriIdentityService, this._workspaceContextService);
                    // Convert the link to the buffer range
                    const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
                        startColumn: 1,
                        startLineNumber: 1,
                        endColumn: 1 + link.length,
                        endLineNumber: 1
                    }, startLine);
                    const simpleLink = {
                        text: link,
                        uri: linkStat.uri,
                        selection: {
                            startLineNumber: parseInt(toFileLine),
                            startColumn: 1,
                            endLineNumber: parseInt(toFileLine) + parseInt(toFileCount)
                        },
                        bufferRange: bufferRange,
                        type
                    };
                    this._logService.trace('terminalMultiLineLinkDetector#detect verified link', simpleLink);
                    links.push(simpleLink);
                    // Break on the first match
                    break;
                }
            }
        }
        return links;
    }
};
TerminalMultiLineLinkDetector = __decorate([
    __param(3, ITerminalLogService),
    __param(4, IUriIdentityService),
    __param(5, IWorkspaceContextService)
], TerminalMultiLineLinkDetector);
export { TerminalMultiLineLinkDetector };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvbGlua3MvYnJvd3Nlci90ZXJtaW5hbE11bHRpTGluZUxpbmtEZXRlY3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVqRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN6RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUdyRSxPQUFPLEVBQW9CLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFNUcsSUFBVyxTQVdWO0FBWEQsV0FBVyxTQUFTO0lBQ25COztPQUVHO0lBQ0gsOERBQW9CLENBQUE7SUFFcEI7OztPQUdHO0lBQ0gsOEVBQTRCLENBQUE7QUFDN0IsQ0FBQyxFQVhVLFNBQVMsS0FBVCxTQUFTLFFBV25CO0FBRUQsTUFBTSx3QkFBd0IsR0FBRztJQUNoQyxXQUFXO0lBQ1gsZUFBZTtJQUNmLG9CQUFvQjtJQUNwQix3QkFBd0I7SUFDeEIsVUFBVTtJQUNWLGVBQWU7SUFDZixzQkFBc0I7SUFDdEIsdUNBQXVDO0NBQ3ZDLENBQUM7QUFFRixNQUFNLGVBQWUsR0FBRztJQUN2QixrQkFBa0I7SUFDbEIsa0JBQWtCO0lBQ2xCLG9DQUFvQztJQUNwQyw2REFBNkQ7Q0FDN0QsQ0FBQztBQUVLLElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQTZCO2FBQ2xDLE9BQUUsR0FBRyxXQUFXLEFBQWQsQ0FBZTtJQVF4QixZQUNVLEtBQWUsRUFDUCxlQUF5SixFQUN6SixhQUFvQyxFQUNoQyxXQUFpRCxFQUNqRCxtQkFBeUQsRUFDcEQsd0JBQW1FO1FBTHBGLFVBQUssR0FBTCxLQUFLLENBQVU7UUFDUCxvQkFBZSxHQUFmLGVBQWUsQ0FBMEk7UUFDekosa0JBQWEsR0FBYixhQUFhLENBQXVCO1FBQ2YsZ0JBQVcsR0FBWCxXQUFXLENBQXFCO1FBQ2hDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDbkMsNkJBQXdCLEdBQXhCLHdCQUF3QixDQUEwQjtRQVo5Riw2RkFBNkY7UUFDN0YsNEZBQTRGO1FBQzVGLDJDQUEyQztRQUMzQyx1Q0FBdUM7UUFDOUIsa0JBQWEsR0FBRyxHQUFHLENBQUM7SUFVN0IsQ0FBQztJQUVELEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBb0IsRUFBRSxTQUFpQixFQUFFLE9BQWU7UUFDcEUsTUFBTSxLQUFLLEdBQTBCLEVBQUUsQ0FBQztRQUV4QyxrREFBa0Q7UUFDbEQsTUFBTSxJQUFJLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRyxJQUFJLElBQUksS0FBSyxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0scUNBQTBCLEVBQUUsQ0FBQztZQUMxRCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUxRSwyRkFBMkY7UUFDM0Ysb0RBQW9EO1FBQ3BELEtBQUssTUFBTSxPQUFPLElBQUksd0JBQXdCLEVBQUUsQ0FBQztZQUNoRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xDLE1BQU0sS0FBSyxHQUFHLEtBQUssRUFBRSxNQUFNLENBQUM7WUFDNUIsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNaLFNBQVM7WUFDVixDQUFDO1lBQ0QsTUFBTSxJQUFJLEdBQUcsS0FBSyxFQUFFLElBQUksQ0FBQztZQUN6QixNQUFNLElBQUksR0FBRyxLQUFLLEVBQUUsSUFBSSxDQUFDO1lBQ3pCLE1BQU0sR0FBRyxHQUFHLEtBQUssRUFBRSxHQUFHLENBQUM7WUFDdkIsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ2pDLFNBQVM7WUFDVixDQUFDO1lBRUQsa0RBQWtEO1lBQ2xELElBQUksSUFBSSxDQUFDLE1BQU0sNkNBQWtDLEVBQUUsQ0FBQztnQkFDbkQsU0FBUztZQUNWLENBQUM7WUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxnREFBZ0QsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUUvRSwwREFBMEQ7WUFDMUQsSUFBSSxZQUFnQyxDQUFDO1lBQ3JDLEtBQUssSUFBSSxLQUFLLEdBQUcsU0FBUyxHQUFHLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7Z0JBQ3JELDhEQUE4RDtnQkFDOUQsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBRSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUN4RCxTQUFTO2dCQUNWLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDMUYsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztvQkFDM0IsWUFBWSxHQUFHLElBQUksQ0FBQztvQkFDcEIsTUFBTTtnQkFDUCxDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztnQkFDbkIsU0FBUztZQUNWLENBQUM7WUFFRCx1RUFBdUU7WUFDdkUsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQzFGLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2QsTUFBTSxJQUFJLEdBQUcsbUJBQW1CLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztnQkFFOUgsMEVBQTBFO2dCQUMxRSxNQUFNLFdBQVcsR0FBRyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUU7b0JBQ3BFLFdBQVcsRUFBRSxDQUFDO29CQUNkLGVBQWUsRUFBRSxDQUFDO29CQUNsQixTQUFTLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNO29CQUMxQixhQUFhLEVBQUUsQ0FBQztpQkFDaEIsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFFZCxNQUFNLFVBQVUsR0FBd0I7b0JBQ3ZDLElBQUksRUFBRSxJQUFJO29CQUNWLEdBQUcsRUFBRSxRQUFRLENBQUMsR0FBRztvQkFDakIsU0FBUyxFQUFFO3dCQUNWLGVBQWUsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDO3dCQUMvQixXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7cUJBQ3BDO29CQUNELGdCQUFnQixFQUFFLElBQUk7b0JBQ3RCLFdBQVcsRUFBRSxXQUFXO29CQUN4QixJQUFJO2lCQUNKLENBQUM7Z0JBQ0YsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsb0RBQW9ELEVBQUUsVUFBVSxDQUFDLENBQUM7Z0JBQ3pGLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBRXZCLDJCQUEyQjtnQkFDM0IsTUFBTTtZQUNQLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3hCLEtBQUssTUFBTSxPQUFPLElBQUksZUFBZSxFQUFFLENBQUM7Z0JBQ3ZDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ2xDLE1BQU0sS0FBSyxHQUFHLEtBQUssRUFBRSxNQUFNLENBQUM7Z0JBQzVCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDWixTQUFTO2dCQUNWLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEdBQUcsS0FBSyxFQUFFLElBQUksQ0FBQztnQkFDekIsTUFBTSxVQUFVLEdBQUcsS0FBSyxFQUFFLFVBQVUsQ0FBQztnQkFDckMsTUFBTSxXQUFXLEdBQUcsS0FBSyxFQUFFLFdBQVcsQ0FBQztnQkFDdkMsSUFBSSxDQUFDLElBQUksSUFBSSxVQUFVLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQ3ZDLFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCxrREFBa0Q7Z0JBQ2xELElBQUksSUFBSSxDQUFDLE1BQU0sNkNBQWtDLEVBQUUsQ0FBQztvQkFDbkQsU0FBUztnQkFDVixDQUFDO2dCQUVELElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLGdEQUFnRCxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUcvRSwwREFBMEQ7Z0JBQzFELElBQUksWUFBZ0MsQ0FBQztnQkFDckMsS0FBSyxJQUFJLEtBQUssR0FBRyxTQUFTLEdBQUcsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQztvQkFDckQsOERBQThEO29CQUM5RCxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFFLENBQUMsU0FBUyxFQUFFLENBQUM7d0JBQ3hELFNBQVM7b0JBQ1YsQ0FBQztvQkFDRCxNQUFNLElBQUksR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUMxRixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7b0JBQ2xELElBQUksS0FBSyxFQUFFLENBQUM7d0JBQ1gsWUFBWSxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDO3dCQUNsQyxNQUFNO29CQUNQLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBQ25CLFNBQVM7Z0JBQ1YsQ0FBQztnQkFFRCx1RUFBdUU7Z0JBQ3ZFLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxZQUFZLENBQUMsQ0FBQztnQkFDMUYsSUFBSSxRQUFRLEVBQUUsQ0FBQztvQkFDZCxNQUFNLElBQUksR0FBRyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixFQUFFLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO29CQUU5SCx1Q0FBdUM7b0JBQ3ZDLE1BQU0sV0FBVyxHQUFHLHdCQUF3QixDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRTt3QkFDcEUsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxFQUFFLENBQUM7d0JBQ2xCLFNBQVMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLE1BQU07d0JBQzFCLGFBQWEsRUFBRSxDQUFDO3FCQUNoQixFQUFFLFNBQVMsQ0FBQyxDQUFDO29CQUVkLE1BQU0sVUFBVSxHQUF3Qjt3QkFDdkMsSUFBSSxFQUFFLElBQUk7d0JBQ1YsR0FBRyxFQUFFLFFBQVEsQ0FBQyxHQUFHO3dCQUNqQixTQUFTLEVBQUU7NEJBQ1YsZUFBZSxFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUM7NEJBQ3JDLFdBQVcsRUFBRSxDQUFDOzRCQUNkLGFBQWEsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQzt5QkFDM0Q7d0JBQ0QsV0FBVyxFQUFFLFdBQVc7d0JBQ3hCLElBQUk7cUJBQ0osQ0FBQztvQkFDRixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxvREFBb0QsRUFBRSxVQUFVLENBQUMsQ0FBQztvQkFDekYsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFFdkIsMkJBQTJCO29CQUMzQixNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQzs7QUEvS1csNkJBQTZCO0lBYXZDLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLHdCQUF3QixDQUFBO0dBZmQsNkJBQTZCLENBZ0x6QyJ9