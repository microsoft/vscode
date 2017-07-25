/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';

export class TextResourceConfigurationService extends Disposable implements ITextResourceConfigurationService {

	public _serviceBrand: any;

	private readonly _onDidUpdateConfiguration: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidUpdateConfiguration: Event<void> = this._onDidUpdateConfiguration.event;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
	) {
		super();
		this._register(this.configurationService.onDidUpdateConfiguration(() => this._onDidUpdateConfiguration.fire()));
	}

	getConfiguration<T>(resource: URI, section?: string): T
	getConfiguration<T>(resource: URI, at?: IPosition, section?: string): T
	getConfiguration<T>(resource: URI, arg2?: any, arg3?: any): T {
		const position: IPosition = Position.isIPosition(arg2) ? arg2 : null;
		const section: string = position ? (typeof arg3 === 'string' ? arg3 : void 0) : (typeof arg2 === 'string' ? arg2 : void 0);
		const language = resource ? this.getLanguage(resource, position) : void 0;
		return this.configurationService.getConfiguration<T>(section, { resource, overrideIdentifier: language });
	}

	private getLanguage(resource: URI, position: IPosition): string {
		const model = this.modelService.getModel(resource);
		if (model) {
			return position ? this.modeService.getLanguageIdentifier(model.getLanguageIdAtPosition(position.lineNumber, position.column)).language : model.getLanguageIdentifier().language;
		}
		return this.modeService.getModeIdByFilenameOrFirstLine(resource.fsPath);
	}
}