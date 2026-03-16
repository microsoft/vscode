/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { isSandboxFilesystemError } from '../../../../../../platform/sandbox/common/sandboxErrorAnalysis.js';
import { ITerminalSandboxService } from '../../common/terminalSandboxService.js';
import type { IOutputAnalyzer, IOutputAnalyzerOptions } from './outputAnalyzer.js';

export class SandboxOutputAnalyzer extends Disposable implements IOutputAnalyzer {
	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ITerminalSandboxService private readonly _sandboxService: ITerminalSandboxService,
	) {
		super();
	}

	async analyze(options: IOutputAnalyzerOptions): Promise<string | undefined> {
		if (options.exitCode === undefined || options.exitCode === 0) {
			return undefined;
		}
		if (!(await this._sandboxService.isEnabled())) {
			return undefined;
		}

		const filesystemPermissionLine = options.exitResult.split(/\r?\n/).find(line => isSandboxFilesystemError(line));
		const sandboxPath = filesystemPermissionLine ? await this._getSandboxPathToAllow(filesystemPermissionLine) : undefined;

		if (sandboxPath && await this._sandboxService.promptToAllowWritePath(sandboxPath)) {
			return localize(
				'runInTerminalTool.sandboxWritePathAllowed',
				"Write access to {0} was added to the terminal sandbox allow list. Retry the command.",
				sandboxPath
			);
		}


		return localize(
			'runInTerminalTool.sandboxCommandFailed',
			"Command failed while running in sandboxed mode. Do not switch to other tools. Retry the command in sandboxed mode at most once, and only if the result suggests the failure was transient."
		);
	}

	private _extractSandboxPath(line: string): string | undefined {
		// Matches paths wrapped in square brackets, e.g. "[/tmp/file.txt]".
		const bracketedPath = line.match(/\[(\/[^\]\r\n]+)\]/);
		if (bracketedPath?.[1]) {
			return bracketedPath[1].trim();
		}

		// Matches quoted absolute paths, e.g. "'/tmp/file.txt'" or '"/tmp/file.txt"'.
		const quotedPath = line.match(/["'`](\/.+?)["'`]/);
		if (quotedPath?.[1]) {
			return quotedPath[1];
		}

		// Matches unquoted absolute paths followed by ": " message text, plain whitespace text,
		// or end of line, e.g. "/home/user/file.txt: Warning..." or "/home/user/file.txt Warning...".
		const inlinePath = line.match(/(\/[^\s:\r\n]+)(?=:\s|\s|$)/);
		if (inlinePath?.[1]) {
			return inlinePath[1].trim();
		}

		// Matches a trailing absolute path at the end of the line, e.g. "... open /tmp/file.txt".
		const trailingPath = line.match(/(\/[\w.\-~/ ]+)$/);
		return trailingPath?.[1]?.trim();
	}

	private async _getSandboxPathToAllow(line: string): Promise<string | undefined> {
		const extractedPath = this._extractSandboxPath(line);
		if (!extractedPath) {
			return undefined;
		}

		if (await this._fileService.exists(URI.file(extractedPath))) {
			return extractedPath;
		}

		const parentPath = posix.dirname(extractedPath);
		return parentPath && parentPath !== extractedPath ? parentPath : extractedPath;
	}
}
