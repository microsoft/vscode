/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { env, Uri, window, workspace } from 'vscode';
import { IAuthenticationService } from '../../../../platform/authentication/common/authentication';
import { ILogger, ILogService } from '../../../../platform/log/common/logService';
import { IFetcherService } from '../../../../platform/networking/common/fetcherService';
import { LogEntry } from '../../../../platform/workspaceRecorder/common/workspaceLog';
import { encodeBase64, VSBuffer } from '../../../../util/vs/base/common/buffer';

/**
 * Represents a feedback file with its name and content.
 */
export interface FeedbackFile {
	name: string;
	content: string;
}

/**
 * Configuration for the feedback repository.
 */
interface FeedbackRepoConfig {
	readonly owner: string;
	readonly name: string;
	readonly apiUrl: string;
}

/**
 * Handles submission of NES feedback captures to a private GitHub repository.
 * Responsible for file collection, user confirmation, filtering, and upload.
 */
export class NesFeedbackSubmitter {

	private static readonly DEFAULT_REPO_CONFIG: FeedbackRepoConfig = {
		owner: 'microsoft',
		name: 'copilot-nes-feedback',
		apiUrl: 'https://api.github.com'
	};

	private readonly _logger: ILogger;

	constructor(
		logService: ILogService,
		private readonly _authenticationService: IAuthenticationService,
		private readonly _fetcherService: IFetcherService,
		private readonly _repoConfig: FeedbackRepoConfig = NesFeedbackSubmitter.DEFAULT_REPO_CONFIG
	) {
		this._logger = logService.createSubLogger(['NES', 'FeedbackSubmitter']);
	}

	/**
	 * Submit feedback files from the given folder to the private GitHub repository.
	 * Shows a preview dialog allowing users to select which files to include.
	 */
	public async submitFromFolder(feedbackFolderUri: Uri): Promise<void> {
		try {
			// Check if feedback folder exists and has files
			const files = await this._collectFeedbackFiles(feedbackFolderUri);
			if (files.length === 0) {
				window.showInformationMessage('No NES feedback captures found to submit. Use "Copilot: Record Expected Edit (NES)" to capture feedback first.');
				return;
			}

			// Read file contents
			const fileContents = await this._readFeedbackFiles(files, feedbackFolderUri);
			if (fileContents.length === 0) {
				window.showErrorMessage('Failed to read feedback files.');
				return;
			}

			// Extract unique document paths from the recordings to show the user
			const documentPaths = this._extractDocumentPathsFromRecordings(fileContents);

			// Extract nextUserEdit paths to calculate accurate recording counts
			const nextUserEditPaths = this._extractNextUserEditPaths(fileContents);

			// Show confirmation with file preview and allow filtering
			// Returns excluded paths for efficiency (empty in the default case when all files are selected)
			const excludedPaths = await this._showFilePreviewAndConfirm(documentPaths, nextUserEditPaths);
			if (!excludedPaths) {
				return;
			}

			// Filter recordings to remove excluded documents
			const filteredContents = this._filterRecordingsByExcludedPaths(fileContents, excludedPaths, nextUserEditPaths);
			if (filteredContents.length === 0) {
				window.showInformationMessage('No files to submit after filtering.');
				return;
			}

			// Get GitHub auth token - need permissive session for repo access
			const session = await this._authenticationService.getGitHubSession('permissive', { createIfNone: { detail: l10n.t('Sign in to GitHub to submit feedback.') } });
			if (!session) {
				window.showErrorMessage('GitHub authentication required with repo access. Please sign in to GitHub.');
				return;
			}

			// Upload files to the private repo
			const folderUrl = await this._uploadToPrivateRepo(filteredContents, session.accessToken);

			if (folderUrl) {
				await this._showSuccessDialog(folderUrl);
				this._logger.info(`Uploaded feedback to private repo: ${folderUrl}`);
			}
		} catch (error) {
			this._logger.error(error instanceof Error ? error : String(error), 'Error submitting feedback');
			window.showErrorMessage(`Failed to submit NES feedback: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Show success dialog with options to open the PR in GitHub or copy the link.
	 */
	private async _showSuccessDialog(prUrl: string): Promise<void> {
		const result = await window.showInformationMessage(
			'Feedback submitted! A pull request has been created.',
			'Open Pull Request',
			'Copy Link'
		);

		if (result === 'Open Pull Request') {
			await env.openExternal(Uri.parse(prUrl));
		} else if (result === 'Copy Link') {
			await env.clipboard.writeText(prUrl);
			window.showInformationMessage('Pull request URL copied to clipboard!');
		}
	}

	/**
	 * Collect all feedback files from the capture folder.
	 */
	private async _collectFeedbackFiles(folderUri: Uri): Promise<Uri[]> {
		try {
			const entries = await workspace.fs.readDirectory(folderUri);
			return entries
				.filter(([name, type]) => type === 1 && name.endsWith('.json')) // FileType.File = 1
				.map(([name]) => Uri.joinPath(folderUri, name));
		} catch {
			return [];
		}
	}

	/**
	 * Read contents of feedback files.
	 */
	private async _readFeedbackFiles(fileUris: Uri[], folderUri: Uri): Promise<FeedbackFile[]> {
		const results: FeedbackFile[] = [];

		for (const fileUri of fileUris) {
			try {
				const content = await workspace.fs.readFile(fileUri);
				const textContent = new TextDecoder().decode(content);
				const relativeName = fileUri.path.replace(folderUri.path + '/', '');
				results.push({
					name: relativeName,
					content: textContent
				});
			} catch (e) {
				this._logger.warn(`Failed to read file: ${fileUri.fsPath}: ${e}`);
			}
		}

		return results;
	}

	/**
	 * Extract unique document paths from recording files.
	 * Parses the log entries to find all documentEncountered events.
	 */
	private _extractDocumentPathsFromRecordings(files: FeedbackFile[]): string[] {
		const paths = new Set<string>();

		for (const file of files) {
			// Only process recording files, not metadata
			if (!file.name.endsWith('.recording.w.json')) {
				continue;
			}

			try {
				const recording = JSON.parse(file.content) as { log?: LogEntry[] };
				if (recording.log) {
					for (const entry of recording.log) {
						if (entry.kind === 'documentEncountered') {
							paths.add(entry.relativePath);
						}
					}
				}
			} catch {
				// Ignore parse errors
			}
		}

		return Array.from(paths).sort();
	}

	/**
	 * Extract the nextUserEdit path for each recording.
	 * Returns a map from recording name to its nextUserEdit relativePath (or undefined if none).
	 */
	private _extractNextUserEditPaths(files: FeedbackFile[]): Map<string, string | undefined> {
		const result = new Map<string, string | undefined>();

		for (const file of files) {
			if (!file.name.endsWith('.recording.w.json')) {
				continue;
			}

			try {
				const recording = JSON.parse(file.content) as {
					nextUserEdit?: { relativePath: string };
				};
				result.set(file.name, recording.nextUserEdit?.relativePath);
			} catch {
				// If parsing fails, assume it has no nextUserEdit
				result.set(file.name, undefined);
			}
		}

		return result;
	}

	/**
	 * Count how many recordings will be included after excluding certain paths.
	 * A recording is included only if its nextUserEdit path is not excluded.
	 */
	private _countIncludedRecordings(nextUserEditPaths: Map<string, string | undefined>, excludedPaths: Set<string>): number {
		let count = 0;
		for (const [, nextUserEditPath] of nextUserEditPaths) {
			if (nextUserEditPath !== undefined && !excludedPaths.has(nextUserEditPath)) {
				count++;
			}
		}
		return count;
	}

	/**
	 * Create a summary string for a list of file paths.
	 * Shows up to maxFiles paths inline, with "and N more..." for the rest.
	 */
	private _createFilesSummary(paths: string[], maxFiles: number = 5): string {
		const sortedPaths = [...paths].sort();
		if (sortedPaths.length <= maxFiles) {
			return sortedPaths.join(', ');
		}
		const shownFiles = sortedPaths.slice(0, maxFiles).join(', ');
		return `${shownFiles}, and ${sortedPaths.length - maxFiles} more...`;
	}

	/**
	 * Show a preview of files that will be uploaded and ask for confirmation.
	 * Uses a QuickPick to allow users to select which files to include.
	 * @returns The excluded file paths (empty array if all selected), or undefined if cancelled.
	 */
	private async _showFilePreviewAndConfirm(
		documentPaths: string[],
		nextUserEditPaths: Map<string, string | undefined>
	): Promise<string[] | undefined> {
		const totalRecordingCount = this._countIncludedRecordings(nextUserEditPaths, new Set());

		if (documentPaths.length === 0) {
			// No document paths found, just show basic confirmation
			const result = await window.showInformationMessage(
				`Found ${totalRecordingCount} feedback recording(s). This will upload your NES feedback to the internal feedback repository.\n\n` +
				`Only team members with access to the private repo can view this data.`,
				{ modal: true },
				'Submit Feedback'
			);
			return result === 'Submit Feedback' ? [] : undefined; // Empty array = no exclusions
		}

		// Create a summary of files
		const filesSummary = this._createFilesSummary(documentPaths);

		const result = await window.showInformationMessage(
			`Found ${totalRecordingCount} recording(s) containing ${documentPaths.length} file(s):\n${filesSummary}\n\n` +
			`This will upload your NES feedback to the internal feedback repository.`,
			{ modal: true },
			'Submit Feedback',
			'Select Files to Include'
		);

		if (result === 'Submit Feedback') {
			return []; // No exclusions - all files selected
		}

		if (result === 'Select Files to Include') {
			return this._showFileSelectionQuickPick(documentPaths, nextUserEditPaths);
		}

		return undefined;
	}

	/**
	 * Show a multi-select QuickPick for file selection.
	 * Loops until user confirms or cancels, allowing them to edit their selection.
	 * @returns The excluded file paths, or undefined if cancelled.
	 */
	private async _showFileSelectionQuickPick(
		documentPaths: string[],
		nextUserEditPaths: Map<string, string | undefined>
	): Promise<string[] | undefined> {
		let currentSelection = new Set(documentPaths); // Start with all selected

		while (true) {
			const items = documentPaths.map(path => ({
				label: path,
				description: '',
				picked: currentSelection.has(path)
			}));

			const selected = await window.showQuickPick(items, {
				title: 'Select files to include in the upload',
				placeHolder: 'Deselect files you want to exclude, then press Enter to confirm',
				canPickMany: true,
				ignoreFocusOut: true
			});

			if (!selected) {
				// User cancelled QuickPick
				return undefined;
			}

			const selectedPaths = new Set(selected.map(item => item.label));
			const excludedPaths = documentPaths.filter(path => !selectedPaths.has(path));

			if (selectedPaths.size === 0) {
				window.showInformationMessage('No files selected. Upload cancelled.');
				return undefined;
			}

			// Calculate how many recordings will actually be included
			const excludedPathSet = new Set(excludedPaths);
			const includedRecordingCount = this._countIncludedRecordings(nextUserEditPaths, excludedPathSet);

			if (includedRecordingCount === 0) {
				const tryAgain = await window.showInformationMessage(
					'No recordings would be included with this selection (all nextUserEdit files are excluded).',
					{ modal: true },
					'Edit Selection'
				);
				if (tryAgain === 'Edit Selection') {
					currentSelection = selectedPaths;
					continue;
				}
				return undefined;
			}

			// Show final confirmation with accurate recording count and file summary
			const selectedPathsArray = Array.from(selectedPaths);
			const filesSummary = this._createFilesSummary(selectedPathsArray);

			const confirmMessage = excludedPaths.length > 0
				? `Submit ${includedRecordingCount} recording(s) with ${selectedPaths.size} file(s)? (${excludedPaths.length} excluded)\n\nIncluded: ${filesSummary}`
				: `Submit ${includedRecordingCount} recording(s) containing ${selectedPaths.size} file(s)?\n\n${filesSummary}`;

			const finalResult = await window.showInformationMessage(
				confirmMessage,
				{ modal: true },
				'Submit Feedback',
				'Edit Selection'
			);

			if (finalResult === 'Submit Feedback') {
				return excludedPaths;
			}

			if (finalResult === 'Edit Selection') {
				// Update current selection and loop back to QuickPick
				currentSelection = selectedPaths;
				continue;
			}

			// User clicked Cancel or dismissed the dialog
			return undefined;
		}
	}

	/**
	 * Filter recording files to remove excluded document paths.
	 * Removes documentEncountered entries and all related events for excluded documents.
	 * Recordings whose nextUserEdit is excluded are skipped entirely,
	 * along with their associated metadata files.
	 * Optimized for the common case where excludedPaths is empty (all files selected).
	 */
	private _filterRecordingsByExcludedPaths(
		files: FeedbackFile[],
		excludedPaths: string[],
		nextUserEditPaths: Map<string, string | undefined>
	): FeedbackFile[] {
		// Fast path: no exclusions, return files as-is
		if (excludedPaths.length === 0) {
			return files;
		}

		const excludedPathSet = new Set(excludedPaths);
		const filteredRecordings: FeedbackFile[] = [];
		const skippedRecordingPrefixes = new Set<string>();

		// First pass: filter recordings and track which ones to skip
		for (const file of files) {
			if (!file.name.endsWith('.recording.w.json')) {
				continue;
			}

			// Use precomputed nextUserEditPaths to quickly skip recordings
			const nextUserEditPath = nextUserEditPaths.get(file.name);
			if (nextUserEditPath === undefined || excludedPathSet.has(nextUserEditPath)) {
				// Skip this recording - no nextUserEdit or it's excluded
				const prefix = file.name.replace('.recording.w.json', '');
				skippedRecordingPrefixes.add(prefix);
				this._logger.debug(`Skipping recording ${file.name}: nextUserEdit excluded or missing`);
				continue;
			}

			try {
				const filteredFile = this._filterSingleRecording(file, excludedPathSet);
				filteredRecordings.push(filteredFile);
			} catch {
				// If parsing fails, include the file as-is
				filteredRecordings.push(file);
			}
		}

		// Second pass: include metadata files only if their recording wasn't skipped
		const result: FeedbackFile[] = [...filteredRecordings];
		for (const file of files) {
			if (file.name.endsWith('.metadata.json')) {
				const prefix = file.name.replace('.metadata.json', '');
				if (!skippedRecordingPrefixes.has(prefix)) {
					result.push(file);
				} else {
					this._logger.debug(`Skipping metadata ${file.name}: associated recording was skipped`);
				}
			}
		}

		return result;
	}

	/**
	 * Filter a single recording file based on excluded document paths.
	 * Assumes the recording will be included (nextUserEdit already checked).
	 */
	private _filterSingleRecording(file: FeedbackFile, excludedPathSet: Set<string>): FeedbackFile {
		const recording = JSON.parse(file.content) as {
			log?: LogEntry[];
			nextUserEdit?: { relativePath: string; edit: unknown };
		};

		if (!recording.log) {
			return file;
		}

		// Find document IDs that should be excluded
		const excludedDocIds = new Set<number>();
		for (const entry of recording.log) {
			if (entry.kind === 'documentEncountered' && excludedPathSet.has(entry.relativePath)) {
				excludedDocIds.add(entry.id);
			}
		}

		// Filter log entries to remove excluded documents
		const filteredLog = recording.log.filter(entry => {
			if (entry.kind === 'header') {
				return true;
			}
			if ('id' in entry && typeof entry.id === 'number') {
				return !excludedDocIds.has(entry.id);
			}
			return true;
		});

		// Create filtered recording (nextUserEdit is preserved - we already checked it's not excluded)
		const filteredRecording = {
			...recording,
			log: filteredLog
		};

		return {
			name: file.name,
			content: JSON.stringify(filteredRecording, null, 2)
		};
	}

	/**
	 * Upload feedback files to the private GitHub repository via a pull request.
	 * Creates a new branch, uploads files to a timestamped folder, and opens a PR.
	 * @returns The URL to the pull request, or undefined on failure.
	 */
	private async _uploadToPrivateRepo(files: FeedbackFile[], token: string): Promise<string | undefined> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
		const folderPath = `feedback/${timestamp}`;

		// Get the current user for commit attribution
		const user = await this._getCurrentUser(token);
		const username = user?.login ?? 'anonymous';

		// Create a unique branch name for this feedback submission
		const branchName = `feedback/${username}/${timestamp}`;

		// Get the SHA of the main branch to create our branch from
		const mainBranchSha = await this._getBranchSha(token, 'main');
		if (!mainBranchSha) {
			throw new Error('Failed to get main branch SHA');
		}

		// Create the new branch
		await this._createBranch(token, branchName, mainBranchSha);

		// Upload each file to the new branch
		for (const file of files) {
			const filePath = `${folderPath}/${file.name}`;
			await this._createFileInRepo(filePath, file.content, token, username, timestamp, branchName);
		}

		// Create the pull request
		const prUrl = await this._createPullRequest(token, branchName, username, timestamp, files.length);

		return prUrl;
	}

	/**
	 * Get the SHA of a branch.
	 */
	private async _getBranchSha(token: string, branch: string): Promise<string | undefined> {
		try {
			const response = await this._fetcherService.fetch(
				`${this._repoConfig.apiUrl}/repos/${this._repoConfig.owner}/${this._repoConfig.name}/git/ref/heads/${branch}`,
				{
					method: 'GET',
					callSite: 'nes-feedback-branch-sha',
					headers: {
						'Authorization': `Bearer ${token}`,
						'Accept': 'application/vnd.github+json',
						'X-GitHub-Api-Version': '2022-11-28',
						'User-Agent': this._fetcherService.getUserAgentLibrary()
					}
				}
			);

			if (response.ok) {
				const data = await response.json() as { object: { sha: string } };
				return data.object.sha;
			}
		} catch (e) {
			this._logger.error(e instanceof Error ? e : String(e), 'Failed to get branch SHA');
		}
		return undefined;
	}

	/**
	 * Create a new branch in the repository.
	 */
	private async _createBranch(token: string, branchName: string, sha: string): Promise<void> {
		const url = `${this._repoConfig.apiUrl}/repos/${this._repoConfig.owner}/${this._repoConfig.name}/git/refs`;

		const payload = {
			ref: `refs/heads/${branchName}`,
			sha: sha
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json',
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
				'User-Agent': this._fetcherService.getUserAgentLibrary()
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errorText = await response.text();
			this._logger.error(`Failed to create branch ${branchName}: ${response.status} ${response.statusText} - ${errorText}`);
			throw new Error(`Failed to create branch: ${response.statusText}`);
		}
	}

	/**
	 * Create a pull request from the feedback branch to main.
	 * @returns The URL to the created pull request.
	 */
	private async _createPullRequest(
		token: string,
		branchName: string,
		username: string,
		timestamp: string,
		fileCount: number
	): Promise<string | undefined> {
		const url = `${this._repoConfig.apiUrl}/repos/${this._repoConfig.owner}/${this._repoConfig.name}/pulls`;

		const payload = {
			title: `NES Feedback from ${username} (${timestamp})`,
			head: branchName,
			base: 'main',
			body: `## NES Feedback Submission\n\n` +
				`- **Submitted by:** ${username}\n` +
				`- **Timestamp:** ${timestamp}\n` +
				`- **Files:** ${fileCount} file(s)\n\n` +
				`This feedback was automatically submitted via the "Copilot: Submit NES Feedback" command.`
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json',
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
				'User-Agent': this._fetcherService.getUserAgentLibrary()
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errorText = await response.text();
			this._logger.error(`Failed to create pull request: ${response.status} ${response.statusText} - ${errorText}`);
			throw new Error(`Failed to create pull request: ${response.statusText}`);
		}

		const prData = await response.json() as { html_url: string };
		return prData.html_url;
	}

	/**
	 * Create a file in the private feedback repository on a specific branch.
	 * Uses native fetch API since IFetcherService only supports GET/POST,
	 * but GitHub Contents API requires PUT for file creation.
	 */
	private async _createFileInRepo(
		path: string,
		content: string,
		token: string,
		username: string,
		timestamp: string,
		branch: string
	): Promise<void> {
		const url = `${this._repoConfig.apiUrl}/repos/${this._repoConfig.owner}/${this._repoConfig.name}/contents/${path}`;

		const payload = {
			message: `NES feedback from ${username} at ${timestamp}`,
			content: encodeBase64(VSBuffer.fromString(content)),
			branch: branch
		};

		// Use native fetch for PUT request (IFetcherService only supports GET/POST)
		const response = await fetch(url, {
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github+json',
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
				'User-Agent': this._fetcherService.getUserAgentLibrary()
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errorText = await response.text();
			this._logger.error(`Failed to create file ${path}: ${response.status} ${response.statusText} - ${errorText}`);
			throw new Error(`Failed to upload file: ${response.statusText}`);
		}
	}

	/**
	 * Get the current authenticated GitHub user.
	 */
	private async _getCurrentUser(token: string): Promise<{ login: string } | undefined> {
		try {
			const response = await this._fetcherService.fetch(
				`${this._repoConfig.apiUrl}/user`,
				{
					method: 'GET',
					callSite: 'nes-feedback-current-user',
					headers: {
						'Authorization': `Bearer ${token}`,
						'Accept': 'application/vnd.github+json',
						'X-GitHub-Api-Version': '2022-11-28',
						'User-Agent': this._fetcherService.getUserAgentLibrary()
					}
				}
			);

			if (response.ok) {
				return await response.json();
			}
		} catch (e) {
			this._logger.warn(`Failed to get current user: ${e}`);
		}
		return undefined;
	}
}
