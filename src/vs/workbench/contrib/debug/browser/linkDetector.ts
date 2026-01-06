/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, isHTMLElement, reset } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
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
import { IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IDebugSession } from '../common/debug.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IHighlight } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
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

type LinkKind = 'web' | 'path' | 'text';
type LinkPart = {
	kind: LinkKind;
	value: string;
	captures: string[];
	index: number;
};

export const enum DebugLinkHoverBehavior {
	/** A nice workbench hover */
	Rich,
	/**
	 * Basic browser hover
	 * @deprecated Consumers should adopt `rich` by propagating disposables appropriately
	 */
	Basic,
	/** No hover */
	None
}

/** Store implies HoverBehavior=rich */
export type DebugLinkHoverBehaviorTypeData = { type: DebugLinkHoverBehavior.None | DebugLinkHoverBehavior.Basic }
	| { type: DebugLinkHoverBehavior.Rich; store: DisposableStore };

export interface ILinkDetector {
	linkify(text: string, splitLines?: boolean, workspaceFolder?: IWorkspaceFolder, includeFulltext?: boolean, hoverBehavior?: DebugLinkHoverBehaviorTypeData, highlights?: IHighlight[]): HTMLElement;
	linkifyLocation(text: string, locationReference: number, session: IDebugSession, hoverBehavior?: DebugLinkHoverBehaviorTypeData): HTMLElement;
}

export class LinkDetector implements ILinkDetector {
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IPathService private readonly pathService: IPathService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		// noop
	}

	/**
	 * Matches and handles web urls, absolute and relative file links in the string provided.
	 * Returns <span/> element that wraps the processed string, where matched links are replaced by <a/>.
	 * 'onclick' event is attached to all anchored links that opens them in the editor.
	 * When splitLines is true, each line of the text, even if it contains no links, is wrapped in a <span>
	 * and added as a child of the returned <span>.
	 * If a `hoverBehavior` is passed, hovers may be added using the workbench hover service.
	 * This should be preferred for new code where hovers are desirable.
	 */
	linkify(text: string, splitLines?: boolean, workspaceFolder?: IWorkspaceFolder, includeFulltext?: boolean, hoverBehavior?: DebugLinkHoverBehaviorTypeData, highlights?: IHighlight[]): HTMLElement {
		return this._linkify(text, splitLines, workspaceFolder, includeFulltext, hoverBehavior, highlights);
	}

	private _linkify(text: string, splitLines?: boolean, workspaceFolder?: IWorkspaceFolder, includeFulltext?: boolean, hoverBehavior?: DebugLinkHoverBehaviorTypeData, highlights?: IHighlight[], defaultRef?: { locationReference: number; session: IDebugSession }): HTMLElement {
		if (splitLines) {
			const lines = text.split('\n');
			for (let i = 0; i < lines.length - 1; i++) {
				lines[i] = lines[i] + '\n';
			}
			if (!lines[lines.length - 1]) {
				// Remove the last element ('') that split added.
				lines.pop();
			}
			const elements = lines.map(line => this._linkify(line, false, workspaceFolder, includeFulltext, hoverBehavior, highlights, defaultRef));
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
				let node: Node;
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
			} catch (e) {
				container.appendChild(document.createTextNode(part.value));
			}
		}
		return container;
	}

	private applyHighlights(node: Node, startIndex: number, length: number, highlights: IHighlight[] | undefined): Iterable<Node | string> {
		const children: (Node | string)[] = [];
		let currentIndex = startIndex;
		const endIndex = startIndex + length;

		for (const highlight of highlights || []) {
			if (highlight.end <= currentIndex || highlight.start >= endIndex) {
				continue;
			}

			if (highlight.start > currentIndex) {
				children.push(node.textContent!.substring(currentIndex - startIndex, highlight.start - startIndex));
				currentIndex = highlight.start;
			}

			const highlightEnd = Math.min(highlight.end, endIndex);
			const highlightedText = node.textContent!.substring(currentIndex - startIndex, highlightEnd - startIndex);
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
			children.push(node.textContent!.substring(currentIndex - startIndex));
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
	linkifyLocation(text: string, locationReference: number, session: IDebugSession, hoverBehavior?: DebugLinkHoverBehaviorTypeData) {
		const link = this.createLink(text);
		this.decorateLink(link, undefined, text, hoverBehavior, async (preserveFocus: boolean) => {
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
	makeReferencedLinkDetector(locationReference: number, session: IDebugSession): ILinkDetector {
		return {
			linkify: (text, splitLines, workspaceFolder, includeFulltext, hoverBehavior, highlights) =>
				this._linkify(text, splitLines, workspaceFolder, includeFulltext, hoverBehavior, highlights, { locationReference, session }),
			linkifyLocation: this.linkifyLocation.bind(this),
		};
	}

	private createWebLink(fulltext: string | undefined, url: string, hoverBehavior?: DebugLinkHoverBehaviorTypeData): Node {
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

	private createPathLink(fulltext: string | undefined, text: string, path: string, lineNumber: number, columnNumber: number, workspaceFolder: IWorkspaceFolder | undefined, hoverBehavior?: DebugLinkHoverBehaviorTypeData): Node {
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
			this.decorateLink(link, uri, fulltext, hoverBehavior, (preserveFocus: boolean) => this.editorService.openEditor({ resource: uri, options: { ...options, preserveFocus } }));
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
			this.decorateLink(link, uri, fulltext, hoverBehavior, (preserveFocus: boolean) => this.editorService.openEditor({ resource: uri, options: { ...options, preserveFocus } }));
		}).catch(() => {
			// If the uri can not be resolved we should not spam the console with error, remain quite #86587
		});
		return link;
	}

	private createLink(text: string): HTMLElement {
		const link = document.createElement('a');
		link.textContent = text;
		return link;
	}

	private decorateLink(link: HTMLElement, uri: URI | undefined, fulltext: string | undefined, hoverBehavior: DebugLinkHoverBehaviorTypeData | undefined, onClick: (preserveFocus: boolean) => void) {
		link.classList.add('link');
		const followLink = uri && this.tunnelService.canTunnel(uri) ? localize('followForwardedLink', "follow link using forwarded port") : localize('followLink', "follow link");
		const title = link.ariaLabel = fulltext
			? (platform.isMacintosh ? localize('fileLinkWithPathMac', "Cmd + click to {0}\n{1}", followLink, fulltext) : localize('fileLinkWithPath', "Ctrl + click to {0}\n{1}", followLink, fulltext))
			: (platform.isMacintosh ? localize('fileLinkMac', "Cmd + click to {0}", followLink) : localize('fileLink', "Ctrl + click to {0}", followLink));

		if (hoverBehavior?.type === DebugLinkHoverBehavior.Rich) {
			hoverBehavior.store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), link, title));
		} else if (hoverBehavior?.type !== DebugLinkHoverBehavior.None) {
			link.title = title;
		}

		link.onmousemove = (event) => { link.classList.toggle('pointer', platform.isMacintosh ? event.metaKey : event.ctrlKey); };
		link.onmouseleave = () => link.classList.remove('pointer');
		link.onclick = (event) => {
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
		};
		link.onkeydown = e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
				event.preventDefault();
				event.stopPropagation();
				onClick(event.keyCode === KeyCode.Space);
			}
		};
	}

	private detectLinks(text: string): LinkPart[] {
		if (text.length > MAX_LENGTH) {
			return [{ kind: 'text', value: text, captures: [], index: 0 }];
		}

		const regexes: RegExp[] = [WEB_LINK_REGEX, PATH_LINK_REGEX];
		const kinds: LinkKind[] = ['web', 'path'];
		const result: LinkPart[] = [];

		const splitOne = (text: string, regexIndex: number, baseIndex: number) => {
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
}
