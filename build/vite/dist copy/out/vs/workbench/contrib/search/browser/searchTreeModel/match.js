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
import { memoize } from '../../../../../base/common/decorators.js';
import { lcut } from '../../../../../base/common/strings.js';
import { OneLineRange } from '../../../../services/search/common/search.js';
import { MATCH_PREFIX } from './searchTreeCommon.js';
import { Range } from '../../../../../editor/common/core/range.js';
export function textSearchResultToMatches(rawMatch, fileMatch, isAiContributed) {
    const previewLines = rawMatch.previewText.split('\n');
    return rawMatch.rangeLocations.map((rangeLocation) => {
        const previewRange = rangeLocation.preview;
        return new MatchImpl(fileMatch, previewLines, previewRange, rangeLocation.source, isAiContributed);
    });
}
export class MatchImpl {
    static { this.MAX_PREVIEW_CHARS = 250; }
    constructor(_parent, _fullPreviewLines, _fullPreviewRange, _documentRange, _isReadonly = false) {
        this._parent = _parent;
        this._fullPreviewLines = _fullPreviewLines;
        this._isReadonly = _isReadonly;
        this._oneLinePreviewText = _fullPreviewLines[_fullPreviewRange.startLineNumber];
        const adjustedEndCol = _fullPreviewRange.startLineNumber === _fullPreviewRange.endLineNumber ?
            _fullPreviewRange.endColumn :
            this._oneLinePreviewText.length;
        this._rangeInPreviewText = new OneLineRange(1, _fullPreviewRange.startColumn + 1, adjustedEndCol + 1);
        this._range = new Range(_documentRange.startLineNumber + 1, _documentRange.startColumn + 1, _documentRange.endLineNumber + 1, _documentRange.endColumn + 1);
        this._fullPreviewRange = _fullPreviewRange;
        this._id = MATCH_PREFIX + this._parent.resource.toString() + '>' + this._range + this.getMatchString();
    }
    id() {
        return this._id;
    }
    parent() {
        return this._parent;
    }
    text() {
        return this._oneLinePreviewText;
    }
    range() {
        return this._range;
    }
    preview() {
        const fullBefore = this._oneLinePreviewText.substring(0, this._rangeInPreviewText.startColumn - 1), before = lcut(fullBefore, 26, '…');
        let inside = this.getMatchString(), after = this._oneLinePreviewText.substring(this._rangeInPreviewText.endColumn - 1);
        let charsRemaining = MatchImpl.MAX_PREVIEW_CHARS - before.length;
        inside = inside.substr(0, charsRemaining);
        charsRemaining -= inside.length;
        after = after.substr(0, charsRemaining);
        return {
            before,
            fullBefore,
            inside,
            after,
        };
    }
    get replaceString() {
        const searchModel = this.parent().parent().searchModel;
        if (!searchModel.replacePattern) {
            throw new Error('searchModel.replacePattern must be set before accessing replaceString');
        }
        const fullMatchText = this.fullMatchText();
        let replaceString = searchModel.replacePattern.getReplaceString(fullMatchText, searchModel.preserveCase);
        if (replaceString !== null) {
            return replaceString;
        }
        // Search/find normalize line endings - check whether \r prevents regex from matching
        const fullMatchTextWithoutCR = fullMatchText.replace(/\r\n/g, '\n');
        if (fullMatchTextWithoutCR !== fullMatchText) {
            replaceString = searchModel.replacePattern.getReplaceString(fullMatchTextWithoutCR, searchModel.preserveCase);
            if (replaceString !== null) {
                return replaceString;
            }
        }
        // If match string is not matching then regex pattern has a lookahead expression
        const contextMatchTextWithSurroundingContent = this.fullMatchText(true);
        replaceString = searchModel.replacePattern.getReplaceString(contextMatchTextWithSurroundingContent, searchModel.preserveCase);
        if (replaceString !== null) {
            return replaceString;
        }
        // Search/find normalize line endings, this time in full context
        const contextMatchTextWithoutCR = contextMatchTextWithSurroundingContent.replace(/\r\n/g, '\n');
        if (contextMatchTextWithoutCR !== contextMatchTextWithSurroundingContent) {
            replaceString = searchModel.replacePattern.getReplaceString(contextMatchTextWithoutCR, searchModel.preserveCase);
            if (replaceString !== null) {
                return replaceString;
            }
        }
        // Match string is still not matching. Could be unsupported matches (multi-line).
        return searchModel.replacePattern.pattern;
    }
    fullMatchText(includeSurrounding = false) {
        let thisMatchPreviewLines;
        if (includeSurrounding) {
            thisMatchPreviewLines = this._fullPreviewLines;
        }
        else {
            thisMatchPreviewLines = this._fullPreviewLines.slice(this._fullPreviewRange.startLineNumber, this._fullPreviewRange.endLineNumber + 1);
            thisMatchPreviewLines[thisMatchPreviewLines.length - 1] = thisMatchPreviewLines[thisMatchPreviewLines.length - 1].slice(0, this._fullPreviewRange.endColumn);
            thisMatchPreviewLines[0] = thisMatchPreviewLines[0].slice(this._fullPreviewRange.startColumn);
        }
        return thisMatchPreviewLines.join('\n');
    }
    rangeInPreview() {
        // convert to editor's base 1 positions.
        return {
            ...this._fullPreviewRange,
            startColumn: this._fullPreviewRange.startColumn + 1,
            endColumn: this._fullPreviewRange.endColumn + 1
        };
    }
    fullPreviewLines() {
        return this._fullPreviewLines.slice(this._fullPreviewRange.startLineNumber, this._fullPreviewRange.endLineNumber + 1);
    }
    getMatchString() {
        return this._oneLinePreviewText.substring(this._rangeInPreviewText.startColumn - 1, this._rangeInPreviewText.endColumn - 1);
    }
    get isReadonly() {
        return this._isReadonly;
    }
}
__decorate([
    memoize
], MatchImpl.prototype, "preview", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWF0Y2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvbWF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQWtDLFlBQVksRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzVHLE9BQU8sRUFBMEMsWUFBWSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDN0YsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRW5FLE1BQU0sVUFBVSx5QkFBeUIsQ0FBQyxRQUEwQixFQUFFLFNBQStCLEVBQUUsZUFBd0I7SUFDOUgsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEQsT0FBTyxRQUFRLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDLGFBQWEsRUFBRSxFQUFFO1FBQ3BELE1BQU0sWUFBWSxHQUFpQixhQUFhLENBQUMsT0FBTyxDQUFDO1FBQ3pELE9BQU8sSUFBSSxTQUFTLENBQUMsU0FBUyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsYUFBYSxDQUFDLE1BQU0sRUFBRSxlQUFlLENBQUMsQ0FBQztJQUNwRyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLE9BQU8sU0FBUzthQUVHLHNCQUFpQixHQUFHLEdBQUcsQ0FBQztJQVFoRCxZQUFzQixPQUE2QixFQUFVLGlCQUEyQixFQUFFLGlCQUErQixFQUFFLGNBQTRCLEVBQW1CLGNBQXVCLEtBQUs7UUFBaEwsWUFBTyxHQUFQLE9BQU8sQ0FBc0I7UUFBVSxzQkFBaUIsR0FBakIsaUJBQWlCLENBQVU7UUFBa0YsZ0JBQVcsR0FBWCxXQUFXLENBQWlCO1FBQ3JNLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxpQkFBaUIsQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNoRixNQUFNLGNBQWMsR0FBRyxpQkFBaUIsQ0FBQyxlQUFlLEtBQUssaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDN0YsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDN0IsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQztRQUNqQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxZQUFZLENBQUMsQ0FBQyxFQUFFLGlCQUFpQixDQUFDLFdBQVcsR0FBRyxDQUFDLEVBQUUsY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRXRHLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQ3RCLGNBQWMsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxFQUNsQyxjQUFjLENBQUMsV0FBVyxHQUFHLENBQUMsRUFDOUIsY0FBYyxDQUFDLGFBQWEsR0FBRyxDQUFDLEVBQ2hDLGNBQWMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFL0IsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDO1FBRTNDLElBQUksQ0FBQyxHQUFHLEdBQUcsWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUN4RyxDQUFDO0lBRUQsRUFBRTtRQUNELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQztJQUNqQixDQUFDO0lBRUQsTUFBTTtRQUNMLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQztJQUNyQixDQUFDO0lBRUQsSUFBSTtRQUNILE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDO0lBQ2pDLENBQUM7SUFFRCxLQUFLO1FBQ0osT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFHRCxPQUFPO1FBQ04sTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsRUFBRSxNQUFNLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFdkksSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLEtBQUssR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFFdkgsSUFBSSxjQUFjLEdBQUcsU0FBUyxDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDakUsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQzFDLGNBQWMsSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDO1FBQ2hDLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUV4QyxPQUFPO1lBQ04sTUFBTTtZQUNOLFVBQVU7WUFDVixNQUFNO1lBQ04sS0FBSztTQUNMLENBQUM7SUFDSCxDQUFDO0lBRUQsSUFBSSxhQUFhO1FBQ2hCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxXQUFXLENBQUM7UUFDdkQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNqQyxNQUFNLElBQUksS0FBSyxDQUFDLHVFQUF1RSxDQUFDLENBQUM7UUFDMUYsQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUMzQyxJQUFJLGFBQWEsR0FBRyxXQUFXLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDekcsSUFBSSxhQUFhLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDNUIsT0FBTyxhQUFhLENBQUM7UUFDdEIsQ0FBQztRQUVELHFGQUFxRjtRQUNyRixNQUFNLHNCQUFzQixHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BFLElBQUksc0JBQXNCLEtBQUssYUFBYSxFQUFFLENBQUM7WUFDOUMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLEVBQUUsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBQzlHLElBQUksYUFBYSxLQUFLLElBQUksRUFBRSxDQUFDO2dCQUM1QixPQUFPLGFBQWEsQ0FBQztZQUN0QixDQUFDO1FBQ0YsQ0FBQztRQUVELGdGQUFnRjtRQUNoRixNQUFNLHNDQUFzQyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEUsYUFBYSxHQUFHLFdBQVcsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsc0NBQXNDLEVBQUUsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzlILElBQUksYUFBYSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQzVCLE9BQU8sYUFBYSxDQUFDO1FBQ3RCLENBQUM7UUFFRCxnRUFBZ0U7UUFDaEUsTUFBTSx5QkFBeUIsR0FBRyxzQ0FBc0MsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hHLElBQUkseUJBQXlCLEtBQUssc0NBQXNDLEVBQUUsQ0FBQztZQUMxRSxhQUFhLEdBQUcsV0FBVyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyx5QkFBeUIsRUFBRSxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDakgsSUFBSSxhQUFhLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQzVCLE9BQU8sYUFBYSxDQUFDO1lBQ3RCLENBQUM7UUFDRixDQUFDO1FBRUQsaUZBQWlGO1FBQ2pGLE9BQU8sV0FBVyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUM7SUFDM0MsQ0FBQztJQUVELGFBQWEsQ0FBQyxrQkFBa0IsR0FBRyxLQUFLO1FBQ3ZDLElBQUkscUJBQStCLENBQUM7UUFDcEMsSUFBSSxrQkFBa0IsRUFBRSxDQUFDO1lBQ3hCLHFCQUFxQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztRQUNoRCxDQUFDO2FBQU0sQ0FBQztZQUNQLHFCQUFxQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ3ZJLHFCQUFxQixDQUFDLHFCQUFxQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsR0FBRyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDN0oscUJBQXFCLENBQUMsQ0FBQyxDQUFDLEdBQUcscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMvRixDQUFDO1FBRUQsT0FBTyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELGNBQWM7UUFDYix3Q0FBd0M7UUFDeEMsT0FBTztZQUNOLEdBQUcsSUFBSSxDQUFDLGlCQUFpQjtZQUN6QixXQUFXLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsR0FBRyxDQUFDO1lBQ25ELFNBQVMsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUyxHQUFHLENBQUM7U0FDL0MsQ0FBQztJQUNILENBQUM7SUFFRCxnQkFBZ0I7UUFDZixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3ZILENBQUM7SUFFRCxjQUFjO1FBQ2IsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDN0gsQ0FBQztJQUVELElBQUksVUFBVTtRQUNiLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN6QixDQUFDOztBQTNGRDtJQURDLE9BQU87d0NBaUJQIn0=