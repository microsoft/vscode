/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

const baselineTag = 'cg-notice-baseline';

interface BuildContext {
	readonly collectionUri: string;
	readonly projectId: string;
	readonly buildId: string;
	readonly token: string;
}

/** Invalidate eligibility before a retried job can replace its published baseline. */
export async function clearNoticeBaselineTag(context: BuildContext, fetcher: typeof fetch = fetch): Promise<void> {
	const url = new URL(`${encodeURIComponent(context.projectId)}/_apis/build/builds/${encodeURIComponent(context.buildId)}/tags?api-version=7.1`, context.collectionUri.replace(/\/?$/, '/'));
	const response = await fetcher(url, {
		method: 'PATCH',
		headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ tagsToRemove: [baselineTag] }),
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) {
		throw new Error(`Cannot clear CG NOTICE baseline tag: HTTP ${response.status} ${response.statusText}`);
	}
}

async function main([stagedDirectory, downloadedDirectory]: string[]): Promise<void> {
	if (stagedDirectory === '--clear') {
		const { SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECTID, BUILD_BUILDID, SYSTEM_ACCESSTOKEN } = process.env;
		if (!SYSTEM_COLLECTIONURI || !SYSTEM_TEAMPROJECTID || !BUILD_BUILDID || !SYSTEM_ACCESSTOKEN) {
			throw new Error('Clearing the CG NOTICE baseline tag requires SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECTID, BUILD_BUILDID and SYSTEM_ACCESSTOKEN.');
		}
		await clearNoticeBaselineTag({
			collectionUri: SYSTEM_COLLECTIONURI,
			projectId: SYSTEM_TEAMPROJECTID,
			buildId: BUILD_BUILDID,
			token: SYSTEM_ACCESSTOKEN,
		});
		return;
	}

	if (!stagedDirectory || !downloadedDirectory) {
		throw new Error('Usage: node tagNoticeBaseline.ts --clear | <staged-directory> <downloaded-directory>');
	}

	for (const [name, minimumSize] of [['ThirdPartyNotices.generated.txt', 1024], ['notice-meta.txt', 0]] as const) {
		const staged = fs.readFileSync(path.join(stagedDirectory, name));
		if (staged.length <= minimumSize) {
			throw new Error(`Cannot tag CG NOTICE baseline: ${name} must be larger than ${minimumSize} bytes.`);
		}
		const downloaded = fs.readFileSync(path.join(downloadedDirectory, name));
		if (!staged.equals(downloaded)) {
			throw new Error(`Cannot tag CG NOTICE baseline: published ${name} does not match the staged file.`);
		}
	}

	console.log(`##vso[build.addbuildtag]${baselineTag}`);
}

if (import.meta.main) {
	main(process.argv.slice(2)).catch(error => {
		console.error(error);
		process.exitCode = 1;
	});
}
