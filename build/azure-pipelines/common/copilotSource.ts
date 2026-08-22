/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

export const SDK_NPM_NAME = '@github/copilot-sdk';
export const RUNTIME_NPM_NAME = '@github/copilot';
export const RUNTIME_REPO = 'github/copilot-agent-runtime';

export interface CopilotGitSource {
	readonly repo: string;
	readonly ref: string;
}

export interface CopilotBuildOverrides {
	readonly sdkRef: string;
	readonly runtimeRef: string;
	readonly sdkVersion: string;
	readonly runtimeVersion: string;
	readonly vscodeVersion: string;
}

export interface VscodeSourceMetadata {
	readonly vscodeCommit: string;
	readonly sourceCommit: string;
	readonly sourceVersion: string;
	readonly sourceBuildId: string;
}

interface RootPackageManifest {
	readonly version?: unknown;
	readonly dependencies?: Readonly<Record<string, unknown>>;
	readonly buildOverrides?: Readonly<Record<string, unknown>>;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[0-9A-Za-z.-]*[0-9A-Za-z])?)?$/;
const BUILD_ID = /^(?:0|[1-9]\d*)$/;

export function assertCommitSha(ref: string, variableName: string): void {
	if (!COMMIT_SHA.test(ref)) {
		throw new Error(`[copilot-source] ${variableName} must be a full 40-character lowercase commit SHA.`);
	}
}

function readRootManifest(root: string): RootPackageManifest {
	return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as RootPackageManifest;
}

function exactVersion(value: unknown, packageName: string): string {
	if (typeof value !== 'string' || !EXACT_VERSION.test(value)) {
		throw new Error(`[copilot-source] ${packageName} must have an exact semantic version in package.json dependencies.`);
	}
	return value;
}

function overrideRef(overrides: Readonly<Record<string, unknown>>, packageName: string): string | undefined {
	const value = overrides[packageName];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new Error(`[copilot-source] package.json buildOverrides["${packageName}"] must be a full commit SHA string.`);
	}
	const ref = value.trim();
	assertCommitSha(ref, `buildOverrides["${packageName}"].ref`);
	return ref;
}

export function readCopilotBuildOverrides(root: string): CopilotBuildOverrides | undefined {
	const manifest = readRootManifest(root);
	const overrides = manifest.buildOverrides ?? {};
	const sdkRef = overrideRef(overrides, SDK_NPM_NAME);
	const runtimeRef = overrideRef(overrides, RUNTIME_NPM_NAME);
	if (!sdkRef && !runtimeRef) {
		return undefined;
	}
	if (!sdkRef || !runtimeRef) {
		throw new Error(`[copilot-source] package.json buildOverrides must specify both ${SDK_NPM_NAME} and ${RUNTIME_NPM_NAME}.`);
	}
	const dependencies = manifest.dependencies ?? {};
	return {
		sdkRef,
		runtimeRef,
		sdkVersion: exactVersion(dependencies[SDK_NPM_NAME], SDK_NPM_NAME),
		runtimeVersion: exactVersion(dependencies[RUNTIME_NPM_NAME], RUNTIME_NPM_NAME),
		vscodeVersion: exactVersion(manifest.version, 'VS Code'),
	};
}

export function copilotSourceVersion(vscodeVersion: string, vscodeCommit: string): string {
	const version = exactVersion(vscodeVersion, 'VS Code');
	assertCommitSha(vscodeCommit, 'BUILD_SOURCEVERSION');
	return `0.0.0-vscode.${version}.g${vscodeCommit}`;
}

export function createVscodeSourceMetadata(root: string, packageName: string, vscodeCommit: string, sourceCommit: string, sourceBuildId: string): VscodeSourceMetadata {
	const manifest = readRootManifest(root);
	const dependencies = manifest.dependencies ?? {};
	assertCommitSha(vscodeCommit, 'BUILD_SOURCEVERSION');
	assertCommitSha(sourceCommit, `${packageName} source commit`);
	if (!BUILD_ID.test(sourceBuildId)) {
		throw new Error(`[copilot-source] BUILD_BUILDID must be a non-negative integer.`);
	}
	return {
		vscodeCommit,
		sourceCommit,
		sourceVersion: exactVersion(dependencies[packageName], packageName),
		sourceBuildId,
	};
}

export function sourceBuildVersion(ref: string): string {
	return `0.0.0-src.g${ref.slice(0, 7)}`;
}
