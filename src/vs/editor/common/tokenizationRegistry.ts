/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../base/common/color.js';
import { Emitter, Event } from '../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { ITokenizationRegistry, ITokenizationSupportChangedEvent, ILazyTokenizationSupport } from './languages.js';
import { ColorId } from './encodedTokenAttributes.js';

export class TokenizationRegistry<TSupport> implements ITokenizationRegistry<TSupport> {

	private readonly _tokenizationSupports = new Map<string, TSupport>();
	private readonly _factories = new Map<string, TokenizationSupportFactoryData<TSupport>>();

	private readonly _onDidChange = new Emitter<ITokenizationSupportChangedEvent>();
	public readonly onDidChange: Event<ITokenizationSupportChangedEvent> = this._onDidChange.event;

	private _colorMap: Color[] | null;

	constructor() {
		this._colorMap = null;
	}

	public handleChange(languageIds: string[]): void {
		this._onDidChange.fire({
			changedLanguages: languageIds,
			changedColorMap: false
		});
	}

	public register(languageId: string, support: TSupport): IDisposable {
		this._tokenizationSupports.set(languageId, support);
		this.handleChange([languageId]);
		return toDisposable(() => {
			if (this._tokenizationSupports.get(languageId) !== support) {
				return;
			}
			this._tokenizationSupports.delete(languageId);
			this.handleChange([languageId]);
		});
	}

	public get(languageId: string): TSupport | null {
		return this._tokenizationSupports.get(languageId) || null;
	}

	public registerFactory(languageId: string, factory: ILazyTokenizationSupport<TSupport>): IDisposable {
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

	public async getOrCreate(languageId: string): Promise<TSupport | null> {
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
			changedLanguages: Array.from(this._tokenizationSupports.keys()),
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

class TokenizationSupportFactoryData<TSupport> extends Disposable {

	private _isDisposed: boolean = false;
	private _resolvePromise: Promise<void> | null = null;
	private _isResolved: boolean = false;

	public get isResolved(): boolean {
		return this._isResolved;
	}

	constructor(
		private readonly _registry: TokenizationRegistry<TSupport>,
		private readonly _languageId: string,
		private readonly _factory: ILazyTokenizationSupport<TSupport>,
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
		const value = await this._factory.tokenizationSupport;
		this._isResolved = true;
		if (value && !this._isDisposed) {
			this._register(this._registry.register(this._languageId, value));
		}
	}
}
