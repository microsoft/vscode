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
import { equals } from '../../../../base/common/arrays.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchAssignmentService } from '../../assignment/common/assignmentService.js';
import { IWorkbenchExtensionEnablementService } from '../../extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
export const IInlineCompletionsUnificationService = createDecorator('inlineCompletionsUnificationService');
const CODE_UNIFICATION_PREFIX = 'cmp-cht-';
const EXTENSION_UNIFICATION_PREFIX = 'cmp-ext-';
const CODE_UNIFICATION_FF = 'inlineCompletionsUnificationCode';
const MODEL_UNIFICATION_FF = 'inlineCompletionsUnificationModel';
export const isRunningUnificationExperiment = new RawContextKey('isRunningUnificationExperiment', false);
const ExtensionUnificationSetting = 'chat.extensionUnification.enabled';
let InlineCompletionsUnificationImpl = class InlineCompletionsUnificationImpl extends Disposable {
    get state() { return this._state; }
    constructor(_assignmentService, _contextKeyService, _configurationService, _extensionEnablementService, _extensionManagementService, _extensionService, productService) {
        super();
        this._assignmentService = _assignmentService;
        this._contextKeyService = _contextKeyService;
        this._configurationService = _configurationService;
        this._extensionEnablementService = _extensionEnablementService;
        this._extensionManagementService = _extensionManagementService;
        this._extensionService = _extensionService;
        this._state = new InlineCompletionsUnificationState(false, false, false, []);
        this._onDidStateChange = this._register(new Emitter());
        this.onDidStateChange = this._onDidStateChange.event;
        this._onDidChangeExtensionUnificationState = this._register(new Emitter());
        this._onDidChangeExtensionUnificationSetting = this._register(new Emitter());
        this._completionsExtensionId = productService.defaultChatAgent?.extensionId.toLowerCase();
        this._chatExtensionId = productService.defaultChatAgent?.chatExtensionId.toLowerCase();
        const relevantExtensions = [this._completionsExtensionId, this._chatExtensionId].filter((id) => !!id);
        this.isRunningUnificationExperiment = isRunningUnificationExperiment.bindTo(this._contextKeyService);
        this._assignmentService.addTelemetryAssignmentFilter({
            exclude: (assignment) => assignment.startsWith(EXTENSION_UNIFICATION_PREFIX) && this._state.extensionUnification !== this._configurationService.getValue(ExtensionUnificationSetting),
            onDidChange: Event.any(this._onDidChangeExtensionUnificationState.event, this._onDidChangeExtensionUnificationSetting.event)
        });
        this._register(this._extensionEnablementService.onEnablementChanged((extensions) => {
            if (extensions.some(ext => relevantExtensions.includes(ext.identifier.id.toLowerCase()))) {
                this._update();
            }
        }));
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ExtensionUnificationSetting)) {
                this._update();
                this._onDidChangeExtensionUnificationSetting.fire();
            }
        }));
        this._register(this._extensionService.onDidChangeExtensions(({ added }) => {
            if (added.some(ext => relevantExtensions.includes(ext.identifier.value.toLowerCase()))) {
                this._update();
            }
        }));
        this._register(this._assignmentService.onDidRefetchAssignments(() => this._update()));
        this._update();
    }
    async _update() {
        const [codeUnificationFF, modelUnificationFF, extensionUnificationEnabled] = await Promise.all([
            this._assignmentService.getTreatment(CODE_UNIFICATION_FF),
            this._assignmentService.getTreatment(MODEL_UNIFICATION_FF),
            this._isExtensionUnificationActive()
        ]);
        const extensionStatesMatchUnificationSetting = this._configurationService.getValue(ExtensionUnificationSetting) === extensionUnificationEnabled;
        // Intentionally read the current experiments after fetching the treatments
        const currentExperiments = await this._assignmentService.getCurrentExperiments();
        const newState = new InlineCompletionsUnificationState(codeUnificationFF === true, modelUnificationFF === true, extensionUnificationEnabled, currentExperiments?.filter(exp => exp.startsWith(CODE_UNIFICATION_PREFIX) || (extensionStatesMatchUnificationSetting && exp.startsWith(EXTENSION_UNIFICATION_PREFIX))) ?? []);
        if (this._state.equals(newState)) {
            return;
        }
        const previousState = this._state;
        this._state = newState;
        this.isRunningUnificationExperiment.set(this._state.codeUnification || this._state.modelUnification || this._state.extensionUnification);
        this._onDidStateChange.fire();
        if (previousState.extensionUnification !== this._state.extensionUnification) {
            this._onDidChangeExtensionUnificationState.fire();
        }
    }
    async _isExtensionUnificationActive() {
        if (!this._configurationService.getValue(ExtensionUnificationSetting)) {
            return false;
        }
        if (!this._completionsExtensionId || !this._chatExtensionId) {
            return false;
        }
        const [completionsExtension, chatExtension, installedExtensions] = await Promise.all([
            this._extensionService.getExtension(this._completionsExtensionId),
            this._extensionService.getExtension(this._chatExtensionId),
            this._extensionManagementService.getInstalled(1 /* ExtensionType.User */)
        ]);
        if (!chatExtension || completionsExtension) {
            return false;
        }
        // Extension might be installed on remote and local
        const completionExtensionInstalled = installedExtensions.filter(ext => ext.identifier.id.toLowerCase() === this._completionsExtensionId);
        if (completionExtensionInstalled.length === 0) {
            return true;
        }
        const completionsExtensionDisabledByUnification = completionExtensionInstalled.some(ext => this._extensionEnablementService.getEnablementState(ext) === 9 /* EnablementState.DisabledByUnification */);
        return !!chatExtension && completionsExtensionDisabledByUnification;
    }
};
InlineCompletionsUnificationImpl = __decorate([
    __param(0, IWorkbenchAssignmentService),
    __param(1, IContextKeyService),
    __param(2, IConfigurationService),
    __param(3, IWorkbenchExtensionEnablementService),
    __param(4, IExtensionManagementService),
    __param(5, IExtensionService),
    __param(6, IProductService)
], InlineCompletionsUnificationImpl);
export { InlineCompletionsUnificationImpl };
class InlineCompletionsUnificationState {
    constructor(codeUnification, modelUnification, extensionUnification, expAssignments) {
        this.codeUnification = codeUnification;
        this.modelUnification = modelUnification;
        this.extensionUnification = extensionUnification;
        this.expAssignments = expAssignments;
    }
    equals(other) {
        return this.codeUnification === other.codeUnification
            && this.modelUnification === other.modelUnification
            && this.extensionUnification === other.extensionUnification
            && equals(this.expAssignments, other.expAssignments);
    }
}
registerSingleton(IInlineCompletionsUnificationService, InlineCompletionsUnificationImpl, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9pbmxpbmVDb21wbGV0aW9ucy9jb21tb24vaW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRXJILE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNGLE9BQU8sRUFBbUIsb0NBQW9DLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoSSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUUxRSxNQUFNLENBQUMsTUFBTSxvQ0FBb0MsR0FBRyxlQUFlLENBQXVDLHFDQUFxQyxDQUFDLENBQUM7QUFnQmpKLE1BQU0sdUJBQXVCLEdBQUcsVUFBVSxDQUFDO0FBQzND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