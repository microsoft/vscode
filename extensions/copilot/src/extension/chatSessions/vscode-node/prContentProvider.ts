/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { IOctoKitService, PullRequestFile } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

/**
 * URI scheme for PR content
 */
export const PR_SCHEME = 'copilot-pr';

/**
 * Parameters encoded in PR content URIs
 */
export interface PRContentUriParams {
	owner: string;
	repo: string;
	prNumber: number;
	fileName: string;
	commitSha: string;
	isBase: boolean; // true for left side, false for right side
	previousFileName?: string; // for renames
	status?: PullRequestFile['status'];
}

/**
 * Create a URI for PR file content
 */
export function toPRContentUri(
	fileName: string,
	params: Omit<PRContentUriParams, 'fileName'>
): vscode.Uri {
	return vscode.Uri.from({
		scheme: PR_SCHEME,
		path: `/${fileName}`,
		query: JSON.stringify({ ...params, fileName })
	});
}

/**
 * Parse parameters from a PR content URI
 */
export function fromPRContentUri(uri: vscode.Uri): PRContentUriParams | undefined {
	if (uri.scheme !== PR_SCHEME) {
		return undefined;
	}
	try {
		return JSON.parse(uri.query) as PRContentUriParams;
	} catch (e) {
		return undefined;
	}
}

function isMissingOnSide(status: PullRequestFile['status'] | undefined, isBase: boolean): boolean {
	if (!status) {
		return false;
	}
	if (isBase) {
		return status === 'added';
	}
	return status === 'removed';
}

/**
 * TextDocumentContentProvider for PR content that fetches file content from GitHub
 */
export class PRContentProvider extends Disposable implements vscode.TextDocumentContentProvider {
	private static readonly ID = 'PRContentProvider';
	private _onDidChange = this._register(new vscode.EventEmitter<vscode.Uri>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Register text document content provider for PR scheme
		this._register(
			vscode.workspace.registerTextDocumentContentProvider(
				PR_SCHEME,
				this
			)
		);
	}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const params = fromPRContentUri(uri);
		if (!params) {
			this.logService.error(`[${PRContentProvider.ID}] Invalid PR content URI: ${uri.toString()}`);
			return '';
		}

		if (isMissingOnSide(params.status, params.isBase)) {
			this.logService.trace(
				`[${PRContentProvider.ID}] Skipping fetch for ${params.fileName} because it does not exist on the ${params.isBase ? 'base' : 'head'} side (status: ${params.status})`
			);
			return '';
		}

		try {
			this.logService.trace(
				`[${PRContentProvider.ID}] Fetching ${params.isBase ? 'base' : 'head'} content for ${params.fileName} ` +
				`from ${params.owner}/${params.repo}#${params.prNumber} at ${params.commitSha}`
			);

			// Fetch file content from GitHub
			const content = await this._octoKitService.getFileContent(
				params.owner,
				params.repo,
				params.commitSha,
				params.fileName,
				{ createIfNone: { detail: l10n.t('Sign in to GitHub to access Copilot cloud sessions.') } }
			);

			return content;
		} catch (error) {
			this.logService.error(
				`[${PRContentProvider.ID}] Failed to fetch PR file content: ${error instanceof Error ? error.message : String(error)}`
			);
			// Return empty content instead of throwing to avoid breaking the diff view
			return '';
		}
	}
}
