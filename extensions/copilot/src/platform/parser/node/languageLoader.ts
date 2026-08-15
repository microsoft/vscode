/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../util/vs/base/common/path';
import { WASMLanguage } from './treeSitterLanguages';
import Parser = require('web-tree-sitter');

export class LanguageLoader {

	private readonly loadedLanguagesCache;

	constructor() {
		this.loadedLanguagesCache = new Map<WASMLanguage, Promise<Parser.Language>>();
	}

	loadLanguage(wasmLanguage: WASMLanguage): Promise<Parser.Language> {
		if (!this.loadedLanguagesCache.has(wasmLanguage)) {
			this.loadedLanguagesCache.set(wasmLanguage, this._doLoadLanguage(wasmLanguage));
		}
		return this.loadedLanguagesCache.get(wasmLanguage)!;
	}

	private _doLoadLanguage(language: WASMLanguage): Promise<Parser.Language> {
		// construct a path that works both for the TypeScript source, which lives under `/src`, and for
		// the transpiled JavaScript, which lives under `/dist`
		const wasmFileLang = language === 'csharp' ? 'c-sharp' : language;

		const wasmFilename = `tree-sitter-${wasmFileLang}.wasm`;

		// depending on if file is being run from the webpack bundle or source, change the relative path
		const wasmFile =
			path.basename(__dirname) === 'dist'
				? path.resolve(__dirname, wasmFilename)
				: path.resolve(__dirname, '../../../../dist', wasmFilename);

		return Parser.Language.load(wasmFile);
	}
}
