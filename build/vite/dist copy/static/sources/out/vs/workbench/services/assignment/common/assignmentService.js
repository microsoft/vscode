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
import { localize } from '../../../../nls.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Memento } from '../../../common/memento.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ASSIGNMENT_REFETCH_INTERVAL, ASSIGNMENT_STORAGE_KEY, AssignmentFilterProvider, TargetPopulation } from '../../../../platform/assignment/common/assignment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { importAMDNodeModule } from '../../../../amdX.js';
import { timeout } from '../../../../base/common/async.js';
import { CopilotAssignmentFilterProvider } from './assignmentFilters.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { experimentsEnabled } from '../../telemetry/common/workbenchTelemetryUtils.js';
export const IWorkbenchAssignmentService = createDecorator('assignmentService');
class MementoKeyValueStorage {
    constructor(memento) {
        this.memento = memento;
        this.mementoObj = memento.getMemento(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    async getValue(key, defaultValue) {
        const value = await this.mementoObj[key];
        return value || defaultValue;
    }
    setValue(key, value) {
        this.mementoObj[key] = value;
        this.memento.saveMemento();
    }
}
class WorkbenchAssignmentServiceTelemetry extends Disposable {
    get assignmentContext() {
        return this._lastAssignmentContext?.split(';');
    }
    constructor(telemetryService, productService) {
        super();
        this.telemetryService = telemetryService;
        this.productService = productService;
        this._onDidUpdateAssignmentContext = this._register(new Emitter());
        this.onDidUpdateAssignmentContext = this._onDidUpdateAssignmentContext.event;
        this._assignmentFilters = [];
        this._assignmentFilterDisposables = this._register(new DisposableStore());
    }
    _filterAssignmentContext(assignmentContext) {
        const assignments = assignmentContext.split(';');
        const filteredAssignments = assignments.filter(assignment => {
            for (const filter of this._assignmentFilters) {
                if (filter.exclude(assignment)) {
                    return false;
                }
            }
            return true;
        });
        return filteredAssignments.join(';');
    }
    _setAssignmentContext(value) {
        const filteredValue = this._filterAssignmentContext(value);
        this._lastAssignmentContext = filteredValue;
        this._onDidUpdateAssignmentContext.fire();
        if (this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
            this.telemetryService.setExperimentProperty(this.productService.tasConfig.assignmentContextTelemetryPropertyName, filteredValue);
        }
    }
    addAssignmentFilter(filter) {
        this._assignmentFilters.push(filter);
        this._assignmentFilterDisposables.add(filter.onDidChange(() => {
            if (this._previousAssignmentContext) {
                this._setAssignmentContext(this._previousAssignmentContext);
            }
        }));
        if (this._previousAssignmentContext) {
            this._setAssignmentContext(this._previousAssignmentContext);
        }
    }
    // __GDPR__COMMON__ "abexp.assignmentcontext" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
    setSharedProperty(name, value) {
        if (name === this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
            this._previousAssignmentContext = value;
            return this._setAssignmentContext(value);
        }
        this.telemetryService.setExperimentProperty(name, value);
    }
    postEvent(eventName, props) {
        const data = {};
        for (const [key, value] of props.entries()) {
            data[key] = value;
        }
        /* __GDPR__
            "query-expfeature" : {
                "owner": "sbatten",
                "comment": "Logs queries to the experiment service by feature for metric calculations",
                "ABExp.queriedFeature": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The experimental feature being queried" }
            }
        */
        this.telemetryService.publicLog(eventName, data);
    }
}
let WorkbenchAssignmentService = class WorkbenchAssignmentService extends Disposable {
    constructor(telemetryService, storageService, configurationService, productService, environmentService, instantiationService) {
        super();
        this.telemetryService = telemetryService;
        this.configurationService = configurationService;
        this.productService = productService;
        this.instantiationService = instantiationService;
        this.tasSetupDisposables = new DisposableStore();
        this.networkInitialized = false;
        this._onDidRefetchAssignments = this._register(new Emitter());
        this.onDidRefetchAssignments = this._onDidRefetchAssignments.event;
        this.experimentsEnabled = experimentsEnabled(configurationService, productService, environmentService);
        if (this.experimentsEnabled) {
            this.tasClient = this.setupTASClient();
        }
        this.telemetry = this._register(new WorkbenchAssignmentServiceTelemetry(telemetryService, productService));
        this._register(this.telemetry.onDidUpdateAssignmentContext(() => this._onDidRefetchAssignments.fire()));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('experiments.override')) {
                this._onDidRefetchAssignments.fire();
            }
        }));
        this.keyValueStorage = new MementoKeyValueStorage(new Memento('experiment.service.memento', storageService));
        // For development purposes, configure the delay until tas local tas treatment ovverrides are available
        const overrideDelaySetting = configurationService.getValue('experiments.overrideDelay');
        const overrideDelay = typeof overrideDelaySetting === 'number' ? overrideDelaySetting : 0;
        this.overrideInitDelay = timeout(overrideDelay);
    }
    async getTreatment(name) {
        const result = await this.doGetTreatment(name);
        this.telemetryService.publicLog2('tasClientReadTreatmentComplete', {
            treatmentName: name,
            treatmentValue: JSON.stringify(result)
        });
        return result;
    }
    async doGetTreatment(name) {
        await this.overrideInitDelay; // For development purposes, allow overriding tas assignments to test variants locally.
        const override = this.configurationService.getValue(`experiments.override.${name}`);
        if (override !== undefined) {
            return override;
        }
        if (!this.tasClient) {
            return undefined;
        }
        if (!this.experimentsEnabled) {
            return undefined;
        }
        let result;
        const client = await this.tasClient;
        // The TAS client is initialized but we need to check if the initial fetch has completed yet
        // If it is complete, return a cached value for the treatment
        // If not, use the async call with `checkCache: true`. This will allow the module to return a cached value if it is present.
        // Otherwise it will await the initial fetch to return the most up to date value.
        if (this.networkInitialized) {
            result = client.getTreatmentVariable('vscode', name);
        }
        else {
            result = await client.getTreatmentVariableAsync('vscode', name, true);
        }
        result = client.getTreatmentVariable('vscode', name);
        return result;
    }
    async setupTASClient() {
        this.tasSetupDisposables.clear();
        const targetPopulation = this.productService.quality === 'stable' ?
            TargetPopulation.Public : (this.productService.quality === 'exploration' ?
            TargetPopulation.Exploration : TargetPopulation.Insiders);
        const filterProvider = new AssignmentFilterProvider(this.productService.version, this.productService.nameLong, this.telemetryService.machineId, this.telemetryService.devDeviceId, targetPopulation, this.productService.date ?? '');
        const extensionsFilterProvider = this.instantiationService.createInstance(CopilotAssignmentFilterProvider);
        this.tasSetupDisposables.add(extensionsFilterProvider);
        this.tasSetupDisposables.add(extensionsFilterProvider.onDidChangeFilters(() => this.refetchAssignments()));
        const tasConfig = this.productService.tasConfig;
        const tasClient = new (await importAMDNodeModule('tas-client', 'dist/tas-client.min.js')).ExperimentationService({
            filterProviders: [filterProvider, extensionsFilterProvider],
            telemetry: this.telemetry,
            storageKey: ASSIGNMENT_STORAGE_KEY,
            keyValueStorage: this.keyValueStorage,
            assignmentContextTelemetryPropertyName: tasConfig.assignmentContextTelemetryPropertyName,
            telemetryEventName: tasConfig.telemetryEventName,
            endpoint: tasConfig.endpoint,
            refetchInterval: ASSIGNMENT_REFETCH_INTERVAL,
        });
        await tasClient.initializePromise;
        tasClient.initialFetch.then(() => {
            this.networkInitialized = true;
        });
        return tasClient;
    }
    async refetchAssignments() {
        if (!this.tasClient) {
            return; // Setup has not started, assignments will use latest filters
        }
        // Await the client to be setup and the initial fetch to complete
        const tasClient = await this.tasClient;
        await tasClient.initialFetch;
        // Refresh the assignments
        await tasClient.getTreatmentVariableAsync('vscode', 'refresh', false);
    }
    async getCurrentExperiments() {
        if (!this.tasClient) {
            return undefined;
        }
        if (!this.experimentsEnabled) {
            return undefined;
        }
        await this.tasClient;
        return this.telemetry.assignmentContext;
    }
    addTelemetryAssignmentFilter(filter) {
        this.telemetry.addAssignmentFilter(filter);
    }
};
WorkbenchAssignmentService = __decorate([
    __param(0, ITelemetryService),
    __param(1, IStorageService),
    __param(2, IConfigurationService),
    __param(3, IProductService),
    __param(4, IWorkbenchEnvironmentService),
    __param(5, IInstantiationService)
], WorkbenchAssignmentService);
export { WorkbenchAssignmentService };
registerSingleton(IWorkbenchAssignmentService, WorkbenchAssignmentService, 1 /* InstantiationType.Delayed */);
const registry = Registry.as(ConfigurationExtensions.Configuration);
registry.registerConfiguration({
    ...workbenchConfigurationNodeBase,
    'properties': {
        'workbench.enableExperiments': {
            'type': 'boolean',
            'description': localize('workbench.enableExperiments', "Fetches experiments to run from a Microsoft online service."),
            'default': true,
            'scope': 1 /* ConfigurationScope.APPLICATION */,
            'restricted': true,
            'tags': ['usesOnlineServices']
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzaWdubWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVwSCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDckQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUU5RyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBc0IsZ0JBQWdCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzTCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEYsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQXNCLE1BQU0sb0VBQW9FLENBQUM7QUFDdkssT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDOUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQ3pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBT3ZGLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLGVBQWUsQ0FBOEIsbUJBQW1CLENBQUMsQ0FBQztBQU83RyxNQUFNLHNCQUFzQjtJQUkzQixZQUE2QixPQUF5QztRQUF6QyxZQUFPLEdBQVAsT0FBTyxDQUFrQztRQUNyRSxJQUFJLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxVQUFVLGtFQUFpRCxDQUFDO0lBQ3ZGLENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUSxDQUFJLEdBQVcsRUFBRSxZQUE0QjtRQUMxRCxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFrQixDQUFDO1FBRTFELE9BQU8sS0FBSyxJQUFJLFlBQVksQ0FBQztJQUM5QixDQUFDO0lBRUQsUUFBUSxDQUFJLEdBQVcsRUFBRSxLQUFRO1FBQ2hDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQzdCLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDNUIsQ0FBQztDQUNEO0FBRUQsTUFBTSxtQ0FBb0MsU0FBUSxVQUFVO0lBTzNELElBQUksaUJBQWlCO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBS0QsWUFDa0IsZ0JBQW1DLEVBQ25DLGNBQStCO1FBRWhELEtBQUssRUFBRSxDQUFDO1FBSFMscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUNuQyxtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFkaEMsa0NBQTZCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDNUUsaUNBQTRCLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQztRQVF6RSx1QkFBa0IsR0FBd0IsRUFBRSxDQUFDO1FBQzdDLGlDQUE0QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO0lBTzdFLENBQUM7SUFFTyx3QkFBd0IsQ0FBQyxpQkFBeUI7UUFDekQsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRWpELE1BQU0sbUJBQW1CLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUMzRCxLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUM5QyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztvQkFDaEMsT0FBTyxLQUFLLENBQUM7Z0JBQ2QsQ0FBQztZQUNGLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVPLHFCQUFxQixDQUFDLEtBQWE7UUFDMUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNELElBQUksQ0FBQyxzQkFBc0IsR0FBRyxhQUFhLENBQUM7UUFDNUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLElBQUksRUFBRSxDQUFDO1FBRTFDLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsc0NBQXNDLEVBQUUsQ0FBQztZQUMzRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsc0NBQXNDLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDbEksQ0FBQztJQUNGLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxNQUF5QjtRQUM1QyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUU7WUFDN0QsSUFBSSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQzdELENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztZQUNyQyxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDN0QsQ0FBQztJQUNGLENBQUM7SUFFRCxtSEFBbUg7SUFDbkgsaUJBQWlCLENBQUMsSUFBWSxFQUFFLEtBQWE7UUFDNUMsSUFBSSxJQUFJLEtBQUssSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUUsc0NBQXNDLEVBQUUsQ0FBQztZQUNwRixJQUFJLENBQUMsMEJBQTBCLEdBQUcsS0FBSyxDQUFDO1lBQ3hDLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzFDLENBQUM7UUFFRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFRCxTQUFTLENBQUMsU0FBaUIsRUFBRSxLQUEwQjtRQUN0RCxNQUFNLElBQUksR0FBbUIsRUFBRSxDQUFDO1FBQ2hDLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztZQUM1QyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ25CLENBQUM7UUFFRDs7Ozs7O1VBTUU7UUFDRixJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNsRCxDQUFDO0NBQ0Q7QUFFTSxJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEyQixTQUFRLFVBQVU7SUFrQnpELFlBQ29CLGdCQUFvRCxFQUN0RCxjQUErQixFQUN6QixvQkFBNEQsRUFDbEUsY0FBZ0QsRUFDbkMsa0JBQWdELEVBQ3ZELG9CQUE0RDtRQUVuRixLQUFLLEVBQUUsQ0FBQztRQVA0QixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBRS9CLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFDakQsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBRXpCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFuQm5FLHdCQUFtQixHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFFckQsdUJBQWtCLEdBQUcsS0FBSyxDQUFDO1FBUWxCLDZCQUF3QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ2hFLDRCQUF1QixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUM7UUFZN0UsSUFBSSxDQUFDLGtCQUFrQixHQUFHLGtCQUFrQixDQUFDLG9CQUFvQixFQUFFLGNBQWMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBRXZHLElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDeEMsQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLG1DQUFtQyxDQUFDLGdCQUFnQixFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFDM0csSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLDRCQUE0QixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDckUsSUFBSSxDQUFDLENBQUMsb0JBQW9CLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDO2dCQUNwRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDdEMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksc0JBQXNCLENBQUMsSUFBSSxPQUFPLENBQTBCLDRCQUE0QixFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFFdEksdUdBQXVHO1FBQ3ZHLE1BQU0sb0JBQW9CLEdBQUcsb0JBQW9CLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFDeEYsTUFBTSxhQUFhLEdBQUcsT0FBTyxvQkFBb0IsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUYsSUFBSSxDQUFDLGlCQUFpQixHQUFHLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBc0MsSUFBWTtRQUNuRSxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUksSUFBSSxDQUFDLENBQUM7UUFjbEQsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsQ0FBbUUsZ0NBQWdDLEVBQUU7WUFDcEksYUFBYSxFQUFFLElBQUk7WUFDbkIsY0FBYyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO1NBQ3RDLENBQUMsQ0FBQztRQUVILE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVPLEtBQUssQ0FBQyxjQUFjLENBQXNDLElBQVk7UUFDN0UsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyx1RkFBdUY7UUFFckgsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBSSx3QkFBd0IsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUN2RixJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM1QixPQUFPLFFBQVEsQ0FBQztRQUNqQixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNyQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzlCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLE1BQXFCLENBQUM7UUFDMUIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDO1FBRXBDLDRGQUE0RjtRQUM1Riw2REFBNkQ7UUFDN0QsNEhBQTRIO1FBQzVILGlGQUFpRjtRQUNqRixJQUFJLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzdCLE1BQU0sR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUksUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pELENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLHlCQUF5QixDQUFJLFFBQVEsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDMUUsQ0FBQztRQUVELE1BQU0sR0FBRyxNQUFNLENBQUMsb0JBQW9CLENBQUksUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVPLEtBQUssQ0FBQyxjQUFjO1FBQzNCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVqQyxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDO1lBQ2xFLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sS0FBSyxhQUFhLENBQUMsQ0FBQztZQUN6RSxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTVELE1BQU0sY0FBYyxHQUFHLElBQUksd0JBQXdCLENBQ2xELElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUMzQixJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFDNUIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsRUFDL0IsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFDakMsZ0JBQWdCLEVBQ2hCLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FDOUIsQ0FBQztRQUVGLE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQzNHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUzRyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVUsQ0FBQztRQUNqRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxtQkFBbUIsQ0FBOEIsWUFBWSxFQUFFLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQztZQUM3SSxlQUFlLEVBQUUsQ0FBQyxjQUFjLEVBQUUsd0JBQXdCLENBQUM7WUFDM0QsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ3pCLFVBQVUsRUFBRSxzQkFBc0I7WUFDbEMsZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlO1lBQ3JDLHNDQUFzQyxFQUFFLFNBQVMsQ0FBQyxzQ0FBc0M7WUFDeEYsa0JBQWtCLEVBQUUsU0FBUyxDQUFDLGtCQUFrQjtZQUNoRCxRQUFRLEVBQUUsU0FBUyxDQUFDLFFBQVE7WUFDNUIsZUFBZSxFQUFFLDJCQUEyQjtTQUM1QyxDQUFDLENBQUM7UUFFSCxNQUFNLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQztRQUNsQyxTQUFTLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDaEMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztRQUNoQyxDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxLQUFLLENBQUMsa0JBQWtCO1FBQy9CLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDckIsT0FBTyxDQUFDLDZEQUE2RDtRQUN0RSxDQUFDO1FBRUQsaUVBQWlFO1FBQ2pFLE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUN2QyxNQUFNLFNBQVMsQ0FBQyxZQUFZLENBQUM7UUFFN0IsMEJBQTBCO1FBQzFCLE1BQU0sU0FBUyxDQUFDLHlCQUF5QixDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELEtBQUssQ0FBQyxxQkFBcUI7UUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNyQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzlCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUM7UUFFckIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLGlCQUFpQixDQUFDO0lBQ3pDLENBQUM7SUFFRCw0QkFBNEIsQ0FBQyxNQUF5QjtRQUNyRCxJQUFJLENBQUMsU0FBUyxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzVDLENBQUM7Q0FDRCxDQUFBO0FBaExZLDBCQUEwQjtJQW1CcEMsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLDRCQUE0QixDQUFBO0lBQzVCLFdBQUEscUJBQXFCLENBQUE7R0F4QlgsMEJBQTBCLENBZ0x0Qzs7QUFFRCxpQkFBaUIsQ0FBQywyQkFBMkIsRUFBRSwwQkFBMEIsb0NBQTRCLENBQUM7QUFFdEcsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDNUYsUUFBUSxDQUFDLHFCQUFxQixDQUFDO0lBQzlCLEdBQUcsOEJBQThCO0lBQ2pDLFlBQVksRUFBRTtRQUNiLDZCQUE2QixFQUFFO1lBQzlCLE1BQU0sRUFBRSxTQUFTO1lBQ2pCLGFBQWEsRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsNkRBQTZELENBQUM7WUFDckgsU0FBUyxFQUFFLElBQUk7WUFDZixPQUFPLHdDQUFnQztZQUN2QyxZQUFZLEVBQUUsSUFBSTtZQUNsQixNQUFNLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQztTQUM5QjtLQUNEO0NBQ0QsQ0FBQyxDQUFDIn0=