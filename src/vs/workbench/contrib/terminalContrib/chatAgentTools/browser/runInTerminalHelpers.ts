/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix as pathPosix, win32 as pathWin32 } from '../../../../../base/common/path.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { removeAnsiEscapeCodes } from '../../../../../base/common/strings.js';

export function isPowerShell(envShell: string, os: OperatingSystem): boolean {
	if (os === OperatingSystem.Windows) {
		return /^(?:powershell|pwsh)(?:-preview)?$/i.test(pathWin32.basename(envShell).replace(/\.exe$/i, ''));

	}
	return /^(?:powershell|pwsh)(?:-preview)?$/.test(pathPosix.basename(envShell));
}

// Maximum output length to prevent context overflow
const MAX_OUTPUT_LENGTH = 60000; // ~60KB limit to keep context manageable
const TRUNCATION_MESSAGE = '\n\n[... MIDDLE OF OUTPUT TRUNCATED ...]\n\n';

export function sanitizeTerminalOutput(output: string): string {
	let sanitized = removeAnsiEscapeCodes(output)
		// Trim trailing \r\n characters
		.trimEnd();

	// Truncate if output is too long to prevent context overflow
	if (sanitized.length > MAX_OUTPUT_LENGTH) {
		const truncationMessageLength = TRUNCATION_MESSAGE.length;
		const availableLength = MAX_OUTPUT_LENGTH - truncationMessageLength;
		const startLength = Math.floor(availableLength * 0.4); // Keep 40% from start
		const endLength = availableLength - startLength; // Keep 60% from end

		const startPortion = sanitized.substring(0, startLength);
		const endPortion = sanitized.substring(sanitized.length - endLength);

		sanitized = startPortion + TRUNCATION_MESSAGE + endPortion;
	}

	return sanitized;
}
