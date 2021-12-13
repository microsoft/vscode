/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { NULL_MODE_ID } from 'vs/editor/common/modes/nullMode';
import { LanguagesRegistry } from 'vs/editor/common/services/languagesRegistry';
import { ILanguageSelection, ILanguageService } from 'vs/editor/common/services/languageService';
import { firstOrDefault } from 'vs/base/common/arrays';
import { ILanguageIdCodec } from 'vs/editor/common/modes';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';

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

export class LanguageService extends Disposable implements ILanguageService {
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
		LanguageService.instanceCount++;
		this._encounteredLanguages = new Set<string>();
		this._registry = this._register(new LanguagesRegistry(true, warnOnOverwrite));
		this.languageIdCodec = this._registry.languageIdCodec;
		this._register(this._registry.onDidChange(() => this._onLanguagesMaybeChanged.fire()));
	}

	public override dispose(): void {
		LanguageService.instanceCount--;
		super.dispose();
	}

	public isRegisteredLanguageId(languageId: string | null | undefined): boolean {
		return this._registry.isRegisteredLanguageId(languageId);
	}

	public getRegisteredLanguageIds(): string[] {
		return this._registry.getRegisteredLanguageIds();
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

	public getMimeTypeForLanguageId(languageId: string): string | null {
		return this._registry.getMimeTypeForLanguageId(languageId);
	}

	public getLanguageName(languageId: string): string | null {
		return this._registry.getLanguageName(languageId);
	}

	public getLanguageIdForLanguageName(alias: string): string | null {
		return this._registry.getLanguageIdForLanguageName(alias);
	}

	public getLanguageIdForMimeType(mimeType: string | null | undefined): string | null {
		return this._registry.getLanguageIdForMimeType(mimeType);
	}

	public getLanguageIdByFilepathOrFirstLine(resource: URI | null, firstLine?: string): string | null {
		const modeIds = this._registry.getLanguageIdByFilepathOrFirstLine(resource, firstLine);
		return firstOrDefault(modeIds, null);
	}

	private getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string | undefined): string | null {
		const modeIds = this._registry.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);
		return firstOrDefault(modeIds, null);
	}

	public validateLanguageId(languageId: string | null): string | null {
		return this._registry.validateLanguageId(languageId);
	}

	public getConfigurationFiles(languageId: string): URI[] {
		return this._registry.getConfigurationFiles(languageId);
	}

	// --- instantiation

	public createById(languageId: string | null | undefined): ILanguageSelection {
		return new LanguageSelection(this.onLanguagesMaybeChanged, () => {
			const validLanguageId = (languageId && this.isRegisteredLanguageId(languageId) ? languageId : PLAINTEXT_MODE_ID);
			this._getOrCreateMode(validLanguageId);
			return validLanguageId;
		});
	}

	public createByMimeType(mimeType: string | null | undefined): ILanguageSelection {
		return new LanguageSelection(this.onLanguagesMaybeChanged, () => {
			const languageId = this.getLanguageIdForMimeType(mimeType);
			return this._createModeAndGetLanguageIdentifier(languageId);
		});
	}

	public createByFilepathOrFirstLine(resource: URI | null, firstLine?: string): ILanguageSelection {
		return new LanguageSelection(this.onLanguagesMaybeChanged, () => {
			const languageId = this.getLanguageIdByFilepathOrFirstLine(resource, firstLine);
			return this._createModeAndGetLanguageIdentifier(languageId);
		});
	}

	private _createModeAndGetLanguageIdentifier(languageId: string | null | undefined): string {
		// Fall back to plain text if no mode was found
		const validLanguageId = this.validateLanguageId(languageId || 'plaintext') || NULL_MODE_ID;
		this._getOrCreateMode(validLanguageId);
		return validLanguageId;
	}

	public triggerMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): void {
		const languageId = this.getModeId(commaSeparatedMimetypesOrCommaSeparatedIds);
		// Fall back to plain text if no mode was found
		this._getOrCreateMode(languageId || 'plaintext');
	}

	private _getOrCreateMode(languageId: string): void {
		if (!this._encounteredLanguages.has(languageId)) {
			this._encounteredLanguages.add(languageId);
			const validLanguageId = this.validateLanguageId(languageId) || NULL_MODE_ID;
			this._onDidEncounterLanguage.fire(validLanguageId);
		}
	}
}
