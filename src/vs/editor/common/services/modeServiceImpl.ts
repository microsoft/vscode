/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IExtensionPoint, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { IMode, LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { FrankensteinMode } from 'vs/editor/common/modes/abstractMode';
import { LanguagesRegistry } from 'vs/editor/common/services/languagesRegistry';
import { ILanguageExtensionPoint, IModeLookupResult, IModeService } from 'vs/editor/common/services/modeService';

export const languagesExtPoint: IExtensionPoint<ILanguageExtensionPoint[]> = ExtensionsRegistry.registerExtensionPoint<ILanguageExtensionPoint[]>('languages', [], {
	description: nls.localize('vscode.extension.contributes.languages', 'Contributes language declarations.'),
	type: 'array',
	items: {
		type: 'object',
		defaultSnippets: [{ body: { id: '${1:languageId}', aliases: ['${2:label}'], extensions: ['${3:extension}'], configuration: './language-configuration.json' } }],
		properties: {
			id: {
				description: nls.localize('vscode.extension.contributes.languages.id', 'ID of the language.'),
				type: 'string'
			},
			aliases: {
				description: nls.localize('vscode.extension.contributes.languages.aliases', 'Name aliases for the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			extensions: {
				description: nls.localize('vscode.extension.contributes.languages.extensions', 'File extensions associated to the language.'),
				default: ['.foo'],
				type: 'array',
				items: {
					type: 'string'
				}
			},
			filenames: {
				description: nls.localize('vscode.extension.contributes.languages.filenames', 'File names associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			filenamePatterns: {
				description: nls.localize('vscode.extension.contributes.languages.filenamePatterns', 'File name glob patterns associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			mimetypes: {
				description: nls.localize('vscode.extension.contributes.languages.mimetypes', 'Mime types associated to the language.'),
				type: 'array',
				items: {
					type: 'string'
				}
			},
			firstLine: {
				description: nls.localize('vscode.extension.contributes.languages.firstLine', 'A regular expression matching the first line of a file of the language.'),
				type: 'string'
			},
			configuration: {
				description: nls.localize('vscode.extension.contributes.languages.configuration', 'A relative path to a file containing configuration options for the language.'),
				type: 'string',
				default: './language-configuration.json'
			}
		}
	}
});

export class ModeServiceImpl implements IModeService {
	public _serviceBrand: any;

	private _instantiatedModes: { [modeId: string]: IMode; };

	private _registry: LanguagesRegistry;

	private _onDidAddModes: Emitter<string[]> = new Emitter<string[]>();
	public onDidAddModes: Event<string[]> = this._onDidAddModes.event;

	private _onDidCreateMode: Emitter<IMode> = new Emitter<IMode>();
	public onDidCreateMode: Event<IMode> = this._onDidCreateMode.event;

	constructor() {
		this._instantiatedModes = {};

		this._registry = new LanguagesRegistry();
		this._registry.onDidAddModes((modes) => this._onDidAddModes.fire(modes));
	}

	protected _onReady(): TPromise<boolean> {
		return TPromise.as(true);
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

	public getMimeForMode(modeId: string): string {
		return this._registry.getMimeForMode(modeId);
	}

	public getLanguageName(modeId: string): string {
		return this._registry.getLanguageName(modeId);
	}

	public getModeIdForLanguageName(alias: string): string {
		return this._registry.getModeIdForLanguageNameLowercase(alias);
	}

	public getModeIdByFilenameOrFirstLine(filename: string, firstLine?: string): string {
		var modeIds = this._registry.getModeIdsFromFilenameOrFirstLine(filename, firstLine);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string {
		var modeIds = this._registry.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public getLanguageIdentifier(modeId: string | LanguageId): LanguageIdentifier {
		return this._registry.getLanguageIdentifier(modeId);
	}

	public getConfigurationFiles(modeId: string): string[] {
		return this._registry.getConfigurationFiles(modeId);
	}

	// --- instantiation

	public lookup(commaSeparatedMimetypesOrCommaSeparatedIds: string): IModeLookupResult[] {
		var r: IModeLookupResult[] = [];
		var modeIds = this._registry.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		for (var i = 0; i < modeIds.length; i++) {
			var modeId = modeIds[i];

			r.push({
				modeId: modeId,
				isInstantiated: this._instantiatedModes.hasOwnProperty(modeId)
			});
		}

		return r;
	}

	public getMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): IMode {
		var modeIds = this._registry.extractModeIds(commaSeparatedMimetypesOrCommaSeparatedIds);

		var isPlainText = false;
		for (var i = 0; i < modeIds.length; i++) {
			if (this._instantiatedModes.hasOwnProperty(modeIds[i])) {
				return this._instantiatedModes[modeIds[i]];
			}
			isPlainText = isPlainText || (modeIds[i] === 'plaintext');
		}

		if (isPlainText) {
			// Try to do it synchronously
			var r: IMode = null;
			this.getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds).then((mode) => {
				r = mode;
			}).done(null, onUnexpectedError);
			return r;
		}
		return undefined;
	}

	public getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): TPromise<IMode> {
		return this._onReady().then(() => {
			var modeId = this.getModeId(commaSeparatedMimetypesOrCommaSeparatedIds);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	public getOrCreateModeByLanguageName(languageName: string): TPromise<IMode> {
		return this._onReady().then(() => {
			var modeId = this._getModeIdByLanguageName(languageName);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	private _getModeIdByLanguageName(languageName: string): string {
		var modeIds = this._registry.getModeIdsFromLanguageName(languageName);

		if (modeIds.length > 0) {
			return modeIds[0];
		}

		return null;
	}

	public getOrCreateModeByFilenameOrFirstLine(filename: string, firstLine?: string): TPromise<IMode> {
		return this._onReady().then(() => {
			var modeId = this.getModeIdByFilenameOrFirstLine(filename, firstLine);
			// Fall back to plain text if no mode was found
			return this._getOrCreateMode(modeId || 'plaintext');
		});
	}

	private _getOrCreateMode(modeId: string): IMode {
		if (!this._instantiatedModes.hasOwnProperty(modeId)) {
			let languageIdentifier = this.getLanguageIdentifier(modeId);
			this._instantiatedModes[modeId] = new FrankensteinMode(languageIdentifier);

			this._onDidCreateMode.fire(this._instantiatedModes[modeId]);
		}
		return this._instantiatedModes[modeId];
	}
}
