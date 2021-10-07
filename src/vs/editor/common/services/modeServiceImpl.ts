/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { NULL_LANGUAGE_IDENTIFIER } from 'vs/editor/common/modes/nullMode';
import { LanguagesRegistry } from 'vs/editor/common/services/languagesRegistry';
import { ILanguageSelection, IModeService } from 'vs/editor/common/services/modeService';
import { firstOrDefault } from 'vs/base/common/arrays';

class LanguageSelection implements ILanguageSelection {

	public languageIdentifier: LanguageIdentifier;

	private readonly _selector: () => LanguageIdentifier;
	private readonly _onDidChange: Emitter<LanguageIdentifier>;
	public readonly onDidChange: Event<LanguageIdentifier>;

	constructor(onLanguagesMaybeChanged: Event<void>, selector: () => LanguageIdentifier) {
		this._selector = selector;
		this.languageIdentifier = this._selector();

		let listener: IDisposable;
		this._onDidChange = new Emitter<LanguageIdentifier>({
			onFirstListenerAdd: () => {
				listener = onLanguagesMaybeChanged(() => this._evaluate());
			},
			onLastListenerRemove: () => {
				listener.dispose();
			}
		});
		this.onDidChange = this._onDidChange.event;
	}

	private _evaluate(): void {
		let languageIdentifier = this._selector();
		if (languageIdentifier.id === this.languageIdentifier.id) {
			// no change
			return;
		}
		this.languageIdentifier = languageIdentifier;
		this._onDidChange.fire(this.languageIdentifier);
	}
}

export class ModeServiceImpl extends Disposable implements IModeService {
	public _serviceBrand: undefined;

	private readonly _encounteredLanguages: Set<string>;
	private readonly _registry: LanguagesRegistry;

	private readonly _onDidEncounterLanguage = this._register(new Emitter<LanguageIdentifier>());
	public readonly onDidEncounterLanguage: Event<LanguageIdentifier> = this._onDidEncounterLanguage.event;

	protected readonly _onLanguagesMaybeChanged = this._register(new Emitter<void>({ leakWarningThreshold: 200 /* https://github.com/microsoft/vscode/issues/119968 */ }));
	public readonly onLanguagesMaybeChanged: Event<void> = this._onLanguagesMaybeChanged.event;

	constructor(warnOnOverwrite = false) {
		super();
		this._encounteredLanguages = new Set<string>();

		this._registry = this._register(new LanguagesRegistry(true, warnOnOverwrite));
		this._register(this._registry.onDidChange(() => this._onLanguagesMaybeChanged.fire()));
	}

	protected _onReady(): Promise<boolean> {
		return Promise.resolve(true);
	}

	public isRegisteredMode(mimetypeOrModeId: string): boolean {
		return this._registry.isRegisteredMode(mimetypeOrModeId);
	}

	public getRegisteredModes(): string[] {
		return this._registry.getRegisteredModes();
	}

	public getRegisteredLanguageNames(): string[] {
		return this._registry.getRegisteredLanguageNames();
	}

	public getExtensions(alias: string): string[] {
		return this._registry.getExtensions(alias);
	}

	public getFilenames(alias: string): string[] {
		return this._registry.getFilenames(alias);
	}

	public getMimeForMode(modeId: string): string | null {
		return this._registry.getMimeForMode(modeId);
	}

	public getLanguageName(modeId: string): string | null {
		return this._registry.getLanguageName(modeId);
	}

	public getModeIdForLanguageName(alias: string): string | null {
		return this._registry.getModeIdForLanguageNameLowercase(alias);
	}

	public getModeIdByFilepathOrFirstLine(resource: URI | null, firstLine?: string): string | null {
		const modeIds = this._registry.getModeIdsFromFilepathOrFirstLine(resource, firstLine);
		return firstOrDefault(modeIds, null);
	}

	public getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string | undefined): string | null {
		const modeIds = this._registry.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);
		return firstOrDefault(modeIds, null);
	}

	public getLanguageIdentifier(modeId: string | LanguageId): LanguageIdentifier | null {
		return this._registry.getLanguageIdentifier(modeId);
	}

	public getConfigurationFiles(modeId: string): URI[] {
		return this._registry.getConfigurationFiles(modeId);
	}

	// --- instantiation

	public create(commaSeparatedMimetypesOrCommaSeparatedIds: string | undefined): ILanguageSelection {
		return new LanguageSelection(this.onLanguagesMaybeChanged, () => {
			const modeId = this.getModeId(commaSeparatedMimetypesOrCommaSeparatedIds);
			return this._createModeAndGetLanguageIdentifier(modeId);
		});
	}

	public createByLanguageName(languageName: string): ILanguageSelection {
		return new LanguageSelection(this.onLanguagesMaybeChanged, () => {
			const modeId = this._getModeIdByLanguageName(languageName);
			return this._createModeAndGetLanguageIdentifier(modeId);
		});
	}

	public createByFilepathOrFirstLine(resource: URI | null, firstLine?: string): ILanguageSelection {
		return new LanguageSelection(this.onLanguagesMaybeChanged, () => {
			const modeId = this.getModeIdByFilepathOrFirstLine(resource, firstLine);
			return this._createModeAndGetLanguageIdentifier(modeId);
		});
	}

	private _createModeAndGetLanguageIdentifier(modeId: string | null): LanguageIdentifier {
		// Fall back to plain text if no mode was found
		const languageIdentifier = this.getLanguageIdentifier(modeId || 'plaintext') || NULL_LANGUAGE_IDENTIFIER;
		this._getOrCreateMode(languageIdentifier.language);
		return languageIdentifier;
	}

	public triggerMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): void {
		const modeId = this.getModeId(commaSeparatedMimetypesOrCommaSeparatedIds);
		// Fall back to plain text if no mode was found
		this._getOrCreateMode(modeId || 'plaintext');
	}

	public waitForLanguageRegistration(): Promise<void> {
		return this._onReady().then(() => { });
	}

	private _getModeIdByLanguageName(languageName: string): string | null {
		const modeIds = this._registry.getModeIdsFromLanguageName(languageName);
		return firstOrDefault(modeIds, null);
	}

	private _getOrCreateMode(modeId: string): void {
		if (!this._encounteredLanguages.has(modeId)) {
			this._encounteredLanguages.add(modeId);
			const languageIdentifier = this.getLanguageIdentifier(modeId) || NULL_LANGUAGE_IDENTIFIER;
			this._onDidEncounterLanguage.fire(languageIdentifier);
		}
	}
}
