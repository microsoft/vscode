/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandFileWriteParser } from './commandFileWriteParser.js';
import { analyzeSedCommand } from '../../../../../../platform/terminal/common/sedCommandAnalyzer.js';

/**
 * Parser for detecting file writes from `sed` commands using in-place editing.
 *
 * Handles:
 * - `sed -i 's/foo/bar/' file.txt` (GNU)
 * - `sed -i.bak 's/foo/bar/' file.txt` (GNU with backup suffix)
 * - `sed -i '' 's/foo/bar/' file.txt` (macOS/BSD with empty backup suffix)
 * - `sed --in-place 's/foo/bar/' file.txt` (GNU long form)
 * - `sed --in-place=.bak 's/foo/bar/' file.txt` (GNU long form with backup)
 * - `sed -I 's/foo/bar/' file.txt` (BSD case-insensitive variant)
 */
export class SedFileWriteParser implements ICommandFileWriteParser {
	readonly commandName = 'sed';

	canHandle(commandText: string): boolean {
		return analyzeSedCommand(commandText, 'bash').kind !== 'safe';
	}

	extractFileWrites(commandText: string): (string | undefined)[] {
		const analysis = analyzeSedCommand(commandText, 'bash');
		if (analysis.kind === 'requiresConfirmation') {
			return [undefined];
		}
		return analysis.kind === 'inPlace' ? [...analysis.fileWrites] : [];
	}
}
