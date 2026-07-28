/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, MarkdownString, StatusBarAlignment, StatusBarItem, ThemeColor, Uri, window, workspace } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { DebugRecorderBookmark } from '../../../../platform/inlineEdits/common/debugRecorderBookmark';
import { ILogger, ILogService } from '../../../../platform/log/common/logService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { deserializeEdit, ISerializedEdit, LogEntry, serializeEdit } from '../../../../platform/workspaceRecorder/common/workspaceLog';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { DebugRecorder } from '../../node/debugRecorder';
import { filterLogForSensitiveFiles } from './inlineEditDebugComponent';
import { NesFeedbackSubmitter } from './nesFeedbackSubmitter';

export const copilotNesCaptureMode = 'copilotNesCaptureMode';

interface CaptureState {
	active: boolean;
	startBookmark: DebugRecorderBookmark;
	endBookmark?: DebugRecorderBookmark;
	startDocumentId: DocumentId;
	startTime: number;
	trigger: 'rejection' | 'manual';
	originalNesMetadata?: {
		requestUuid: string;
		providerInfo?: string;
		modelName?: string;
		endpointUrl?: string;
		suggestionText?: string;
		suggestionRange?: [number, number, number, number];
		documentPath?: string;
	};
}

/**
 * Controller for capturing expected edit suggestions from users when NES suggestions
 * are rejected or don't appear. Leverages DebugRecorder's automatic edit tracking.
 */
export class ExpectedEditCaptureController extends Disposable {

	private static readonly CAPTURE_FOLDER = '.copilot/nes-feedback';

	private _state: CaptureState | undefined;
	private _statusBarItem: StatusBarItem | undefined;
	private _statusBarAnimationInterval: ReturnType<typeof setInterval> | undefined;
	private readonly _feedbackSubmitter: NesFeedbackSubmitter;
	private readonly _logger: ILogger;

	constructor(
		private readonly _debugRecorder: DebugRecorder,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IFetcherService private readonly _fetcherService: IFetcherService,
	) {
		super();
		this._logger = this._logService.createSubLogger(['NES', 'Capture']);
		this._feedbackSubmitter = new NesFeedbackSubmitter(
			this._logService,
			this._authenticationService,
			this._fetcherService
		);
	}

	/**
	 * Check if the feature is enabled in settings.
	 */
	public get isEnabled(): boolean {
		return this._configurationService.getConfig(ConfigKey.TeamInternal.RecordExpectedEditEnabled) ?? false;
	}

	/**
	 * Check if automatic capture on rejection is enabled.
	 */
	public get captureOnReject(): boolean {
		return this._configurationService.getConfig(ConfigKey.TeamInternal.RecordExpectedEditOnReject) ?? true;
	}

	/**
	 * Check if a capture session is currently active.
	 */
	public get isCaptureActive(): boolean {
		return this._state?.active ?? false;
	}

	/**
	 * Start a capture session.
	 * @param trigger How the capture was initiated
	 * @param nesMetadata Optional metadata about the rejected NES suggestion
	 */
	public async startCapture(
		trigger: 'rejection' | 'manual',
		nesMetadata?: CaptureState['originalNesMetadata']
	): Promise<void> {
		if (!this.isEnabled) {
			this._logger.trace('Feature disabled, ignoring start request');
			return;
		}

		if (this._state?.active) {
			this._logger.trace('Capture already active, ignoring start request');
			return;
		}

		const editor = window.activeTextEditor;
		if (!editor) {
			this._logger.trace('No active editor, cannot start capture');
			return;
		}

		// Create bookmark to mark the start point
		const startBookmark = this._debugRecorder.createBookmark();
		const documentId = DocumentId.create(editor.document.uri.toString());

		this._state = {
			active: true,
			startBookmark,
			startDocumentId: documentId,
			startTime: Date.now(),
			trigger,
			originalNesMetadata: nesMetadata
		};

		// Set context key to enable keybindings
		await commands.executeCommand('setContext', copilotNesCaptureMode, true);

		// Show status bar message
		this._createStatusBarItem();

		this._logger.info(`Started capture session: trigger=${trigger}, documentUri=${editor.document.uri.toString()}, hasMetadata=${!!nesMetadata}`);
	}

	/**
	 * Confirm and save the capture.
	 */
	public async confirmCapture(): Promise<void> {
		if (!this._state?.active) {
			this._logger.trace('No active capture to confirm');
			return;
		}

		try {
			// Create end bookmark
			const endBookmark = this._debugRecorder.createBookmark();
			this._state.endBookmark = endBookmark;

			// Get log slices
			const logUpToStart = this._debugRecorder.getRecentLog(this._state.startBookmark);
			const logUpToEnd = this._debugRecorder.getRecentLog(endBookmark);

			if (!logUpToStart || !logUpToEnd) {
				this._logger.warn('Failed to retrieve logs from debug recorder');
				await this.abortCapture();
				return;
			}

			// Extract edits between bookmarks
			const nextUserEdit = this._extractEditsBetweenBookmarks(
				logUpToStart,
				logUpToEnd,
				this._state.startDocumentId
			);

			// Build recording
			// Filter out both non-interacted documents and sensitive files (settings.json, .env)
			const filteredLog = filterLogForSensitiveFiles(this._filterLogForNonInteractedDocuments(logUpToStart));
			const recording = {
				log: filteredLog,
				nextUserEdit: nextUserEdit
			};

			// Save to disk
			const noEditExpected = nextUserEdit?.edit && typeof nextUserEdit.edit === 'object' && '__marker__' in nextUserEdit.edit && nextUserEdit.edit.__marker__ === 'NO_EDIT_EXPECTED';
			await this._saveRecording(recording, this._state, noEditExpected);

			const durationMs = Date.now() - this._state.startTime;
			this._logger.info(`Capture confirmed and saved: durationMs=${durationMs}, hasEdit=${!noEditExpected}, noEditExpected=${noEditExpected}, trigger=${this._state.trigger}`);

			if (noEditExpected) {
				window.showInformationMessage('Captured: No edit expected (this is valid feedback!).');
			} else {
				window.showInformationMessage('Expected edit captured successfully!');
			}
		} catch (error) {
			this._logger.error(error instanceof Error ? error : String(error), 'Error confirming capture');
			window.showErrorMessage('Failed to save expected edit capture');
		} finally {
			await this.cleanup();
		}
	}

	/**
	 * Abort the current capture session without saving.
	 */
	public async abortCapture(): Promise<void> {
		if (!this._state?.active) {
			return;
		}

		this._logger.info('Capture aborted');
		await this.cleanup();
	}

	/**
	 * Clean up capture state and UI.
	 */
	private async cleanup(): Promise<void> {
		this._state = undefined;
		await commands.executeCommand('setContext', copilotNesCaptureMode, false);
		this._disposeStatusBarItem();
	}

	/**
	 * Create and show the status bar item during capture with animated attention-grabbing effects.
	 */
	private _createStatusBarItem(): void {
		if (this._statusBarItem) {
			this._statusBarItem.dispose();
		}
		if (this._statusBarAnimationInterval) {
			clearInterval(this._statusBarAnimationInterval);
		}

		this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 10000); // High priority for visibility
		this._statusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground');

		// Rich markdown tooltip
		const ctrlOrCmd = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
		const tooltip = new MarkdownString();
		tooltip.appendMarkdown('### 🔴 NES CAPTURE MODE ACTIVE\n\n');
		tooltip.appendMarkdown('Type your expected edit, then:\n\n');
		tooltip.appendMarkdown(`- **${ctrlOrCmd}+Enter** — Save your edits\n`);
		tooltip.appendMarkdown(`- **${ctrlOrCmd}+Enter (empty)** — No edit expected\n`);
		tooltip.appendMarkdown('- **Esc** — Cancel capture\n');
		tooltip.isTrusted = true;
		this._statusBarItem.tooltip = tooltip;

		// Animated icons and text for attention
		const icons = ['$(record)', '$(alert)', '$(warning)', '$(zap)'];
		let iconIndex = 0;
		let isExpanded = false;

		const updateText = () => {
			if (!this._statusBarItem) {
				return;
			}
			const icon = icons[iconIndex];
			if (isExpanded) {
				this._statusBarItem.text = `${icon} NES CAPTURE MODE: ${ctrlOrCmd}+Enter=Save, Esc=Cancel ${icon}`;
			} else {
				this._statusBarItem.text = `${icon} NES CAPTURE MODE ACTIVE ${icon}`;
			}
			iconIndex = (iconIndex + 1) % icons.length;
			isExpanded = !isExpanded;
		};

		updateText(); // Initial text
		this._statusBarAnimationInterval = setInterval(updateText, 1000);

		this._statusBarItem.show();
	}

	/**
	 * Dispose the status bar item and stop animation.
	 */
	private _disposeStatusBarItem(): void {
		if (this._statusBarAnimationInterval) {
			clearInterval(this._statusBarAnimationInterval);
			this._statusBarAnimationInterval = undefined;
		}
		if (this._statusBarItem) {
			this._statusBarItem.dispose();
			this._statusBarItem = undefined;
		}
	}

	/**
	 * Extract edits that occurred between two bookmarks for a specific document.
	 * Returns a special marker object with __marker__ field if no edits were made.
	 */
	private _extractEditsBetweenBookmarks(
		logBefore: LogEntry[],
		logAfter: LogEntry[],
		targetDocId: DocumentId
	): { relativePath: string; edit: ISerializedEdit | { __marker__: 'NO_EDIT_EXPECTED' } } | undefined {
		// Find the numeric ID for our target document
		let docNumericId: number | undefined;
		let relativePath: string | undefined;

		for (const entry of logBefore) {
			if (entry.kind === 'documentEncountered') {
				const entryPath = entry.relativePath;
				// Check if this is our document by comparing paths
				if (entryPath && this._pathMatchesDocument(entryPath, targetDocId)) {
					docNumericId = entry.id;
					relativePath = entry.relativePath;
					break;
				}
			}
		}

		if (docNumericId === undefined || !relativePath) {
			this._logger.trace('Could not find document in log');
			return undefined;
		}

		// Get only the new entries (diff between logs)
		const newEntries = logAfter.slice(logBefore.length);

		// Filter for 'changed' entries on target document
		const editEntries = newEntries.filter(e =>
			e.kind === 'changed' && e.id === docNumericId
		);

		if (editEntries.length === 0) {
			this._logger.trace('No edits found between bookmarks - marking as NO_EDIT_EXPECTED');
			return {
				relativePath,
				edit: { __marker__: 'NO_EDIT_EXPECTED' as const }
			};
		}

		// Compose all edits into one
		let composedEdit: ISerializedEdit = [];
		for (const entry of editEntries) {
			if (entry.kind === 'changed') {
				composedEdit = this._composeSerializedEdits(composedEdit, entry.edit);
			}
		}

		return {
			relativePath,
			edit: composedEdit
		};
	}

	/**
	 * Check if a relative path from the log matches a DocumentId.
	 */
	private _pathMatchesDocument(logPath: string, documentId: DocumentId): boolean {
		// Simple comparison - both should be relative paths
		// For notebook cells, the log path includes the fragment (e.g., "file.ipynb#cell0")
		const docPath = documentId.path;
		return logPath.endsWith(docPath) || docPath.endsWith(logPath);
	}

	/**
	 * Compose two serialized edits using StringEdit.compose.
	 */
	private _composeSerializedEdits(
		first: ISerializedEdit,
		second: ISerializedEdit
	): ISerializedEdit {
		const firstEdit = deserializeEdit(first);
		const secondEdit = deserializeEdit(second);
		const composed = firstEdit.compose(secondEdit);
		return serializeEdit(composed);
	}

	/**
	 * Filter out documents that had no user interaction (background/virtual documents).
	 * Real documents will have user selection, visibility, or edit events.
	 * This removes startup noise like package.json files from node_modules that VS Code
	 * opens in the background, while preserving real workspace files that existed before capture.
	 */
	private _filterLogForNonInteractedDocuments(log: LogEntry[]): LogEntry[] {
		// Collect document IDs that had actual user interaction
		const interactedDocIds = new Set<number>();

		for (const entry of log) {
			// Documents with these events are "real" documents that the user interacted with
			if (entry.kind === 'selectionChanged' ||
				entry.kind === 'changed') {
				if ('id' in entry && typeof entry.id === 'number') {
					interactedDocIds.add(entry.id);
				}
			}
		}

		// Collect document IDs that should be excluded (no interaction)
		const excludedDocIds = new Set<number>();
		for (const entry of log) {
			if (entry.kind === 'documentEncountered') {
				if (!interactedDocIds.has(entry.id)) {
					excludedDocIds.add(entry.id);
					this._logger.trace(`Filtering out background document: ${entry.relativePath}`);
				}
			}
		}

		// Filter the log to exclude non-interactive documents
		return log.filter(entry => {
			if (entry.kind === 'header') {
				return true;
			}
			if ('id' in entry && typeof entry.id === 'number') {
				return !excludedDocIds.has(entry.id);
			}
			return true;
		});
	}

	/**
	 * Save the recording to disk in .recording.w.json format.
	 */
	private async _saveRecording(
		recording: { log: LogEntry[]; nextUserEdit?: { relativePath: string; edit: ISerializedEdit | { __marker__: 'NO_EDIT_EXPECTED' } } },
		state: CaptureState,
		noEditExpected: boolean = false
	): Promise<void> {
		const workspaceFolder = workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			throw new Error('No workspace folder found');
		}

		// Create folder if it doesn't exist
		const folderUri = Uri.joinPath(workspaceFolder.uri, ExpectedEditCaptureController.CAPTURE_FOLDER);
		try {
			await workspace.fs.createDirectory(folderUri);
		} catch (error) {
			// Ignore if already exists
		}

		// Generate filename with timestamp
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
		const filename = `capture-${timestamp}.recording.w.json`;
		const fileUri = Uri.joinPath(folderUri, filename);

		// Write file
		const content = JSON.stringify(recording, null, 2);
		await workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));

		// Optionally save metadata
		await this._saveMetadata(folderUri, filename, state, noEditExpected);

		this._logger.info(`Saved recording: path=${fileUri.fsPath}, noEditExpected=${noEditExpected}`);
	}

	/**
	 * Save additional metadata alongside the recording.
	 */
	private async _saveMetadata(
		folderUri: Uri,
		recordingFilename: string,
		state: CaptureState,
		noEditExpected: boolean = false
	): Promise<void> {
		const metadataFilename = recordingFilename.replace('.recording.w.json', '.metadata.json');
		const metadataUri = Uri.joinPath(folderUri, metadataFilename);

		const metadata = {
			captureTimestamp: new Date(state.startTime).toISOString(),
			trigger: state.trigger,
			durationMs: Date.now() - state.startTime,
			noEditExpected,
			originalNesContext: state.originalNesMetadata
		};

		const content = JSON.stringify(metadata, null, 2);
		await workspace.fs.writeFile(metadataUri, Buffer.from(content, 'utf8'));
	}

	/**
	 * Submit all captured NES feedback files to a private GitHub repository.
	 * Delegates to NesFeedbackSubmitter for file collection, filtering, and upload.
	 */
	public async submitCaptures(): Promise<void> {
		const workspaceFolder = workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			window.showErrorMessage('No workspace folder found');
			return;
		}

		const feedbackFolderUri = Uri.joinPath(workspaceFolder.uri, ExpectedEditCaptureController.CAPTURE_FOLDER);
		await this._feedbackSubmitter.submitFromFolder(feedbackFolderUri);
	}

	override dispose(): void {
		// Ensure complete cleanup if disposed during active capture
		if (this._state?.active) {
			this._state = undefined;
			// Note: Can't await in dispose, but this is best-effort cleanup
			void commands.executeCommand('setContext', copilotNesCaptureMode, false);
		}
		this._disposeStatusBarItem();
		super.dispose();
	}
}
