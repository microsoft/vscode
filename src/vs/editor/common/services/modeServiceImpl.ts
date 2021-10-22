/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { NULL_MODE_ID } from 'vs/editor/common/modes/nullMode';
import { LanguagesRegistry } from 'vs/editor/common/services/languagesRegistry';
import { ILanguageSelection, IModeService } from 'vs/editor/common/services/modeService';
import { firstOrDefault } from 'vs/base/common/arrays';
import { ILanguageIdCodec } from 'vs/editor/common/modes';

class LanguageSelection implements ILanguageSelection {

	public languageId: string;

	private readonly _selector: () => string;
	private readonly _onDidChange: Emitter<string>;
	public readonly onDidChange: Event<string>;

	constructor(onLanguagesMaybeChanged: Event<void>, selector: () => string) {
		this._selector = selector;
		this.languageId = this._selector();

		let listener: IDisposable;
		this._onDidChange = new Emitter<string>({
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
		const languageId = this._selector();
		if (languageId === this.languageId) {
			// no change
			return;
		}
		this.languageId = languageId;
		this._onDidChange.fire(this.languageId);
	}
}

export class ModeServiceImpl extends Disposable implements IModeService {
	public _serviceBrand: undefined;

	static instanceCount = 0;

	private readonly _encounteredLanguages: Set<string>;
	private readonly _registry: LanguagesRegistry;
	public readonly languageIdCodec: ILanguageIdCodec;

	private readonly _onDidEncounterLanguage = this._register(new Emitter<string>());
	public readonly onDidEncounterLanguage: Event<string> = this._onDidEncounterLanguage.event;

	protected readonly _onLanguagesMaybeChanged = this._register(new Emitter<void>({ leakWarningThreshold: 200 /* https://github.com/microsoft/vscode/issues/119968 */ }));
	public readonly onLanguagesMaybeChanged: Event<void> = this._onLanguagesMaybeChanged.event;

	constructor(warnOnOverwrite = false) {
		super();
		ModeServiceImpl.instanceCount++;
		this._encounteredLanguages = new Set<string>();
		this._registry = this._register(new LanguagesRegistry(true, warnOnOverwrite));
		this.languageIdCodec = this._registry.languageIdCodec;
		this._register(this._registry.onDidChange(() => this._onLanguagesMaybeChanged.fire()));
	}

	public override dispose(): void {
		ModeServiceImpl.instanceCount--;
		super.dispose();
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

	public validateLanguageId(modeId: string | null): string | null {
		return this._registry.validateLanguageId(modeId);
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

	private _createModeAndGetLanguageIdentifier(modeId: string | null): string {
		// Fall back to plain text if no mode was found
		const languageId = this.validateLanguageId(modeId || 'plaintext') || NULL_MODE_ID;
		this._getOrCreateMode(languageId);
		return languageId;
	}

	public triggerMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): void {
		const modeId = this.getModeId(commaSeparatedMimetypesOrCommaSeparatedIds);
		// Fall back to plain text if no mode was found
		this._getOrCreateMode(modeId || 'plaintext');
	}

	private _getModeIdByLanguageName(languageName: string): string | null {
		return this._registry.getModeIdFromLanguageName(languageName);
	}

	private _getOrCreateMode(modeId: string): void {
		if (!this._encounteredLanguages.has(modeId)) {
			this._encounteredLanguages.add(modeId);
			const languageId = this.validateLanguageId(modeId) || NULL_MODE_ID;
			this._onDidEncounterLanguage.fire(languageId);
		}
	}
}
