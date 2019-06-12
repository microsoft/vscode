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
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class TextResourceConfigurationService extends Disposable implements ITextResourceConfigurationService {

	public _serviceBrand: any;

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