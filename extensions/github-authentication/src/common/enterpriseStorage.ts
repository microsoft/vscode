/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IAccountLink } from './accountLinks';
import { enterpriseUriSetting, getEnterpriseUriKey } from './enterpriseConfiguration';

const tokenSuffix = '.ghes.auth';
const accountLinksSuffix = '.microsoftAccountLinks';

interface EnterpriseStorage {
	readonly key: string;
	readonly tokens: string | undefined;
	readonly links: readonly IAccountLink[] | undefined;
}

export function getEnterpriseStorageKey(uri: vscode.Uri): string {
	return `${getEnterpriseUriKey(uri)}${tokenSuffix}`;
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

async function migrateStorage(context: vscode.ExtensionContext, source: EnterpriseStorage, target: EnterpriseStorage): Promise<void> {
	if (source.links !== undefined && target.links === undefined) {
		await context.globalState.update(`${target.key}${accountLinksSuffix}`, source.links);
	}
	if (source.tokens !== undefined && target.tokens === undefined) {
		await context.secrets.store(target.key, source.tokens);
	}
	// Keep both legacy stores until both destination writes have succeeded.
	if (source.tokens !== undefined) {
		await context.secrets.delete(source.key);
	}
	if (source.links !== undefined) {
		await context.globalState.update(`${source.key}${accountLinksSuffix}`, undefined);
	}
}

export async function migrateEnterpriseStorage(context: vscode.ExtensionContext, uri: vscode.Uri): Promise<void> {
	const target = await readStorage(context, getEnterpriseStorageKey(uri));
	const keys = new Set([
		...await context.secrets.keys(),
		...context.globalState.keys().filter(key => key.endsWith(accountLinksSuffix)).map(key => key.slice(0, -accountLinksSuffix.length))
	]);
	const sources: EnterpriseStorage[] = [];
	for (const key of keys) {
		const legacyUri = getLegacyStorageUri(key, uri.scheme);
		if (legacyUri && getEnterpriseUriKey(legacyUri) === getEnterpriseUriKey(uri)) {
			const source = await readStorage(context, key);
			if (source.tokens !== undefined || source.links !== undefined) {
				sources.push(source);
			}
		}
	}
	if (!sources.length) {
		return;
	}
	const originalKey = `${uri.authority}${uri.path}${tokenSuffix}`;
	const source = sources.find(source => source.key === originalKey) ?? (sources.length === 1 ? sources[0] : undefined);
	if (!source) {
		throw new Error(vscode.l10n.t('Multiple saved authentication stores match {0}. Set {1} to the previously used URI before migrating its saved sign-in.', uri.toString(true), enterpriseUriSetting));
	}
	await migrateStorage(context, source, target);
}
