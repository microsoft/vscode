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
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { getTestingConfiguration } from '../common/configuration.js';
import { ITestCoverageService } from '../common/testCoverageService.js';
import { isFailedState } from '../common/testingStates.js';
import { ITestResultService } from '../common/testResultService.js';
import { ExplorerTestCoverageBars } from './testCoverageBars.js';
/** Workbench contribution that triggers updates in the TestingProgressUi service */
let TestingProgressTrigger = class TestingProgressTrigger extends Disposable {
    static { this.ID = 'workbench.contrib.testing.progressTrigger'; }
    constructor(resultService, testCoverageService, configurationService, viewsService) {
        super();
        this.configurationService = configurationService;
        this.viewsService = viewsService;
        this._register(resultService.onResultsChanged((e) => {
            if ('started' in e) {
                this.attachAutoOpenForNewResults(e.started);
            }
        }));
        const barContributionRegistration = autorun(reader => {
            const hasCoverage = !!testCoverageService.selected.read(reader);
            if (!hasCoverage) {
                return;
            }
            barContributionRegistration.dispose();
            ExplorerTestCoverageBars.register();
        });
        this._register(barContributionRegistration);
    }
    attachAutoOpenForNewResults(result) {
        if (result.request.preserveFocus === true) {
            return;
        }
        const cfg = getTestingConfiguration(this.configurationService, "testing.automaticallyOpenTestResults" /* TestingConfigKeys.OpenResults */);
        if (cfg === "neverOpen" /* AutoOpenTesting.NeverOpen */) {
            return;
        }
        if (cfg === "openExplorerOnTestStart" /* AutoOpenTesting.OpenExplorerOnTestStart */) {
            return this.openExplorerView();
        }
        if (cfg === "openOnTestStart" /* AutoOpenTesting.OpenOnTestStart */) {
            return this.openResultsView();
        }
        // open on failure
        const disposable = new DisposableStore();
        disposable.add(result.onComplete(() => disposable.dispose()));
        disposable.add(result.onChange(e => {
            if (e.reason === 1 /* TestResultItemChangeReason.OwnStateChange */ && isFailedState(e.item.ownComputedState)) {
                this.openResultsView();
                disposable.dispose();
            }
        }));
    }
    openExplorerView() {
        this.viewsService.openView("workbench.view.testing" /* Testing.ExplorerViewId */, false);
    }
    openResultsView() {
        this.viewsService.openView("workbench.panel.testResults.view" /* Testing.ResultsViewId */, false);
    }
};
TestingProgressTrigger = __decorate([
    __param(0, ITestResultService),
    __param(1, ITestCoverageService),
    __param(2, IConfigurationService),
    __param(3, IViewsService)
], TestingProgressTrigger);
export { TestingProgressTrigger };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ1Byb2dyZXNzVWlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9icm93c2VyL3Rlc3RpbmdQcm9ncmVzc1VpU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFtQix1QkFBdUIsRUFBcUIsTUFBTSw0QkFBNEIsQ0FBQztBQUV6RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFM0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakUsb0ZBQW9GO0FBQzdFLElBQU0sc0JBQXNCLEdBQTVCLE1BQU0sc0JBQXVCLFNBQVEsVUFBVTthQUM5QixPQUFFLEdBQUcsMkNBQTJDLEFBQTlDLENBQStDO0lBRXhFLFlBQ3FCLGFBQWlDLEVBQy9CLG1CQUF5QyxFQUN2QixvQkFBMkMsRUFDbkQsWUFBMkI7UUFFM0QsS0FBSyxFQUFFLENBQUM7UUFIZ0MseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUNuRCxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUkzRCxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEs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