/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';

export class LanguageServiceDefaults {

	private _compilerOptions: ts.CompilerOptions = { allowNonTsExtensions: true, target: ts.ScriptTarget.Latest };
	private _onDidChangeCompilerOptions = new Emitter<ts.CompilerOptions>();
	private _extraLibs: { [path: string]: string } = Object.create(null);
	private _onDidAddExtraLib = new Emitter<string>();
	private _onDidRemoveExtraLib = new Emitter<string>();

	get onDidAddExtraLibs(): Event<string> {
		return this._onDidAddExtraLib.event;
	}

	get onDidRemoveExtraLib(): Event<string> {
		return this._onDidRemoveExtraLib.event;
	}

	getExtraLibs(): { [path: string]: string } {
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
		this._onDidAddExtraLib.fire(filePath);

		return {
			dispose: () => {
				if (delete this._extraLibs[filePath]) {
					this._onDidRemoveExtraLib.fire(filePath);
				}
			}
		};
	}

	get onDidChangeCompilerOptions(): Event<ts.CompilerOptions> {
		return this._onDidChangeCompilerOptions.event;
	}

	getCompilerOptions(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	setCompilerOptions(options: ts.CompilerOptions): void {
		this._compilerOptions = options || Object.create(null);
		this._onDidChangeCompilerOptions.fire(this._compilerOptions);
	}
}

export const Defaults = new LanguageServiceDefaults();
