/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import type { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';

/** Runtime-owned repository plugin state exchanged through the optional VS Code Agent Host extension. */
export interface IAgentHostRepositoryPluginRecord {
	readonly name: string;
	readonly marketplace: string;
	readonly enabled: boolean;
	readonly installed_at: string;
	readonly cache_path?: string;
	readonly installed_from?: string;
	readonly version?: string;
	readonly source_sha?: string;
}

export interface IAgentHostRepositoryPluginActivation {
	readonly plugin: IAgentHostRepositoryPluginRecord;
	readonly enabled: boolean;
}

export interface IAgentHostRepositoryPluginContext {
	readonly id: string;
	readonly workingDirectory: string;
	readonly trusted: boolean;
	readonly automaticUpdatesAllowed: boolean;
	readonly managedSettings?: Record<string, unknown>;
}

export interface IAgentHostRepositoryPluginContextResult {
	readonly repositoryEnabledPlugins: Readonly<Record<string, boolean | undefined>>;
	readonly repositoryPlugins: readonly IAgentHostRepositoryPluginActivation[];
	readonly installResults: readonly {
		readonly spec: string;
		readonly action: 'installed' | 'already_installed' | 'disabled' | 'skipped' | 'failed';
		readonly error?: string;
	}[];
	readonly updateResults: readonly {
		readonly spec: string;
		readonly action: 'updated' | 'already_latest' | 'failed';
		readonly previousVersion?: string;
		readonly newVersion?: string;
		readonly error?: string;
	}[];
	readonly warnings: readonly string[];
}

export interface IAgentHostRepositoryPluginContextSnapshot {
	readonly id: string;
	readonly workingDirectory: string;
	readonly state: 'ready' | 'error';
	readonly result?: IAgentHostRepositoryPluginContextResult;
	readonly error?: string;
}

export interface IAgentHostRepositoryPluginContextsSnapshot {
	readonly revision: number;
	readonly contexts: readonly IAgentHostRepositoryPluginContextSnapshot[];
}

export interface IAgentHostRepositoryPluginContexts {
	readonly onDidChange: Event<IAgentHostRepositoryPluginContextsSnapshot>;
	getSnapshot(): IAgentHostRepositoryPluginContextsSnapshot | undefined;
	set(contexts: readonly IAgentHostRepositoryPluginContext[]): Promise<IAgentHostRepositoryPluginContextsSnapshot>;
}

export function isAgentHostRepositoryPluginContextsSnapshot(value: unknown): value is IAgentHostRepositoryPluginContextsSnapshot {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as { revision?: unknown; contexts?: unknown };
	return typeof candidate.revision === 'number'
		&& Number.isSafeInteger(candidate.revision)
		&& candidate.revision >= 0
		&& Array.isArray(candidate.contexts)
		&& candidate.contexts.every(context => {
			if (!context || typeof context !== 'object' || Array.isArray(context)) {
				return false;
			}
			const snapshot = context as { id?: unknown; workingDirectory?: unknown; state?: unknown; result?: unknown; error?: unknown };
			if (typeof snapshot.id !== 'string' || typeof snapshot.workingDirectory !== 'string') {
				return false;
			}
			if (snapshot.state === 'error') {
				return snapshot.result === undefined && typeof snapshot.error === 'string';
			}
			return snapshot.state === 'ready' && isRepositoryPluginContextResult(snapshot.result) && snapshot.error === undefined;
		});
}

function isRepositoryPluginContextResult(value: unknown): value is IAgentHostRepositoryPluginContextResult {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const result = value as {
		repositoryEnabledPlugins?: unknown;
		repositoryPlugins?: unknown;
		installResults?: unknown;
		updateResults?: unknown;
		warnings?: unknown;
	};
	return isBooleanRecord(result.repositoryEnabledPlugins)
		&& Array.isArray(result.repositoryPlugins)
		&& result.repositoryPlugins.every(activation => {
			if (!activation || typeof activation !== 'object' || Array.isArray(activation)) {
				return false;
			}
			const candidate = activation as { plugin?: unknown; enabled?: unknown };
			return typeof candidate.enabled === 'boolean' && isRepositoryPluginRecord(candidate.plugin);
		})
		&& Array.isArray(result.installResults)
		&& Array.isArray(result.updateResults)
		&& Array.isArray(result.warnings)
		&& result.warnings.every(warning => typeof warning === 'string');
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
	return !!value
		&& typeof value === 'object'
		&& !Array.isArray(value)
		&& Object.values(value).every(entry => typeof entry === 'boolean');
}

function isRepositoryPluginRecord(value: unknown): value is IAgentHostRepositoryPluginRecord {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const record = value as { name?: unknown; marketplace?: unknown; enabled?: unknown; installed_at?: unknown };
	return typeof record.name === 'string'
		&& typeof record.marketplace === 'string'
		&& typeof record.enabled === 'boolean'
		&& typeof record.installed_at === 'string';
}

export function toRepositoryPluginRuntimeWorkingDirectory(workingDirectory: string): string {
	const uri = URI.parse(workingDirectory, true);
	return uri.scheme === Schemas.file ? uri.fsPath : uri.path;
}
