/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute } from 'vs/base/common/paths';
import { URI as uri } from 'vs/base/common/uri';
import { isMacintosh } from 'vs/base/common/platform';
import { IMouseEvent, StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import * as nls from 'vs/nls';
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';

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
		@IEditorService private editorService: IEditorService
	) {
		// noop
	}

	/**
	 * Matches and handles absolute file links in the string provided.
	 * Returns <span/> element that wraps the processed string, where matched links are replaced by <a/> and unmatched parts are surrounded by <span/> elements.
	 * 'onclick' event is attached to all anchored links that opens them in the editor.
	 * If no links were detected, returns the original string wrapped in a <span>.
	 */
	handleLinks(text: string): HTMLElement {
		const container = document.createElement('span');

		// Handle the text one line at a time
		const lines = text.split('\n');

		if (text.charAt(text.length - 1) === '\n') {
			// Remove the last element ('') that split added
			lines.pop();
		}

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];

			// Re-introduce the newline for every line except the last (unless the last line originally ended with a newline)
			if (i < lines.length - 1 || text.charAt(text.length - 1) === '\n') {
				line += '\n';
			}

			// Don't handle links for lines that are too long
			if (line.length > LinkDetector.MAX_LENGTH) {
				let span = document.createElement('span');
				span.textContent = line;
				container.appendChild(span);
				continue;
			}

			const lineContainer = document.createElement('span');

			for (let pattern of LinkDetector.FILE_LOCATION_PATTERNS) {
				// Reset the state of the pattern
				pattern = new RegExp(pattern);
				let lastMatchIndex = 0;

				let match = pattern.exec(line);

				while (match !== null) {
					let resource: uri | null = isAbsolute(match[1]) ? uri.file(match[1]) : null;

					if (!resource) {
						match = pattern.exec(line);
						continue;
					}

					const textBeforeLink = line.substring(lastMatchIndex, match.index);
					if (textBeforeLink) {
						// textBeforeLink may have matches for other patterns, so we run handleLinks on it before adding it.
						lineContainer.appendChild(this.handleLinks(textBeforeLink));
					}

					const link = document.createElement('a');
					link.textContent = line.substr(match.index, match[0].length);
					link.title = isMacintosh ? nls.localize('fileLinkMac', "Click to follow (Cmd + click opens to the side)") : nls.localize('fileLink', "Click to follow (Ctrl + click opens to the side)");
					lineContainer.appendChild(link);
					const lineNumber = Number(match[3]);
					const columnNumber = match[4] ? Number(match[4]) : undefined;
					link.onclick = (e) => this.onLinkClick(new StandardMouseEvent(e), resource!, lineNumber, columnNumber);

					lastMatchIndex = pattern.lastIndex;
					const currentMatch = match;
					match = pattern.exec(line);

					// Append last string part if no more link matches
					if (!match) {
						const textAfterLink = line.substr(currentMatch.index + currentMatch[0].length);
						if (textAfterLink) {
							// textAfterLink may have matches for other patterns, so we run handleLinks on it before adding it.
							lineContainer.appendChild(this.handleLinks(textAfterLink));
						}
					}
				}

				// If we found any matches for this pattern, don't check any more patterns
				if (lineContainer.hasChildNodes()) {
					break;
				}
			}

			if (!lineContainer.hasChildNodes()) {
				// We didn't find a match for any of the patterns. Add the unmodified line.
				let span = document.createElement('span');
				span.textContent = line;
				lineContainer.appendChild(span);
			}

			container.appendChild(lineContainer);
		}

		return container;
	}

	private onLinkClick(event: IMouseEvent, resource: uri, line: number, column: number = 0): void {
		const selection = window.getSelection();
		if (selection.type === 'Range') {
			return; // do not navigate when user is selecting
		}

		event.preventDefault();
		const group = event.ctrlKey || event.metaKey ? SIDE_GROUP : ACTIVE_GROUP;

		this.editorService.openEditor({
			resource,
			options: {
				selection: {
					startLineNumber: line,
					startColumn: column
				}
			}
		}, group);
	}
}
