/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { hashAsync } from '../../../../../base/common/hash.js';
import { dirname, getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';

export const CUSTOMIZATION_MIGRATION_RECOVERY_MANIFEST = 'manifest.json';

export type CustomizationMigrationRecoveryStatus = 'prepared' | 'running' | 'completed' | 'cancelled' | 'unknown';

export interface ICustomizationMigrationRecoverySourceInput {
	readonly uri: URI;
	readonly storage: PromptsStorage;
	readonly type: PromptsType | 'mcpServer';
}

export interface ICustomizationMigrationRecoverySource {
	readonly source: string;
	readonly backup: string;
	readonly kind: 'file' | 'directory';
	readonly fingerprint: string;
	readonly storages: readonly PromptsStorage[];
	readonly types: readonly (PromptsType | 'mcpServer')[];
}

export interface ICustomizationMigrationRecoveryManifest {
	readonly version: 1;
	readonly migrationFlowId: string;
	readonly harnessId: string;
	readonly harnessLabel: string;
	readonly createdAt: string;
	readonly status: CustomizationMigrationRecoveryStatus;
	readonly sessionResource?: string;
	readonly restoredAt?: string;
	readonly sources: readonly ICustomizationMigrationRecoverySource[];
}

export interface ICustomizationMigrationRecoveryPlanEntry {
	readonly source: ICustomizationMigrationRecoverySource;
	readonly state: 'missing' | 'unchanged' | 'changed';
	readonly currentFingerprint?: string;
}

export interface ICustomizationMigrationRecoveryPlan {
	readonly manifestResource: URI;
	readonly manifest: ICustomizationMigrationRecoveryManifest;
	readonly entries: readonly ICustomizationMigrationRecoveryPlanEntry[];
}

export interface ICustomizationMigrationRecoveryListResult {
	readonly recoveries: readonly { readonly manifestResource: URI; readonly manifest: ICustomizationMigrationRecoveryManifest }[];
	readonly errors: readonly Error[];
}

export async function prepareCustomizationMigrationRecovery(
	fileService: IFileService,
	recoveryFolder: URI,
	migrationFlowId: string,
	harness: { readonly id: string; readonly label: string },
	inputs: readonly ICustomizationMigrationRecoverySourceInput[],
): Promise<{ readonly manifestResource: URI; readonly manifest: ICustomizationMigrationRecoveryManifest }> {
	const sources = coalesceRecoverySources(inputs);
	if (sources.length === 0) {
		throw new Error('Cannot prepare a customization migration recovery without sources.');
	}

	try {
		const backupsFolder = URI.joinPath(recoveryFolder, 'backups');
		await fileService.createFolder(backupsFolder);
		const recoverySources: ICustomizationMigrationRecoverySource[] = [];
		for (let index = 0; index < sources.length; index++) {
			const source = sources[index];
			const stat = await fileService.resolve(source.uri);
			if (stat.isSymbolicLink) {
				throw new Error(`Cannot back up symbolic link ${source.uri.toString()}.`);
			}
			if (!stat.isFile && !stat.isDirectory) {
				throw new Error(`Cannot back up unsupported customization resource ${source.uri.toString()}.`);
			}
			const backupName = String(index + 1).padStart(4, '0');
			const backup = URI.joinPath(backupsFolder, backupName);
			await fileService.copy(source.uri, backup, false);
			const fingerprint = await fingerprintResource(source.uri, fileService);
			const backupFingerprint = await fingerprintResource(backup, fileService);
			if (backupFingerprint !== fingerprint) {
				throw new Error(`Could not verify customization backup ${source.uri.toString()}.`);
			}
			recoverySources.push({
				source: source.uri.toString(),
				backup: `backups/${backupName}`,
				kind: stat.isDirectory ? 'directory' : 'file',
				fingerprint,
				storages: source.storages,
				types: source.types,
			});
		}

		const manifest: ICustomizationMigrationRecoveryManifest = {
			version: 1,
			migrationFlowId,
			harnessId: harness.id,
			harnessLabel: harness.label,
			createdAt: new Date().toISOString(),
			status: 'prepared',
			sources: recoverySources,
		};
		const manifestResource = URI.joinPath(recoveryFolder, CUSTOMIZATION_MIGRATION_RECOVERY_MANIFEST);
		await writeCustomizationMigrationRecoveryManifest(fileService, manifestResource, manifest);
		return { manifestResource, manifest };
	} catch (error) {
		if (await fileService.exists(recoveryFolder)) {
			await fileService.del(recoveryFolder, { recursive: true });
		}
		throw error;
	}
}

export async function updateCustomizationMigrationRecovery(
	fileService: IFileService,
	manifestResource: URI,
	update: Partial<Pick<ICustomizationMigrationRecoveryManifest, 'status'>> & { readonly sessionResource?: URI; readonly restoredAt?: string },
): Promise<ICustomizationMigrationRecoveryManifest> {
	const current = await readCustomizationMigrationRecoveryManifest(fileService, manifestResource);
	const manifest: ICustomizationMigrationRecoveryManifest = {
		...current,
		status: update.status ?? current.status,
		...(update.sessionResource ? { sessionResource: update.sessionResource.toString() } : {}),
		...(update.restoredAt ? { restoredAt: update.restoredAt } : {}),
	};
	await writeCustomizationMigrationRecoveryManifest(fileService, manifestResource, manifest);
	return manifest;
}

export async function listCustomizationMigrationRecoveries(fileService: IFileService, recoveryRoot: URI): Promise<ICustomizationMigrationRecoveryListResult> {
	if (!await fileService.exists(recoveryRoot)) {
		return { recoveries: [], errors: [] };
	}
	const root = await fileService.resolve(recoveryRoot);
	const recoveries: { manifestResource: URI; manifest: ICustomizationMigrationRecoveryManifest }[] = [];
	const errors: Error[] = [];
	for (const child of root.children ?? []) {
		if (!child.isDirectory) {
			continue;
		}
		const manifestResource = URI.joinPath(child.resource, CUSTOMIZATION_MIGRATION_RECOVERY_MANIFEST);
		if (!await fileService.exists(manifestResource)) {
			continue;
		}
		try {
			recoveries.push({
				manifestResource,
				manifest: await readCustomizationMigrationRecoveryManifest(fileService, manifestResource),
			});
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
	}
	recoveries.sort((a, b) => b.manifest.createdAt.localeCompare(a.manifest.createdAt));
	return { recoveries, errors };
}

export async function createCustomizationMigrationRecoveryPlan(fileService: IFileService, manifestResource: URI): Promise<ICustomizationMigrationRecoveryPlan> {
	const manifest = await readCustomizationMigrationRecoveryManifest(fileService, manifestResource);
	const entries = await Promise.all(manifest.sources.map(async source => {
		const sourceResource = URI.parse(source.source);
		if (!await fileService.exists(sourceResource)) {
			return { source, state: 'missing' as const };
		}
		const currentFingerprint = await fingerprintResource(sourceResource, fileService);
		return {
			source,
			state: currentFingerprint === source.fingerprint ? 'unchanged' as const : 'changed' as const,
			currentFingerprint,
		};
	}));
	return { manifestResource, manifest, entries };
}

export async function restoreCustomizationMigrationSources(
	fileService: IFileService,
	plan: ICustomizationMigrationRecoveryPlan,
	overwriteChanged: boolean,
): Promise<{ readonly restored: number; readonly unchanged: number }> {
	let restored = 0;
	let unchanged = 0;
	const recoveryFolder = dirname(plan.manifestResource);
	for (const entry of plan.entries) {
		if (entry.state === 'unchanged') {
			unchanged++;
			continue;
		}
		if (entry.state === 'changed' && !overwriteChanged) {
			throw new Error(`Cannot restore changed customization ${entry.source.source} without confirmation.`);
		}
		const source = URI.parse(entry.source.source);
		const backup = URI.joinPath(recoveryFolder, ...entry.source.backup.split('/'));
		if (await fingerprintResource(backup, fileService) !== entry.source.fingerprint) {
			throw new Error(`Customization backup no longer matches its manifest: ${entry.source.backup}.`);
		}
		const sourceExists = await fileService.exists(source);
		if (entry.state === 'missing' && sourceExists) {
			throw new Error(`Cannot safely restore ${source.toString()} because it was created after confirmation.`);
		}
		if (entry.state === 'changed') {
			if (!sourceExists || await fingerprintResource(source, fileService) !== entry.currentFingerprint) {
				throw new Error(`Cannot safely restore ${source.toString()} because it changed after confirmation.`);
			}
		}
		const restoreId = generateUuid();
		const staging = source.with({ path: `${source.path}.restore-${restoreId}` });
		const displacedSource = source.with({ path: `${source.path}.before-restore-${restoreId}` });
		let sourceDisplaced = false;
		let restoreVerified = false;
		try {
			await fileService.createFolder(dirname(source));
			await fileService.copy(backup, staging, false);
			if (await fingerprintResource(staging, fileService) !== entry.source.fingerprint) {
				throw new Error(`Could not verify staged customization restore ${source.toString()}.`);
			}
			if (entry.state === 'changed') {
				await fileService.move(source, displacedSource, false);
				sourceDisplaced = true;
				if (await fingerprintResource(displacedSource, fileService) !== entry.currentFingerprint) {
					throw new Error(`Cannot safely restore ${source.toString()} because it changed after confirmation.`);
				}
			}
			await fileService.move(staging, source, false);
			if (await fingerprintResource(source, fileService) !== entry.source.fingerprint) {
				throw new Error(`Could not verify restored customization ${source.toString()}.`);
			}
			restoreVerified = true;
		} catch (error) {
			if (sourceDisplaced && !await fileService.exists(source)) {
				await fileService.move(displacedSource, source, false);
				sourceDisplaced = false;
			}
			throw error;
		} finally {
			if (await fileService.exists(staging)) {
				await fileService.del(staging, { recursive: entry.source.kind === 'directory' });
			}
			if (restoreVerified && sourceDisplaced && await fileService.exists(displacedSource)) {
				await fileService.del(displacedSource, { recursive: true });
			}
		}
		restored++;
	}
	return { restored, unchanged };
}

export async function readCustomizationMigrationRecoveryManifest(fileService: IFileService, manifestResource: URI): Promise<ICustomizationMigrationRecoveryManifest> {
	const content = await fileService.readFile(manifestResource, { limits: { size: 1024 * 1024 } });
	const value: unknown = JSON.parse(content.value.toString());
	if (!isCustomizationMigrationRecoveryManifest(value)) {
		throw new Error(`Invalid customization migration recovery manifest ${manifestResource.toString()}.`);
	}
	return value;
}

async function writeCustomizationMigrationRecoveryManifest(fileService: IFileService, manifestResource: URI, manifest: ICustomizationMigrationRecoveryManifest): Promise<void> {
	const temporaryResource = manifestResource.with({ path: `${manifestResource.path}.tmp` });
	await fileService.writeFile(temporaryResource, VSBuffer.fromString(JSON.stringify(manifest, undefined, '\t')));
	await fileService.move(temporaryResource, manifestResource, true);
}

async function fingerprintResource(resource: URI, fileService: IFileService): Promise<string> {
	const parts: string[] = [];
	await collectFingerprintParts(resource, '', fileService, parts);
	return hashAsync(parts.join('\n'));
}

async function collectFingerprintParts(resource: URI, relativePath: string, fileService: IFileService, parts: string[]): Promise<void> {
	const stat = await fileService.resolve(resource);
	if (stat.isSymbolicLink) {
		throw new Error(`Cannot fingerprint symbolic link ${resource.toString()}.`);
	}
	if (stat.isFile) {
		const content = await fileService.readFile(resource);
		parts.push(`f:${relativePath}:${await hashAsync(content.value)}`);
		return;
	}
	if (!stat.isDirectory) {
		throw new Error(`Cannot fingerprint unsupported resource ${resource.toString()}.`);
	}
	parts.push(`d:${relativePath}`);
	const children = [...(stat.children ?? [])].sort((a, b) => a.name.localeCompare(b.name));
	for (const child of children) {
		await collectFingerprintParts(child.resource, relativePath ? `${relativePath}/${child.name}` : child.name, fileService, parts);
	}
}

function coalesceRecoverySources(inputs: readonly ICustomizationMigrationRecoverySourceInput[]): readonly {
	readonly uri: URI;
	readonly storages: readonly PromptsStorage[];
	readonly types: readonly (PromptsType | 'mcpServer')[];
}[] {
	const sources = new Map<string, { uri: URI; storages: Set<PromptsStorage>; types: Set<PromptsType | 'mcpServer'> }>();
	for (const input of inputs) {
		const key = getComparisonKey(input.uri);
		let source = sources.get(key);
		if (!source) {
			source = { uri: input.uri, storages: new Set(), types: new Set() };
			sources.set(key, source);
		}
		source.storages.add(input.storage);
		source.types.add(input.type);
	}
	return [...sources.values()].map(source => ({
		uri: source.uri,
		storages: [...source.storages],
		types: [...source.types],
	}));
}

function isCustomizationMigrationRecoveryManifest(value: unknown): value is ICustomizationMigrationRecoveryManifest {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<ICustomizationMigrationRecoveryManifest>;
	return candidate.version === 1
		&& typeof candidate.migrationFlowId === 'string'
		&& typeof candidate.harnessId === 'string'
		&& typeof candidate.harnessLabel === 'string'
		&& typeof candidate.createdAt === 'string'
		&& isRecoveryStatus(candidate.status)
		&& (candidate.sessionResource === undefined || typeof candidate.sessionResource === 'string')
		&& (candidate.restoredAt === undefined || typeof candidate.restoredAt === 'string')
		&& Array.isArray(candidate.sources)
		&& candidate.sources.length > 0
		&& candidate.sources.every(source => {
			if (!source || typeof source !== 'object') {
				return false;
			}
			const entry = source as Partial<ICustomizationMigrationRecoverySource>;
			return typeof entry.source === 'string'
				&& typeof entry.backup === 'string'
				&& /^backups\/\d{4}$/.test(entry.backup)
				&& (entry.kind === 'file' || entry.kind === 'directory')
				&& typeof entry.fingerprint === 'string'
				&& Array.isArray(entry.storages)
				&& entry.storages.every(storage => storage === PromptsStorage.local || storage === PromptsStorage.user)
				&& Array.isArray(entry.types)
				&& entry.types.every(type => type === 'mcpServer' || Object.values(PromptsType).includes(type));
		});
}

function isRecoveryStatus(value: unknown): value is CustomizationMigrationRecoveryStatus {
	return value === 'prepared' || value === 'running' || value === 'completed' || value === 'cancelled' || value === 'unknown';
}
