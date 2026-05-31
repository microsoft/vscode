/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, commands, ThemeIcon, window } from 'vscode';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { InlineEditRequestLogContext } from '../../../../platform/inlineEdits/common/inlineEditLogContext';
import { TsExpr } from '../../../../platform/inlineEdits/common/utils/tsExpr';
import { LogEntry } from '../../../../platform/workspaceRecorder/common/workspaceLog';
import { assertNever } from '../../../../util/vs/base/common/assert';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { IObservable, ISettableObservable } from '../../../../util/vs/base/common/observableInternal';
import { basename, extname } from '../../../../util/vs/base/common/path';
import { openIssueReporter } from '../../../conversation/vscode-node/feedbackReporter';
import { XtabProvider } from '../../../xtab/node/xtabProvider';
import { defaultNextEditProviderId } from '../../node/createNextEditProvider';
import { DebugRecorder } from '../../node/debugRecorder';

export const reportFeedbackCommandId = 'github.copilot.debug.inlineEdit.reportFeedback';
const pickProviderId = 'github.copilot.debug.inlineEdit.pickProvider';

export type InlineCompletionCommand = { command: Command; icon: ThemeIcon };

export class InlineEditDebugComponent extends Disposable {

	constructor(
		private readonly _internalActionsEnabled: IObservable<boolean>,
		private readonly _inlineEditsEnabled: IObservable<boolean>,
		private readonly _debugRecorder: DebugRecorder,
		private readonly _inlineEditsProviderId: ISettableObservable<string | undefined>,
	) {
		super();

		this._register(commands.registerCommand(reportFeedbackCommandId, async (args: { logContext: InlineEditRequestLogContext }) => {
			if (!this._inlineEditsEnabled.get()) {
				return;
			}
			const isInternalUser = this._internalActionsEnabled.get();

			const data = new SimpleMarkdownBuilder();

			data.appendLine(`# Inline Edits Debug Info`);

			if (!isInternalUser) {
				// Public users
				data.appendLine(args.logContext.toMinimalLog());
			} else {
				// Internal users
				data.appendLine(args.logContext.toLogDocument());

				let logFilteredForSensitiveFiles: LogEntry[] | undefined;
				{
					const bookmark = args.logContext.recordingBookmark;
					const log = this._debugRecorder.getRecentLog(bookmark);

					let hasRemovedSensitiveFilesFromHistory = false;
					let sectionContent;
					if (log === undefined) {
						sectionContent = ['Could not get recording to generate stest (likely because there was no corresponding workspaceRoot for this file)'];
					} else {
						logFilteredForSensitiveFiles = filterLogForSensitiveFiles(log);
						hasRemovedSensitiveFilesFromHistory = log.length !== logFilteredForSensitiveFiles.length;
						const stest = generateSTest(logFilteredForSensitiveFiles);

						sectionContent = [
							'```typescript',
							stest,
							'```'
						];
					}
					const header = hasRemovedSensitiveFilesFromHistory ? 'STest (sensitive files removed)' : 'STest';
					data.appendSection(header, sectionContent);
					data.appendLine('');
				}

				{
					if (logFilteredForSensitiveFiles !== undefined) {
						data.appendSection('Recording', ['```json', JSON.stringify(logFilteredForSensitiveFiles, undefined, 2), '```']);
					}
				}

				{
					const uiRepro = await extractInlineEditRepro();
					if (uiRepro) {
						data.appendSection('UI Repro', ['```', uiRepro, '```']);
					}
				}
			}

			await openIssueReporter({
				title: '',
				data: data.toString(),
				issueBody: '# Description\nPlease describe the expected outcome and attach a screenshot!',
				public: !isInternalUser
			});
		}));

		this._register(commands.registerCommand(pickProviderId, async (args: unknown) => {
			if (!this._inlineEditsEnabled.get()) { return; }
			if (!this._internalActionsEnabled.get()) { return; }

			const selectedProvider = await window.showQuickPick(this._getAvailableProviderIds(), { placeHolder: 'Select inline edits provider' });
			if (!selectedProvider || selectedProvider === this._inlineEditsProviderId.get()) { return; }

			this._inlineEditsProviderId.set(selectedProvider, undefined);

			const pick = await window.showWarningMessage(`Inline edits provider set to ${selectedProvider}. Reloading will undo this change. Set "github.copilot.${ConfigKey.TeamInternal.InlineEditsProviderId.id}": "${selectedProvider}" in your settings file to make the change persistent.`, 'Open settings (JSON)');
			if (!pick) { return; }

			await commands.executeCommand('workbench.action.openSettingsJson', { revealSetting: { key: `github.copilot.${ConfigKey.TeamInternal.InlineEditsProviderId.id}`, edit: true } });
		}));
	}

	getCommands(logContext: InlineEditRequestLogContext): InlineCompletionCommand[] {
		const menuCommands: InlineCompletionCommand[] = [];
		menuCommands.push({
			command: {
				command: reportFeedbackCommandId,
				title: 'Feedback',
				arguments: [{ logContext }],
			},
			icon: new ThemeIcon('feedback')
		});

		if (this._internalActionsEnabled.get()) {
			if (this._getAvailableProviderIds().length > 1) {
				menuCommands.push({
					command: {
						command: pickProviderId,
						title: `Model: ${this._inlineEditsProviderId.get() ?? defaultNextEditProviderId}`,
					},
					icon: new ThemeIcon('wand'),
				});
			}
		}

		return menuCommands;
	}

	private _getAvailableProviderIds(): string[] {
		const providers = [XtabProvider.ID];

		const providerId = this._inlineEditsProviderId.get();
		if (providerId && !providers.includes(providerId)) {
			providers.push(providerId);
		}

		return providers;
	}
}

function generateSTest(log: LogEntry[]): string {
	return TsExpr.str`
stest({ description: 'MyTest', language: 'typescript' }, collection => tester.runAndScoreTestFromRecording(collection,
	loadFile({
		fileName: "MyTest/recording.w.json",
		fileContents: ${JSON.stringify({ log })},
	})
));
`.toString();
}

/**
 * Sensitive file patterns that should be filtered from logs to prevent
 * accidental exposure of secrets, credentials, or private configuration.
 */
const SENSITIVE_FILE_PATTERNS = {
	// Exact basename matches (case-insensitive)
	exactNames: new Set([
		'settings.json',      // VS Code settings
		'keybindings.json',   // VS Code keybindings (may contain custom bindings)
		'launch.json',        // Debug configs often contain env vars with secrets
		'.npmrc',             // npm auth tokens
		'.netrc',             // Network credentials
		'.htpasswd',          // HTTP auth passwords
		'.gitconfig',         // Git config can contain tokens
		'credentials',        // Generic credentials file
		'credentials.json',
		'secrets.json',
		'config.json',        // Often contains API keys
		'password.txt',       // Plain text password files
		'passwords.txt',
		'password.json',
		'passwords.json',
		'token.json',         // Token storage files
		'tokens.json',
		'token.txt',
		'tokens.txt',
	]),

	// File extensions that are sensitive (checked with endsWith)
	extensions: [
		'.env',               // Files ending with .env (e.g., app.env, local.env)
		'.pem',               // Private keys
		'.key',               // Private keys
		'.p12',               // PKCS#12 certificates
		'.pfx',               // PKCS#12 certificates
	],

	// Prefixes for dotfiles that are sensitive (e.g., .env, .env.local, .env.production)
	sensitiveDotfilePrefixes: [
		'.env',               // Environment files (.env, .env.local, .env.development, etc.)
	],

	// Path segments that indicate sensitive directories
	sensitivePathSegments: [
		'.aws',               // AWS credentials
		'.ssh',               // SSH keys
		'.gnupg',             // GPG keys
		'.docker',            // Docker config with registry auth
	],

	// Filename patterns (using includes)
	patterns: [
		'id_rsa',             // SSH private keys
		'id_ed25519',         // SSH private keys
		'id_ecdsa',           // SSH private keys
		'id_dsa',             // SSH private keys
		'.secret',            // Files with .secret in name
		'_secret',            // Files with _secret in name
	],
};

/**
 * Check if a file path represents a sensitive file that should be filtered.
 */
function isSensitiveFile(relativePath: string): boolean {
	// Normalize path separators for consistent handling across platforms
	const normalizedPath = relativePath.replace(/\\/g, '/');
	const pathParts = normalizedPath.split('/');

	// Use basename/extname on normalized path for robust filename extraction
	const fileName = basename(normalizedPath);
	const fileNameLower = fileName.toLowerCase();
	const fileExt = extname(normalizedPath).toLowerCase();

	// Check exact filename matches (case-insensitive)
	if (SENSITIVE_FILE_PATTERNS.exactNames.has(fileNameLower)) {
		return true;
	}

	// Check file extensions (e.g., .pem, .key, .p12, .pfx, files ending in .env like app.env)
	for (const ext of SENSITIVE_FILE_PATTERNS.extensions) {
		if (fileExt === ext || fileNameLower.endsWith(ext)) {
			return true;
		}
	}

	// Check sensitive dotfile prefixes (e.g., .env, .env.local, .env.production)
	for (const prefix of SENSITIVE_FILE_PATTERNS.sensitiveDotfilePrefixes) {
		if (fileNameLower === prefix || fileNameLower.startsWith(prefix + '.')) {
			return true;
		}
	}

	// Check sensitive path segments
	for (const segment of SENSITIVE_FILE_PATTERNS.sensitivePathSegments) {
		if (pathParts.some(part => part === segment)) {
			return true;
		}
	}

	// Check filename patterns
	for (const pattern of SENSITIVE_FILE_PATTERNS.patterns) {
		if (fileNameLower.includes(pattern)) {
			return true;
		}
	}

	return false;
}

export function filterLogForSensitiveFiles(log: LogEntry[]): LogEntry[] {
	const sensitiveFileIds = new Set<number>();

	const safeEntries: LogEntry[] = [];

	for (const entry of log) {
		switch (entry.kind) {
			// safe entry
			case 'meta':
			case 'header':
			case 'applicationStart':
			case 'event':
			case 'bookmark':
				safeEntries.push(entry);
				break;

			// check if newly encountered document is sensitive
			// if so, add it to the sensitive file ids
			// otherwise, add it to the safe entries
			case 'documentEncountered': {
				if (isSensitiveFile(entry.relativePath)) {
					sensitiveFileIds.add(entry.id);
				} else {
					safeEntries.push(entry);
				}
				break;
			}

			// ensure the entry doesn't belong to a sensitive file
			case 'setContent':
			case 'storeContent':
			case 'restoreContent':
			case 'opened':
			case 'closed':
			case 'changed':
			case 'focused':
			case 'selectionChanged':
			case 'documentEvent': {
				if (!sensitiveFileIds.has(entry.id)) {
					safeEntries.push(entry);
				}
				break;
			}

			default: {
				assertNever(entry);
			}
		}
	}

	return safeEntries;
}


async function extractInlineEditRepro() {
	const commandId = 'editor.action.inlineSuggest.dev.extractRepro';
	const result: { reproCase: string } | undefined = await commands.executeCommand(commandId);
	return result?.reproCase;
}

class SimpleMarkdownBuilder {
	private readonly _lines: string[] = [];

	constructor() {
	}

	appendLine(line: string): void {
		this._lines.push(line);
	}

	toString(): string {
		return this._lines.join('\n');
	}

	appendSection(header: string, lines: string[]): void {
		this._lines.push(
			`<details><summary>${header}</summary>`,
			'', // we need separation between the summary and the content
			...lines,
			`</details>`
		);
	}
}
