/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { posix } from '../../../../../base/common/path.js';
import { dirname, isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { CustomizationMarketplaceIcon, CustomizationMarketplaceInstallation, CustomizationMarketplaceMediaType, getCustomizationMarketplaceResourceKey, ICustomizationMarketplaceResource } from '../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SKILL_FILENAME } from '../../common/promptSyntax/config/promptFileLocations.js';

// The slot namespace stays stable while record values version independently.
const installationRecordStoragePrefix = 'chat.customizations.marketplace.installationRecord.v1.';
const installationRecordSchemaVersion = 2;
const agenticResourceInstallationRecordSchemaVersion = 1;

type RecordedCustomizationMarketplaceInstallation = CustomizationMarketplaceInstallation;

/** Catalogue identity retained by the portable SDK-compatible installation record. */
export interface IInstallationRecordCatalogueIdentity {
	readonly resourceId: string;
	readonly itemUrl?: string;
	readonly displayName: string;
	readonly description: string;
	readonly publisher?: string;
	readonly version?: string;
	readonly source: string;
}

/** Portable installation identity and catalogue provenance. This is not ownership proof. */
export interface IInstallationRecord {
	readonly schemaVersion: 1;
	readonly installationId: string;
	readonly operationId?: string;
	readonly mediaType: string;
	readonly catalogue: IInstallationRecordCatalogueIdentity;
	readonly installedAt?: string;
}

/** A durable association between one marketplace resource and its exact local or account-scoped target. */
export interface ICustomizationMarketplaceInstallationRecord extends IInstallationRecord {
	readonly installation: RecordedCustomizationMarketplaceInstallation;
	readonly icon?: CustomizationMarketplaceIcon;
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
	| { readonly kind: 'mcp'; readonly id: string }
	| {
		readonly kind: 'copilotConnector';
		readonly name: string;
		readonly providerId: string;
		readonly accountName: string;
		readonly enterprise: boolean;
	};

type StoredCustomizationMarketplaceInstallationRecordTarget =
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
	| { readonly kind: 'mcp'; readonly id: string }
	| {
		readonly kind: 'copilotConnector';
		readonly name: string;
		readonly providerId: string;
		readonly accountName: string;
		readonly enterprise: boolean;
	};

interface IStoredCustomizationMarketplaceInstallationRecordV1 {
	readonly version: 1;
	readonly record: {
		readonly id: string;
		readonly sourceId: string;
		readonly identifier: string;
		readonly version?: string;
		readonly displayName: string;
		readonly description: string;
		readonly mediaType: string;
		readonly installation: RecordedCustomizationMarketplaceInstallation;
		readonly icon?: unknown;
		readonly iconDark?: unknown;
		readonly target: StoredCustomizationMarketplaceInstallationRecordTarget;
	};
}

interface IStoredCustomizationMarketplaceInstallationRecordV2 {
	readonly version: 2;
	readonly record: {
		readonly schemaVersion: 1;
		readonly installationId: string;
		readonly operationId?: string;
		readonly mediaType: string;
		readonly catalogue: IInstallationRecordCatalogueIdentity;
		readonly installedAt?: string;
		readonly installation: RecordedCustomizationMarketplaceInstallation;
		readonly icon?: unknown;
		readonly iconDark?: unknown;
		readonly target: StoredCustomizationMarketplaceInstallationRecordTarget;
	};
}

/** Persists independently writable installation records in machine-local profile storage. */
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

	upsert(record: ICustomizationMarketplaceInstallationRecord): void {
		const storageKey = this.getStorageKey(record.installationId);
		const raw = JSON.stringify(serializeInstallationRecord(record));
		this.storageService.store(storageKey, raw, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._records.set(record.installationId, record);
	}

	delete(record: ICustomizationMarketplaceInstallationRecord): void {
		this.storageService.remove(this.getStorageKey(record.installationId), StorageScope.PROFILE);
		this._records.delete(record.installationId);
	}

	private reload(): void {
		const records = new Map<string, ICustomizationMarketplaceInstallationRecord>();
		for (const key of this.getStorageKeys()) {
			const raw = this.storageService.get(key, StorageScope.PROFILE);
			if (!raw) {
				this.logService.error(`[CustomizationMarketplace] Ignoring invalid installation record '${key}'.`);
				continue;
			}
			try {
				const stored: unknown = JSON.parse(raw);
				const revived = reviveInstallationRecord(stored);
				if (!revived || this.getStorageKey(revived.record.installationId) !== key) {
					throw new Error('Invalid installation record');
				}
				if (revived.sanitizedIconFields.length > 0) {
					this.logService.warn(`[CustomizationMarketplace] Sanitized invalid icon metadata fields [${revived.sanitizedIconFields.join(', ')}] for installation record '${key}'.`);
				}
				records.set(revived.record.installationId, revived.record);
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
	return getCustomizationMarketplaceResourceKey({
		sourceId: record.catalogue.source,
		identifier: record.catalogue.resourceId,
		version: record.catalogue.version,
	});
}

export function toRecordedMarketplaceResource(record: ICustomizationMarketplaceInstallationRecord): ICustomizationMarketplaceResource {
	return {
		sourceId: record.catalogue.source,
		identifier: record.catalogue.resourceId,
		version: record.catalogue.version,
		displayName: record.catalogue.displayName,
		description: record.catalogue.description,
		publisher: record.catalogue.publisher,
		mediaType: record.mediaType,
		tags: [],
		capabilities: [],
		representativeQueries: [],
		installation: record.installation,
		icon: record.icon,
	};
}

interface IRevivedCustomizationMarketplaceInstallationRecord {
	readonly record: ICustomizationMarketplaceInstallationRecord;
	readonly sanitizedIconFields: readonly ('icon' | 'iconDark')[];
}

function reviveInstallationRecord(value: unknown): IRevivedCustomizationMarketplaceInstallationRecord | undefined {
	let portableRecord: IInstallationRecord;
	let storedRecord: IStoredCustomizationMarketplaceInstallationRecordV1['record'] | IStoredCustomizationMarketplaceInstallationRecordV2['record'];
	if (isStoredInstallationRecordV2(value)) {
		storedRecord = value.record;
		portableRecord = {
			schemaVersion: value.record.schemaVersion,
			installationId: value.record.installationId,
			operationId: value.record.operationId,
			mediaType: value.record.mediaType,
			catalogue: value.record.catalogue,
			installedAt: value.record.installedAt,
		};
	} else if (isStoredInstallationRecordV1(value)) {
		storedRecord = value.record;
		portableRecord = {
			schemaVersion: agenticResourceInstallationRecordSchemaVersion,
			installationId: value.record.id,
			mediaType: value.record.mediaType,
			catalogue: {
				resourceId: value.record.identifier,
				displayName: value.record.displayName,
				description: value.record.description,
				version: value.record.version,
				source: value.record.sourceId,
			},
		};
	} else {
		return undefined;
	}
	try {
		const sanitizedIcon = sanitizeStoredIcon(storedRecord.icon, storedRecord.iconDark);
		let target: CustomizationMarketplaceInstallationRecordTarget;
		if (storedRecord.target.kind === 'mcp') {
			target = { kind: 'mcp', id: storedRecord.target.id };
		} else if (storedRecord.target.kind === 'copilotConnector') {
			target = {
				kind: 'copilotConnector',
				name: storedRecord.target.name,
				providerId: storedRecord.target.providerId,
				accountName: storedRecord.target.accountName,
				enterprise: storedRecord.target.enterprise,
			};
		} else if (storedRecord.target.kind === 'plugin') {
			target = { kind: 'plugin', uri: URI.parse(storedRecord.target.uri), resolvedRevision: storedRecord.target.resolvedRevision };
		} else {
			const uri = URI.parse(storedRecord.target.uri);
			const root = dirname(uri);
			const sourceFolder = URI.parse(storedRecord.target.sourceFolder);
			if (posix.basename(uri.path) !== SKILL_FILENAME || !root.path || root.path === '/' || !isEqualOrParent(root, sourceFolder)) {
				return undefined;
			}
			target = {
				kind: 'skill',
				uri,
				files: storedRecord.target.files,
				resolvedRevision: storedRecord.target.resolvedRevision,
				source: storedRecord.target.source,
				harness: storedRecord.target.harness,
				sourceFolder,
				destinationGroupId: storedRecord.target.destinationGroupId,
				project: storedRecord.target.project ? URI.parse(storedRecord.target.project) : undefined,
				session: storedRecord.target.session ? URI.parse(storedRecord.target.session) : undefined,
			};
		}
		return {
			record: {
				...portableRecord,
				installation: storedRecord.installation,
				icon: sanitizedIcon.icon,
				target,
			},
			sanitizedIconFields: sanitizedIcon.sanitizedFields,
		};
	} catch {
		return undefined;
	}
}

function serializeInstallationRecord(record: ICustomizationMarketplaceInstallationRecord): IStoredCustomizationMarketplaceInstallationRecordV2 {
	const target: StoredCustomizationMarketplaceInstallationRecordTarget = record.target.kind === 'mcp'
		? { kind: 'mcp', id: record.target.id }
		: record.target.kind === 'copilotConnector'
			? {
				kind: 'copilotConnector',
				name: record.target.name,
				providerId: record.target.providerId,
				accountName: record.target.accountName,
				enterprise: record.target.enterprise,
			}
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
			schemaVersion: record.schemaVersion,
			installationId: record.installationId,
			operationId: record.operationId,
			mediaType: record.mediaType,
			catalogue: record.catalogue,
			installedAt: record.installedAt,
			installation: record.installation,
			...serializeStoredIcon(record.icon),
			target,
		},
	};
}

function isStoredInstallationRecordV1(value: unknown): value is IStoredCustomizationMarketplaceInstallationRecordV1 {
	if (!isRecord(value) || value.version !== 1 || !isRecord(value.record)) {
		return false;
	}
	const record = value.record;
	if (!isExactLengthString(record.id, 64) || !/^[0-9a-f]{64}$/i.test(record.id)
		|| !isNonEmptyString(record.sourceId)
		|| !isNonEmptyString(record.identifier)
		|| record.version !== undefined && !isNonEmptyString(record.version)
		|| !isNonEmptyString(record.displayName)
		|| typeof record.description !== 'string') {
		return false;
	}
	return isStoredInstallationPayload(record);
}

function isStoredInstallationRecordV2(value: unknown): value is IStoredCustomizationMarketplaceInstallationRecordV2 {
	if (!isRecord(value) || value.version !== installationRecordSchemaVersion || !isRecord(value.record)) {
		return false;
	}
	const record = value.record;
	if (record.schemaVersion !== agenticResourceInstallationRecordSchemaVersion
		|| !isExactLengthString(record.installationId, 64) || !/^[0-9a-f]{64}$/i.test(record.installationId)
		|| record.operationId !== undefined && (!isExactLengthString(record.operationId, 32) || !/^[0-9a-f]{32}$/i.test(record.operationId))
		|| record.installedAt !== undefined && !isIsoDateString(record.installedAt)
		|| !isRecord(record.catalogue)
		|| !isNonEmptyString(record.catalogue.resourceId)
		|| record.catalogue.itemUrl !== undefined && !isNonEmptyString(record.catalogue.itemUrl)
		|| !isNonEmptyString(record.catalogue.displayName)
		|| typeof record.catalogue.description !== 'string'
		|| record.catalogue.publisher !== undefined && !isNonEmptyString(record.catalogue.publisher)
		|| record.catalogue.version !== undefined && !isNonEmptyString(record.catalogue.version)
		|| !isNonEmptyString(record.catalogue.source)) {
		return false;
	}
	return isStoredInstallationPayload(record);
}

function isStoredInstallationPayload(record: Record<string, unknown>): boolean {
	const installation = record.installation;
	const target = record.target;
	const mediaType = record.mediaType;
	if (!isNonEmptyString(mediaType)
		|| !isStoredInstallation(installation)
		|| !isRecord(target)
		|| !isStoredTargetKind(target.kind, installation.kind)) {
		return false;
	}
	if (target.kind === 'mcp') {
		return mediaType === CustomizationMarketplaceMediaType.McpServer && isNonEmptyString(target.id);
	}
	if (target.kind === 'copilotConnector') {
		return mediaType === CustomizationMarketplaceMediaType.McpServer
			&& isNonEmptyString(target.name)
			&& installation.kind === 'copilotConnector'
			&& installation.name === target.name
			&& isNonEmptyString(target.providerId)
			&& isNonEmptyString(target.accountName)
			&& typeof target.enterprise === 'boolean';
	}
	if (target.kind === 'plugin') {
		return (mediaType === CustomizationMarketplaceMediaType.CopilotPlugin || mediaType === CustomizationMarketplaceMediaType.ClaudePlugin)
			&& isNonEmptyString(target.uri)
			&& (installation.kind === 'configuredPlugin'
				? target.resolvedRevision === undefined
				: isExactLengthString(target.resolvedRevision, 40) && /^[0-9a-f]{40}$/i.test(target.resolvedRevision));
	}
	if (mediaType !== CustomizationMarketplaceMediaType.Skill) {
		return false;
	}
	if (target.kind !== 'skill'
		|| !isNonEmptyString(target.uri)
		|| !Array.isArray(target.files)
		|| target.files.length === 0
		|| !target.files.includes(SKILL_FILENAME)
		|| new Set(target.files).size !== target.files.length
		|| !target.files.every(isSafeStoredRelativePath)
		|| !isExactLengthString(target.resolvedRevision, 40) || !/^[0-9a-f]{40}$/i.test(target.resolvedRevision)
		|| (target.source !== 'local' && target.source !== 'user')
		|| !isNonEmptyString(target.harness)
		|| !isNonEmptyString(target.sourceFolder)
		|| target.destinationGroupId !== undefined && !isNonEmptyString(target.destinationGroupId)
		|| target.project !== undefined && !isNonEmptyString(target.project)
		|| target.session !== undefined && !isNonEmptyString(target.session)) {
		return false;
	}
	return true;
}

function isStoredInstallation(value: unknown): value is RecordedCustomizationMarketplaceInstallation {
	if (!isRecord(value) || typeof value.kind !== 'string') {
		return false;
	}
	if (value.kind === 'mcp') {
		return isNonEmptyString(value.name) && isNonEmptyString(value.version);
	}
	if (value.kind === 'mcpGallery') {
		return isNonEmptyString(value.name)
			&& (value.registry === 'custom' || value.registry === 'default')
			&& isNonEmptyString(value.registryUrl);
	}
	if (value.kind === 'copilotConnector') {
		return isNonEmptyString(value.name);
	}
	if (value.kind === 'configuredPlugin') {
		return Object.keys(value).length === 1;
	}
	return (value.kind === 'skill' || value.kind === 'plugin')
		&& isNonEmptyString(value.repository)
		&& isNonEmptyString(value.ref)
		&& typeof value.path === 'string';
}

function isStoredTargetKind(targetKind: unknown, installationKind: RecordedCustomizationMarketplaceInstallation['kind']): boolean {
	return targetKind === installationKind
		|| targetKind === 'mcp' && installationKind === 'mcpGallery'
		|| targetKind === 'plugin' && installationKind === 'configuredPlugin';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isExactLengthString(value: unknown, length: number): value is string {
	return typeof value === 'string' && value.length === length;
}

function isIsoDateString(value: unknown): value is string {
	if (typeof value !== 'string') {
		return false;
	}
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isSafeStoredRelativePath(value: unknown): value is string {
	return typeof value === 'string'
		&& value.length > 0
		&& !value.startsWith('/')
		&& !value.includes('\u0000')
		&& value.split('/').every(segment => !!segment && segment !== '.' && segment !== '..' && segment.toLowerCase() !== '.git');
}

function isSafeStoredIcon(value: unknown): value is string {
	if (!isNonEmptyString(value)) {
		return false;
	}
	try {
		const url = new URL(value);
		return (url.protocol === `${Schemas.http}:` || url.protocol === `${Schemas.https}:`)
			&& !url.username
			&& !url.password;
	} catch {
		return false;
	}
}

function sanitizeStoredIcon(light: unknown, dark: unknown): {
	readonly icon: CustomizationMarketplaceIcon | undefined;
	readonly sanitizedFields: readonly ('icon' | 'iconDark')[];
} {
	const sanitizedFields: ('icon' | 'iconDark')[] = [];
	const lightUri = isSafeStoredIcon(light) ? URI.parse(light) : undefined;
	const darkUri = isSafeStoredIcon(dark) ? URI.parse(dark) : undefined;
	if (light !== undefined && !lightUri) {
		sanitizedFields.push('icon');
	}
	if (dark !== undefined && !darkUri) {
		sanitizedFields.push('iconDark');
	}
	if (lightUri && darkUri) {
		return { icon: { light: lightUri, dark: darkUri }, sanitizedFields };
	}
	if (lightUri) {
		return { icon: lightUri, sanitizedFields };
	}
	if (darkUri) {
		if (light === undefined) {
			sanitizedFields.push('iconDark');
		}
		return { icon: darkUri, sanitizedFields };
	}
	return { icon: undefined, sanitizedFields };
}

function serializeStoredIcon(icon: CustomizationMarketplaceIcon | undefined): Pick<IStoredCustomizationMarketplaceInstallationRecordV2['record'], 'icon' | 'iconDark'> {
	if (!icon) {
		return {};
	}
	return URI.isUri(icon)
		? { icon: icon.toString(true) }
		: { icon: icon.light.toString(true), iconDark: icon.dark.toString(true) };
}
