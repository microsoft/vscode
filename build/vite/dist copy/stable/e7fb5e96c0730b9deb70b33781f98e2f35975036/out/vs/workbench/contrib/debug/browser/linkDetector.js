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
import { addDisposableListener, getWindow, isHTMLElement, reset } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Schemas } from '../../../../base/common/network.js';
import * as osPath from '../../../../base/common/path.js';
import * as platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITunnelService } from '../../../../platform/tunnel/common/tunnel.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { Iterable } from '../../../../base/common/iterator.js';
const CONTROL_CODES = '\\u0000-\\u0020\\u007f-\\u009f';
const WEB_LINK_REGEX = new RegExp('(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\\/\\/|data:|www\\.)[^\\s' + CONTROL_CODES + '"]{2,}[^\\s' + CONTROL_CODES + '"\')}\\],:;.!?]', 'ug');
const WIN_ABSOLUTE_PATH = /(?:[a-zA-Z]:(?:(?:\\|\/)[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
const WIN_RELATIVE_PATH = /(?:(?:\~|\.+)(?:(?:\\|\/)[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
const WIN_PATH = new RegExp(`(${WIN_ABSOLUTE_PATH.source}|${WIN_RELATIVE_PATH.source})`);
const POSIX_PATH = /((?:\~|\.+)?(?:\/[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
// Support both ":line 123" and ":123:45" formats for line/column numbers
const LINE_COLUMN = /(?::(?:line\s+)?([\d]+))?(?::([\d]+))?/;
const PATH_LINK_REGEX = new RegExp(`${platform.isWindows ? WIN_PATH.source : POSIX_PATH.source}${LINE_COLUMN.source}`, 'g');
const LINE_COLUMN_REGEX = /:(?:line\s+)?([\d]+)(?::([\d]+))?$/;
const MAX_LENGTH = 2000;
export var DebugLinkHoverBehavior;
(function (DebugLinkHoverBehavior) {
    /** A nice workbench hover */
    DebugLinkHoverBehavior[DebugLinkHoverBehavior["Rich"] = 0] = "Rich";
    /**
     * Basic browser hover
     * @deprecated Consumers should adopt `rich` by propagating disposables appropriately
     */
    DebugLinkHoverBehavior[DebugLinkHoverBehavior["Basic"] = 1] = "Basic";
    /** No hover */
    DebugLinkHoverBehavior[DebugLinkHoverBehavior["None"] = 2] = "None";
})(DebugLinkHoverBehavior || (DebugLinkHoverBehavior = {}));
let LinkDetector = class LinkDetector {
    constructor(editorService, fileService, openerService, pathService, tunnelService, environmentService, configurationService, hoverService) {
        this.editorService = editorService;
        this.fileService = fileService;
        this.openerService = openerService;
        this.pathService = pathService;
        this.tunnelService = tunnelService;
        this.environmentService = environmentService;
        this.configurationService = configurationService;
        this.hoverService = hoverService;
        // noop
    }
    /**
     * Matches and handles web urls, absolute and relative file links in the string provided.
     * Returns <span/> element that wraps the processed string, where matched links are replaced by <a/>.
     * 'onclick' event is attached to all anchored links that opens them in the editor.
     * When splitLines is true, each line of the text, even if it contains no links, is wrapped in a <span>
     * and added as a child of the returned <span>.
     * The `hoverBehavior` is required and manages the lifecycle of event listeners.
     */
    linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights) {
        return this._linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights);
    }
    _linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights, defaultRef) {
        if (splitLines) {
            const lines = text.split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
                lines[i] = lines[i] + '\n';
            }
            if (!lines[lines.length - 1]) {
                // Remove the last element ('') that split added.
                lines.pop();
            }
            const elements = lines.map(line => this._linkify(line, hoverBehavior, false, workspaceFolder, includeFulltext, highlights, defaultRef));
            if (elements.length === 1) {
                // Do not wrap single line with extra span.
                return elements[0];
            }
            const container = document.createElement('span');
            elements.forEach(e => container.appendChild(e));
            return container;
        }
        const container = document.createElement('span');
        for (const part of this.detectLinks(text)) {
            try {
                let node;
                switch (part.kind) {
                    case 'text':
                        node = defaultRef ? this.linkifyLocation(part.value, defaultRef.locationReference, defaultRef.session, hoverBehavior) : document.createTextNode(part.value);
                        break;
                    case 'web':
                        node = this.createWebLink(includeFulltext ? text : undefined, part.value, hoverBehavior);
                        break;
                    case 'path': {
                        const path = part.captures[0];
                        const lineNumber = part.captures[1] ? Number(part.captures[1]) : 0;
                        const columnNumber = part.captures[2] ? Number(part.captures[2]) : 0;
                        node = this.createPathLink(includeFulltext ? text : undefined, part.value, path, lineNumber, columnNumber, workspaceFolder, hoverBehavior);
                        break;
                    }
                    default:
                        node = document.createTextNode(part.value);
                }
                container.append(...this.applyHighlights(node, part.index, part.value.length, highlights));
            }
            catch (e) {
                container.appendChild(document.createTextNode(part.value));
            }
        }
        return container;
    }
    applyHighlights(node, startIndex, length, highlights) {
        const children = [];
        let currentIndex = startIndex;
        const endIndex = startIndex + length;
        for (const highlight of highlights || []) {
            if (highlight.end <= currentIndex || highlight.start >= endIndex) {
                continue;
            }
            if (highlight.start > currentIndex) {
                children.push(node.textContent.substring(currentIndex - startIndex, highlight.start - startIndex));
                currentIndex = highlight.start;
            }
            const highlightEnd = Math.min(highlight.end, endIndex);
            const highlightedText = node.textContent.substring(currentIndex - startIndex, highlightEnd - startIndex);
            const highlightSpan = document.createElement('span');
            highlightSpan.classList.add('highlight');
            if (highlight.extraClasses) {
                highlightSpan.classList.add(...highlight.extraClasses);
            }
            highlightSpan.textContent = highlightedText;
            children.push(highlightSpan);
            currentIndex = highlightEnd;
        }
        if (currentIndex === startIndex) {
            return Iterable.single(node); // no changes made
        }
        if (currentIndex < endIndex) {
            children.push(node.textContent.substring(currentIndex - startIndex));
        }
        // reuse the element if it's a link
        if (isHTMLElement(node)) {
            reset(node, ...children);
            return Iterable.single(node);
        }
        return children;
    }
    /**
     * Linkifies a location reference.
     */
    linkifyLocation(text, locationReference, session, hoverBehavior) {
        const link = this.createLink(text);
        this.decorateLink(link, undefined, text, hoverBehavior, async (preserveFocus) => {
            const location = await session.resolveLocationReference(locationReference);
            await location.source.openInEditor(this.editorService, {
                startLineNumber: location.line,
                startColumn: location.column,
                endLineNumber: location.endLine ?? location.line,
                endColumn: location.endColumn ?? location.column,
            }, preserveFocus);
        });
        return link;
    }
    /**
     * Makes an {@link ILinkDetector} that links everything in the output to the
     * reference if they don't have other explicit links.
     */
    makeReferencedLinkDetector(locationReference, session) {
        return {
            linkify: (text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights) => this._linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights, { locationReference, session }),
            linkifyLocation: this.linkifyLocation.bind(this),
        };
    }
    createWebLink(fulltext, url, hoverBehavior) {
        const link = this.createLink(url);
        let uri = URI.parse(url);
        // if the URI ends with something like `foo.js:12:3`, parse
        // that into a fragment to reveal that location (#150702)
        const lineCol = LINE_COLUMN_REGEX.exec(uri.path);
        if (lineCol) {
            uri = uri.with({
                path: uri.path.slice(0, lineCol.index),
                fragment: `L${lineCol[0].slice(1)}`
            });
        }
        this.decorateLink(link, uri, fulltext, hoverBehavior, async () => {
            if (uri.scheme === Schemas.file) {
                // Just using fsPath here is unsafe: https://github.com/microsoft/vscode/issues/109076
                const fsPath = uri.fsPath;
                const path = await this.pathService.path;
                const fileUrl = osPath.normalize(((path.sep === osPath.posix.sep) && platform.isWindows) ? fsPath.replace(/\\/g, osPath.posix.sep) : fsPath);
                const fileUri = URI.parse(fileUrl);
                const exists = await this.fileService.exists(fileUri);
                if (!exists) {
                    return;
                }
                await this.editorService.openEditor({
                    resource: fileUri,
                    options: {
                        pinned: true,
                        selection: lineCol ? { startLineNumber: +lineCol[1], startColumn: lineCol[2] ? +lineCol[2] : 1 } : undefined,
                    },
                });
                return;
            }
            this.openerService.open(url, { allowTunneling: (!!this.environmentService.remoteAuthority && this.configurationService.getValue('remote.forwardOnOpen')) });
        });
        return link;
    }
    createPathLink(fulltext, text, path, lineNumber, columnNumber, workspaceFolder, hoverBehavior) {
        if (path[0] === '/' && path[1] === '/') {
            // Most likely a url part which did not match, for example ftp://path.
            return document.createTextNode(text);
        }
        // Only set selection if we have a valid line number (greater than 0)
        const options = lineNumber > 0
            ? { selection: { startLineNumber: lineNumber, startColumn: columnNumber > 0 ? columnNumber : 1 } }
            : {};
        if (path[0] === '.') {
            if (!workspaceFolder) {
                return document.createTextNode(text);
            }
            const uri = workspaceFolder.toResource(path);
            const link = this.createLink(text);
            this.decorateLink(link, uri, fulltext, hoverBehavior, (preserveFocus) => this.editorService.openEditor({ resource: uri, options: { ...options, preserveFocus } }));
            return link;
        }
        if (path[0] === '~') {
            const userHome = this.pathService.resolvedUserHome;
            if (userHome) {
                path = osPath.join(userHome.fsPath, path.substring(1));
            }
        }
        const link = this.createLink(text);
        link.tabIndex = 0;
        const uri = URI.file(osPath.normalize(path));
        this.fileService.stat(uri).then(stat => {
            if (stat.isDirectory) {
                return;
            }
            this.decorateLink(link, uri, fulltext, hoverBehavior, (preserveFocus) => this.editorService.openEditor({ resource: uri, options: { ...options, preserveFocus } }));
        }).catch(() => {
            // If the uri can not be resolved we should not spam the console with error, remain quite #86587
        });
        return link;
    }
    createLink(text) {
        const link = document.createElement('a');
        link.textContent = text;
        return link;
    }
    decorateLink(link, uri, fulltext, hoverBehavior, onClick) {
        if (hoverBehavior.store.isDisposed) {
            return;
        }
        link.classList.add('link');
        const followLink = uri && this.tunnelService.canTunnel(uri) ? localize('followForwardedLink', "follow link using forwarded port") : localize('followLink', "follow link");
        const title = link.ariaLabel = fulltext
            ? (platform.isMacintosh ? localize('fileLinkWithPathMac', "Cmd + click to {0}\n{1}", followLink, fulltext) : localize('fileLinkWithPath', "Ctrl + click to {0}\n{1}", followLink, fulltext))
            : (platform.isMacintosh ? localize('fileLinkMac', "Cmd + click to {0}", followLink) : localize('fileLink', "Ctrl + click to {0}", followLink));
        if (hoverBehavior.type === 0 /* DebugLinkHoverBehavior.Rich */) {
            hoverBehavior.store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), link, title));
        }
        else if (hoverBehavior.type !== 2 /* DebugLinkHoverBehavior.None */) {
            link.title = title;
        }
        hoverBehavior.store.add(addDisposableListener(link, 'mousemove', (event) => {
            link.classList.toggle('pointer', platform.isMacintosh ? event.metaKey : event.ctrlKey);
        }));
        hoverBehavior.store.add(addDisposableListener(link, 'mouseleave', () => {
            link.classList.remove('pointer');
        }));
        hoverBehavior.store.add(addDisposableListener(link, 'click', (event) => {
            const selection = getWindow(link).getSelection();
            if (!selection || selection.type === 'Range') {
                return; // do not navigate when user is selecting
            }
            if (!(platform.isMacintosh ? event.metaKey : event.ctrlKey)) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            onClick(false);
        }));
        hoverBehavior.store.add(addDisposableListener(link, 'keydown', (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.keyCode === 3 /* KeyCode.Enter */ || event.keyCode === 10 /* KeyCode.Space */) {
                event.preventDefault();
                event.stopPropagation();
                onClick(event.keyCode === 10 /* KeyCode.Space */);
            }
        }));
    }
    detectLinks(text) {
        if (text.length > MAX_LENGTH) {
            return [{ kind: 'text', value: text, captures: [], index: 0 }];
        }
        const regexes = [WEB_LINK_REGEX, PATH_LINK_REGEX];
        const kinds = ['web', 'path'];
        const result = [];
        const splitOne = (text, regexIndex, baseIndex) => {
            if (regexIndex >= regexes.length) {
                result.push({ value: text, kind: 'text', captures: [], index: baseIndex });
                return;
            }
            const regex = regexes[regexIndex];
            let currentIndex = 0;
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(text)) !== null) {
                const stringBeforeMatch = text.substring(currentIndex, match.index);
                if (stringBeforeMatch) {
                    splitOne(stringBeforeMatch, regexIndex + 1, baseIndex + currentIndex);
                }
                const value = match[0];
                result.push({
                    value: value,
                    kind: kinds[regexIndex],
                    captures: match.slice(1),
                    index: baseIndex + match.index
                });
                currentIndex = match.index + value.length;
            }
            const stringAfterMatches = text.substring(currentIndex);
            if (stringAfterMatches) {
                splitOne(stringAfterMatches, regexIndex + 1, baseIndex + currentIndex);
            }
        };
        splitOne(text, 0, 0);
        return result;
    }
};
LinkDetector = __decorate([
    __param(0, IEditorService),
    __param(1, IFileService),
    __param(2, IOpenerService),
    __param(3, IPathService),
    __param(4, ITunnelService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, IConfigurationService),
    __param(7, IHoverService)
], LinkDetector);
export { LinkDetector };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua0RldGVjdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9saW5rRGV0ZWN0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFHcEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sS0FBSyxNQUFNLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxLQUFLLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUc5RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDMUcsT0FBTyxFQUFFLFlBQVks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