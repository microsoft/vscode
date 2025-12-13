/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

export type ProductConfiguration = typeof import('../../product.json');

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function deepMerge(base: JsonValue, override: JsonValue): JsonValue {
	if (override === null || typeof override !== 'object') {
		return override;
	}

	if (Array.isArray(override)) {
		return override;
	}

	if (base === null || typeof base !== 'object' || Array.isArray(base)) {
		return override;
	}

	const result: Record<string, JsonValue> = { ...(base as Record<string, JsonValue>) };
	for (const [key, value] of Object.entries(override)) {
		if (Object.prototype.hasOwnProperty.call(result, key)) {
			result[key] = deepMerge(result[key] as JsonValue, value);
		} else {
			result[key] = value;
		}
	}

	return result;
}

export function getBuildName(): string {
	return process.env['VSCODE_BUILD_NAME'] || 'VSCode';
}

export function getProductOverridesPath(repoRoot: string): string | undefined {
	const configured = process.env['VSCODE_PRODUCT_JSON'];
	if (!configured) {
		return undefined;
	}

	return path.isAbsolute(configured) ? configured : path.join(repoRoot, configured);
}

export function getProductConfiguration(repoRoot: string): ProductConfiguration {
	const basePath = path.join(repoRoot, 'product.json');
	const base = JSON.parse(fs.readFileSync(basePath, 'utf8')) as JsonValue;

	const overridesPath = getProductOverridesPath(repoRoot);
	if (!overridesPath) {
		return base as ProductConfiguration;
	}

	const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8')) as JsonValue;
	return deepMerge(base, overrides) as ProductConfiguration;
}

