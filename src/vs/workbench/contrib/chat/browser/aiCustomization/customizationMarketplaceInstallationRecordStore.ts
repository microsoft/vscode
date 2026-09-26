/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { posix } from '../../../../../base/common/path.js';
import { dirname, isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SKILL_FILENAME } from '../../common/promptSyntax/config/promptFileLocations.js';

const installationRecordStoragePrefix = 'chat.customizations.marketplace.installationRecord.v1.';
const installationRecordSchemaVersion = 1;
const maxInstallationRecords = 1000;
const maxInstallationRecordStorageLength = 2 * 1024 * 1024;
const maxInstallationRecordStorageTotalLength = 32 * 1024 * 1024;
const maxStoredStringLength = 8192;
const maxStoredSkillFiles = 1000;
const maxStoredSkillPathCharacters = 1024 * 1024;

/** A durable association between one marketplace resource and its exact installed target. */
export interface ICustomizationMarketplaceInstallationRecord {
	readonly id: string;
	readonly sourceId: string;
	readonly identifier: string;
	readonly version?: string;
	readonly displayName: string;
	readonly description: string;
	readonly mediaType: string;
	readonly installation: CustomizationMarketplaceInstallation;
	readonly target: CustomizationMarketplaceInstallationRecordTarget;
}

export type CustomizationMarketplaceInstallationRecordTarget =
	| {
		readonly kind: 'skill';
		readonly uri: URI;
		readonly files: readonly string[];
		readonly resolvedRevision: string;
		readonly source: 'local' | 'user';
		readonly harness: string;
		readonly sourceFolder: URI;
		readonly destinationGroupId?: string;
		readonly project?: URI;
		readonly session?: URI;
	}
	| { readonly kind: 'plugin'; readonly uri: URI; readonly resolvedRevision?: string }
	| { readonly kind: 'mcp'; readonly id: string };

interface IStoredCustomizationMarketplaceInstallationRecord {
	readonly version: number;
	readonly record: {
		readonly id: string;
		readonly sourceId: string;
		readonly identifier: string;
		readonly version?: string;
		readonly displayName: string;
		readonly description: string;
		readonly mediaType: string;
		readonly installation: CustomizationMarketplaceInstallation;
		readonly target:
		| {
			readonly kind: 'skill';
			readonly uri: string;
			readonly files: readonly string[];
			readonly resolvedRevision: string;
			readonly source: 'local' | 'user';
			readonly harness: string;
			readonly sourceFolder: string;
			readonly destinationGroupId?: string;
			readonly project?: string;
			readonly session?: string;
		}
		| { readonly kind: 'plugin'; readonly uri: string; readonly resolvedRevision?: string }
		| { readonly kind: 'mcp'; readonly id: string };
	};
}

/** Persists bounded, independently writable installation records in machine-local profile storage. */
export class CustomizationMarketplaceInstallationRecordStore extends Disposable {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;
	private readonly _records = new Map<string, ICustomizationMarketplaceInstallationRecord>();

	get records(): ReadonlyMap<string, ICustomizationMarketplaceInstallationRecord> {
		return this._records;
	}

	constructor(
		private readonly storageService: IStorageService,
		private readonly logService: ILogService,
	) {
		super();
		this.reload();
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(event => {
			if (event.external && event.key.startsWith(installationRecordStoragePrefix)) {
				this.reload();
				this._onDidChange.fire();
			}
		}));
	}

	ensureCanAdd(): void {
		const keys = this.getStorageKeys();
		const storedLength = keys.reduce((total, key) => total + (this.storageService.get(key, StorageScope.PROFILE)?.length ?? 0), 0);
		if (keys.length >= maxInstallationRecords || storedLength + maxInstallationRecordStorageLength > maxInstallationRecordStorageTotalLength) {
			throw new Error(localize('customizationMarketplace.tooManyInstallationRecords', "Too many customization marketplace installations are recorded. Uninstall an existing marketplace customization before installing another."));
		}
	}

	upsert(record: ICustomizationMarketplaceInstallationRecord): void {
		const storageKey = this.getStorageKey(record.id);
		if (!this._records.has(record.id) && !this.storageService.get(storageKey, StorageScope.PROFILE)) {
			this.ensureCanAdd();
		}
		const stored = serializeInstallationRecord(record);
		const raw = JSON.stringify(stored);
		const storedLength = this.getStorageKeys().reduce((total, key) => key === storageKey ? total : total + (this.storageService.get(key, StorageScope.PROFILE)?.length ?? 0), raw.length);
		if (raw.length > maxInstallationRecordStorageLength || storedLength > maxInstallationRecordStorageTotalLength) {
			throw new Error(localize('customizationMarketplace.installationRecordTooLarge', "The customization installation contains too much metadata to record safely."));
		}
		this.storageService.store(storageKey, raw, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._records.set(record.id, record);
	}

	delete(record: ICustomizationMarketplaceInstallationRecord): void {
		this.storageService.remove(this.getStorageKey(record.id), StorageScope.PROFILE);
		this._records.delete(record.id);
	}

	private reload(): void {
		const keys = this.getStorageKeys();
		if (keys.length > maxInstallationRecords) {
			this.logService.error(`[CustomizationMarketplace] Ignoring ${keys.length - maxInstallationRecords} installation records beyond the supported limit.`);
		}
		const records = new Map<string, ICustomizationMarketplaceInstallationRecord>();
		let storedLength = 0;
		for (const key of keys.slice(0, maxInstallationRecords)) {
			const raw = this.storageService.get(key, StorageScope.PROFILE);
			storedLength += raw?.length ?? 0;
			if (!raw || raw.length > maxInstallationRecordStorageLength || storedLength > maxInstallationRecordStorageTotalLength) {
				this.logService.error(`[CustomizationMarketplace] Ignoring invalid installation record '${key}'.`);
				continue;
			}
			try {
				const stored: unknown = JSON.parse(raw);
				const record = reviveInstallationRecord(stored);
				if (!record || this.getStorageKey(record.id) !== key) {
					throw new Error('Invalid installation record');
				}
				records.set(record.id, record);
			} catch (error) {
				this.logService.error(`[CustomizationMarketplace] Unable to load installation record '${key}'`, error);
			}
		}
		this._records.clear();
		for (const [id, record] of records) {
			this._records.set(id, record);
		}
	}

	private getStorageKeys(): string[] {
		return this.storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE)
			.filter(key => key.startsWith(installationRecordStoragePrefix))
			.sort();
	}

	private getStorageKey(id: string): string {
		return `${installationRecordStoragePrefix}${id}`;
	}
}

export function getInstallationRecordResourceKey(record: ICustomizationMarketplaceInstallationRecord): string {
	return getCustomizationMarketplaceResourceKey(record);
}

export function toRecordedMarketplaceResource(record: ICustomizationMarketplaceInstallationRecord): ICustomizationMarketplaceResource {
	return {
		sourceId: record.sourceId,
		identifier: record.identifier,
		version: record.version,
		displayName: record.displayName,
		description: record.description,
		mediaType: record.mediaType,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		installation: record.installation,
	};
}

function reviveInstallationRecord(value: unknown): ICustomizationMarketplaceInstallationRecord | undefined {
	if (!isStoredInstallationRecord(value)) {
		return undefined;
	}
	try {
		const record = value.record;
		let target: CustomizationMarketplaceInstallationRecordTarget;
		if (record.target.kind === 'mcp') {
			target = { kind: 'mcp', id: record.target.id };
		} else if (record.target.kind === 'plugin') {
			target = { kind: 'plugin', uri: URI.parse(record.target.uri), resolvedRevision: record.target.resolvedRevision };
		} else {
			const uri = URI.parse(record.target.uri);
			const root = dirname(uri);
			const sourceFolder = URI.parse(record.target.sourceFolder);
			if (posix.basename(uri.path) !== SKILL_FILENAME || !root.path || root.path === '/' || !isEqualOrParent(root, sourceFolder)) {
				return undefined;
			}
			target = {
				kind: 'skill',
				uri,
				files: record.target.files,
				resolvedRevision: record.target.resolvedRevision,
				source: record.target.source,
				harness: record.target.harness,
				sourceFolder,
				destinationGroupId: record.target.destinationGroupId,
				project: record.target.project ? URI.parse(record.target.project) : undefined,
				session: record.target.session ? URI.parse(record.target.session) : undefined,
			};
		}
		return {
			id: record.id,
			sourceId: record.sourceId,
			identifier: record.identifier,
			version: record.version,
			displayName: record.displayName,
			description: record.description,
			mediaType: record.mediaType,
			installation: record.installation,
			target,
		};
	} catch {
		return undefined;
	}
}

function serializeInstallationRecord(record: ICustomizationMarketplaceInstallationRecord): IStoredCustomizationMarketplaceInstallationRecord {
	const target: IStoredCustomizationMarketplaceInstallationRecord['record']['target'] = record.target.kind === 'mcp'
		? { kind: 'mcp', id: record.target.id }
		: record.target.kind === 'plugin'
			? { kind: 'plugin', uri: record.target.uri.toString(), resolvedRevision: record.target.resolvedRevision }
			: {
				kind: 'skill',
				uri: record.target.uri.toString(),
				files: record.target.files,
				resolvedRevision: record.target.resolvedRevision,
				source: record.target.source,
				harness: record.target.harness,
				sourceFolder: record.target.sourceFolder.toString(),
				destinationGroupId: record.target.destinationGroupId,
				project: record.target.project?.toString(),
				session: record.target.session?.toString(),
			};
	return {
		version: installationRecordSchemaVersion,
		record: {
			id: record.id,
			sourceId: record.sourceId,
			identifier: record.identifier,
			version: record.version,
			displayName: record.displayName,
			description: record.description,
			mediaType: record.mediaType,
			installation: record.installation,
			target,
		},
	};
}

function isStoredInstallationRecord(value: unknown): value is IStoredCustomizationMarketplaceInstallationRecord {
	if (!isRecord(value) || value.version !== installationRecordSchemaVersion || !isRecord(value.record)) {
		return false;
	}
	const record = value.record;
	if (!isBoundedString(record.id, 64, 64) || !/^[0-9a-f]{64}$/i.test(record.id)
		|| !isBoundedString(record.sourceId)
		|| !isBoundedString(record.identifier)
		|| record.version !== undefined && !isBoundedString(record.version)
		|| !isBoundedString(record.displayName)
		|| typeof record.description !== 'string' || record.description.length > maxStoredStringLength
		|| !isBoundedString(record.mediaType)
		|| !isStoredInstallation(record.installation)
		|| !isRecord(record.target)
		|| record.target.kind !== (record.installation.kind === 'configuredPlugin' ? 'plugin' : record.installation.kind)) {
		return false;
	}
	if (record.target.kind === 'mcp') {
		return record.mediaType === CustomizationMarketplaceMediaType.McpServer && isBoundedString(record.target.id);
	}
	if (record.target.kind === 'plugin') {
		return (record.mediaType === CustomizationMarketplaceMediaType.CopilotPlugin || record.mediaType === CustomizationMarketplaceMediaType.ClaudePlugin)
			&& isBoundedString(record.target.uri)
			&& (record.installation.kind === 'configuredPlugin'
				? record.target.resolvedRevision === undefined
				: isBoundedString(record.target.resolvedRevision, 40, 40) && /^[0-9a-f]{40}$/i.test(record.target.resolvedRevision));
	}
	if (record.mediaType !== CustomizationMarketplaceMediaType.Skill) {
		return false;
	}
	if (record.target.kind !== 'skill'
		|| !isBoundedString(record.target.uri)
		|| !Array.isArray(record.target.files)
		|| record.target.files.length === 0
		|| record.target.files.length > maxStoredSkillFiles
		|| !record.target.files.includes(SKILL_FILENAME)
		|| new Set(record.target.files).size !== record.target.files.length
		|| record.target.files.reduce((total, file) => total + (typeof file === 'string' ? file.length : 0), 0) > maxStoredSkillPathCharacters
		|| !record.target.files.every(isSafeStoredRelativePath)
		|| !isBoundedString(record.target.resolvedRevision, 40, 40) || !/^[0-9a-f]{40}$/i.test(record.target.resolvedRevision)
		|| (record.target.source !== 'local' && record.target.source !== 'user')
		|| !isBoundedString(record.target.harness)
		|| !isBoundedString(record.target.sourceFolder)
		|| record.target.destinationGroupId !== undefined && !isBoundedString(record.target.destinationGroupId)
		|| record.target.project !== undefined && !isBoundedString(record.target.project)
		|| record.target.session !== undefined && !isBoundedString(record.target.session)) {
		return false;
	}
	return true;
}

function isStoredInstallation(value: unknown): value is CustomizationMarketplaceInstallation {
	if (!isRecord(value) || typeof value.kind !== 'string') {
		return false;
	}
	if (value.kind === 'mcp') {
		return isBoundedString(value.name) && isBoundedString(value.version);
	}
	if (value.kind === 'configuredPlugin') {
		return Object.keys(value).length === 1;
	}
	return (value.kind === 'skill' || value.kind === 'plugin')
		&& isBoundedString(value.repository)
		&& isBoundedString(value.ref)
		&& typeof value.path === 'string'
		&& value.path.length <= maxStoredStringLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, minimumLength = 1, maximumLength = maxStoredStringLength): value is string {
	return typeof value === 'string' && value.length >= minimumLength && value.length <= maximumLength;
}

function isSafeStoredRelativePath(value: unknown): value is string {
	return typeof value === 'string'
		&& value.length > 0
		&& value.length <= maxStoredStringLength
		&& !value.startsWith('/')
		&& !value.includes('\u0000')
		&& value.split('/').every(segment => !!segment && segment !== '.' && segment !== '..' && segment.toLowerCase() !== '.git');
}
