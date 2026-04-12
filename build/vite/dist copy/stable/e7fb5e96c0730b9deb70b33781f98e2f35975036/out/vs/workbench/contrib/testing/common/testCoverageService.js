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
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue, transaction } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { bindContextKey, observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ITestResultService } from './testResultService.js';
import { TestingContextKeys } from './testingContextKeys.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
export const ITestCoverageService = createDecorator('testCoverageService');
let TestCoverageService = class TestCoverageService extends Disposable {
    constructor(contextKeyService, resultService, configService, viewsService) {
        super();
        this.viewsService = viewsService;
        this.lastOpenCts = this._register(new MutableDisposable());
        this.selected = observableValue('testCoverage', undefined);
        this.filterToTest = observableValue('filterToTest', undefined);
        this.showInline = observableValue('inlineCoverage', false);
        const toolbarConfig = observableConfigValue("testing.coverageToolbarEnabled" /* TestingConfigKeys.CoverageToolbarEnabled */, true, configService);
        this._register(bindContextKey(TestingContextKeys.coverageToolbarEnabled, contextKeyService, reader => toolbarConfig.read(reader)));
        this._register(bindContextKey(TestingContextKeys.inlineCoverageEnabled, contextKeyService, reader => this.showInline.read(reader)));
        this._register(bindContextKey(TestingContextKeys.isTestCoverageOpen, contextKeyService, reader => !!this.selected.read(reader)));
        this._register(bindContextKey(TestingContextKeys.hasPerTestCoverage, contextKeyService, reader => !Iterable.isEmpty(this.selected.read(reader)?.allPerTestIDs())));
        this._register(bindContextKey(TestingContextKeys.isCoverageFilteredToTest, contextKeyService, reader => !!this.filterToTest.read(reader)));
        this._register(resultService.onResultsChanged(evt => {
            if ('completed' in evt) {
                const coverage = evt.completed.tasks.find(t => t.coverage.get());
                if (coverage) {
                    this.openCoverage(coverage, false);
                }
                else {
                    this.closeCoverage();
                }
            }
            else if ('removed' in evt && this.selected.get()) {
                const taskId = this.selected.get()?.fromTaskId;
                if (evt.removed.some(e => e.tasks.some(t => t.id === taskId))) {
                    this.closeCoverage();
                }
            }
        }));
    }
    /** @inheritdoc */
    async openCoverage(task, focus = true) {
        this.lastOpenCts.value?.cancel();
        const cts = this.lastOpenCts.value = new CancellationTokenSource();
        const coverage = task.coverage.get();
        if (!coverage) {
            return;
        }
        transaction(tx => {
            // todo: may want to preserve this if coverage for that test in the new run?
            this.filterToTest.set(undefined, tx);
            this.selected.set(coverage, tx);
        });
        if (focus && !cts.token.isCancellationRequested) {
            this.viewsService.openView("workbench.view.testCoverage" /* Testing.CoverageViewId */, true);
        }
    }
    /** @inheritdoc */
    closeCoverage() {
        this.selected.set(undefined, undefined);
    }
};
TestCoverageService = __decorate([
    __param(0, IContextKeyService),
    __param(1, ITestResultService),
    __param(2, IConfigurationService),
    __param(3, IViewsService)
], TestCoverageService);
export { TestCoverageService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdENvdmVyYWdlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RDb3ZlcmFnZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQW9DLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN2SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBTTFILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzVELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzdELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUUvRSxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLENBQXVCLHFCQUFxQixDQUFDLENBQUM7QUFnQzFGLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQVFsRCxZQUNxQixpQkFBcUMsRUFDckMsYUFBaUMsRUFDOUIsYUFBb0MsRUFDNUMsWUFBNEM7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