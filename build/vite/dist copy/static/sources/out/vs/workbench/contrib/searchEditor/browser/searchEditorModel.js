/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { parseSavedSearchEditor, parseSerializedSearchEditor } from './searchEditorSerialization.js';
import { IWorkingCopyBackupService } from '../../../services/workingCopy/common/workingCopyBackup.js';
import { SearchEditorWorkingCopyTypeId } from './constants.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { createTextBufferFactoryFromStream } from '../../../../editor/common/model/textModel.js';
import { Emitter } from '../../../../base/common/event.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { SEARCH_RESULT_LANGUAGE_ID } from '../../../services/search/common/search.js';
export class SearchConfigurationModel {
    constructor(config) {
        this.config = config;
        this._onConfigDidUpdate = new Emitter();
        this.onConfigDidUpdate = this._onConfigDidUpdate.event;
    }
    updateConfig(config) { this.config = config; this._onConfigDidUpdate.fire(config); }
}
export class SearchEditorModel {
    constructor(resource) {
        this.resource = resource;
    }
    async resolve() {
        return assertReturnsDefined(searchEditorModelFactory.models.get(this.resource)).resolve();
    }
}
class SearchEditorModelFactory {
    constructor() {
        this.models = new ResourceMap();
    }
    initializeModelFromExistingModel(accessor, resource, config) {
        if (this.models.has(resource)) {
            throw Error('Unable to contruct model for resource that already exists');
        }
        const languageService = accessor.get(ILanguageService);
        const modelService = accessor.get(IModelService);
        const instantiationService = accessor.get(IInstantiationService);
        const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
        let ongoingResolve;
        this.models.set(resource, {
            resolve: () => {
                if (!ongoingResolve) {
                    ongoingResolve = (async () => {
                        const backup = await this.tryFetchModelFromBackupService(resource, languageService, modelService, workingCopyBackupService, instantiationService);
                        if (backup) {
                            return backup;
                        }
                        return Promise.resolve({
                            resultsModel: modelService.getModel(resource) ?? modelService.createModel('', languageService.createById(SEARCH_RESULT_LANGUAGE_ID), resource),
                            configurationModel: new SearchConfigurationModel(config)
                        });
                    })();
                }
                return ongoingResolve;
            }
        });
    }
    initializeModelFromRawData(accessor, resource, config, contents) {
        if (this.models.has(resource)) {
            throw Error('Unable to contruct model for resource that already exists');
        }
        const languageService = accessor.get(ILanguageService);
        const modelService = accessor.get(IModelService);
        const instantiationService = accessor.get(IInstantiationService);
        const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
        let ongoingResolve;
        this.models.set(resource, {
            resolve: () => {
                if (!ongoingResolve) {
                    ongoingResolve = (async () => {
                        const backup = await this.tryFetchModelFromBackupService(resource, languageService, modelService, workingCopyBackupService, instantiationService);
                        if (backup) {
                            return backup;
                        }
                        return Promise.resolve({
                            resultsModel: modelService.createModel(contents ?? '', languageService.createById(SEARCH_RESULT_LANGUAGE_ID), resource),
                            configurationModel: new SearchConfigurationModel(config)
                        });
                    })();
                }
                return ongoingResolve;
            }
        });
    }
    initializeModelFromExistingFile(accessor, resource, existingFile) {
        if (this.models.has(resource)) {
            throw Error('Unable to contruct model for resource that already exists');
        }
        const languageService = accessor.get(ILanguageService);
        const modelService = accessor.get(IModelService);
        const instantiationService = accessor.get(IInstantiationService);
        const workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
        let ongoingResolve;
        this.models.set(resource, {
            resolve: async () => {
                if (!ongoingResolve) {
                    ongoingResolve = (async () => {
                        const backup = await this.tryFetchModelFromBackupService(resource, languageService, modelService, workingCopyBackupService, instantiationService);
                        if (backup) {
                            return backup;
                        }
                        const { text, config } = await instantiationService.invokeFunction(parseSavedSearchEditor, existingFile);
                        return ({
                            resultsModel: modelService.createModel(text ?? '', languageService.createById(SEARCH_RESULT_LANGUAGE_ID), resource),
                            configurationModel: new SearchConfigurationModel(config)
                        });
                    })();
                }
                return ongoingResolve;
            }
        });
    }
    async tryFetchModelFromBackupService(resource, languageService, modelService, workingCopyBackupService, instantiationService) {
        const backup = await workingCopyBackupService.resolve({ resource, typeId: SearchEditorWorkingCopyTypeId });
        let model = modelService.getModel(resource);
        if (!model && backup) {
            const factory = await createTextBufferFactoryFromStream(backup.value);
            model = modelService.createModel(factory, languageService.createById(SEARCH_RESULT_LANGUAGE_ID), resource);
        }
        if (model) {
            const existingFile = model.getValue();
            const { text, config } = parseSerializedSearchEditor(existingFile);
            modelService.destroyModel(resource);
            return ({
                resultsModel: modelService.createModel(text ?? '', languageService.createById(SEARCH_RESULT_LANGUAGE_ID), resource),
                configurationModel: new SearchConfigurationModel(config)
            });
        }
        else {
            return undefined;
        }
    }
}
export const searchEditorModelFactory = new SearchEditorModelFactory();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRWRpdG9yTW9kZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2hFZGl0b3IvYnJvd3Nlci9zZWFyY2hFZGl0b3JNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxzQkFBc0IsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3RHLE9BQU8sRUFBdUIsNkJBQTZCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNwRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzdELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBSXRGLE1BQU0sT0FBTyx3QkFBd0I7SUFJcEMsWUFBbUIsTUFBcUM7UUFBckMsV0FBTSxHQUFOLE1BQU0sQ0FBK0I7UUFIaEQsdUJBQWtCLEdBQUcsSUFBSSxPQUFPLEVBQXVCLENBQUM7UUFDaEQsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztJQUVOLENBQUM7SUFDN0QsWUFBWSxDQUFDLE1B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