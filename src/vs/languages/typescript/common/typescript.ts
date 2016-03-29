/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';

export class LanguageServiceDefaults {

	private _onDidChange = new Emitter<LanguageServiceDefaults>();
	private _compilerOptions: ts.CompilerOptions = { allowNonTsExtensions: true, target: ts.ScriptTarget.Latest };
	private _extraLibs: { [path: string]: string } = Object.create(null);

	get onDidChange(): Event<LanguageServiceDefaults>{
		return this._onDidChange.event;
	}

	get extraLibs(): { [path: string]: string } {
		return Object.freeze(this._extraLibs);
	}

	addExtraLib(content: string, filePath?: string): IDisposable {
		if (typeof filePath === 'undefined') {
			filePath = `ts:extralib-${Date.now()}`;
		}

		if (this._extraLibs[filePath]) {
			throw new Error(`${filePath} already a extra lib`);
		}

		this._extraLibs[filePath] = content;
		this._onDidChange.fire(this);

		return {
			dispose: () => {
				if (delete this._extraLibs[filePath]) {
					this._onDidChange.fire(this);
				}
			}
		};
	}

	get compilerOptions(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	setCompilerOptions(options: ts.CompilerOptions): void {
		this._compilerOptions = options || Object.create(null);
		this._onDidChange.fire(this);
	}
}

export const Defaults = new LanguageServiceDefaults();
