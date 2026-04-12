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
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalLink } from './terminalLink.js';
/**
 * Wrap a link detector object so it can be used in xterm.js
 */
let TerminalLinkDetectorAdapter = class TerminalLinkDetectorAdapter extends Disposable {
    constructor(_detector, _instantiationService) {
        super();
        this._detector = _detector;
        this._instantiationService = _instantiationService;
        this._activeLinksStore = this._register(new DisposableStore());
        this._onDidActivateLink = this._register(new Emitter());
        this.onDidActivateLink = this._onDidActivateLink.event;
        this._onDidShowHover = this._register(new Emitter());
        this.onDidShowHover = this._onDidShowHover.event;
        this._activeProvideLinkRequests = new Map();
    }
    async provideLinks(bufferLineNumber, callback) {
        let activeRequest = this._activeProvideLinkRequests.get(bufferLineNumber);
        if (activeRequest) {
            const links = await activeRequest;
            callback(links);
            return;
        }
        this._activeLinksStore.clear();
        activeRequest = this._provideLinks(bufferLineNumber);
        this._activeProvideLinkRequests.set(bufferLineNumber, activeRequest);
        const links = await activeRequest;
        this._activeProvideLinkRequests.delete(bufferLineNumber);
        callback(links);
    }
    async _provideLinks(bufferLineNumber) {
        // Dispose of all old links if new links are provided, links are only cached for the current line
        const links = [];
        let startLine = bufferLineNumber - 1;
        let endLine = startLine;
        const lines = [
            this._detector.xterm.buffer.active.getLine(startLine)
        ];
        // Cap the maximum context on either side of the line being provided, by taking the context
        // around the line being provided for this ensures the line the pointer is on will have
        // links provided.
        const maxCharacterContext = Math.max(this._detector.maxLinkLength, this._detector.xterm.cols);
        const maxLineContext = Math.ceil(maxCharacterContext / this._detector.xterm.cols);
        const minStartLine = Math.max(startLine - maxLineContext, 0);
        const maxEndLine = Math.min(endLine + maxLineContext, this._detector.xterm.buffer.active.length);
        while (startLine >= minStartLine && this._detector.xterm.buffer.active.getLine(startLine)?.isWrapped) {
            lines.unshift(this._detector.xterm.buffer.active.getLine(startLine - 1));
            startLine--;
        }
        while (endLine < maxEndLine && this._detector.xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
            lines.push(this._detector.xterm.buffer.active.getLine(endLine + 1));
            endLine++;
        }
        const detectedLinks = await this._detector.detect(lines, startLine, endLine);
        for (const link of detectedLinks) {
            const terminalLink = this._createTerminalLink(link, async (event) => this._onDidActivateLink.fire({ link, event }));
            links.push(terminalLink);
            this._activeLinksStore.add(terminalLink);
        }
        return links;
    }
    _createTerminalLink(l, activateCallback) {
        // Remove trailing colon if there is one so the link is more useful
        if (!l.disableTrimColon && l.text.length > 0 && l.text.charAt(l.text.length - 1) === ':') {
            l.text = l.text.slice(0, -1);
            l.bufferRange.end.x--;
        }
        return this._instantiationService.createInstance(TerminalLink, this._detector.xterm, l.bufferRange, l.text, l.uri, l.parsedLink, l.actions, this._detector.xterm.buffer.active.viewportY, activateCallback, (link, viewportRange, modifierDownCallback, modifierUpCallback) => this._onDidShowHover.fire({
            link,
            viewportRange,
            modifierDownCallback,
            modifierUpCallback
        }), l.type !== "Search" /* TerminalBuiltinLinkType.Search */, // Only search is low confidence
        l.label || this._getLabel(l.type), l.type);
    }
    _getLabel(type) {
        switch (type) {
            case "Search" /* TerminalBuiltinLinkType.Search */: return localize('searchWorkspace', 'Search workspace');
            case "LocalFile" /* TerminalBuiltinLinkType.LocalFile */: return localize('openFile', 'Open file in editor');
            case "LocalFolderInWorkspace" /* TerminalBuiltinLinkType.LocalFolderInWorkspace */: return localize('focusFolder', 'Focus folder in explorer');
            case "LocalFolderOutsideWorkspace" /* TerminalBuiltinLinkType.LocalFolderOutsideWorkspace */: return localize('openFolder', 'Open folder in new window');
            case "Url" /* TerminalBuiltinLinkType.Url */:
            default:
                return localize('followLink', 'Follow link');
        }
    }
};
TerminalLinkDetectorAdapter = __decorate([
    __param(1, IInstantiationService)
], TerminalLinkDetectorAdapter);
export { TerminalLinkDetectorAdapter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rRGV0ZWN0b3JBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL2Jyb3dzZXIvdGVybWluYWxMaW5rRGV0ZWN0b3JBZGFwdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFnQmpEOztHQUVHO0FBQ0ksSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSxVQUFVO0lBUTFELFlBQ2tCLFNBQWdDLEVBQzFCLHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUhTLGNBQVMsR0FBVCxTQUFTLENBQXVCO1FBQ1QsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQVRwRSxzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUUxRCx1QkFBa0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFzQixDQUFDLENBQUM7UUFDL0Usc0JBQWlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQUMxQyxvQkFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQW1CLENBQUMsQ0FBQztRQUN6RSxtQkFBYyxHQUFH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