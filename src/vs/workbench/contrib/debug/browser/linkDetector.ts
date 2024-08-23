/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as osPath from 'vs/base/common/path';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITunnelService } from 'vs/platform/tunnel/common/tunnel';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IDebugSession } from 'vs/workbench/contrib/debug/common/debug';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IPathService } from 'vs/workbench/services/path/common/pathService';

const CONTROL_CODES = '\\u0000-\\u0020\\u007f-\\u009f';
const WEB_LINK_REGEX = new RegExp('(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\\/\\/|data:|www\\.)[^\\s' + CONTROL_CODES + '"]{2,}[^\\s' + CONTROL_CODES + '"\')}\\],:;.!?]', 'ug');

const WIN_ABSOLUTE_PATH = /(?:[a-zA-Z]:(?:(?:\\|\/)[\w\.-]*)+)/;
const WIN_RELATIVE_PATH = /(?:(?:\~|\.)(?:(?:\\|\/)[\w\.-]*)+)/;
const WIN_PATH = new RegExp(`(${WIN_ABSOLUTE_PATH.source}|${WIN_RELATIVE_PATH.source})`);
const POSIX_PATH = /((?:\~|\.)?(?:\/[\w\.-]*)+)/;
const LINE_COLUMN = /(?:\:([\d]+))?(?:\:([\d]+))?/;
const PATH_LINK_REGEX = new RegExp(`${platform.isWindows ? WIN_PATH.source : POSIX_PATH.source}${LINE_COLUMN.source}`, 'g');
const LINE_COLUMN_REGEX = /:([\d]+)(?::([\d]+))?$/;

const MAX_LENGTH = 2000;

type LinkKind = 'web' | 'path' | 'text';
type LinkPart = {
	kind: LinkKind;
	value: string;
	captures: string[];
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

export class LinkDetector {
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
	linkify(text: string, splitLines?: boolean, workspaceFolder?: IWorkspaceFolder, includeFulltext?: boolean, hoverBehavior?: DebugLinkHoverBehaviorTypeData): HTMLElement {
		if (splitLines) {
			const lines = text.split('\n');
			for (let i = 0; i < lines.length - 1; i++) {
				lines[i] = lines[i] + '\n';
			}
			if (!lines[lines.length - 1]) {
				// Remove the last element ('') that split added.
				lines.pop();
			}
			const elements = lines.map(line => this.linkify(line, false, workspaceFolder, includeFulltext));
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
				switch (part.kind) {
					case 'text':
						container.appendChild(document.createTextNode(part.value));
						break;
					case 'web':
						container.appendChild(this.createWebLink(includeFulltext ? text : undefined, part.value, hoverBehavior));
						break;
					case 'path': {
						const path = part.captures[0];
						const lineNumber = part.captures[1] ? Number(part.captures[1]) : 0;
						const columnNumber = part.captures[2] ? Number(part.captures[2]) : 0;
						container.appendChild(this.createPathLink(includeFulltext ? text : undefined, part.value, path, lineNumber, columnNumber, workspaceFolder, hoverBehavior));
						break;
					}
				}
			} catch (e) {
				container.appendChild(document.createTextNode(part.value));
			}
		}
		return container;
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
						selection: lineCol ? { startLineNumber: +lineCol[1], startColumn: +lineCol[2] } : undefined,
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

		const options = { selection: { startLineNumber: lineNumber, startColumn: columnNumber } };
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
			return [{ kind: 'text', value: text, captures: [] }];
		}

		const regexes: RegExp[] = [WEB_LINK_REGEX, PATH_LINK_REGEX];
		const kinds: LinkKind[] = ['web', 'path'];
		const result: LinkPart[] = [];

		const splitOne = (text: string, regexIndex: number) => {
			if (regexIndex >= regexes.length) {
				result.push({ value: text, kind: 'text', captures: [] });
				return;
			}
			const regex = regexes[regexIndex];
			let currentIndex = 0;
			let match;
			regex.lastIndex = 0;
			while ((match = regex.exec(text)) !== null) {
				const stringBeforeMatch = text.substring(currentIndex, match.index);
				if (stringBeforeMatch) {
					splitOne(stringBeforeMatch, regexIndex + 1);
				}
				const value = match[0];
				result.push({
					value: value,
					kind: kinds[regexIndex],
					captures: match.slice(1)
				});
				currentIndex = match.index + value.length;
			}
			const stringAfterMatches = text.substring(currentIndex);
			if (stringAfterMatches) {
				splitOne(stringAfterMatches, regexIndex + 1);
			}
		};

		splitOne(text, 0);
		return result;
	}
}
