/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri';
import { IModelService } from '../../../../editor/common/services/model';
import { ModelService } from '../../../../editor/common/services/modelService';
import { ITextResourcePropertiesService } from '../../../../editor/common/services/textResourceConfiguration';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo';
import { IPathService } from '../../path/common/pathService';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';

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
