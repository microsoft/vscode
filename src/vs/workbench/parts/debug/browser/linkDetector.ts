/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import { isMacintosh } from 'vs/base/common/platform';
import * as errors from 'vs/base/common/errors';
import { IMouseEvent, StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import * as nls from 'vs/nls';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export class LinkDetector {
	private static readonly MAX_LENGTH = 500;
	private static FILE_LOCATION_PATTERNS: RegExp[] = [
		// group 0: full path with line and column
		// group 1: full path without line and column, matched by `*.*` in the end to work only on paths with extensions in the end (s.t. node:10352 would not match)
		// group 2: drive letter on windows with trailing backslash or leading slash on mac/linux
		// group 3: line number, matched by (:(\d+))
		// group 4: column number, matched by ((?::(\d+))?)
		// eg: at Context.<anonymous> (c:\Users\someone\Desktop\mocha-runner\test\test.js:26:11)
		/(?![\(])(?:file:\/\/)?((?:([a-zA-Z]+:)|[^\(\)<>\'\"\[\]:\s]+)(?:[\\/][^\(\)<>\'\"\[\]:]*)?\.[a-zA-Z]+[0-9]*):(\d+)(?::(\d+))?/g
	];

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		// noop
	}

	/**
	 * Matches and handles relative and absolute file links in the string provided.
	 * Returns <span/> element that wraps the processed string, where matched links are replaced by <a/> and unmatched parts are surrounded by <span/> elements.
	 * 'onclick' event is attached to all anchored links that opens them in the editor.
	 * If no links were detected, returns the original string.
	 */
	public handleLinks(text: string): HTMLElement | string {
		if (text.length > LinkDetector.MAX_LENGTH) {
			return text;
		}

		let linkContainer: HTMLElement;
		for (let pattern of LinkDetector.FILE_LOCATION_PATTERNS) {
			pattern.lastIndex = 0; // the holy grail of software development
			let lastMatchIndex = 0;

			let match = pattern.exec(text);
			while (match !== null) {
				let resource: uri = null;
				if (!resource) {
					match = pattern.exec(text);
					continue;
				}
				if (!linkContainer) {
					linkContainer = document.createElement('span');
				}

				let textBeforeLink = text.substring(lastMatchIndex, match.index);
				if (textBeforeLink) {
					let span = document.createElement('span');
					span.textContent = textBeforeLink;
					linkContainer.appendChild(span);
				}

				const link = document.createElement('a');
				link.textContent = text.substr(match.index, match[0].length);
				link.title = isMacintosh ? nls.localize('fileLinkMac', "Click to follow (Cmd + click opens to the side)") : nls.localize('fileLink', "Click to follow (Ctrl + click opens to the side)");
				linkContainer.appendChild(link);
				const line = Number(match[3]);
				const column = match[4] ? Number(match[4]) : undefined;
				link.onclick = (e) => this.onLinkClick(new StandardMouseEvent(e), resource, line, column);

				lastMatchIndex = pattern.lastIndex;
				const currentMatch = match;
				match = pattern.exec(text);

				// Append last string part if no more link matches
				if (!match) {
					let textAfterLink = text.substr(currentMatch.index + currentMatch[0].length);
					if (textAfterLink) {
						let span = document.createElement('span');
						span.textContent = textAfterLink;
						linkContainer.appendChild(span);
					}
				}
			}
		}

		return linkContainer || text;
	}

	private onLinkClick(event: IMouseEvent, resource: uri, line: number, column: number = 0): void {
		const selection = window.getSelection();
		if (selection.type === 'Range') {
			return; // do not navigate when user is selecting
		}

		event.preventDefault();

		this.editorService.openEditor({
			resource,
			options: {
				selection: {
					startLineNumber: line,
					startColumn: column
				}
			}
		}, event.ctrlKey || event.metaKey).done(null, errors.onUnexpectedError);
	}
}
