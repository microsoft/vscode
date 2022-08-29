/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITokenizationRegistry, ITokenizationSupport, ITokenizationSupportChangedEvent, ITokenizationSupportFactory } from 'vs/editor/common/languages';
import { ColorId } from 'vs/editor/common/encodedTokenAttributes';

export class TokenizationRegistry implements ITokenizationRegistry {

	private readonly _map = new Map<string, ITokenizationSupport>();
	private readonly _factories = new Map<string, TokenizationSupportFactoryData>();

	private readonly _onDidChange = new Emitter<ITokenizationSupportChangedEvent>();
	public readonly onDidChange: Event<ITokenizationSupportChangedEvent> = this._onDidChange.event;

	private _colorMap: Color[] | null;

	constructor() {
		this._colorMap = null;
	}

	public fire(languages: string[]): void {
		this._onDidChange.fire({
			changedLanguages: languages,
			changedColorMap: false
		});
	}

	public register(language: string, support: ITokenizationSupport) {
		this._map.set(language, support);
		this.fire([language]);
		return toDisposable(() => {
			if (this._map.get(language) !== support) {
				return;
			}
			this._map.delete(language);
			this.fire([language]);
		});
	}

	public registerFactory(languageId: string, factory: ITokenizationSupportFactory): IDisposable {
		this._factories.get(languageId)?.dispose();
		const myData = new TokenizationSupportFactoryData(this, languageId, factory);
		this._factories.set(languageId, myData);
		return toDisposable(() => {
			const v = this._factories.get(languageId);
			if (!v || v !== myData) {
				return;
			}
			this._factories.delete(languageId);
			v.dispose();
		});
	}

	public async getOrCreate(languageId: string): Promise<ITokenizationSupport | null> {
		// check first if the support is already set
		const tokenizationSupport = this.get(languageId);
		if (tokenizationSupport) {
			return tokenizationSupport;
		}

		const factory = this._factories.get(languageId);
		if (!factory || factory.isResolved) {
			// no factory or factory.resolve already finished
			return null;
		}

		await factory.resolve();

		return this.get(languageId);
	}

	public get(language: string): ITokenizationSupport | null {
		return (this._map.get(language) || null);
	}

	public isResolved(languageId: string): boolean {
		const tokenizationSupport = this.get(languageId);
		if (tokenizationSupport) {
			return true;
		}

		const factory = this._factories.get(languageId);
		if (!factory || factory.isResolved) {
			return true;
		}

		return false;
	}

	public setColorMap(colorMap: Color[]): void {
		this._colorMap = colorMap;
		this._onDidChange.fire({
			changedLanguages: Array.from(this._map.keys()),
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

class TokenizationSupportFactoryData extends Disposable {

	private _isDisposed: boolean = false;
	private _resolvePromise: Promise<void> | null = null;
	private _isResolved: boolean = false;

	public get isResolved(): boolean {
		return this._isResolved;
	}

	constructor(
		private readonly _registry: TokenizationRegistry,
		private readonly _languageId: string,
		private readonly _factory: ITokenizationSupportFactory,
	) {
		super();
	}

	public override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	public async resolve(): Promise<void> {
		if (!this._resolvePromise) {
			this._resolvePromise = this._create();
		}
		return this._resolvePromise;
	}

	private async _create(): Promise<void> {
		const value = await Promise.resolve(this._factory.createTokenizationSupport());
		this._isResolved = true;
		if (value && !this._isDisposed) {
			this._register(this._registry.register(this._languageId, value));
		}
	}
}
