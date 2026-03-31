/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { IGitHubUploadResult, IGitHubUploadService } from '../browser/githubUploadService.js';

/**
 * GitHub upload service using the integrated browser + Playwright.
 *
 * Opens github.com in the integrated browser, then uses page.evaluate()
 * via Playwright to execute the upload flow (policy -> S3 -> confirm).
 */
export class NativeGitHubUploadService extends Disposable implements IGitHubUploadService {

	readonly _serviceBrand: undefined;

	private readonly _onDidChangeLoginState = this._register(new Emitter<boolean>());
	readonly onDidChangeLoginState: Event<boolean> = this._onDidChangeLoginState.event;

	private activePageId: string | undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
	) {
		super();
	}

	async isLoggedIn(): Promise<boolean> {
		return !!this.activePageId;
	}

	async login(): Promise<boolean> {
		this.logService.info('[GitHubUpload] Opening browser to GitHub login...');
		const { pageId } = await this.playwrightService.openPage('https://github.com/login');
		this.activePageId = pageId;
		this.logService.info(`[GitHubUpload] Page opened: ${pageId}, polling for login...`);

		// Poll until user logs in. Navigations (login -> 2FA -> home) destroy
		// the execution context, so we catch and retry instead of bailing out.
		for (let i = 0; i < 150; i++) {
			await new Promise(r => setTimeout(r, 2000));
			try {
				const user = await this.playwrightService.invokeFunctionRaw<string | null>(pageId,
					`async (page) => {
						return await page.evaluate(() =>
							document.querySelector('meta[name="user-login"]')?.getAttribute('content') || null
						);
					}`
				);
				if (user) {
					this.logService.info(`[GitHubUpload] Logged in as ${user}`);
					this._onDidChangeLoginState.fire(true);
					return true;
				}
			} catch {
				// Navigation destroyed execution context (e.g. login -> 2FA -> home).
				// This is expected — just keep polling.
			}
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

		if (!this.activePageId) {
			throw new Error('No active browser page');
		}

		const pageId = this.activePageId;

		// Navigate to repo page for CSRF tokens
		this.logService.info(`[GitHubUpload] Navigating to ${owner}/${repo}...`);
		await this.playwrightService.invokeFunctionRaw(pageId,
			`async (page) => { await page.goto('https://github.com/${owner}/${repo}', { waitUntil: 'domcontentloaded' }); }`
		);
		await new Promise(r => setTimeout(r, 1000));

		// Step 1: Get upload policy
		this.logService.info('[GitHubUpload] Step 1/3: policy');
		const policyResult = await this.playwrightService.invokeFunctionRaw<{ error?: string; policy?: Record<string, unknown> }>(pageId,
			`async (page, repoId, fileName, fileSize, contentType) => {
				return await page.evaluate(async ({ repoId, fileName, fileSize, contentType }) => {
					const token =
						document.querySelector('input[name="authenticity_token"]')?.value ||
						document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || null;
					const fd = new FormData();
					fd.append('repository_id', repoId);
					fd.append('name', fileName);
					fd.append('size', String(fileSize));
					fd.append('content_type', contentType);
					if (token) { fd.append('authenticity_token', token); }
					const r = await fetch('https://github.com/upload/policies/assets', {
						method: 'POST', body: fd, credentials: 'same-origin',
						headers: { 'github-verified-fetch': 'true', 'x-requested-with': 'XMLHttpRequest' },
					});
					if (!r.ok) { return { error: 'Policy ' + r.status + ': ' + (await r.text()).substring(0, 200) }; }
					return { policy: await r.json() };
				}, { repoId, fileName, fileSize, contentType });
			}`,
			repoId, fileName, String(fileBytes.length), contentType
		);

		this.logService.info(`[GitHubUpload] policyResult: ${JSON.stringify(policyResult)?.substring(0, 300)}`);
		if (!policyResult || policyResult.error) {
			throw new Error(policyResult?.error ?? 'Policy request failed');
		}
		const policy = policyResult.policy as Record<string, unknown>;
		const asset = policy.asset as Record<string, unknown>;
		this.logService.info(`[GitHubUpload] Policy OK: asset=${asset.id}`);

		// Step 2: S3 upload
		this.logService.info('[GitHubUpload] Step 2/3: S3');
		const bytesArray = Array.from(fileBytes);
		const s3 = await this.playwrightService.invokeFunctionRaw<{ ok: boolean; error?: string }>(pageId,
			`async (page, uploadUrl, formFields, bytesArray, contentType, assetName) => {
				return await page.evaluate(async ({ uploadUrl, formFields, bytesArray, contentType, assetName }) => {
					const fd = new FormData();
					for (const [k, v] of Object.entries(formFields)) { fd.append(k, v); }
					fd.append('file', new Blob([new Uint8Array(bytesArray)], { type: contentType }), assetName);
					const r = await fetch(uploadUrl, { method: 'POST', body: fd, mode: 'cors' });
					return r.status >= 200 && r.status < 300 ? { ok: true } : { ok: false, error: 'S3 ' + r.status };
				}, { uploadUrl, formFields, bytesArray, contentType, assetName });
			}`,
			policy.upload_url, policy.form, bytesArray, contentType, asset.name
		);

		if (!s3 || !s3.ok) {
			throw new Error(s3?.error ?? 'S3 upload failed');
		}
		this.logService.info('[GitHubUpload] S3 OK');

		// Step 3: confirm
		this.logService.info('[GitHubUpload] Step 3/3: confirm');
		await this.playwrightService.invokeFunctionRaw(pageId,
			`async (page, assetUploadUrl, confirmToken) => {
				await page.evaluate(async ({ assetUploadUrl, confirmToken }) => {
					await fetch('https://github.com' + assetUploadUrl, {
						method: 'PUT', credentials: 'same-origin',
						headers: { 'github-verified-fetch': 'true', 'x-requested-with': 'XMLHttpRequest', 'content-type': 'application/json' },
						body: JSON.stringify({ authenticity_token: confirmToken }),
					});
				}, { assetUploadUrl, confirmToken });
			}`,
			policy.asset_upload_url, policy.asset_upload_authenticity_token
		);

		const assetHref = asset.href as string;
		this.logService.info(`[GitHubUpload] Done: ${assetHref}`);
		return { fileName, assetUrl: assetHref, contentType };
	}

	async navigateTo(url: string): Promise<void> {
		if (!this.activePageId) {
			return;
		}
		this.logService.info(`[GitHubUpload] Navigating to: ${url}`);
		await this.playwrightService.invokeFunctionRaw(this.activePageId,
			`async (page, url) => { await page.goto(url, { waitUntil: 'domcontentloaded' }); }`,
			url
		);
	}
}
