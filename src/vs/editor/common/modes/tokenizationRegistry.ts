/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ColorId, ITokenizationRegistry, ITokenizationSupport, ITokenizationSupportChangedEvent } from 'vs/editor/common/modes';
import { Color } from 'vs/base/common/color';
import { TPromise } from 'vs/base/common/winjs.base';

export class TokenizationRegistryImpl implements ITokenizationRegistry {

	private _map: { [language: string]: ITokenizationSupport };
	private _promises: { [language: string]: Thenable<IDisposable> };

	private readonly _onDidChange: Emitter<ITokenizationSupportChangedEvent> = new Emitter<ITokenizationSupportChangedEvent>();
	public readonly onDidChange: Event<ITokenizationSupportChangedEvent> = this._onDidChange.event;

	private _colorMap: Color[];

	constructor() {
		this._map = Object.create(null);
		this._promises = Object.create(null);
		this._colorMap = null;
	}

	public fire(languages: string[]): void {
		this._onDidChange.fire({
			changedLanguages: languages,
			changedColorMap: false
		});
	}

	public register(language: string, support: ITokenizationSupport) {
		this._map[language] = support;
		this.fire([language]);
		return toDisposable(() => {
			if (this._map[language] !== support) {
				return;
			}
			delete this._map[language];
			this.fire([language]);
		});
	}

	public registerPromise(language: string, supportPromise: Thenable<ITokenizationSupport>): Thenable<IDisposable> {
		const promise = this._promises[language] = supportPromise.then(support => {
			delete this._promises[language];
			return this.register(language, support);
		});
		return promise;
	}

	public getPromise(language: string): Thenable<ITokenizationSupport> {
		const support = this.get(language);
		if (support) {
			return TPromise.as(support);
		}
		const promise = this._promises[language];
		if (promise) {
			return promise.then(_ => this.get(language));
		}
		return null;
	}

	public get(language: string): ITokenizationSupport {
		return (this._map[language] || null);
	}

	public setColorMap(colorMap: Color[]): void {
		this._colorMap = colorMap;
		this._onDidChange.fire({
			changedLanguages: Object.keys(this._map),
			changedColorMap: true
		});
	}

	public getColorMap(): Color[] {
		return this._colorMap;
	}

	public getDefaultBackground(): Color {
		return this._colorMap[ColorId.DefaultBackground];
	}
}
