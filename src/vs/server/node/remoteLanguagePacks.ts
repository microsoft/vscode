/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import { FileAccess } from '../../base/common/network.js';
import { join } from '../../base/common/path.js';
import type { INLSConfiguration } from '../../nls.js';
import { resolveNLSConfiguration } from '../../base/node/nls.js';
import { Promises } from '../../base/node/pfs.js';
import product from '../../platform/product/common/product.js';

const nlsMetadataPath = join(FileAccess.asFileUri('').fsPath);
const defaultMessagesFile = join(nlsMetadataPath, 'nls.messages.json');
const nlsConfigurationCache = new Map<string, Promise<INLSConfiguration>>();

export async function getNLSConfiguration(language: string, userDataPath: string): Promise<INLSConfiguration> {
	if (!product.commit || !(await Promises.exists(defaultMessagesFile))) {
		return {
			userLocale: 'en',
			osLocale: 'en',
			resolvedLanguage: 'en',
			defaultMessagesFile,

			// NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
			locale: 'en',
			availableLanguages: {}
		};
	}

	const cacheKey = `${language}||${userDataPath}`;
	let result = nlsConfigurationCache.get(cacheKey);
	if (!result) {
		result = resolveNLSConfiguration({ userLocale: language, osLocale: language, commit: product.commit, userDataPath, nlsMetadataPath });
		nlsConfigurationCache.set(cacheKey, result);
		// If the language pack does not yet exist, it defaults to English, which is
		// then cached and you have to restart even if you then install the pack.
		result.then((r) => {
			if (!language.startsWith('en') && r.resolvedLanguage.startsWith('en')) {
				nlsConfigurationCache.delete(cacheKey);
			}
		})
	}

	return result;
}

/**
 * Copied from from src/main.js.
 */
export const getLocaleFromConfig = async (argvResource: string): Promise<string> => {
	try {
		const content = stripComments(await fs.readFile(argvResource, 'utf8'));
		return JSON.parse(content).locale;
	} catch (error) {
		if (error.code !== "ENOENT") {
			console.warn(error)
		}
		return 'en';
	}
};

/**
 * Copied from from src/main.js.
 */
const stripComments = (content: string): string => {
	const regexp = /('(?:[^\\']*(?:\\.)?)*')|('(?:[^\\']*(?:\\.)?)*')|(\/\*(?:\r?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))/g;

	return content.replace(regexp, (match, _m1, _m2, m3, m4) => {
		// Only one of m1, m2, m3, m4 matches
		if (m3) {
			// A block comment. Replace with nothing
			return '';
		} else if (m4) {
			// A line comment. If it ends in \r?\n then keep it.
			const length_1 = m4.length;
			if (length_1 > 2 && m4[length_1 - 1] === '\n') {
				return m4[length_1 - 2] === '\r' ? '\r\n' : '\n';
			}
			else {
				return '';
			}
		} else {
			// We match a string
			return match;
		}
	});
};

/**
 * Generate translations then return a path to a JavaScript file that sets the
 * translations into global variables.  This file is loaded by the browser to
 * set global variables that the loader uses when looking for translations.
 *
 * Normally, VS Code pulls these files from a CDN but we want them to be local.
 */
export async function getBrowserNLSConfiguration(locale: string, userDataPath: string): Promise<string> {
	if (locale.startsWith('en')) {
		return ''; // Use fallback translations.
	}

	const nlsConfig = await getNLSConfiguration(locale, userDataPath);
	const messagesFile = nlsConfig?.languagePack?.messagesFile;
	const resolvedLanguage = nlsConfig?.resolvedLanguage;
	if (!messagesFile || !resolvedLanguage) {
		return ''; // Use fallback translations.
	}

	const nlsFile = path.join(path.dirname(messagesFile), "nls.messages.js");
	try {
		await fs.stat(nlsFile);
		return nlsFile; // We already generated the file.
	} catch (error) {
		// ENOENT is fine, that just means we need to generate the file.
		if (error.code !== 'ENOENT') {
			throw error;
		}
	}

	const messages = (await fs.readFile(messagesFile)).toString();
	const content = `globalThis._VSCODE_NLS_MESSAGES=${messages};
globalThis._VSCODE_NLS_LANGUAGE=${JSON.stringify(resolvedLanguage)};`
	await fs.writeFile(nlsFile, content, "utf-8");

	return nlsFile;
}
