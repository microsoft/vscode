/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';

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

export interface IAgentHostRepositoryPluginReconcileRequest {
	readonly workingDirectory: string;
	readonly managedSettings?: Record<string, unknown>;
}

export interface IAgentHostRepositoryPluginReconcileResult {
	readonly repositoryPlugins: readonly IAgentHostRepositoryPluginActivation[];
	readonly warnings: readonly string[];
}

export function toRepositoryPluginRuntimeWorkingDirectory(workingDirectory: string): string {
	const uri = URI.parse(workingDirectory, true);
	return uri.scheme === Schemas.file ? uri.fsPath : uri.path;
}
