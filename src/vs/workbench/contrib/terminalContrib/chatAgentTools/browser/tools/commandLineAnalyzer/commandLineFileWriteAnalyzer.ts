/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { win32, posix } from '../../../../../../../base/common/path.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { containsCmdDelayedExpansion } from '../../../../../../../platform/terminal/common/autoApprove/cmdDelayedExpansion.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { TreeSitterCommandParserLanguage, type TreeSitterCommandParser } from '../../treeSitterCommandParser.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { isString } from '../../../../../../../base/common/types.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { IUriIdentityService } from '../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { parseCommand } from '../terminalCommandParser.js';

const nullDevice = Symbol('null device');

type FileWrite = URI | string | typeof nullDevice;
type RawFileWrite = { readonly value: string; readonly source: 'redirect' | 'command'; readonly hasUnquotedPathExpansion?: boolean } | typeof nullDevice;

export class CommandLineFileWriteAnalyzer extends Disposable implements ICommandLineAnalyzer {
	constructor(
		private readonly _treeSitterCommandParser: TreeSitterCommandParser,
		private readonly _log: (message: string, ...args: unknown[]) => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@ILabelService private readonly _labelService: ILabelService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
	}

	async analyze(options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult> {
		if (this._hasUnquotedZshNumericRange(options.commandLine, options.shell)) {
			this._log('File writes blocked because the command contains an unquoted zsh numeric range');
			return { isAutoApproveAllowed: false };
		}
		let fileWrites: FileWrite[];
		let hasSequentialCommands: boolean;
		let hasUnquotedPathExpansion: boolean;
		let hasUnanalyzablePath: boolean;
		try {
			({ fileWrites, hasUnquotedPathExpansion, hasUnanalyzablePath } = await this._getFileWrites(options));
			const parsedCommand = parseCommand(options.commandLine);
			const executionUnitCount = await this._treeSitterCommandParser.countExecutionUnits(options.treeSitterLanguage, options.commandLine);
			hasSequentialCommands =
				(parsedCommand?.segments.length ?? 0) > 1 ||
				executionUnitCount > (parsedCommand?.segments.length ?? 0);
		} catch (e) {
			console.error(e);
			this._log('Failed to get file writes via grammar', options.treeSitterLanguage);
			return {
				isAutoApproveAllowed: false
			};
		}
		return this._getResult(options, fileWrites, hasSequentialCommands, hasUnquotedPathExpansion, hasUnanalyzablePath);
	}

	private _hasUnquotedZshNumericRange(commandLine: string, shell: string): boolean {
		if (!/(^|[/\\])zsh(?:\s|$)/i.test(shell)) {
			return false;
		}
		let inSingleQuote = false;
		let inDoubleQuote = false;
		for (let i = 0; i < commandLine.length; i++) {
			const char = commandLine[i];
			if (char === '\\' && !inSingleQuote) {
				i++;
				continue;
			}
			if (char === '\'' && !inDoubleQuote) {
				inSingleQuote = !inSingleQuote;
				continue;
			}
			if (char === '"' && !inSingleQuote) {
				inDoubleQuote = !inDoubleQuote;
				continue;
			}
			if (char === '<' && !inSingleQuote && !inDoubleQuote && /^<\d+-\d+>/.test(commandLine.slice(i))) {
				return true;
			}
		}
		return false;
	}

	private async _getFileWrites(options: ICommandLineAnalyzerOptions): Promise<{ fileWrites: FileWrite[]; hasUnquotedPathExpansion: boolean; hasUnanalyzablePath: boolean }> {
		let fileWrites: FileWrite[] = [];

		// Get file writes from redirections (via tree-sitter grammar)
		const capturedFileWrites = (await this._treeSitterCommandParser.getFileWrites(options.treeSitterLanguage, options.commandLine))
			.map(rawFileWrite => this._mapRawFileWrite(options, rawFileWrite, 'redirect'));

		// Get file writes from command-specific parsers (e.g., sed -i in-place editing)
		const commandFileWrites = (await this._treeSitterCommandParser.getCommandFileWriteDetails(options.treeSitterLanguage, options.commandLine))
			.map(write => this._mapRawFileWrite(options, write.path, 'command', write.hasUnquotedPathExpansion));

		const allCapturedFileWrites = [...capturedFileWrites, ...commandFileWrites];
		const bashPaths = options.treeSitterLanguage === TreeSitterCommandParserLanguage.Bash
			? allCapturedFileWrites
				.filter((fileWrite): fileWrite is Exclude<RawFileWrite, typeof nullDevice> => fileWrite !== nullDevice)
				.map(fileWrite => fileWrite.source === 'redirect'
					? this._parseBashLiteralPath(fileWrite.value)
					: {
						value: fileWrite.value,
						hasUnquotedPathExpansion: fileWrite.hasUnquotedPathExpansion ?? true,
						hasHistoryExpansion: this._parseBashLiteralPath(fileWrite.value)?.hasHistoryExpansion ?? true,
					})
			: [];
		const hasUnquotedPathExpansion = bashPaths.some(path => path?.hasUnquotedPathExpansion);
		let hasUnanalyzablePath =
			bashPaths.some(path => path === undefined) ||
			bashPaths.some(path => path?.hasHistoryExpansion) ||
			this._isCmdShell(options);

		if (allCapturedFileWrites.length) {
			const cwd = options.cwd;
			if (cwd) {
				this._log('Detected cwd', cwd.toString());
				fileWrites = allCapturedFileWrites.map(e => {
					if (e === nullDevice) {
						return e;
					}

					let value = e.value;
					if (options.treeSitterLanguage === TreeSitterCommandParserLanguage.Bash && e.source === 'redirect') {
						value = this._parseBashLiteralPath(value)?.value ?? value;
					} else if (options.treeSitterLanguage === TreeSitterCommandParserLanguage.PowerShell) {
						const parsed = this._parsePowerShellLiteralPath(value);
						if (parsed === undefined) {
							hasUnanalyzablePath = true;
						} else {
							value = parsed;
						}
					}

					// Surrounding quotes where it's difficult to determine whether this is absolute
					// or relative
					if (options.treeSitterLanguage !== TreeSitterCommandParserLanguage.Bash && /^['"].*['"]$/.test(value)) {
						// Strip surrounding quotes to get a more reasonable view of the path. Note
						// that this may not get the real file in the case of inner quotes, but the
						// important thing here is the resolving whether it's absolute or not.
						value = this._stripSurroundingQuotes(value);
					}

					if (options.os === OperatingSystem.Windows && /^[A-Za-z]:[^\\/]/.test(value)) {
						hasUnanalyzablePath = true;
					}

					const uriPath = options.os === OperatingSystem.Windows ? value.replaceAll('\\', '/') : value;

					// Absolute
					const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(value) : posix.isAbsolute(value);
					if (isAbsolute) {
						// Ensure cwd's scheme and authority is retained
						return cwd.with({ path: uriPath });
					}

					// Relative
					return cwd.with({ path: `${cwd.path}${cwd.path.endsWith('/') ? '' : '/'}${uriPath}` });
				});
			} else {
				this._log('Cwd could not be detected');
				fileWrites = allCapturedFileWrites.map(fileWrite => fileWrite === nullDevice ? fileWrite : fileWrite.value);
			}
		}
		this._log('File writes detected', fileWrites.map(e => e.toString()));
		return { fileWrites, hasUnquotedPathExpansion, hasUnanalyzablePath };
	}

	private _isCmdShell(options: ICommandLineAnalyzerOptions): boolean {
		return options.os === OperatingSystem.Windows && /(?:^|[\\/])cmd(?:\.exe)?$/i.test(options.shell);
	}

	private _parseBashLiteralPath(value: string): { value: string; hasUnquotedPathExpansion: boolean; hasHistoryExpansion: boolean } | undefined {
		let inSingleQuotes = false;
		let inDoubleQuotes = false;
		let result = '';
		let hasUnquotedPathExpansion = false;
		let hasHistoryExpansion = false;
		for (let i = 0; i < value.length; i++) {
			const char = value[i];

			if (inSingleQuotes) {
				if (char === '\'') {
					inSingleQuotes = false;
				} else {
					result += char;
				}
				continue;
			}

			if (inDoubleQuotes) {
				if (char === '"') {
					inDoubleQuotes = false;
				} else if (char === '\\' && i + 1 < value.length && '$`"\\\n'.includes(value[i + 1])) {
					i++;
					if (value[i] !== '\n') {
						result += value[i];
					}
				} else if (char === '\\' && value[i + 1] === '!') {
					result += '\\!';
					i++;
				} else {
					if (char === '!' && this._isBashHistoryDesignator(value, i)) {
						hasHistoryExpansion = true;
					}
					result += char;
				}
				continue;
			}

			if (char === '\'') {
				inSingleQuotes = true;
				continue;
			}
			if (char === '"') {
				inDoubleQuotes = true;
				continue;
			}
			if (char === '\\') {
				if (++i >= value.length) {
					return undefined;
				}
				if (value[i] !== '\n') {
					result += value[i];
				}
				continue;
			}
			if (char === '*' || char === '?' || char === '[') {
				hasUnquotedPathExpansion = true;
			}
			if (char === '!' && this._isBashHistoryDesignator(value, i)) {
				hasHistoryExpansion = true;
			}
			result += char;
		}
		return inSingleQuotes || inDoubleQuotes ? undefined : { value: result, hasUnquotedPathExpansion, hasHistoryExpansion };
	}

	private _isBashHistoryDesignator(value: string, index: number): boolean {
		return index < value.length;
	}

	private _parsePowerShellLiteralPath(value: string): string | undefined {
		if (value.startsWith('\'') || value.endsWith('\'')) {
			if (!(value.startsWith('\'') && value.endsWith('\''))) {
				return undefined;
			}
			return value.slice(1, -1).replaceAll('\'\'', '\'');
		}
		if (value.startsWith('"') || value.endsWith('"')) {
			if (!(value.startsWith('"') && value.endsWith('"'))) {
				return undefined;
			}
			const inner = value.slice(1, -1);
			if (inner.includes('`')) {
				return undefined;
			}
			return inner;
		}
		return value;
	}

	private _stripSurroundingQuotes(text: string): string {
		let result = text;
		while (
			(result.startsWith('"') && result.endsWith('"')) ||
			(result.startsWith('\'') && result.endsWith('\''))
		) {
			result = result.slice(1, -1);
		}
		return result;
	}

	private _mapRawFileWrite(options: ICommandLineAnalyzerOptions, rawFileWrite: string, source: 'redirect' | 'command', hasUnquotedPathExpansion?: boolean): RawFileWrite {
		if (options.treeSitterLanguage === TreeSitterCommandParserLanguage.PowerShell) {
			return rawFileWrite === '$null'
				? nullDevice
				: { value: rawFileWrite, source, hasUnquotedPathExpansion };
		}
		return rawFileWrite === '/dev/null'
			? nullDevice
			: { value: rawFileWrite, source, hasUnquotedPathExpansion };
	}

	private async _getResult(options: ICommandLineAnalyzerOptions, fileWrites: FileWrite[], hasSequentialCommands: boolean, hasUnquotedPathExpansion: boolean, hasUnanalyzablePath: boolean): Promise<ICommandLineAnalyzerResult> {
		let isAutoApproveAllowed = true;
		if (fileWrites.length > 0) {
			const blockDetectedFileWrites = this._configurationService.getValue<string>(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites);
			switch (blockDetectedFileWrites) {
				case 'all': {
					isAutoApproveAllowed = false;
					this._log('File writes blocked due to "all" setting');
					break;
				}
				case 'outsideWorkspace': {
					const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
					if (workspaceFolders.length > 0) {
						if (hasUnanalyzablePath) {
							isAutoApproveAllowed = false;
							this._log('File writes blocked because the destination could not be parsed');
							break;
						}
						if (hasUnquotedPathExpansion) {
							isAutoApproveAllowed = false;
							this._log('File writes blocked because the destination contains unquoted pathname expansion');
							break;
						}
						if (hasSequentialCommands && fileWrites.some(fileWrite => fileWrite !== nullDevice)) {
							isAutoApproveAllowed = false;
							this._log('File writes blocked because earlier commands can change the destination');
							break;
						}
						const workspaceRoots = await Promise.all(workspaceFolders.map(async folder => ({
							literal: this._uriIdentityService.extUri.normalizePath(folder.uri),
							canonical: await this._canonicalize(folder.uri),
						})));
						for (const fileWrite of fileWrites) {
							if (fileWrite === nullDevice) {
								this._log('File write to null device allowed', URI.isUri(fileWrite) ? fileWrite.toString() : fileWrite);
								continue;
							}

							if (isString(fileWrite)) {
								const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(fileWrite) : posix.isAbsolute(fileWrite);
								if (!isAbsolute) {
									isAutoApproveAllowed = false;
									this._log('File write blocked due to unknown terminal cwd', fileWrite);
									break;
								}
							}
							const rawFileUri = URI.isUri(fileWrite) ? fileWrite : URI.file(fileWrite);
							const fileUri = this._uriIdentityService.extUri.normalizePath(rawFileUri);
							// TODO: Handle command substitutions/complex destinations properly https://github.com/microsoft/vscode/issues/274167
							// TODO: Handle environment variables properly https://github.com/microsoft/vscode/issues/274166
							// `~` catches POSIX tilde expansion (e.g. `~/foo`), `%` catches Windows
							// environment variable expansion (e.g. `%APPDATA%\foo`), and the shared
							// predicate catches CMD delayed expansion (e.g. `!APPDATA!\foo`). These are
							// not recognized as absolute by `posix.isAbsolute` / `win32.isAbsolute`, so
							// without this guard they would be joined onto cwd and incorrectly classified
							// as inside the workspace while expanding at runtime to a location outside it.
							if (fileUri.fsPath.match(/[$\(\){}`~%]/) || containsCmdDelayedExpansion(fileUri.fsPath)) {
								isAutoApproveAllowed = false;
								this._log('File write blocked due to likely containing a variable, sub-command, or tilde/environment-variable expansion', fileUri.toString());
								break;
							}

							const canonicalFileUri = await this._canonicalize(rawFileUri);
							if (!canonicalFileUri) {
								isAutoApproveAllowed = false;
								this._log('File write blocked because the canonical path could not be resolved', fileUri.toString());
								break;
							}

							const isInsideWorkspace = workspaceRoots.some(folder =>
								!!folder.canonical &&
								this._uriIdentityService.extUri.isEqualOrParent(fileUri, folder.literal) &&
								this._uriIdentityService.extUri.isEqualOrParent(canonicalFileUri, folder.canonical)
							);
							if (!isInsideWorkspace) {
								// Allow writes to OS temp locations when the user has opted into
								// "Allow All Commands in this Session" via the confirmation.
								if (
									options.hasSessionAutoApproval &&
									fileUri.scheme === canonicalFileUri.scheme &&
									fileUri.authority === canonicalFileUri.authority &&
									this._isInTempDirectory(fileUri.path, options.os) &&
									this._isInTempDirectory(canonicalFileUri.path, options.os)
								) {
									continue;
								}
								isAutoApproveAllowed = false;
								this._log('File write blocked outside workspace', fileUri.toString());
								break;
							}
						}
					} else {
						// No workspace folders, allow safe null device paths even without workspace
						const hasOnlyNullDevices = fileWrites.every(fw => fw === nullDevice);
						if (!hasOnlyNullDevices) {
							isAutoApproveAllowed = false;
							this._log('File writes blocked - no workspace folders');
						}
					}
					break;
				}
				case 'never':
				default: {
					break;
				}
			}
		}

		const disclaimers: string[] = [];
		if (fileWrites.length > 0) {
			const fileWritesList = fileWrites.map(fw => `\`${URI.isUri(fw) ? this._labelService.getUriLabel(fw) : fw === nullDevice ? '/dev/null' : fw.toString()}\``).join(', ');
			if (!isAutoApproveAllowed) {
				disclaimers.push(localize('runInTerminal.fileWriteBlockedDisclaimer', 'File write operations detected that cannot be auto approved: {0}', fileWritesList));
			} else {
				disclaimers.push(localize('runInTerminal.fileWriteDisclaimer', 'File write operations detected: {0}', fileWritesList));
			}
		}
		return {
			isAutoApproveAllowed,
			disclaimers,
		};
	}

	private async _canonicalize(uri: URI): Promise<URI | undefined> {
		const suffix: string[] = [];
		let current = uri;
		while (true) {
			try {
				const real = await this._fileService.realpath(current);
				if (!real) {
					return undefined;
				}
				// A missing parent could be created as a symlink earlier in the
				// same compound command, so only a missing final path segment is safe.
				if (suffix.length > 1) {
					return undefined;
				}
				return suffix.length ? this._uriIdentityService.extUri.joinPath(real, ...suffix) : real;
			} catch (error) {
				if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					return undefined;
				}
			}

			try {
				await this._fileService.stat(current);
				return undefined;
			} catch (error) {
				if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					return undefined;
				}
			}

			const parent = this._uriIdentityService.extUri.dirname(current);
			if (this._uriIdentityService.extUri.isEqual(parent, current)) {
				return undefined;
			}
			suffix.unshift(this._uriIdentityService.extUri.basename(current));
			current = parent;
		}
	}

	/**
	 * Returns true if the given URI path points inside an OS temporary directory.
	 * On posix systems this matches `/tmp/`. On Windows this matches any `temp`
	 * or `tmp` directory segment (case-insensitive), which covers the canonical
	 * user temp (`...\AppData\Local\Temp\`), system temp (`C:\Windows\Temp\`),
	 * and common dev conventions like `C:\Temp\` and `C:\tmp\`.
	 */
	private _isInTempDirectory(uriPath: string, os: OperatingSystem | undefined): boolean {
		if (os === OperatingSystem.Windows) {
			// Windows paths from URI.with({path}) keep their original backslashes,
			// so accept either separator. Require content after the segment so the
			// directory itself is not matched.
			return /[\\/]te?mp[\\/].+/i.test(uriPath);
		}
		return uriPath.startsWith('/tmp/');
	}
}
