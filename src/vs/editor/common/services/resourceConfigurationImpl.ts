/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IConfigurationChangeEvent, IConfigurationService, ConfigurationTarget, IConfigurationTargetValue } from 'vs/platform/configuration/common/configuration';

export class TextResourceConfigurationService extends Disposable implements ITextResourceConfigurationService {

	public _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	public readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => this._onDidChangeConfiguration.fire(e)));
	}

	getValue<T>(resource: URI, section?: string): T;
	getValue<T>(resource: URI, at?: IPosition, section?: string): T;
	getValue<T>(resource: URI, arg2?: any, arg3?: any): T {
		if (typeof arg3 === 'string') {
			return this._getValue(resource, Position.isIPosition(arg2) ? arg2 : null, arg3);
		}
		return this._getValue(resource, null, typeof arg2 === 'string' ? arg2 : undefined);
	}

	updateValue<T>(resource: URI, key: string, value: any, configurationTarget?: ConfigurationTarget): Promise<void> {
		const language = this.getLanguage(resource, null);

		if (!language) {
			if (configurationTarget !== undefined) {
				return this.configurationService.updateValue(key, value, configurationTarget);
			}
			return this.configurationService.updateValue(key, value);
		}

		const configurationValue = this.configurationService.inspectValue(key);

		if (configurationTarget !== undefined) {
			switch (configurationTarget) {
				case ConfigurationTarget.MEMORY:
					return this.configurationService.updateValue(key, value, configurationTarget);
				case ConfigurationTarget.WORKSPACE_FOLDER:
					return this._updateValue(key, value, configurationTarget, configurationValue.getWorkspaceFolderValue(resource), resource, language);
				case ConfigurationTarget.WORKSPACE:
					return this._updateValue(key, value, configurationTarget, configurationValue.workspace, resource, language);
				case ConfigurationTarget.USER_REMOTE:
					return this._updateValue(key, value, configurationTarget, configurationValue.userRemote, resource, language);
				case ConfigurationTarget.USER_LOCAL:
				case ConfigurationTarget.USER:
					return this._updateValue(key, value, configurationTarget, configurationValue.userLocal, resource, language);
			}
		}

		if (configurationValue.workspaceFolders) {
			const workspaceFolderValue = configurationValue.getWorkspaceFolderValue(resource);
			if (workspaceFolderValue) {
				return this._updateValue(key, value, ConfigurationTarget.WORKSPACE_FOLDER, workspaceFolderValue, resource, language);
			}
		}

		if (configurationValue.workspace) {
			return this._updateValue(key, value, ConfigurationTarget.WORKSPACE, configurationValue.workspace, resource, language);
		}

		if (configurationValue.userRemote) {
			return this._updateValue(key, value, ConfigurationTarget.USER_REMOTE, configurationValue.userRemote, resource, language);
		}

		return this._updateValue(key, value, ConfigurationTarget.USER_LOCAL, configurationValue.userLocal, resource, language);
	}

	private _updateValue(key: string, value: any, configurationTarget: ConfigurationTarget, configurationTargetValue: IConfigurationTargetValue<any> | undefined, resource: URI, language: string): Promise<void> {
		if (!configurationTargetValue) {
			return this.configurationService.updateValue(key, value, configurationTarget);
		}
		if (configurationTargetValue.overrides.some(({ overrideIdentifier }) => overrideIdentifier === language)) {
			return this.configurationService.updateValue(key, value, { resource, overrideIdentifier: language }, configurationTarget);
		} else {
			return this.configurationService.updateValue(key, value, { resource }, configurationTarget);
		}
	}

	private _getValue<T>(resource: URI, position: IPosition | null, section: string | undefined): T {
		const language = resource ? this.getLanguage(resource, position) : undefined;
		if (typeof section === 'undefined') {
			return this.configurationService.getValue<T>({ resource, overrideIdentifier: language });
		}
		return this.configurationService.getValue<T>(section, { resource, overrideIdentifier: language });
	}

	private getLanguage(resource: URI, position: IPosition | null): string | null {
		const model = this.modelService.getModel(resource);
		if (model) {
			return position ? this.modeService.getLanguageIdentifier(model.getLanguageIdAtPosition(position.lineNumber, position.column))!.language : model.getLanguageIdentifier().language;
		}
		return this.modeService.getModeIdByFilepathOrFirstLine(resource);

	}
}
