/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { serializeMapAsObject, storedObservable } from 'vs/platform/observable/common/platformObservableUtils';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IEvaluate, IExpression } from 'vs/workbench/contrib/debug/common/debug';
import { Breakpoint, DataBreakpoint, ExceptionBreakpoint, Expression, FunctionBreakpoint } from 'vs/workbench/contrib/debug/common/debugModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

const DEBUG_BREAKPOINTS_KEY = 'debug.breakpoint';
const DEBUG_FUNCTION_BREAKPOINTS_KEY = 'debug.functionbreakpoint';
const DEBUG_DATA_BREAKPOINTS_KEY = 'debug.databreakpoint';
const DEBUG_EXCEPTION_BREAKPOINTS_KEY = 'debug.exceptionbreakpoint';
const DEBUG_WATCH_EXPRESSIONS_KEY = 'debug.watchexpressions';
const DEBUG_CHOSEN_ENVIRONMENTS_KEY = 'debug.chosenenvironment';
const DEBUG_UX_STATE_KEY = 'debug.uxstate';

export class DebugStorage extends Disposable {
	public chosenEnvironments = this._register(createChosenEnvironmentsObservable(this.storageService)).object;
	public breakpoints = this._register(createBreakpointsObservable(this.storageService, this.textFileService, this.uriIdentityService, this.logService)).object;
	public functionBreakpoints = this._register(createFunctionBreakpointsObservable(this.storageService)).object;
	public exceptionBreakpoints = this._register(createExceptionBreakpointsObservable(this.storageService)).object;
	public dataBreakpoints = this._register(createDataBreakpointsObservable(this.storageService)).object;
	public watchExpressions = this._register(createWatchExpressionObservable(this.storageService)).object;
	public debugUX = this._register(createDebugUXObservable(this.storageService)).object;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}
}

const createWatchExpressionObservable = (s: IStorageService) => storedObservable<readonly Expression[]>(s, {
	key: DEBUG_WATCH_EXPRESSIONS_KEY,
	scope: StorageScope.WORKSPACE,
	target: StorageTarget.MACHINE,
	defaultValue: [],
	isMutableData: true,
	serialization: {
		fromString: loadWatchExpressions,
		toString: storeWatchExpressions,
	},
});
const createBreakpointsObservable = (s: IStorageService, textFileService: ITextFileService, uriIdentityService: IUriIdentityService, logService: ILogService) => storedObservable<readonly Breakpoint[]>(s, {
	key: DEBUG_BREAKPOINTS_KEY,
	scope: StorageScope.WORKSPACE,
	target: StorageTarget.MACHINE,
	defaultValue: [],
	isMutableData: true,
	serialization: {
		fromString: (s) => loadBreakpoints(s, textFileService, uriIdentityService, logService),
		toString: JSON.stringify,
	},
});

const createFunctionBreakpointsObservable = (s: IStorageService) => storedObservable<readonly FunctionBreakpoint[]>(s, {
	key: DEBUG_FUNCTION_BREAKPOINTS_KEY,
	scope: StorageScope.WORKSPACE,
	target: StorageTarget.MACHINE,
	defaultValue: [],
	isMutableData: true,
	serialization: {
		fromString: loadFunctionBreakpoints,
		toString: JSON.stringify,
	},
});

const createExceptionBreakpointsObservable = (s: IStorageService) => storedObservable<readonly ExceptionBreakpoint[]>(s, {
	key: DEBUG_EXCEPTION_BREAKPOINTS_KEY,
	scope: StorageScope.WORKSPACE,
	target: StorageTarget.MACHINE,
	defaultValue: [],
	isMutableData: true,
	serialization: {
		fromString: loadExceptionBreakpoints,
		toString: JSON.stringify,
	},
});

const createDataBreakpointsObservable = (s: IStorageService) => storedObservable<readonly DataBreakpoint[]>(s, {
	key: DEBUG_DATA_BREAKPOINTS_KEY,
	scope: StorageScope.WORKSPACE,
	target: StorageTarget.MACHINE,
	defaultValue: [],
	isMutableData: true,
	serialization: {
		fromString: loadDataBreakpoints,
		toString: JSON.stringify,
	},
});

const createChosenEnvironmentsObservable = (s: IStorageService) => storedObservable<ReadonlyMap<string, string>>(s, {
	key: DEBUG_CHOSEN_ENVIRONMENTS_KEY,
	scope: StorageScope.WORKSPACE,
	target: StorageTarget.MACHINE,
	defaultValue: new Map(),
	serialization: serializeMapAsObject,
});

const createDebugUXObservable = (s: IStorageService) => storedObservable<'simple' | 'default'>(s, {
	key: DEBUG_UX_STATE_KEY,
	scope: StorageScope.WORKSPACE,
	target: StorageTarget.MACHINE,
	defaultValue: 'default',
	serialization: { fromString: a => a as 'simple' | 'default', toString: a => a },
});

function loadBreakpoints(input: string, textFileService: ITextFileService, uriIdentityService: IUriIdentityService, logService: ILogService): Breakpoint[] {
	let result: Breakpoint[] | undefined;
	try {
		result = JSON.parse(input).map((breakpoint: ReturnType<Breakpoint['toJSON']>) => {
			breakpoint.uri = URI.revive(breakpoint.uri);
			return new Breakpoint(breakpoint, textFileService, uriIdentityService, logService, breakpoint.id);
		});
	} catch (e) { }

	return result || [];
}

function loadFunctionBreakpoints(input: string): FunctionBreakpoint[] {
	let result: FunctionBreakpoint[] | undefined;
	try {
		result = JSON.parse(input).map((fb: ReturnType<FunctionBreakpoint['toJSON']>) => {
			return new FunctionBreakpoint(fb, fb.id);
		});
	} catch (e) { }

	return result || [];
}

function loadExceptionBreakpoints(input: string): ExceptionBreakpoint[] {
	let result: ExceptionBreakpoint[] | undefined;
	try {
		result = JSON.parse(input).map((exBreakpoint: ReturnType<ExceptionBreakpoint['toJSON']>) => {
			return new ExceptionBreakpoint(exBreakpoint, exBreakpoint.id);
		});
	} catch (e) { }

	return result || [];
}

function loadDataBreakpoints(input: string): DataBreakpoint[] {
	let result: DataBreakpoint[] | undefined;
	try {
		result = JSON.parse(input).map((dbp: ReturnType<DataBreakpoint['toJSON']>) => {
			return new DataBreakpoint(dbp, dbp.id);
		});
	} catch (e) { }

	return result || [];
}

function loadWatchExpressions(input: string): Expression[] {
	let result: Expression[] | undefined;
	try {
		result = JSON.parse(input).map((watchStoredData: { name: string; id: string }) => {
			return new Expression(watchStoredData.name, watchStoredData.id);
		});
	} catch (e) { }

	return result || [];
}

function storeWatchExpressions(watchExpressions: readonly (IExpression & IEvaluate)[]): string {
	return JSON.stringify(watchExpressions.map(we => ({ name: we.name, id: we.getId() })));
}
