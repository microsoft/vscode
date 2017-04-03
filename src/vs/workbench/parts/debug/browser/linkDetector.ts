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
	private static FILE_LOCATION_PATTERNS: RegExp[] = [
		// group 0: the full thing :)
		// group 1: absolute path
		// group 2: drive letter on windows with trailing backslash or leading slash on mac/linux
		// group 3: line number
		// group 4: column number
		// eg: at Context.<anonymous> (c:\Users\someone\Desktop\mocha-runner\test\test.js:26:11)
		/((\/|[a-zA-Z]:\\)[^\(\)<>\'\"\[\]]+):(\d+):(\d+)/g
	];

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		// noop
	}

	public handleLinks(text: string): HTMLElement | string {
		let linkContainer: HTMLElement;

		for (let pattern of LinkDetector.FILE_LOCATION_PATTERNS) {
			pattern.lastIndex = 0; // the holy grail of software development
			let lastMatchIndex = 0;

			let match = pattern.exec(text);
			while (match !== null) {
				let resource: uri = null;
				try {
					resource = match && uri.file(match[1]);
				} catch (e) { }

				if (resource) {
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
					const column = Number(match[4]);
					link.onclick = (e) => this.onLinkClick(new StandardMouseEvent(e), resource, line, column);

					lastMatchIndex = pattern.lastIndex;
					const previousMatch = match;
					match = pattern.exec(text);

					// Append remaining text if no more links detected
					if (!match) {
						let textAfterLink = text.substr(previousMatch.index + previousMatch[0].length);
						if (textAfterLink) {
							let span = document.createElement('span');
							span.textContent = textAfterLink;
							linkContainer.appendChild(span);
						}
					}
				}
			}
		}

		return linkContainer || text;
	}

	private onLinkClick(event: IMouseEvent, resource: uri, line: number, column: number): void {
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
