/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MobilePreviewManifest } from '../../next/mobilePreview.ts';

/** Mobile has a separate root and inventory; the normal web preloader must never discover it. */
export function getWebCdnConfiguration(args: readonly string[], quality: string | undefined, commit: string | undefined) {
	assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--mobile'), 'Usage: upload-cdn.ts [--mobile]');
	if (args.length === 0) {
		return { source: '../vscode-web', prefix: `${quality}/${commit}/`, patterns: ['**'], mobile: false };
	}
	assert.match(quality ?? '', /^(stable|insider|exploration)$/, 'Mobile publication requires an official build quality');
	assert.match(commit ?? '', /^[0-9a-f]{40}$/, 'Mobile publication requires BUILD_SOURCEVERSION');
	return {
		source: 'out-mobile-preview',
		prefix: `agents/mobile/${quality}/${commit}/`,
		patterns: ['out/**', 'node_modules/**', 'extensions/**', 'mobile-preview.json'],
		mobile: true,
	};
}

/** The build registry, CDN assets and archive must all describe the same source revision. */
export async function validateMobileWebCdnIdentity(directory: string, quality: string, commit: string): Promise<void> {
	const manifest: MobilePreviewManifest = JSON.parse(await readFile(join(directory, 'mobile-preview.json'), 'utf8'));
	assert.equal(manifest.schemaVersion, 2, 'Unsupported mobile build inventory');
	assert.equal(manifest.kind, 'sessions-mobile-preview', 'Expected a mobile web build');
	assert.equal(manifest.build?.commit, commit, 'Mobile build does not match BUILD_SOURCEVERSION');
	assert.equal(manifest.build?.quality, quality, 'Mobile build does not match VSCODE_QUALITY');
}
