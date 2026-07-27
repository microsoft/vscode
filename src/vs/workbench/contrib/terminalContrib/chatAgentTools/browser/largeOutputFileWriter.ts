/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { MAX_OUTPUT_LENGTH, truncateLargeOutput } from './outputHelpers.js';

/**
 * Writes large terminal output to temp files so the model can read the full
 * output using file-reading tools. Tracks created files for cleanup on dispose.
 *
 * Mirrors copilot-agent-runtime's largeOutputHandler.ts pattern:
 * - Output exceeding MAX_OUTPUT_LENGTH is written to a temp file
 * - A truncated preview (head + tail) is returned with the file path
 * - Files are cleaned up when sessions end or this writer is disposed
 */
export class LargeOutputFileWriter extends Disposable {

	private readonly _tempFiles = new Set<URI>();

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) {
		super();
	}

	/**
	 * If the output exceeds MAX_OUTPUT_LENGTH, writes it to a temp file and
	 * returns a truncated message with the file path. Otherwise returns the
	 * output unchanged.
	 */
	async processOutput(output: string): Promise<string> {
		if (output.length <= MAX_OUTPUT_LENGTH) {
			return output;
		}

		const filePath = await this._writeToTempFile(output);
		if (!filePath) {
			// File write failed, fall back to truncation without file reference
			return truncateLargeOutput(output);
		}

		return truncateLargeOutput(output, filePath);
	}

	private async _writeToTempFile(output: string): Promise<string | undefined> {
		try {
			const fileName = `copilot-terminal-output-${generateUuid()}.txt`;
			const dirUri = URI.joinPath(this._environmentService.cacheHome, 'copilot-terminal-output');
			const fileUri = URI.joinPath(dirUri, fileName);

			// Pretty-print JSON in the file for readability (matches agent-runtime behavior)
			const fileContent = this._prettyPrintIfJson(output);
			await this._fileService.writeFile(fileUri, VSBuffer.fromString(fileContent));
			this._tempFiles.add(fileUri);

			this._logService.debug(`LargeOutputFileWriter: wrote ${Math.ceil(output.length / 1024)}KB to ${fileUri.fsPath}`);
			return fileUri.fsPath;
		} catch (e) {
			this._logService.debug(`LargeOutputFileWriter: failed to write temp file: ${e}`);
			return undefined;
		}
	}

	private _prettyPrintIfJson(output: string): string {
		const trimmed = output.trim();
		if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
			return output;
		}
		try {
			return JSON.stringify(JSON.parse(trimmed), null, 2);
		} catch {
			return output;
		}
	}

	/**
	 * Cleans up all tracked temp files. Called on session end.
	 */
	cleanup(): void {
		for (const fileUri of this._tempFiles) {
			this._fileService.del(fileUri).catch(() => { /* ignore cleanup errors */ });
		}
		this._tempFiles.clear();
	}

	override dispose(): void {
		this.cleanup();
		super.dispose();
	}
}
