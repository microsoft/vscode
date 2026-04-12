/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Position } from '../core/position.js';
import { ILanguageService } from '../languages/language.js';
import { IModelService } from './model.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
let TextResourceConfigurationService = class TextResourceConfigurationService extends Disposable {
    constructor(configurationService, modelService, languageService) {
        super();
        this.configurationService = configurationService;
        this.modelService = modelService;
        this.languageService = languageService;
        this._onDidChangeConfiguration = this._register(new Emitter());
        this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
        this._register(this.configurationService.onDidChangeConfiguration(e => this._onDidChangeConfiguration.fire(this.toResourceConfigurationChangeEvent(e))));
    }
    getValue(resource, arg2, arg3) {
        if (typeof arg3 === 'string') {
            return this._getValue(resource, Position.isIPosition(arg2) ? arg2 : null, arg3);
        }
        return this._getValue(resource, null, typeof arg2 === 'string' ? arg2 : undefined);
    }
    updateValue(resource, key, value, configurationTarget) {
        const language = resource ? this.getLanguage(resource, null) : null;
        const configurationValue = this.configurationService.inspect(key, { resource, overrideIdentifier: language });
        if (configurationTarget === undefined) {
            configurationTarget = this.deriveConfigurationTarget(configurationValue, language);
        }
        const overrideIdentifier = language && configurationValue.overrideIdentifiers?.includes(language) ? language : undefined;
        return this.configurationService.updateValue(key, value, { resource, overrideIdentifier }, configurationTarget);
    }
    deriveConfigurationTarget(configurationValue, language) {
        if (language) {
            if (configurationValue.memory?.override !== undefined) {
                return 8 /* ConfigurationTarget.MEMORY */;
            }
            if (configurationValue.workspaceFolder?.override !== undefined) {
                return 6 /* ConfigurationTarget.WORKSPACE_FOLDER */;
            }
            if (configurationValue.workspace?.override !== undefined) {
                return 5 /* ConfigurationTarget.WORKSPACE */;
            }
            if (configurationValue.userRemote?.override !== undefined) {
                return 4 /* ConfigurationTarget.USER_REMOTE */;
            }
            if (configurationValue.userLocal?.override !== undefined) {
                return 3 /* ConfigurationTarget.USER_LOCAL */;
            }
        }
        if (configurationValue.memory?.value !== undefined) {
            return 8 /* ConfigurationTarget.MEMORY */;
        }
        if (configurationValue.workspaceFolder?.value !== undefined) {
            return 6 /* ConfigurationTarget.WORKSPACE_FOLDER */;
        }
        if (configurationValue.workspace?.value !== undefined) {
            return 5 /* ConfigurationTarget.WORKSPACE */;
        }
        if (configurationValue.userRemote?.value !== undefined) {
            return 4 /* ConfigurationTarget.USER_REMOTE */;
        }
        return 3 /* ConfigurationTarget.USER_LOCAL */;
    }
    _getValue(resource, position, section) {
        const language = resource ? this.getLanguage(resource, position) : undefined;
        if (typeof section === 'undefined') {
            return this.configurationService.getValue({ resource, overrideIdentifier: language });
        }
        return this.configurationService.getValue(section, { resource, overrideIdentifier: language });
    }
    inspect(resource, position, section) {
        const language = resource ? this.getLanguage(resource, position) : undefined;
        return this.configurationService.inspect(section, { resource, overrideIdentifier: language });
    }
    getLanguage(resource, position) {
        const model = this.modelService.getModel(resource);
        if (model) {
            return position ? model.getLanguageIdAtPosition(position.lineNumber, position.column) : model.getLanguageId();
        }
        return this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
    }
    toResourceConfigurationChangeEvent(configurationChangeEvent) {
        return {
            affectedKeys: configurationChangeEvent.affectedKeys,
            affectsConfiguration: (resource, configuration) => {
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
};
TextResourceConfigurationService = __decorate([
    __param(0, IConfigurationService),
    __param(1, IModelService),
    __param(2, ILanguageService)
], TextResourceConfigurationService);
export { TextResourceConfigurationService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFL0QsT0FBTyxFQUFhLFFBQVEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzFELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzVELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFM0MsT0FBTyxFQUFFLHFCQUFxQixFQUF1RSxNQUFNLHlEQUF5RCxDQUFDO0FBRTlKLElBQU0sZ0NBQWdDLEdBQXRDLE1BQU0sZ0NBQWlDLFNBQVEsVUFBVTtJQU8vRCxZQUN3QixvQkFBNEQsRUFDcEUsWUFBNEMsRUFDekMsZUFBa0Q7UUFFcEUsS0FBSyxFQUFFLENBQUM7UUFKZ0MseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUNuRCxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUN4QixvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUFOcEQsOEJBQXlCLEdBQW1ELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXlDLENBQUMsQ0FBQztRQUNsSiw2QkFBd0IsR0FBaUQsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQztRQVE3SCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx5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