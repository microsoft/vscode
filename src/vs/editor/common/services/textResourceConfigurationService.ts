/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IPosition, Position } from '../core/position.js';
import { ILanguageService } from '../languages/language.js';
import { IModelService } from './model.js';
import { ITextResourceConfigurationService, ITextResourceConfigurationChangeEvent } from './textResourceConfiguration.js';
import { IConfigurationService, ConfigurationTarget, IConfigurationValue, IConfigurationChangeEvent } from '../../../platform/configuration/common/configuration.js';

export class TextResourceConfigurationService extends Disposable implements ITextResourceConfigurationService {

	public _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration: Emitter<ITextResourceConfigurationChangeEvent> = this._register(new Emitter<ITextResourceConfigurationChangeEvent>());
	public readonly onDidChangeConfiguration: Event<ITextResourceConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => this._onDidChangeConfiguration.fire(this.toResourceConfigurationChangeEvent(e))));
	}

	getValue<T>(resource: URI | undefined, section?: string): T;
	getValue<T>(resource: URI | undefined, at?: IPosition, section?: string): T;
	getValue<T>(resource: URI | undefined, arg2?: unknown, arg3?: unknown): T {
		if (typeof arg3 === 'string') {
			return this._getValue(resource, Position.isIPosition(arg2) ? arg2 : null, arg3);
		}
		return this._getValue(resource, null, typeof arg2 === 'string' ? arg2 : undefined);
	}

	updateValue(resource: URI | undefined, key: string, value: unknown, configurationTarget?: ConfigurationTarget): Promise<void> {
		const language = resource ? this.getLanguage(resource, null) : null;
		const configurationValue = this.configurationService.inspect(key, { resource, overrideIdentifier: language });
		if (configurationTarget === undefined) {
			configurationTarget = this.deriveConfigurationTarget(configurationValue, language);
		}
		const overrideIdentifier = language && configurationValue.overrideIdentifiers?.includes(language) ? language : undefined;
		return this.configurationService.updateValue(key, value, { resource, overrideIdentifier }, configurationTarget);
	}

	private deriveConfigurationTarget(configurationValue: IConfigurationValue<unknown>, language: string | null): ConfigurationTarget {
		if (language) {
			if (configurationValue.memory?.override !== undefined) {
				return ConfigurationTarget.MEMORY;
			}
			if (configurationValue.workspaceFolder?.override !== undefined) {
				return ConfigurationTarget.WORKSPACE_FOLDER;
			}
			if (configurationValue.workspace?.override !== undefined) {
				return ConfigurationTarget.WORKSPACE;
			}
			if (configurationValue.userRemote?.override !== undefined) {
				return ConfigurationTarget.USER_REMOTE;
			}
			if (configurationValue.userLocal?.override !== undefined) {
				return ConfigurationTarget.USER_LOCAL;
			}
		}
		if (configurationValue.memory?.value !== undefined) {
			return ConfigurationTarget.MEMORY;
		}
		if (configurationValue.workspaceFolder?.value !== undefined) {
			return ConfigurationTarget.WORKSPACE_FOLDER;
		}
		if (configurationValue.workspace?.value !== undefined) {
			return ConfigurationTarget.WORKSPACE;
		}
		if (configurationValue.userRemote?.value !== undefined) {
			return ConfigurationTarget.USER_REMOTE;
		}
		return ConfigurationTarget.USER_LOCAL;
	}

	private _getValue<T>(resource: URI | undefined, position: IPosition | null, section: string | undefined): T {
		const language = resource ? this.getLanguage(resource, position) : undefined;
		if (typeof section === 'undefined') {
			return this.configurationService.getValue<T>({ resource, overrideIdentifier: language });
		}
		return this.configurationService.getValue<T>(section, { resource, overrideIdentifier: language });
	}

	inspect<T>(resource: URI | undefined, position: IPosition | null, section: string): IConfigurationValue<Readonly<T>> {
		const language = resource ? this.getLanguage(resource, position) : undefined;
		return this.configurationService.inspect<T>(section, { resource, overrideIdentifier: language });
	}

	private getLanguage(resource: URI, position: IPosition | null): string | null {
		const model = this.modelService.getModel(resource);
		if (model) {
			return position ? model.getLanguageIdAtPosition(position.lineNumber, position.column) : model.getLanguageId();
		}
		return this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
	}

	private toResourceConfigurationChangeEvent(configurationChangeEvent: IConfigurationChangeEvent): ITextResourceConfigurationChangeEvent {
		return {
			affectedKeys: configurationChangeEvent.affectedKeys,
			affectsConfiguration: (resource: URI | undefined, configuration: string) => {
				const overrideIdentifier = resource ? this.getLanguage(resource, null) : undefined;
				if (configurationChangeEvent.affectsConfiguration(configuration, { resource, overrideIdentifier })) {
					return true;
				}
				if (overrideIdentifier) {
					//TODO@sandy081 workaround for https://github.com/microsoft/vscode/issues/240410
					return configurationChangeEvent.affectedKeys.has(`[${overrideIdentifier}]`);
				}
				return false;
			}
		};
	}
}
