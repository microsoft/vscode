/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class WorkbenchModelService extends ModelService {
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ITextResourcePropertiesService resourcePropertiesService: ITextResourcePropertiesService,
		@IUndoRedoService undoRedoService: IUndoRedoService,
		@IPathService private readonly _pathService: IPathService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(configurationService, resourcePropertiesService, undoRedoService, instantiationService);
	}

	protected override _schemaShouldMaintainUndoRedoElements(resource: URI) {
		return (
			super._schemaShouldMaintainUndoRedoElements(resource)
			|| resource.scheme === this._pathService.defaultUriScheme
		);
	}
}

registerSingleton(IModelService, WorkbenchModelService, InstantiationType.Delayed);
