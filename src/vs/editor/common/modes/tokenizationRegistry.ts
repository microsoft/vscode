/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { ITokenizationRegistry, ITokenizationSupport, ITokenizationSupportChangedEvent } from 'vs/editor/common/modes';

export class TokenizationRegistryImpl implements ITokenizationRegistry {

	private _map: { [language: string]: ITokenizationSupport };

	private _onDidChange: Emitter<ITokenizationSupportChangedEvent> = new Emitter<ITokenizationSupportChangedEvent>();
	public onDidChange: Event<ITokenizationSupportChangedEvent> = this._onDidChange.event;

	private _colorMap: string[];

	constructor() {
		this._map = Object.create(null);
		this._colorMap = null;
	}

	public fire(languages: string[]): void {
		this._onDidChange.fire({
			changedLanguages: languages,
			changedColorMap: false
		});
	}

	public register(language: string, support: ITokenizationSupport): IDisposable {
		this._map[language] = support;
		this.fire([language]);
		return {
			dispose: () => {
				if (this._map[language] !== support) {
					return;
				}
				delete this._map[language];
				this.fire([language]);
			}
		};
	}

	public get(language: string): ITokenizationSupport {
		return (this._map[language] || null);
	}

	public setColorMap(colorMap: string[]): void {
		this._colorMap = colorMap;
		this._onDidChange.fire({
			changedLanguages: Object.keys(this._map),
			changedColorMap: false
		});
	}

	public getColorMap(): string[] {
		return this._colorMap;
	}
}
