/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { enterpriseUriSetting, enterpriseUrisSetting, getEnterpriseUriKey } from './enterpriseConfiguration';

export interface EnterpriseHostConfiguration {
	readonly key: string;
	readonly uri: vscode.Uri;
	readonly storageCandidates: readonly string[];
	readonly legacyStorageKey: string | undefined;
}

export interface EnterpriseHostDescriptor {
	readonly key: string;
	readonly uri: vscode.Uri;
	readonly storageKey: string;
}

export interface EnterpriseHostPlan {
	readonly hosts: readonly EnterpriseHostDescriptor[];
	readonly added: readonly EnterpriseHostDescriptor[];
	readonly removed: readonly EnterpriseHostDescriptor[];
	readonly storageKeys: Readonly<Record<string, string>>;
	readonly storageChanged: boolean;
}

function legacyStorageKey(uri: vscode.Uri): string {
	return `${uri.authority}${uri.path}.ghes.auth`;
}

export function getEnterpriseHostConfigurations(uris: readonly vscode.Uri[], legacyUri?: vscode.Uri): readonly EnterpriseHostConfiguration[] {
	const aliases = new Map<string, Set<string>>();
	for (const uri of uris) {
		const key = getEnterpriseUriKey(uri);
		const candidates = aliases.get(key) ?? new Set<string>();
		candidates.add(legacyStorageKey(uri));
		aliases.set(key, candidates);
	}
	const legacyKey = legacyUri && getEnterpriseUriKey(legacyUri);
	return [...aliases.keys()].sort().map(key => ({
		key,
		uri: vscode.Uri.parse(key),
		storageCandidates: [...aliases.get(key)!].sort(),
		legacyStorageKey: legacyUri && key === legacyKey ? legacyStorageKey(legacyUri) : undefined
	}));
}

export function getEnterpriseStorageCandidates(host: EnterpriseHostConfiguration, mappedKey: string | undefined): readonly string[] {
	return [...new Set([mappedKey, host.legacyStorageKey, ...host.storageCandidates].filter((key): key is string => key !== undefined))];
}

function selectPopulatedStorage(host: EnterpriseHostConfiguration, candidates: readonly string[], populated: ReadonlySet<string>): string | undefined {
	const occupied = candidates.filter(key => populated.has(key));
	if (occupied.length < 2) {
		return occupied[0];
	}
	if (host.legacyStorageKey && occupied.includes(host.legacyStorageKey)) {
		return host.legacyStorageKey;
	}
	throw new Error(vscode.l10n.t('Multiple saved authentication stores match {0}. Keep the original URI spelling in {1}, or set {2} to the previously used URI.', host.uri.toString(true), enterpriseUrisSetting, enterpriseUriSetting));
}

function resolveStorageKey(
	host: EnterpriseHostConfiguration,
	mappings: Readonly<Record<string, string>>,
	populated: ReadonlySet<string>,
	claims: ReadonlyMap<string, string>,
	owners: ReadonlyMap<string, ReadonlySet<string>>
): string {
	const mapped = mappings[host.key];
	if (mapped && populated.has(mapped)) {
		return mapped;
	}
	const available = getEnterpriseStorageCandidates(host, mapped).filter(key =>
		(!claims.has(key) || claims.get(key) === host.key)
		&& (key === mapped || key === host.legacyStorageKey || owners.get(key)?.size === 1));
	return selectPopulatedStorage(host, available, populated) ?? available[0] ?? `${encodeURIComponent(host.key)}.ghes.auth`;
}

export function planEnterpriseHosts(
	configured: readonly EnterpriseHostConfiguration[],
	current: readonly EnterpriseHostDescriptor[],
	mappings: Readonly<Record<string, string>>,
	populated: ReadonlySet<string>
): EnterpriseHostPlan {
	const claims = new Map(Object.entries(mappings).map(([host, storage]) => [storage, host]));
	const owners = new Map<string, Set<string>>();
	for (const host of configured) {
		for (const storage of getEnterpriseStorageCandidates(host, mappings[host.key])) {
			const hosts = owners.get(storage) ?? new Set<string>();
			hosts.add(host.key);
			owners.set(storage, hosts);
		}
	}
	const hosts = configured.map(host => ({ key: host.key, uri: host.uri, storageKey: resolveStorageKey(host, mappings, populated, claims, owners) }));
	const before = new Map(current.map(host => [host.key, host.storageKey]));
	const after = new Map(hosts.map(host => [host.key, host.storageKey]));
	return {
		hosts,
		added: hosts.filter(host => before.get(host.key) !== host.storageKey),
		removed: current.filter(host => after.get(host.key) !== host.storageKey),
		storageKeys: { ...mappings, ...Object.fromEntries(after) },
		storageChanged: hosts.some(host => mappings[host.key] !== host.storageKey)
	};
}
