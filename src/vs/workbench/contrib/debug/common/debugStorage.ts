/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IDebugModel, IEvaluate, IExpression } from './debug.js';
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

export interface IChosenEnvironment {
	type: string;
	dynamicLabel?: string;
}

export class DebugStorage extends Disposable {
	public readonly breakpoints = observableValue(this, this.loadBreakpoints());
	public readonly functionBreakpoints = observableValue(this, this.loadFunctionBreakpoints());
	public readonly exceptionBreakpoints = observableValue(this, this.loadExceptionBreakpoints());
	public readonly dataBreakpoints = observableValue(this, this.loadDataBreakpoints());
	public readonly watchExpressions = observableValue(this, this.loadWatchExpressions());

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._register(storageService.onDidChangeValue(StorageScope.WORKSPACE, undefined, this._store)(e => {
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

	loadDebugUxState(): 'simple' | 'default' {
		return this.storageService.get(DEBUG_UX_STATE_KEY, StorageScope.WORKSPACE, 'default') as 'simple' | 'default';
	}

	storeDebugUxState(value: 'simple' | 'default'): void {
		this.storageService.store(DEBUG_UX_STATE_KEY, value, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private loadBreakpoints(): Breakpoint[] {
		let result: Breakpoint[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((breakpoint: ReturnType<Breakpoint['toJSON']>) => {
				breakpoint.uri = URI.revive(breakpoint.uri);
				return new Breakpoint(breakpoint, this.textFileService, this.uriIdentityService, this.logService, breakpoint.id);
			});
		} catch (e) { }

		return result || [];
	}

	private loadFunctionBreakpoints(): FunctionBreakpoint[] {
		let result: FunctionBreakpoint[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_FUNCTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((fb: ReturnType<FunctionBreakpoint['toJSON']>) => {
				return new FunctionBreakpoint(fb, fb.id);
			});
		} catch (e) { }

		return result || [];
	}

	private loadExceptionBreakpoints(): ExceptionBreakpoint[] {
		let result: ExceptionBreakpoint[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((exBreakpoint: ReturnType<ExceptionBreakpoint['toJSON']>) => {
				return new ExceptionBreakpoint(exBreakpoint, exBreakpoint.id);
			});
		} catch (e) { }

		return result || [];
	}

	private loadDataBreakpoints(): DataBreakpoint[] {
		let result: DataBreakpoint[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_DATA_BREAKPOINTS_KEY, StorageScope.WORKSPACE, '[]')).map((dbp: ReturnType<DataBreakpoint['toJSON']>) => {
				return new DataBreakpoint(dbp, dbp.id);
			});
		} catch (e) { }

		return result || [];
	}

	private loadWatchExpressions(): Expression[] {
		let result: Expression[] | undefined;
		try {
			result = JSON.parse(this.storageService.get(DEBUG_WATCH_EXPRESSIONS_KEY, StorageScope.WORKSPACE, '[]')).map((watchStoredData: { name: string; id: string }) => {
				return new Expression(watchStoredData.name, watchStoredData.id);
			});
		} catch (e) { }

		return result || [];
	}

	loadChosenEnvironments(): Record<string, IChosenEnvironment> {
		const obj = JSON.parse(this.storageService.get(DEBUG_CHOSEN_ENVIRONMENTS_KEY, StorageScope.WORKSPACE, '{}'));
		// back compat from when this was a string map:
		return mapValues(obj, (value): IChosenEnvironment => typeof value === 'string' ? { type: value } : value);
	}

	storeChosenEnvironments(environments: Record<string, IChosenEnvironment>): void {
		this.storageService.store(DEBUG_CHOSEN_ENVIRONMENTS_KEY, JSON.stringify(environments), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	storeWatchExpressions(watchExpressions: (IExpression & IEvaluate)[]): void {
		if (watchExpressions.length) {
			this.storageService.store(DEBUG_WATCH_EXPRESSIONS_KEY, JSON.stringify(watchExpressions.map(we => ({ name: we.name, id: we.getId() }))), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(DEBUG_WATCH_EXPRESSIONS_KEY, StorageScope.WORKSPACE);
		}
	}

	storeBreakpoints(debugModel: IDebugModel): void {
		const breakpoints = debugModel.getBreakpoints();
		if (breakpoints.length) {
			this.storageService.store(DEBUG_BREAKPOINTS_KEY, JSON.stringify(breakpoints), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(DEBUG_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		const functionBreakpoints = debugModel.getFunctionBreakpoints();
		if (functionBreakpoints.length) {
			this.storageService.store(DEBUG_FUNCTION_BREAKPOINTS_KEY, JSON.stringify(functionBreakpoints), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(DEBUG_FUNCTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		const dataBreakpoints = debugModel.getDataBreakpoints().filter(dbp => dbp.canPersist);
		if (dataBreakpoints.length) {
			this.storageService.store(DEBUG_DATA_BREAKPOINTS_KEY, JSON.stringify(dataBreakpoints), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(DEBUG_DATA_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}

		const exceptionBreakpoints = debugModel.getExceptionBreakpoints();
		if (exceptionBreakpoints.length) {
			this.storageService.store(DEBUG_EXCEPTION_BREAKPOINTS_KEY, JSON.stringify(exceptionBreakpoints), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(DEBUG_EXCEPTION_BREAKPOINTS_KEY, StorageScope.WORKSPACE);
		}
	}
}
