/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { NULL_MODE_ID } from 'vs/editor/common/modes/nullMode';
import { LanguagesRegistry } from 'vs/editor/common/services/languagesRegistry';
import { ILanguageNameIdPair, ILanguageSelection, ILanguageService } from 'vs/editor/common/services/languageService';
import { firstOrDefault } from 'vs/base/common/arrays';
import { ILanguageIdCodec, TokenizationRegistry } from 'vs/editor/common/modes';
import { PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/modes/modesRegistry';

class LanguageSelection implements ILanguageSelection {

	public languageId: string;

	private readonly _selector: () => string;
	private readonly _onDidChange: Emitter<string>;
	public readonly onDidChange: Event<string>;

	constructor(onDidChangeLanguages: Event<void>, selector: () => string) {
		this._selector = selector;
		this.languageId = this._selector();

		let listener: IDisposable;
		this._onDidChange = new Emitter<string>({
			onFirstListenerAdd: () => {
				listener = onDidChangeLanguages(() => this._evaluate());
			},
			onLastListenerRemove: () => {
				listener.dispose();
			}
		});
		this.onDidChange = this._onDidChange.event;
	}

	private _evaluate(): void {
		const languageId = this._selector();
		if (languageId === this.languageId) {
			// no change
			return;
		}
		this.languageId = languageId;
		this._onDidChange.fire(this.languageId);
	}
}

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

	public isRegisteredLanguageId(languageId: string | null | undefined): boolean {
		return this._registry.isRegisteredLanguageId(languageId);
	}

	public validateLanguageId(languageId: string | null): string | null {
		return this._registry.validateLanguageId(languageId);
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
			const validLanguageId = (languageId && this.isRegisteredLanguageId(languageId) ? languageId : PLAINTEXT_LANGUAGE_ID);
			this._getOrCreateMode(validLanguageId);
			return validLanguageId;
		});
	}

	public createByMimeType(mimeType: string | null | undefined): ILanguageSelection {
		return new LanguageSelection(this.onDidChange, () => {
			const languageId = this.getLanguageIdByMimeType(mimeType);
			return this._createModeAndGetLanguageIdentifier(languageId);
		});
	}

	public createByFilepathOrFirstLine(resource: URI | null, firstLine?: string): ILanguageSelection {
		return new LanguageSelection(this.onDidChange, () => {
			const languageId = this.guessLanguageIdByFilepathOrFirstLine(resource, firstLine);
			return this._createModeAndGetLanguageIdentifier(languageId);
		});
	}

	private _createModeAndGetLanguageIdentifier(languageId: string | null | undefined): string {
		// Fall back to plain text if no mode was found
		const validLanguageId = this.validateLanguageId(languageId || PLAINTEXT_LANGUAGE_ID) || NULL_MODE_ID;
		this._getOrCreateMode(validLanguageId);
		return validLanguageId;
	}

	private _getOrCreateMode(languageId: string): void {
		if (!this._encounteredLanguages.has(languageId)) {
			this._encounteredLanguages.add(languageId);
			const validLanguageId = this.validateLanguageId(languageId) || NULL_MODE_ID;
			// Ensure tokenizers are created
			TokenizationRegistry.getOrCreate(validLanguageId);
			this._onDidEncounterLanguage.fire(validLanguageId);
		}
	}
}
