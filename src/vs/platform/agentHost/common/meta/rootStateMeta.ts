/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IProductService } from '../../../product/common/productService.js';
import type { RootState } from '../state/protocol/state.js';

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link RootState}. Keys SHOULD be namespaced to avoid collisions; values MUST
 * be JSON-serializable.
 */
export type RootMeta = Record<string, unknown>;

/**
 * Reserved key under {@link RootMeta} for the well-known host-build payload.
 * Value at this key, when present, MUST be shaped like {@link IHostBuildInfo}.
 * This is a VS Code-specific convention layered on top of the protocol's
 * generic `_meta` bag — the protocol itself does not know about build info.
 */
export const ROOT_META_HOST_BUILD_KEY = 'hostBuild';

/**
 * Build information about the program hosting the agent host (the VS Code CLI),
 * carried under {@link RootMeta} at {@link ROOT_META_HOST_BUILD_KEY}. Lets a
 * client see which build is hosting it — useful when inspecting the output of a
 * remote agent host.
 *
 * All fields except {@link version} are optional — a build that does not track
 * a particular field should omit it.
 */
export interface IHostBuildInfo {
	/** Product version (e.g. `1.96.0`). */
	readonly version: string;
	/** Commit SHA of the build, if known. */
	readonly commit?: string;
	/** Build date (ISO 8601), if known. */
	readonly date?: string;
	/** Release quality (e.g. `stable`, `insider`), if known. */
	readonly quality?: string;
}

/**
 * Derives {@link IHostBuildInfo} from the host's {@link IProductService}.
 */
export function hostBuildInfoFromProduct(productService: IProductService): IHostBuildInfo {
	return {
		version: productService.version,
		commit: productService.commit,
		date: productService.date,
		quality: productService.quality,
	};
}

/**
 * Reads the well-known host-build payload from {@link RootMeta}, if present.
 * Returns `undefined` when the meta bag is absent or the value at the host-build
 * key is not a plain object with a string `version`. Optional fields with wrong
 * types are silently dropped.
 */
export function readHostBuildInfo(state: RootState | undefined): IHostBuildInfo | undefined {
	const meta = state?._meta;
	const value = meta?.[ROOT_META_HOST_BUILD_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['version'] !== 'string') {
		return undefined;
	}
	const result: { version: string; commit?: string; date?: string; quality?: string } = {
		version: raw['version'],
	};
	if (typeof raw['commit'] === 'string') { result.commit = raw['commit']; }
	if (typeof raw['date'] === 'string') { result.date = raw['date']; }
	if (typeof raw['quality'] === 'string') { result.quality = raw['quality']; }
	return result;
}

/**
 * Returns a new {@link RootMeta} with the host-build payload set to
 * `buildInfo`, or with the slot removed if `buildInfo` is `undefined`. Returns
 * `undefined` if the result would be empty.
 */
export function withHostBuildInfo(meta: RootMeta | undefined, buildInfo: IHostBuildInfo | undefined): RootMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (buildInfo !== undefined) {
		next[ROOT_META_HOST_BUILD_KEY] = buildInfo;
	} else {
		delete next[ROOT_META_HOST_BUILD_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Formats {@link IHostBuildInfo} as a short single-line human-readable string,
 * e.g. `1.96.0 (commit abc1234, 2024-01-02T03:04:05Z, insider)`.
 */
export function formatHostBuildInfo(info: IHostBuildInfo): string {
	const details: string[] = [];
	if (info.commit) { details.push(`commit ${info.commit}`); }
	if (info.date) { details.push(info.date); }
	if (info.quality) { details.push(info.quality); }
	return details.length > 0 ? `${info.version} (${details.join(', ')})` : info.version;
}
