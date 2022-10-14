/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { LanguagesRegistry } from 'vs/editor/common/services/languagesRegistry';
import { ILanguageNameIdPair, ILanguageSelection, ILanguageService, ILanguageIcon, ILanguageExtensionPoint } from 'vs/editor/common/languages/language';
import { firstOrDefault } from 'vs/base/common/arrays';
import { ILanguageIdCodec, TokenizationRegistry } from 'vs/editor/common/languages';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';

export class LanguageService extends Disposable implements ILanguageService {
	public _serviceBrand: undefined;

	static instanceCount = 0;

	private readonly _encounteredLanguages: Set<string>;
	protected readonly _registry: LanguagesRegistry;
	public readonly languageIdCodec: ILanguageIdCodec;

	private readonly _onDidEncounterLanguage = this._register(new Emitter<string>());
	public readonly onDidEncounterLanguage: Event<string> = this._onDidEncounterLanguage.event;

	protected readonly _onDidChange = this._register(new Emitter<void>({ leakWarningThreshold: 200 /* https://github.com/microsoft/vscode/issues/119968 */ }));
	public readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(warnOnOverwrite = false) {
		super();
		LanguageService.instanceCount++;
		this._encounteredLanguages = new Set<string>();
		this._registry = this._register(new LanguagesRegistry(true, warnOnOverwrite));
		this.languageIdCodec = this._registry.languageIdCodec;
		this._register(this._registry.onDidChange(() => this._onDidChange.fire()));
	}

	public override dispose(): void {
		LanguageService.instanceCount--;
		super.dispose();
	}

	public registerLanguage(def: ILanguageExtensionPoint): IDisposable {
		return this._registry.registerLanguage(def);
	}

	public isRegisteredLanguageId(languageId: string | null | undefined): boolean {
		return this._registry.isRegisteredLanguageId(languageId);
	}

	public getRegisteredLanguageIds(): string[] {
		return this._registry.getRegisteredLanguageIds();
	}

	public getSortedRegisteredLanguageNames(): ILanguageNameIdPair[] {
		return this._registry.getSortedRegisteredLanguageNames();
	}

	public getLanguageName(languageId: string): string | null {
		return this._registry.getLanguageName(languageId);
	}

	public getMimeType(languageId: string): string | null {
		return this._registry.getMimeType(languageId);
	}

	public getIcon(languageId: string): ILanguageIcon | null {
		return this._registry.getIcon(languageId);
	}

	public getExtensions(languageId: string): ReadonlyArray<string> {
		return this._registry.getExtensions(languageId);
	}

	public getFilenames(languageId: string): ReadonlyArray<string> {
		return this._registry.getFilenames(languageId);
	}

	public getConfigurationFiles(languageId: string): ReadonlyArray<URI> {
		return this._registry.getConfigurationFiles(languageId);
	}

	public getLanguageIdByLanguageName(languageName: string): string | null {
		return this._registry.getLanguageIdByLanguageName(languageName);
	}

	public getLanguageIdByMimeType(mimeType: string | null | undefined): string | null {
		return this._registry.getLanguageIdByMimeType(mimeType);
	}

	public guessLanguageIdByFilepathOrFirstLine(resource: URI | null, firstLine?: string): string | null {
		const languageIds = this._registry.guessLanguageIdByFilepathOrFirstLine(resource, firstLine);
		return firstOrDefault(languageIds, null);
	}

	public createById(languageId: string | null | undefined): ILanguageSelection {
		return new LanguageSelection(this.onDidChange, () => {
			return this._createAndGetLanguageIdentifier(languageId);
		});
	}

	public createByMimeType(mimeType: string | null | undefined): ILanguageSelection {
		return new LanguageSelection(this.onDidChange, () => {
			const languageId = this.getLanguageIdByMimeType(mimeType);
			return this._createAndGetLanguageIdentifier(languageId);
		});
	}

	public createByFilepathOrFirstLine(resource: URI | null, firstLine?: string): ILanguageSelection {
		return new LanguageSelection(this.onDidChange, () => {
			const languageId = this.guessLanguageIdByFilepathOrFirstLine(resource, firstLine);
			return this._createAndGetLanguageIdentifier(languageId);
		});
	}

	private _createAndGetLanguageIdentifier(languageId: string | null | undefined): string {
		if (!languageId || !this.isRegisteredLanguageId(languageId)) {
			// Fall back to plain text if language is unknown
			languageId = PLAINTEXT_LANGUAGE_ID;
		}

		if (!this._encounteredLanguages.has(languageId)) {
			this._encounteredLanguages.add(languageId);

			// Ensure tokenizers are created
			TokenizationRegistry.getOrCreate(languageId);

			// Fire event
			this._onDidEncounterLanguage.fire(languageId);
		}

		return languageId;
	}
}

class LanguageSelection implements ILanguageSelection {

	public languageId: string;

	private _listener: IDisposable | null = null;
	private _emitter: Emitter<string> | null = null;

	constructor(
		private readonly _onDidChangeLanguages: Event<void>,
		private readonly _selector: () => string
	) {
		this.languageId = this._selector();
	}

	private _dispose(): void {
		if (this._listener) {
			this._listener.dispose();
			this._listener = null;
		}
		if (this._emitter) {
			this._emitter.dispose();
			this._emitter = null;
		}
	}

	public get onDidChange(): Event<string> {
		if (!this._listener) {
			this._listener = this._onDidChangeLanguages(() => this._evaluate());
		}
		if (!this._emitter) {
			this._emitter = new Emitter<string>({
				onLastListenerRemove: () => {
					this._dispose();
				}
			});
		}
		return this._emitter.event;
	}

	private _evaluate(): void {
		const languageId = this._selector();
		if (languageId === this.languageId) {
			// no change
			return;
		}
		this.languageId = languageId;
		this._emitter?.fire(this.languageId);
	}
}
