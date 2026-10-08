/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IAccountLink } from './accountLinks';

export const enterpriseUriSetting = 'github-enterprise.uri';

const tokenSuffix = '.ghes.auth';

export function getEnterpriseUriKey(uri: vscode.Uri): string {
	return uri.with({
		scheme: uri.scheme.toLowerCase(),
		path: uri.path.replace(/\/+$/, '')
	}).toString();
}

export function getEnterpriseStorageKey(uri: vscode.Uri): string {
	return `${getEnterpriseUriKey(uri)}${tokenSuffix}`;
}

//#region Legacy migration - TODO: delete in 1.144 (four releases after 1.140), including callers and migration tests.

const accountLinksSuffix = '.microsoftAccountLinks';

interface EnterpriseStorage {
	readonly key: string;
	readonly tokens: string | undefined;
	readonly links: readonly IAccountLink[] | undefined;
}

function getLegacyStorageUri(key: string, scheme: string): vscode.Uri | undefined {
	if (!key.endsWith(tokenSuffix) || key.includes('://')) {
		return undefined;
	}
	const value = key.slice(0, -tokenSuffix.length);
	const separator = value.indexOf('/');
	return vscode.Uri.from({
		scheme,
		authority: separator < 0 ? value : value.slice(0, separator),
		path: separator < 0 ? '' : value.slice(separator)
	});
}

async function readStorage(context: vscode.ExtensionContext, key: string): Promise<EnterpriseStorage> {
	return {
		key,
		tokens: await context.secrets.get(key),
		links: context.globalState.get<readonly IAccountLink[]>(`${key}${accountLinksSuffix}`)
	};
}

function selectLegacyStorage(sources: readonly EnterpriseStorage[], originalKey: string | undefined, uri: vscode.Uri): EnterpriseStorage | undefined {
	if (sources.length < 2) {
		return sources[0];
	}
	const source = sources.find(source => source.key === originalKey);
	if (!source) {
		throw new Error(vscode.l10n.t('Multiple saved authentication stores match {0}. Set {1} to the previously used URI before migrating its saved sign-in.', uri.toString(true), enterpriseUriSetting));
	}
	return source;
}

async function migrateStorage(context: vscode.ExtensionContext, sources: readonly EnterpriseStorage[], target: EnterpriseStorage, originalKey: string | undefined, uri: vscode.Uri): Promise<void> {
	const tokenSource = target.tokens === undefined ? selectLegacyStorage(sources.filter(source => source.tokens !== undefined), originalKey, uri) : undefined;
	const linkSource = target.links === undefined ? selectLegacyStorage(sources.filter(source => source.links !== undefined), originalKey, uri) : undefined;
	if (linkSource?.links !== undefined) {
		await context.globalState.update(`${target.key}${accountLinksSuffix}`, linkSource.links);
	}
	if (tokenSource?.tokens !== undefined && (await context.secrets.get(target.key)) === undefined) {
		await context.secrets.store(target.key, tokenSource.tokens);
	}
	// Keep legacy stores until both destination writes have succeeded.
	for (const source of sources) {
		if (source.tokens !== undefined && (target.tokens !== undefined || source === tokenSource)) {
			await context.secrets.delete(source.key);
		}
		if (source.links !== undefined && (target.links !== undefined || source === linkSource)) {
			await context.globalState.update(`${source.key}${accountLinksSuffix}`, undefined);
		}
	}
}

export async function migrateEnterpriseStorage(context: vscode.ExtensionContext, uri: vscode.Uri, configuredUris: readonly vscode.Uri[] = [uri], legacyUri?: vscode.Uri): Promise<void> {
	const hostKey = getEnterpriseUriKey(uri);
	const keys = new Set([
		...await context.secrets.keys(),
		...context.globalState.keys().filter(key => key.endsWith(accountLinksSuffix)).map(key => key.slice(0, -accountLinksSuffix.length))
	]);
	const sources: EnterpriseStorage[] = [];
	for (const key of keys) {
		const storedUri = getLegacyStorageUri(key, uri.scheme);
		if (storedUri && getEnterpriseUriKey(storedUri) === hostKey) {
			const source = await readStorage(context, key);
			if (source.tokens !== undefined || source.links !== undefined) {
				sources.push(source);
			}
		}
	}
	const target = await readStorage(context, getEnterpriseStorageKey(uri));
	if (!sources.length) {
		return;
	}
	const original = legacyUri ?? (configuredUris.length === 1 ? configuredUris[0] : undefined);
	const originalMatches = original && getEnterpriseUriKey(original.with({ scheme: uri.scheme })) === hostKey;
	if (originalMatches && getEnterpriseUriKey(original) !== hostKey) {
		return;
	}
	const matchingHosts = new Set(configuredUris
		.filter(candidate => getEnterpriseUriKey(candidate.with({ scheme: uri.scheme })) === hostKey)
		.map(getEnterpriseUriKey));
	if (!originalMatches && matchingHosts.size > 1) {
		const needsTokens = target.tokens === undefined && sources.some(source => source.tokens !== undefined);
		const needsLinks = target.links === undefined && sources.some(source => source.links !== undefined);
		if (!needsTokens && !needsLinks) {
			return;
		}
		throw new Error(vscode.l10n.t('Saved authentication for {0} does not identify its URL scheme. Set {1} to the original instance before migrating its saved sign-in.', uri.authority, enterpriseUriSetting));
	}
	const originalKey = originalMatches ? `${original.authority}${original.path}${tokenSuffix}` : undefined;
	await migrateStorage(context, sources, target, originalKey, uri);
}

//#endregion
