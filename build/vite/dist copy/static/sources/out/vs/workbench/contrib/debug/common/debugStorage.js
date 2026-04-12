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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { Breakpoint, DataBreakpoint, ExceptionBreakpoint, Expression, FunctionBreakpoint } from './debugModel.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { mapValues } from '../../../../base/common/objects.js';
const DEBUG_BREAKPOINTS_KEY = 'debug.breakpoint';
const DEBUG_FUNCTION_BREAKPOINTS_KEY = 'debug.functionbreakpoint';
const DEBUG_DATA_BREAKPOINTS_KEY = 'debug.databreakpoint';
const DEBUG_EXCEPTION_BREAKPOINTS_KEY = 'debug.exceptionbreakpoint';
const DEBUG_WATCH_EXPRESSIONS_KEY = 'debug.watchexpressions';
const DEBUG_CHOSEN_ENVIRONMENTS_KEY = 'debug.chosenenvironment';
const DEBUG_UX_STATE_KEY = 'debug.uxstate';
let DebugStorage = class DebugStorage extends Disposable {
    constructor(storageService, textFileService, uriIdentityService, logService) {
        super();
        this.storageService = storageService;
        this.textFileService = textFileService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this.breakpoints = observableValue(this, this.loadBreakpoints());
        this.functionBreakpoints = observableValue(this, this.loadFunctionBreakpoints());
        this.exceptionBreakpoints = observableValue(this, this.loadExceptionBreakpoints());
        this.dataBreakpoints = observableValue(this, this.loadDataBreakpoints());
        this.watchExpressions = observableValue(this, this.loadWatchExpressions());
        this._register(storageService.onDidChangeValue(1 /* StorageScope.WORKSPACE */, undefined, this._store)(e => {
            if (e.external) {
                switch (e.key) {
                    case DEBUG_BREAKPOINTS_KEY:
                        return this.breakpoints.set(this.loadBreakpoints(), undefined);
                    case DEBUG_FUNCTION_BREAKPOINTS_KEY:
                        return this.functionBreakpoints.set(this.loadFunctionBreakpoints(), undefined);
                    case DEBUG_EXCEPTION_BREAKPOINTS_KEY:
                        return this.exceptionBreakpoints.set(this.loadExceptionBreakpoints(), undefined);
                    case DEBUG_DATA_BREAKPOINTS_KEY:
                        return this.dataBreakpoints.set(this.loadDataBreakpoints(), undefined);
                    case DEBUG_WATCH_EXPRESSIONS_KEY:
                        return this.watchExpressions.set(this.loadWatchExpressions(), undefined);
                }
            }
        }));
    }
    loadDebugUxState() {
        return this.storageService.get(DEBUG_UX_STATE_KEY, 1 /* StorageScope.WORKSPACE */, 'default');
    }
    storeDebugUxState(value) {
        this.storageService.store(DEBUG_UX_STATE_KEY, value, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    loadBreakpoints() {
        let result;
        try {
            result = JSON.parse(this.storageService.get(DEBUG_BREAKPOINTS_KEY, 1 /* StorageScope.WORKSPACE */, '[]')).map((breakpoint) => {
                breakpoint.uri = URI.revive(breakpoint.uri);
                return new Breakpoint(breakpoint, this.textFileService, this.uriIdentityService, this.logService, breakpoint.id);
            });
        }
        catch (e) { }
        return result || [];
    }
    loadFunctionBreakpoints() {
        let result;
        try {
            result = JSON.parse(this.storageService.get(DEBUG_FUNCTION_BREAKPOINTS_KEY, 1 /* StorageScope.WORKSPACE */, '[]')).map((fb) => {
                return new FunctionBreakpoint(fb, fb.id);
            });
        }
        catch (e) { }
        return result || [];
    }
    loadExceptionBreakpoints() {
        let result;
        try {
            result = JSON.parse(this.storageService.get(DEBUG_EXCEPTION_BREAKPOINTS_KEY, 1 /* StorageScope.WORKSPACE */, '[]')).map((exBreakpoint) => {
                return new ExceptionBreakpoint(exBreakpoint, exBreakpoint.id);
            });
        }
        catch (e) { }
        return result || [];
    }
    loadDataBreakpoints() {
        let result;
        try {
            result = JSON.parse(this.storageService.get(DEBUG_DATA_BREAKPOINTS_KEY, 1 /* StorageScope.WORKSPACE */, '[]')).map((dbp) => {
                return new DataBreakpoint(dbp, dbp.id);
            });
        }
        catch (e) { }
        return result || [];
    }
    loadWatchExpressions() {
        let result;
        try {
            result = JSON.parse(this.storageService.get(DEBUG_WATCH_EXPRESSIONS_KEY, 1 /* StorageScope.WORKSPACE */, '[]')).map((watchStoredData) => {
                return new Expression(watchStoredData.name, watchStoredData.id);
            });
        }
        catch (e) { }
        return result || [];
    }
    loadChosenEnvironments() {
        const obj = JSON.parse(this.storageService.get(DEBUG_CHOSEN_ENVIRONMENTS_KEY, 1 /* StorageScope.WORKSPACE */, '{}'));
        // back compat from when this was a string map:
        return mapValues(obj, (value) => typeof value === 'string' ? { type: value } : value);
    }
    storeChosenEnvironments(environments) {
        this.storageService.store(DEBUG_CHOSEN_ENVIRONMENTS_KEY, JSON.stringify(environments), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    storeWatchExpressions(watchExpressions) {
        if (watchExpressions.length) {
            this.storageService.store(DEBUG_WATCH_EXPRESSIONS_KEY, JSON.stringify(watchExpressions.map(we => ({ name: we.name, id: we.getId() }))), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(DEBUG_WATCH_EXPRESSIONS_KEY, 1 /* StorageScope.WORKSPACE */);
        }
    }
    storeBreakpoints(debugModel) {
        const breakpoints = debugModel.getBreakpoints();
        if (breakpoints.length) {
            this.storageService.store(DEBUG_BREAKPOINTS_KEY, JSON.stringify(breakpoints), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(DEBUG_BREAKPOINTS_KEY, 1 /* StorageScope.WORKSPACE */);
        }
        const functionBreakpoints = debugModel.getFunctionBreakpoints();
        if (functionBreakpoints.length) {
            this.storageService.store(DEBUG_FUNCTION_BREAKPOINTS_KEY, JSON.stringify(functionBreakpoints), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(DEBUG_FUNCTION_BREAKPOINTS_KEY, 1 /* StorageScope.WORKSPACE */);
        }
        const dataBreakpoints = debugModel.getDataBreakpoints().filter(dbp => dbp.canPersist);
        if (dataBreakpoints.length) {
            this.storageService.store(DEBUG_DATA_BREAKPOINTS_KEY, JSON.stringify(dataBreakpoints), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(DEBUG_DATA_BREAKPOINTS_KEY, 1 /* StorageScope.WORKSPACE */);
        }
        const exceptionBreakpoints = debugModel.getExceptionBreakpoints();
        if (exceptionBreakpoints.length) {
            this.storageService.store(DEBUG_EXCEPTION_BREAKPOINTS_KEY, JSON.stringify(exceptionBreakpoints), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(DEBUG_EXCEPTION_BREAKPOINTS_KEY, 1 /* StorageScope.WORKSPACE */);
        }
    }
};
DebugStorage = __decorate([
    __param(0, IStorageService),
    __param(1, ITextFileService),
    __param(2, IUriIdentityService),
    __param(3, ILogService)
], DebugStorage);
export { DebugStorage };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdTdG9yYWdlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnU3RvcmFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUF1QixlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDOUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFN0YsT0FBTyxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsbUJBQW1CLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDbEgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRS9ELE1BQU0scUJBQXFCLEdBQUcsa0JBQWtCLENBQUM7QUFDakQsTUFBTSw4QkFBOEIsR0FBRywwQkFBMEIsQ0FBQztBQUNsRSxNQUFNLDBCQUEwQixHQUFHLHNCQUFzQixDQUFDO0FBQzFELE1BQU0sK0JBQStCLEdBQUcsMkJBQTJCLENBQUM7QUFDcEUsTUFBTSwyQkFBMkIsR0FBRyx3QkFBd0IsQ0FBQztBQUM3RCxNQUFNLDZCQUE2QixHQUFHLHlCQUF5QixDQUFDO0FBQ2hFLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFDO0FBT3BDLElBQU0sWUFBWSxH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