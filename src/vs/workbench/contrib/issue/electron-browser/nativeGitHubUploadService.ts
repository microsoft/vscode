/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IGitHubUploadResult, IGitHubUploadService } from '../browser/githubUploadService.js';

const GITHUB_PARTITION = 'persist:github-upload';

/**
 * Electron-specific GitHub upload service.
 *
 * Uses a hidden <webview> element with a persistent session partition to
 * maintain GitHub session cookies. The upload flow (policy -> S3 -> confirm)
 * runs via executeJavaScript() inside the webview which has github.com cookies.
 */
export class NativeGitHubUploadService extends Disposable implements IGitHubUploadService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeLoginState = this._register(new Emitter<boolean>());
	readonly onDidChangeLoginState: Event<boolean> = this._onDidChangeLoginState.event;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async isLoggedIn(): Promise<boolean> {
		this.logService.info('[GitHubUpload] Checking isLoggedIn...');
		const webview = this.createHiddenWebview();
		try {
			await this.loadUrl(webview, 'https://github.com');
			this.logService.info('[GitHubUpload] github.com loaded, checking user meta...');
			const user = await webview.executeJavaScript(
				`document.querySelector('meta[name="user-login"]')?.getAttribute('content') || null`
			);
			this.logService.info(`[GitHubUpload] isLoggedIn user=${user}`);
			return !!user;
		} catch (err) {
			this.logService.error('[GitHubUpload] isLoggedIn failed:', err);
			return false;
		} finally {
			webview.remove();
		}
	}

	async login(): Promise<boolean> {
		if (await this.isLoggedIn()) {
			return true;
		}

		return new Promise<boolean>(resolve => {
			const webview = document.createElement('webview') as Electron.WebviewTag;
			webview.setAttribute('partition', GITHUB_PARTITION);
			webview.setAttribute('style', 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:500px;height:700px;z-index:999999;border:2px solid var(--vscode-focusBorder);border-radius:8px;');
			webview.setAttribute('src', 'https://github.com/login');
			document.body.appendChild(webview);

			const backdrop = document.createElement('div');
			backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999998;';
			document.body.appendChild(backdrop);

			const cleanup = () => {
				webview.remove();
				backdrop.remove();
			};

			const checkLogin = async () => {
				try {
					const user = await webview.executeJavaScript(
						`document.querySelector('meta[name="user-login"]')?.getAttribute('content') || null`
					);
					if (user) {
						this.logService.info(`[GitHubUpload] Logged in as ${user}`);
						this._onDidChangeLoginState.fire(true);
						cleanup();
						resolve(true);
					}
				} catch {
					// page still loading
				}
			};

			webview.addEventListener('did-navigate', checkLogin);
			webview.addEventListener('did-navigate-in-page', checkLogin);

			backdrop.addEventListener('click', () => {
				cleanup();
				resolve(false);
			});
		});
	}

	async resolveRepositoryId(owner: string, repo: string): Promise<string> {
		const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
			headers: {
				'Accept': 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});
		if (!response.ok) {
			throw new Error(`Failed to resolve repository ID for ${owner}/${repo}: ${response.status}`);
		}
		const json = await response.json();
		return String(json.id);
	}

	async uploadAsset(owner: string, repo: string, repoId: string, fileName: string, fileBytes: Uint8Array, contentType: string): Promise<IGitHubUploadResult> {
		this.logService.info(`[GitHubUpload] Uploading ${fileName} (${fileBytes.length} bytes, ${contentType})`);

		const webview = this.createHiddenWebview();
		try {
			await this.loadUrl(webview, `https://github.com/${owner}/${repo}`);
			await new Promise(r => setTimeout(r, 500));

			// Step 1: Get upload policy
			const policyResult = await webview.executeJavaScript(`
				(async () => {
					const token =
						document.querySelector('input[name="authenticity_token"]')?.value ||
						document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
						null;

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
					if (!r.ok) {
						return { error: 'Policy ' + r.status + ': ' + (await r.text()).substring(0, 300) };
					}
					return { policy: await r.json() };
				})()
			`);

			if (policyResult.error) {
				throw new Error(policyResult.error);
			}
			const policy = policyResult.policy;
			this.logService.info(`[GitHubUpload] Policy OK, asset_id=${policy.asset.id}`);

			// Step 2: Upload to S3
			const bytesArray = Array.from(fileBytes);
			const s3Result = await webview.executeJavaScript(`
				(async () => {
					const fd = new FormData();
					const formFields = ${JSON.stringify(policy.form)};
					for (const [key, value] of Object.entries(formFields)) { fd.append(key, value); }
					const blob = new Blob([new Uint8Array(${JSON.stringify(bytesArray)})], { type: ${JSON.stringify(contentType)} });
					fd.append('file', blob, ${JSON.stringify(policy.asset.name)});

					const r = await fetch(${JSON.stringify(policy.upload_url)}, { method: 'POST', body: fd, mode: 'cors' });
					return r.status >= 200 && r.status < 300
						? { ok: true }
						: { ok: false, error: 'S3 ' + r.status };
				})()
			`);

			if (!s3Result.ok) {
				throw new Error(s3Result.error);
			}
			this.logService.info(`[GitHubUpload] S3 upload OK`);

			// Step 3: Confirm
			await webview.executeJavaScript(`
				(async () => {
					await fetch('https://github.com' + ${JSON.stringify(policy.asset_upload_url)}, {
						method: 'PUT', credentials: 'same-origin',
						headers: { 'github-verified-fetch': 'true', 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/json' },
						body: JSON.stringify({ authenticity_token: ${JSON.stringify(policy.asset_upload_authenticity_token)} }),
					});
				})()
			`);

			this.logService.info(`[GitHubUpload] Confirmed: ${policy.asset.href}`);
			return { fileName, assetUrl: policy.asset.href, contentType };
		} finally {
			webview.remove();
		}
	}

	private createHiddenWebview(): Electron.WebviewTag {
		const webview = document.createElement('webview') as Electron.WebviewTag;
		webview.setAttribute('partition', GITHUB_PARTITION);
		// DEBUG: make visible so we can see what github.com shows
		webview.setAttribute('style', 'position:fixed;bottom:10px;right:10px;width:400px;height:300px;z-index:999999;border:2px solid red;border-radius:4px;');
		document.body.appendChild(webview);
		return webview;
	}

	private loadUrl(webview: Electron.WebviewTag, url: string): Promise<void> {
		this.logService.info(`[GitHubUpload] loadUrl: ${url}`);
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				webview.removeEventListener('did-finish-load', onLoad);
				webview.removeEventListener('did-fail-load', onError);
				this.logService.error(`[GitHubUpload] loadUrl TIMEOUT: ${url}`);
				reject(new Error(`Timeout loading ${url}`));
			}, 15000);

			const onLoad = () => {
				clearTimeout(timeout);
				webview.removeEventListener('did-finish-load', onLoad);
				webview.removeEventListener('did-fail-load', onError);
				this.logService.info(`[GitHubUpload] loadUrl done: ${url}`);
				resolve();
			};
			const onError = (e: Electron.DidFailLoadEvent) => {
				clearTimeout(timeout);
				webview.removeEventListener('did-finish-load', onLoad);
				webview.removeEventListener('did-fail-load', onError);
				this.logService.error(`[GitHubUpload] loadUrl FAILED: ${url} -- ${e.errorDescription}`);
				reject(new Error(`Failed to load ${url}: ${e.errorDescription}`));
			};
			webview.addEventListener('did-finish-load', onLoad);
			webview.addEventListener('did-fail-load', onError);
			webview.setAttribute('src', url);
		});
	}
}
