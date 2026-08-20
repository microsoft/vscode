/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface ProductBuildRequest {
	readonly definition: { readonly id: number };
	readonly sourceBranch: string;
	readonly sourceVersion: string;
	readonly templateParameters: {
		readonly VSCODE_QUALITY: string;
		readonly NPM_REGISTRY: string;
		readonly VSCODE_PUBLISH: boolean;
		readonly VSCODE_RELEASE: boolean;
		readonly VSCODE_RUN_ARTIFACT_SANITY_TESTS: boolean;
		readonly VSCODE_BUILD_WIN32: boolean;
		readonly VSCODE_BUILD_WIN32_ARM64: boolean;
		readonly VSCODE_BUILD_LINUX: boolean;
		readonly VSCODE_BUILD_LINUX_SNAP: boolean;
		readonly VSCODE_BUILD_LINUX_ARM64: boolean;
		readonly VSCODE_BUILD_LINUX_ARMHF: boolean;
		readonly VSCODE_BUILD_ALPINE: boolean;
		readonly VSCODE_BUILD_ALPINE_ARM64: boolean;
		readonly VSCODE_BUILD_MACOS: boolean;
		readonly VSCODE_BUILD_MACOS_ARM64: boolean;
		readonly VSCODE_BUILD_MACOS_UNIVERSAL: boolean;
		readonly VSCODE_BUILD_WEB: boolean;
	};
}

interface BuildResponse {
	readonly id: number;
	readonly buildNumber: string;
	readonly status: string;
	readonly result?: string;
	readonly _links?: { readonly web?: { readonly href?: string } };
}

interface QueueOptions {
	readonly definitionId: number;
	readonly sourceBranch: string;
	readonly sourceVersion: string;
	readonly quality: string;
	readonly registry: string;
	readonly publish: boolean;
	readonly release: boolean;
	readonly windows: boolean;
	readonly linux: boolean;
	readonly alpine: boolean;
	readonly macos: boolean;
	readonly web: boolean;
}

function requiredEnv(name: string): string {
	const value = (process.env[name] ?? '').trim();
	if (!value) {
		throw new Error(`[copilot-product-build] Missing required environment variable ${name}.`);
	}
	return value;
}

function booleanEnv(name: string, defaultValue: boolean): boolean {
	const value = (process.env[name] ?? '').trim().toLowerCase();
	if (!value) {
		return defaultValue;
	}
	if (value !== 'true' && value !== 'false') {
		throw new Error(`[copilot-product-build] ${name} must be true or false.`);
	}
	return value === 'true';
}

function sourceBranch(ref: string): string {
	return ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;
}

export function createProductBuildRequest(options: QueueOptions): ProductBuildRequest {
	return {
		definition: { id: options.definitionId },
		sourceBranch: sourceBranch(options.sourceBranch),
		sourceVersion: options.sourceVersion,
		templateParameters: {
			VSCODE_QUALITY: options.quality,
			NPM_REGISTRY: options.registry,
			VSCODE_PUBLISH: options.publish,
			VSCODE_RELEASE: options.release,
			VSCODE_RUN_ARTIFACT_SANITY_TESTS: !options.publish,
			VSCODE_BUILD_WIN32: options.windows,
			VSCODE_BUILD_WIN32_ARM64: options.windows,
			VSCODE_BUILD_LINUX: options.linux,
			VSCODE_BUILD_LINUX_SNAP: options.linux,
			VSCODE_BUILD_LINUX_ARM64: options.linux,
			VSCODE_BUILD_LINUX_ARMHF: options.linux,
			VSCODE_BUILD_ALPINE: options.alpine,
			VSCODE_BUILD_ALPINE_ARM64: options.alpine,
			VSCODE_BUILD_MACOS: options.macos,
			VSCODE_BUILD_MACOS_ARM64: options.macos,
			VSCODE_BUILD_MACOS_UNIVERSAL: options.macos,
			VSCODE_BUILD_WEB: options.web,
		},
	};
}

async function adoRequest<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...init.headers,
		},
	});
	const body = await response.text();
	if (!response.ok) {
		throw new Error(`[copilot-product-build] Azure DevOps request failed (${response.status} ${response.statusText}): ${body}`);
	}
	return JSON.parse(body) as T;
}

async function waitForBuild(url: string, token: string, build: BuildResponse): Promise<void> {
	const deadline = Date.now() + 8 * 60 * 60 * 1000;
	let current = build;
	while (current.status !== 'completed') {
		if (Date.now() >= deadline) {
			throw new Error(`[copilot-product-build] Timed out waiting for child build ${current.id}.`);
		}
		await new Promise(resolve => setTimeout(resolve, 30_000));
		current = await adoRequest<BuildResponse>(`${url}/${current.id}?api-version=7.1`, token);
		console.log(`[copilot-product-build] Child build ${current.id}: ${current.status}${current.result ? ` (${current.result})` : ''}.`);
	}
	if (current.result !== 'succeeded') {
		throw new Error(`[copilot-product-build] Child build ${current.id} completed with result ${current.result ?? 'unknown'}.`);
	}
}

async function main(): Promise<void> {
	const collectionUri = requiredEnv('SYSTEM_COLLECTIONURI').replace(/\/?$/, '/');
	const project = encodeURIComponent(requiredEnv('SYSTEM_TEAMPROJECT'));
	const token = requiredEnv('SYSTEM_ACCESSTOKEN');
	const definitionId = Number(requiredEnv('VSCODE_PRODUCT_BUILD_DEFINITION_ID'));
	if (!Number.isInteger(definitionId) || definitionId <= 0) {
		throw new Error('[copilot-product-build] VSCODE_PRODUCT_BUILD_DEFINITION_ID must be a positive integer.');
	}

	const request = createProductBuildRequest({
		definitionId,
		sourceBranch: requiredEnv('VSCODE_PRODUCT_SOURCE_BRANCH'),
		sourceVersion: requiredEnv('VSCODE_PRODUCT_SOURCE_VERSION'),
		quality: requiredEnv('VSCODE_QUALITY'),
		registry: requiredEnv('NPM_REGISTRY'),
		publish: booleanEnv('VSCODE_PUBLISH', false),
		release: booleanEnv('VSCODE_RELEASE', false),
		windows: booleanEnv('VSCODE_BUILD_WINDOWS', true),
		linux: booleanEnv('VSCODE_BUILD_LINUX', true),
		alpine: booleanEnv('VSCODE_BUILD_ALPINE', true),
		macos: booleanEnv('VSCODE_BUILD_MACOS', true),
		web: booleanEnv('VSCODE_BUILD_WEB', true),
	});
	const buildsUrl = `${collectionUri}${project}/_apis/build/builds`;
	const build = await adoRequest<BuildResponse>(`${buildsUrl}?api-version=7.1`, token, {
		method: 'POST',
		body: JSON.stringify(request),
	});
	const webUrl = build._links?.web?.href;
	console.log(`##vso[build.addbuildtag]product-build=${build.id}`);
	console.log(`[copilot-product-build] Queued child build ${build.buildNumber} (${build.id})${webUrl ? `: ${webUrl}` : '.'}`);

	if (booleanEnv('VSCODE_WAIT_FOR_PRODUCT_BUILD', true)) {
		await waitForBuild(buildsUrl, token, build);
	}
}

if (import.meta.main) {
	main().catch(error => {
		console.error(error instanceof Error ? error.stack ?? error.message : String(error));
		process.exit(1);
	});
}
