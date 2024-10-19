/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OS } from '../../../../../base/common/platform.js';
import { detectLinks } from '../../links/browser/terminalLinkParsing.js';
import { fallbackMatchers } from '../../links/browser/terminalLocalLinkDetector.js';


/**
 * Manages all the terminal smart paste related operations
 */
export class SmartPasteUtils {

	private static _detectLink(text: string): boolean {
		const links = detectLinks(text, OS);

		/* Check the first link only */
		if (links.length > 0 && links[0]?.path?.text === text) {
			return true;
		}

		return false;
	}

	private static _matchFallbackMatchers(text: string) {
		let hasMatchedFallbackMatchers = false;

		fallbackMatchers.forEach((regexPattern) => {
			if (regexPattern.test(text)) {
				hasMatchedFallbackMatchers = true;
				return;
			}
		});
		return hasMatchedFallbackMatchers;
	}

	/**
	 * Check if the input string looks like a path
	 * @param text input string, returns true if it looks like a path
	 */
	static isPathLike(text: string): boolean {
		// Regex to detect common path formats

		const windowsPathPattern = /^[a-zA-Z]:(?:\\|\/)/;  // Windows absolute path
		const windowsUNCPathPattern = /^\\\\/;             // Windows UNC path
		const unixPathPattern = /^\/|(?:\w+\/)/; // Unix/Linux/macOS paths

		return windowsPathPattern.test(text) ||
			windowsUNCPathPattern.test(text) ||
			unixPathPattern.test(text) ||
			/* Checks below are to validate if the path is relative */
			this._detectLink(text) ||
			this._matchFallbackMatchers(text);
	}

	/**
	 * Wraps the input path in " and escapes the " in the path
	 * @param path input path which needs to be wrapped in "
	 */
	static wrapAndEscapePath(path: string, escapeChar: string): string {
		// Escape double quotes in the path
		const escapedPath = path.replace(/"/g, `${escapeChar}"`);
		// Wrap the escaped path in double quotes
		return `"${escapedPath}"`;
	}

	/**
	 * Handles smartPaste for paths depending on the type of the terminal
	 * @param text the string that's going to be pasted on the terminal
	 * @param shellType the type of terminal on which the paste operation was done
	 */
	static handleSmartPaste(text: string, shellType: string): string {
		if (!this.isPathLike(text)) {
			return text;  // Return the string as is if it's not detected as a path
		}

		switch (shellType) {
			case 'gitbash':
			case 'zsh':
			case 'tmux':
			case 'fish':
			case 'bash':
				{
					// Escape backslashes and wrap in double quotes if necessary
					const escapedPath = text.replace(/\\/g, '\\\\');
					if (text.includes(' ')) {
						return this.wrapAndEscapePath(escapedPath, '\\');
					}
					return escapedPath;
				}

			case 'pwsh':
				if (text.includes(' ')) {
					return this.wrapAndEscapePath(text, '`');
				}
				return text;
			case 'cmd':
				// Simply wrap in quotes if spaces are present
				if (text.includes(' ')) {
					return this.wrapAndEscapePath(text, '^');
				}
				return text;

			default:
				return text;  // If shell type is unknown, return text as is
		}
	}
}
