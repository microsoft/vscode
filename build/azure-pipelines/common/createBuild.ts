/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientAssertionCredential } from '@azure/identity';
import { CosmosClient } from '@azure/cosmos';
import { retry } from './retry.ts';

function getEnv(name: string): string {
	const result = process.env[name];

	if (typeof result === 'undefined') {
		throw new Error('Missing env: ' + name);
	}

	return result;
}

/**
 * Parses an Azure Pipelines numeric variable (e.g. Build.BuildId, System.DefinitionId)
 * to a positive integer. Returns undefined if the value is missing, non-numeric, or
 * not a positive integer (e.g. local dev runs where the variable isn't set).
 */
export function parseAdoPositiveInt(value: string | undefined): number | undefined {
	if (typeof value !== 'string' || value.length === 0) {
		return undefined;
	}
	if (!/^\d+$/.test(value)) {
		return undefined;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return undefined;
	}
	return parsed;
}

export interface IBuildEnv {
	readonly quality: string;
	readonly commit: string;
	readonly queuedBy: string;
	readonly sourceBranch: string;
	readonly version: string;
	readonly isPrivate: boolean;
	/** Azure DevOps run id (Build.BuildId). */
	readonly buildId?: number;
	/** Azure DevOps pipeline definition id (System.DefinitionId). */
	readonly definitionId?: number;
	readonly timestamp: number;
}

export interface IBuildDocument {
	id: string;
	timestamp: number;
	version: string;
	isReleased: boolean;
	private: boolean;
	sourceBranch: string;
	queuedBy: string;
	assets: unknown[];
	updates: Record<string, unknown>;
	firstReleaseTimestamp: number | null;
	history: { event: string; timestamp: number }[];
	/** Azure DevOps run id that produced this build. Used by vscode-release-server to link to the pipeline run. */
	buildId?: number;
	/** Azure DevOps pipeline definition id that produced this build. */
	definitionId?: number;
}

export function createBuildDocument(env: IBuildEnv): IBuildDocument {
	const build: IBuildDocument = {
		id: env.commit,
		timestamp: env.timestamp,
		version: env.version,
		isReleased: false,
		private: env.isPrivate,
		sourceBranch: env.sourceBranch,
		queuedBy: env.queuedBy,
		assets: [],
		updates: {},
		firstReleaseTimestamp: null,
		history: [
			{ event: 'created', timestamp: env.timestamp }
		]
	};

	if (env.buildId !== undefined) {
		build.buildId = env.buildId;
	}
	if (env.definitionId !== undefined) {
		build.definitionId = env.definitionId;
	}

	return build;
}

async function main(): Promise<void> {
	const [, , _version] = process.argv;
	const quality = getEnv('VSCODE_QUALITY');
	const commit = getEnv('BUILD_SOURCEVERSION');
	const queuedBy = getEnv('BUILD_QUEUEDBY');
	const sourceBranch = getEnv('BUILD_SOURCEBRANCH');
	const version = _version + (quality === 'stable' ? '' : `-${quality}`);
	const buildId = parseAdoPositiveInt(process.env['BUILD_BUILDID']);
	const definitionId = parseAdoPositiveInt(process.env['SYSTEM_DEFINITIONID']);

	console.log('Creating build...');
	console.log('Quality:', quality);
	console.log('Version:', version);
	console.log('Commit:', commit);
	console.log('ADO BuildId:', buildId ?? '(not set)');
	console.log('ADO DefinitionId:', definitionId ?? '(not set)');

	const build = createBuildDocument({
		quality,
		commit,
		queuedBy,
		sourceBranch,
		version,
		isPrivate: process.env['VSCODE_PRIVATE_BUILD']?.toLowerCase() === 'true',
		buildId,
		definitionId,
		timestamp: Date.now(),
	});

	const aadCredentials = new ClientAssertionCredential(process.env['AZURE_TENANT_ID']!, process.env['AZURE_CLIENT_ID']!, () => Promise.resolve(process.env['AZURE_ID_TOKEN']!));
	const client = new CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT']!, aadCredentials });
	const scripts = client.database('builds').container(quality).scripts;
	await retry(() => scripts.storedProcedure('createBuild').execute('', [{ ...build, _partitionKey: '' }]));
}

// Run as CLI when invoked directly (not when imported by tests).
if (process.argv[1] && /createBuild\.(ts|js)$/.test(process.argv[1])) {
	if (process.argv.length !== 3) {
		console.error('Usage: node createBuild.ts VERSION');
		process.exit(-1);
	}

	main().then(() => {
		console.log('Build successfully created');
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
