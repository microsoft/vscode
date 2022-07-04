/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { FileAccess } from 'vs/base/common/network';
import * as path from 'vs/base/common/path';

import * as lp from 'vs/base/node/languagePacks';
import product from 'vs/platform/product/common/product';

const metaData = path.join(FileAccess.asFileUri('', require).fsPath, 'nls.metadata.json');
const _cache: Map<string, Promise<lp.NLSConfiguration>> = new Map();

function exists(file: string) {
	return new Promise(c => fs.exists(file, c));
}

export function getNLSConfiguration(language: string, userDataPath: string): Promise<lp.NLSConfiguration> {
	return exists(metaData).then((fileExists) => {
		if (!fileExists || !product.commit) {
			// console.log(`==> MetaData or commit unknown. Using default language.`);
			return Promise.resolve({ locale: 'en', availableLanguages: {} });
		}
		const key = `${language}||${userDataPath}`;
		let result = _cache.get(key);
		if (!result) {
			result = lp.getNLSConfiguration(product.commit, userDataPath, metaData, language).then(value => {
				if (InternalNLSConfiguration.is(value)) {
					value._languagePackSupport = true;
				}
				return value;
			});
			_cache.set(key, result);
		}
		return result;
	});
}

export namespace InternalNLSConfiguration {
	export function is(value: lp.NLSConfiguration): value is lp.InternalNLSConfiguration {
		const candidate: lp.InternalNLSConfiguration = value as lp.InternalNLSConfiguration;
		return candidate && typeof candidate._languagePackId === 'string';
	}
}
