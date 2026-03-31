/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IBrowserViewCDPService } from '../../browserView/common/browserView.js';
import { BrowserEditorInput } from '../../browserView/common/browserEditorInput.js';
import { CDPResponse } from '../../../../platform/browserView/common/cdp/types.js';
import { IGitHubUploadResult, IGitHubUploadService } from '../browser/githubUploadService.js';

/**
 * GitHub upload service using the integrated browser + CDP.
 *
 * Opens a single integrated browser tab for all operations. The user logs in
 * visually, then uploads happen via CDP Runtime.evaluate in that same tab.
 */
export class NativeGitHubUploadService extends Disposable implements IGitHubUploadService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeLoginState = this._register(new Emitter<boolean>());
	readonly onDidChangeLoginState: Event<boolean> = this._onDidChangeLoginState.event;

	private activeBrowserId: string | undefined;
	private cdpMessageId = 0;

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserViewCDPService private readonly cdpService: IBrowserViewCDPService,
	) {
		super();
	}

	async isLoggedIn(): Promise<boolean> {
		if (!this.activeBrowserId) {
			return false;
		}
		try {
			const user = await this.cdpEval<string | null>(this.activeBrowserId,
				`document.querySelector('meta[name="user-login"]')?.getAttribute('content') || null`
			);
			return !!user;
		} catch {
			this.activeBrowserId = undefined;
			return false;
		}
	}

	async login(): Promise<boolean> {
		this.logService.info('[GitHubUpload] Starting login flow...');

		// Open one browser to github.com/login
		const browserId = await this.openBrowser('https://github.com/login');
		this.activeBrowserId = browserId;

		// Wait for page to fully load before starting CDP
		this.logService.info('[GitHubUpload] Waiting for page to load...');
		await new Promise(r => setTimeout(r, 5000));

		// Create one CDP session and reuse it for all polls
		this.logService.info('[GitHubUpload] Starting CDP session for login polling...');
		const groupId = await this.cdpService.createSessionGroup(browserId);
		try {
			await this.cdpSend(groupId, 'Runtime.enable');

			for (let i = 0; i < 150; i++) {
				await new Promise(r => setTimeout(r, 2000));
				try {
					const response = await this.cdpSend(groupId, 'Runtime.evaluate', {
						expression: `document.querySelector('meta[name="user-login"]')?.getAttribute('content') || null`,
						returnByValue: true,
					});
					const result = (response as unknown as Record<string, unknown>).result as Record<string, unknown> | undefined;
					const innerResult = result?.result as Record<string, unknown> | undefined;
					const user = innerResult?.value as string | null;

					if (user) {
						this.logService.info(`[GitHubUpload] Logged in as ${user}`);
						this._onDidChangeLoginState.fire(true);
						return true;
					}
				} catch (err) {
					this.logService.warn('[GitHubUpload] Poll error:', err);
					this.activeBrowserId = undefined;
					return false;
				}
			}
		} finally {
			await this.cdpService.destroySessionGroup(groupId).catch(() => { });
		}

		this.logService.warn('[GitHubUpload] Login timed out (5 min)');
		return false;
	}

	async resolveRepositoryId(owner: string, repo: string): Promise<string> {
		this.logService.info(`[GitHubUpload] Resolving repo ID: ${owner}/${repo}`);
		const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
			headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
		});
		if (!r.ok) {
			throw new Error(`Repo ID lookup failed: ${r.status}`);
		}
		const json = await r.json();
		this.logService.info(`[GitHubUpload] Repo ID: ${json.id}`);
		return String(json.id);
	}

	async uploadAsset(owner: string, repo: string, repoId: string, fileName: string, fileBytes: Uint8Array, contentType: string): Promise<IGitHubUploadResult> {
		this.logService.info(`[GitHubUpload] Uploading ${fileName} (${fileBytes.length} bytes)`);

		if (!this.activeBrowserId) {
			throw new Error('No active browser session');
		}

		// Navigate the existing browser to the repo page for CSRF tokens
		const browserId = this.activeBrowserId;
		await this.cdpEval(browserId, `window.location.href = 'https://github.com/${owner}/${repo}'`);
		await new Promise(r => setTimeout(r, 3000));

		// Step 1: Get upload policy
		this.logService.info('[GitHubUpload] Step 1/3: policy');
		const policyResult = await this.cdpEval<{ error?: string; policy?: Record<string, unknown> }>(browserId, `
			(async () => {
				const token =
					document.querySelector('input[name="authenticity_token"]')?.value ||
					document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || null;
				const fd = new FormData();
				fd.append('repository_id', ${JSON.stringify(repoId)});
				fd.append('name', ${JSON.stringify(fileName)});
				fd.append('size', ${JSON.stringify(String(fileBytes.length))});
				fd.append('content_type', ${JSON.stringify(contentType)});
				if (token) { fd.append('authenticity_token', token); }
				const r = await fetch('https://github.com/upload/policies/assets', {
					method: 'POST', body: fd, credentials: 'same-origin',
					headers: { 'github-verified-fetch': 'true', 'x-requested-with': 'XMLHttpRequest' },
				});
				if (!r.ok) { return { error: 'Policy ' + r.status + ': ' + (await r.text()).substring(0, 200) }; }
				return { policy: await r.json() };
			})()
		`);

		if (policyResult.error) {
			throw new Error(policyResult.error);
		}
		const policy = policyResult.policy as Record<string, unknown>;
		const asset = policy.asset as Record<string, unknown>;
		this.logService.info(`[GitHubUpload] Policy OK: asset=${asset.id}`);

		// Step 2: S3 upload
		this.logService.info('[GitHubUpload] Step 2/3: S3');
		const bytesArray = Array.from(fileBytes);
		const s3 = await this.cdpEval<{ ok: boolean; error?: string }>(browserId, `
			(async () => {
				const fd = new FormData();
				for (const [k, v] of Object.entries(${JSON.stringify(policy.form)})) { fd.append(k, v); }
				fd.append('file', new Blob([new Uint8Array(${JSON.stringify(bytesArray)})], { type: ${JSON.stringify(contentType)} }), ${JSON.stringify(asset.name)});
				const r = await fetch(${JSON.stringify(policy.upload_url)}, { method: 'POST', body: fd, mode: 'cors' });
				return r.status >= 200 && r.status < 300 ? { ok: true } : { ok: false, error: 'S3 ' + r.status };
			})()
		`);
		if (!s3.ok) {
			throw new Error(s3.error ?? 'S3 upload failed');
		}
		this.logService.info('[GitHubUpload] S3 OK');

		// Step 3: confirm
		this.logService.info('[GitHubUpload] Step 3/3: confirm');
		await this.cdpEval(browserId, `
			fetch('https://github.com' + ${JSON.stringify(policy.asset_upload_url)}, {
				method: 'PUT', credentials: 'same-origin',
				headers: { 'github-verified-fetch': 'true', 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/json' },
				body: JSON.stringify({ authenticity_token: ${JSON.stringify(policy.asset_upload_authenticity_token)} }),
			})
		`);

		const assetHref = asset.href as string;
		this.logService.info(`[GitHubUpload] Done: ${assetHref}`);
		return { fileName, assetUrl: assetHref, contentType };
	}

	private async openBrowser(url: string): Promise<string> {
		const resource = BrowserViewUri.forUrl(url);
		const pane = await this.editorService.openEditor({ resource }, SIDE_GROUP);
		const input = pane?.input;
		if (!(input instanceof BrowserEditorInput)) {
			throw new Error('Failed to open integrated browser');
		}
		this.logService.info(`[GitHubUpload] Browser opened: id=${input.id}`);
		return input.id;
	}

	private async cdpEval<T>(browserId: string, expression: string): Promise<T> {
		const groupId = await this.cdpService.createSessionGroup(browserId);
		try {
			await this.cdpSend(groupId, 'Runtime.enable');
			const response = await this.cdpSend(groupId, 'Runtime.evaluate', {
				expression,
				returnByValue: true,
				awaitPromise: true,
			});
			return this.extractCdpValue<T>(response);
		} finally {
			await this.cdpService.destroySessionGroup(groupId).catch(() => { });
		}
	}

	private cdpSend(groupId: string, method: string, params: Record<string, unknown> = {}): Promise<CDPResponse> {
		const id = ++this.cdpMessageId;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				sub.dispose();
				reject(new Error(`CDP ${method} timed out`));
			}, 30_000);

			const sub = this.cdpService.onCDPMessage(groupId)(msg => {
				if ('id' in msg && msg.id === id) {
					clearTimeout(timer);
					sub.dispose();
					resolve(msg as CDPResponse);
				}
			});

			this.cdpService.sendCDPMessage(groupId, { id, method, params });
		});
	}

	private extractCdpValue<T>(response: CDPResponse): T {
		const result = (response as unknown as Record<string, unknown>).result as Record<string, unknown> | undefined;
		const innerResult = result?.result as Record<string, unknown> | undefined;
		if (innerResult?.type === 'undefined') {
			return undefined as T;
		}
		return (innerResult?.value ?? undefined) as T;
	}

	async uploadViaGist(token: string, files: { name: string; bytes: Uint8Array }[]): Promise<IGitHubUploadResult[]> {
		this.logService.info(`[GitHubUpload/Gist] Uploading ${files.length} files via gist...`);

		// Step 1: Create gist via API
		this.logService.info('[GitHubUpload/Gist] Creating gist...');
		const createResponse = await fetch('https://api.github.com/gists', {
			method: 'POST',
			headers: {
				'Accept': 'application/vnd.github+json',
				'Authorization': `Bearer ${token}`,
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: JSON.stringify({
				description: 'VS Code Issue Reporter Attachments',
				public: false,
				files: { 'README.md': { content: 'Attachments for VS Code issue report' } },
			}),
		});
		if (!createResponse.ok) {
			const text = await createResponse.text();
			throw new Error(`Failed to create gist: ${createResponse.status} ${text.substring(0, 200)}`);
		}
		const gist = await createResponse.json();
		const gistId = gist.id as string;
		const gitPullUrl = gist.git_pull_url as string;
		this.logService.info(`[GitHubUpload/Gist] Gist created: ${gistId}`);

		// Step 2: Clone to temp dir via main process
		const tempDir = await this.nativeHostService.makeTempDir(`vscode-gist-${gistId}`);
		try {
			const cloneUrl = gitPullUrl.replace('https://', `https://x-access-token:${token}@`);
			this.logService.info(`[GitHubUpload/Gist] Cloning...`);
			await this.nativeHostService.runGitCommand(['clone', cloneUrl, tempDir], undefined, 30_000);

			// Step 3: Write files via main process
			for (const file of files) {
				const filePath = `${tempDir}/${file.name}`;
				await this.nativeHostService.writeFileToPath(filePath, VSBuffer.wrap(file.bytes));
				this.logService.info(`[GitHubUpload/Gist] Wrote ${file.name} (${file.bytes.length} bytes)`);
			}

			// Step 4: Git add, commit, push via main process
			this.logService.info('[GitHubUpload/Gist] Committing and pushing...');
			await this.nativeHostService.runGitCommand(['add', '.'], tempDir, 10_000);
			await this.nativeHostService.runGitCommand(['commit', '-m', 'Add attachments'], tempDir, 10_000);
			await this.nativeHostService.runGitCommand(['push'], tempDir, 60_000);

			// Step 5: Get commit SHA
			const { stdout: commitSha } = await this.nativeHostService.runGitCommand(['rev-parse', 'HEAD'], tempDir, 5_000);
			const sha = commitSha.trim();

			// Build raw URLs
			const owner = (gist.owner as Record<string, unknown>)?.login as string;
			const results: IGitHubUploadResult[] = [];
			for (const file of files) {
				const assetUrl = `https://gist.githubusercontent.com/${owner}/${gistId}/raw/${sha}/${encodeURIComponent(file.name)}`;
				const contentType = file.name.endsWith('.mp4') ? 'video/mp4'
					: file.name.endsWith('.webm') ? 'video/webm'
						: 'image/png';
				results.push({ fileName: file.name, assetUrl, contentType });
				this.logService.info(`[GitHubUpload/Gist] ${file.name} -> ${assetUrl}`);
			}
			return results;
		} finally {
			await this.nativeHostService.removeTempDir(tempDir);
		}
	}

	async saveAttachmentsToFolder(screenshots: { name: string; bytes: Uint8Array }[], recordings: { name: string; bytes: Uint8Array }[]): Promise<string> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const dirPath = await this.nativeHostService.makeTempDir(`vscode-issue-attachments-${timestamp}`);
		this.logService.info(`[GitHubUpload] Saving attachments to ${dirPath}`);

		const allFiles = [...screenshots, ...recordings];
		for (const file of allFiles) {
			await this.nativeHostService.writeFileToPath(`${dirPath}/${file.name}`, VSBuffer.wrap(file.bytes));
			this.logService.info(`[GitHubUpload] Saved ${file.name}`);
		}

		// Reveal folder in OS file explorer by showing the first file
		if (allFiles.length > 0) {
			await this.nativeHostService.showItemInFolder(`${dirPath}/${allFiles[0].name}`);
		}

		return dirPath;
	}
}
