/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class SmartPasteUtils {
	/**
	 * Check if the input string looks like a path
	 * @param string input string, returns true if it looks like a path
	 */
	static isPathLike(string: string): boolean {
		// Regex to detect common path formats
		const windowsPathPattern = /^[a-zA-Z]:(\\|\/)/;  // Windows absolute path
		const windowsUNCPathPattern = /^\\\\/;             // Windows UNC path
		const unixPathPattern = /^\/|(\w+\/)/;      // Unix/Linux/macOS paths

		return windowsPathPattern.test(string) ||
			windowsUNCPathPattern.test(string) ||
			unixPathPattern.test(string);
	}

	/**
	 * Handles smartPaste for paths depending on the type of the terminal
	 * @param string the string that's going to be pasted on the terminal
	 * @param shellType the type of terminal on which the paste operation was done
	 */
	static handleSmartPaste(string: string, shellType: string): string {
		if (!SmartPasteUtils.isPathLike(string)) {
			return string;  // Return the string as is if it's not detected as a path
		}

		switch (shellType) {
			case 'gitbash':
			case 'cmd':
				{
					// Escape backslashes and wrap in double quotes if necessary
					const escapedPath = string.replace(/\\/g, '\\\\');
					if (string.includes(' ')) {
						return `"${escapedPath}"`;
					}
					return escapedPath;
				}

			case 'bash':  // Linux/macOS Bash
				// Wrap in quotes if spaces or special characters exist
				if (string.includes(' ')) {
					return `"${string}"`;
				}
				return string;

			case 'pwsh':
				// Simply wrap in quotes if spaces are present
				if (string.includes(' ')) {
					return `"${string}"`;
				}
				return string;

			default:
				return string;  // If shell type is unknown, return string as is
		}
	}
}
