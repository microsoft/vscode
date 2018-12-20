/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ColorId, ITokenizationRegistry, ITokenizationSupport, ITokenizationSupportChangedEvent } from 'vs/editor/common/modes';

export class TokenizationRegistryImpl implements ITokenizationRegistry {

	private _map: { [language: string]: ITokenizationSupport };
	private _promises: { [language: string]: Thenable<void> };

	private readonly _onDidChange = new Emitter<ITokenizationSupportChangedEvent>();
	public readonly onDidChange: Event<ITokenizationSupportChangedEvent> = this._onDidChange.event;

	private _colorMap: Color[] | null;

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

	public registerPromise(language: string, supportPromise: Thenable<ITokenizationSupport | null>): IDisposable {

		let registration: IDisposable | null = null;
		let isDisposed: boolean = false;

		this._promises[language] = supportPromise.then(support => {
			delete this._promises[language];
			if (isDisposed || !support) {
				return;
			}
			registration = this.register(language, support);
		});

		return toDisposable(() => {
			isDisposed = true;
			if (registration) {
				registration.dispose();
			}
		});
	}

	public getPromise(language: string): Thenable<ITokenizationSupport> | null {
		const support = this.get(language);
		if (support) {
			return Promise.resolve(support);
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

	public getColorMap(): Color[] | null {
		return this._colorMap;
	}

	public getDefaultBackground(): Color | null {
		if (this._colorMap && this._colorMap.length > ColorId.DefaultBackground) {
			return this._colorMap[ColorId.DefaultBackground];
		}
		return null;
	}
}
