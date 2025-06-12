/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../base/common/network.js';
import { join } from '../../base/common/path.js';
import type { INLSConfiguration } from '../../nls.js';
import { resolveNLSConfiguration } from '../../base/node/nls.js';
import { Promises } from '../../base/node/pfs.js';
import product from '../../platform/product/common/product.js';

const nlsMetadataPath = join(FileAccess.asFileUri('').fsPath);
const defaultMessagesFile = join(nlsMetadataPath, 'nls.messages.json');
const nlsKeysFile = join(nlsMetadataPath, 'nls.keys.json');
const nlsConfigurationCache = new Map<string, Promise<INLSConfiguration>>();

// Debug logging for remote language packs
function debugLog(message: string, data?: any): void {
	if (data !== undefined) {
		console.log(`[RemoteLanguagePacks] ${message}`, data);
	} else {
		console.log(`[RemoteLanguagePacks] ${message}`);
	}
}

export async function getNLSConfiguration(language: string, userDataPath: string): Promise<INLSConfiguration> {
	debugLog('=== getNLSConfiguration START ===');
	debugLog('Input parameters:', { language, userDataPath });
	debugLog('Product info:', { commit: product.commit, hasCommit: !!product.commit });
	debugLog('NLS paths:', {
		nlsMetadataPath,
		defaultMessagesFile,
		nlsKeysFile
	});

	// Check if required files exist
	const [messagesFileExists, keysFileExists] = await Promise.all([
		Promises.exists(defaultMessagesFile),
		Promises.exists(nlsKeysFile)
	]);

	debugLog('File existence check:', {
		defaultMessagesFile: messagesFileExists,
		nlsKeysFile: keysFileExists
	});

	if (!product.commit || !messagesFileExists) {
		debugLog('EARLY RETURN: Missing product.commit or nls.messages.json');
		debugLog('Condition breakdown:', {
			hasCommit: !!product.commit,
			messagesFileExists
		});

		const fallbackConfig = {
			userLocale: 'en',
			osLocale: 'en',
			resolvedLanguage: 'en',
			defaultMessagesFile,

			// NLS: below 2 are a relic from old times only used by vscode-nls and deprecated
			locale: 'en',
			availableLanguages: {}
		};

		debugLog('Returning fallback config:', fallbackConfig);
		debugLog('=== getNLSConfiguration END (FALLBACK) ===');
		return fallbackConfig;
	}

	const cacheKey = `${language}||${userDataPath}`;
	debugLog('Cache operations:', { cacheKey, hasCached: nlsConfigurationCache.has(cacheKey) });

	let result = nlsConfigurationCache.get(cacheKey);
	if (!result) {
		debugLog('Cache miss - calling resolveNLSConfiguration with:', {
			userLocale: language,
			osLocale: language,
			commit: product.commit,
			userDataPath,
			nlsMetadataPath
		});

		result = resolveNLSConfiguration({
			userLocale: language,
			osLocale: language,
			commit: product.commit,
			userDataPath,
			nlsMetadataPath
		});

		// Log the result when it resolves
		result.then(resolvedConfig => {
			debugLog('resolveNLSConfiguration result:', {
				userLocale: resolvedConfig.userLocale,
				osLocale: resolvedConfig.osLocale,
				resolvedLanguage: resolvedConfig.resolvedLanguage,
				locale: resolvedConfig.locale,
				languagePackExists: !!resolvedConfig.languagePack,
				languagePackPath: resolvedConfig.languagePack?.translationsConfigFile,
				messagesFile: resolvedConfig.defaultMessagesFile,
				availableLanguagesCount: Object.keys(resolvedConfig.availableLanguages || {}).length
			});
		}).catch(error => {
			debugLog('resolveNLSConfiguration ERROR:', error);
		});

		nlsConfigurationCache.set(cacheKey, result);
		debugLog('Cached result for key:', cacheKey);
	} else {
		debugLog('Cache hit for key:', cacheKey);
	}

	const finalResult = await result;
	debugLog('Final result summary:', {
		userLocale: finalResult.userLocale,
		resolvedLanguage: finalResult.resolvedLanguage,
		hasLanguagePack: !!finalResult.languagePack
	});
	debugLog('=== getNLSConfiguration END ===');
	return finalResult;
}
