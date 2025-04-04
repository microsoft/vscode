/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AutorunObserver } from '../autorun.js';
import { IObservable, TransactionImpl } from '../base.js';
import type { Derived } from '../derived.js';

let globalObservableLogger: IObservableLogger | undefined;

export function addLogger(logger: IObservableLogger): void {
	if (!globalObservableLogger) {
		globalObservableLogger = logger;
	} else if (globalObservableLogger instanceof ComposedLogger) {
		globalObservableLogger.loggers.push(logger);
	} else {
		globalObservableLogger = new ComposedLogger([globalObservableLogger, logger]);
	}
}

export function getLogger(): IObservableLogger | undefined {
	return globalObservableLogger;
}

let globalObservableLoggerFn: ((obs: IObservable<any>) => void) | undefined = undefined;
export function setLogObservableFn(fn: (obs: IObservable<any>) => void): void {
	globalObservableLoggerFn = fn;
}

export function logObservable(obs: IObservable<any>): void {
	if (globalObservableLoggerFn) {
		globalObservableLoggerFn(obs);
	}
}

export interface IChangeInformation {
	oldValue: unknown;
	newValue: unknown;
	change: unknown;
	didChange: boolean;
	hadValue: boolean;
}

export interface IObservableLogger {
	handleObservableCreated(observable: IObservable<any>): void;
	handleOnListenerCountChanged(observable: IObservable<any>, newCount: number): void;

	handleObservableUpdated(observable: IObservable<any>, info: IChangeInformation): void;

	handleAutorunCreated(autorun: AutorunObserver): void;
	handleAutorunDisposed(autorun: AutorunObserver): void;
	handleAutorunDependencyChanged(autorun: AutorunObserver, observable: IObservable<any>, change: unknown): void;
	handleAutorunStarted(autorun: AutorunObserver): void;
	handleAutorunFinished(autorun: AutorunObserver): void;

	handleDerivedDependencyChanged(derived: Derived<any>, observable: IObservable<any>, change: unknown): void;
	handleDerivedCleared(observable: Derived<any>): void;

	handleBeginTransaction(transaction: TransactionImpl): void;
	handleEndTransaction(transaction: TransactionImpl): void;
}

class ComposedLogger implements IObservableLogger {
	constructor(
		public readonly loggers: IObservableLogger[],
	) { }

	handleObservableCreated(observable: IObservable<any>): void {
		for (const logger of this.loggers) {
			logger.handleObservableCreated(observable);
		}
	}
	handleOnListenerCountChanged(observable: IObservable<any>, newCount: number): void {
		for (const logger of this.loggers) {
			logger.handleOnListenerCountChanged(observable, newCount);
		}
	}
	handleObservableUpdated(observable: IObservable<any>, info: IChangeInformation): void {
		for (const logger of this.loggers) {
			logger.handleObservableUpdated(observable, info);
		}
	}
	handleAutorunCreated(autorun: AutorunObserver): void {
		for (const logger of this.loggers) {
			logger.handleAutorunCreated(autorun);
		}
	}
	handleAutorunDisposed(autorun: AutorunObserver): void {
		for (const logger of this.loggers) {
			logger.handleAutorunDisposed(autorun);
		}
	}
	handleAutorunDependencyChanged(autorun: AutorunObserver, observable: IObservable<any>, change: unknown): void {
		for (const logger of this.loggers) {
			logger.handleAutorunDependencyChanged(autorun, observable, change);
		}
	}
	handleAutorunStarted(autorun: AutorunObserver): void {
		for (const logger of this.loggers) {
			logger.handleAutorunStarted(autorun);
		}
	}
	handleAutorunFinished(autorun: AutorunObserver): void {
		for (const logger of this.loggers) {
			logger.handleAutorunFinished(autorun);
		}
	}
	handleDerivedDependencyChanged(derived: Derived<any>, observable: IObservable<any>, change: unknown): void {
		for (const logger of this.loggers) {
			logger.handleDerivedDependencyChanged(derived, observable, change);
		}
	}
	handleDerivedCleared(observable: Derived<any>): void {
		for (const logger of this.loggers) {
			logger.handleDerivedCleared(observable);
		}
	}
	handleBeginTransaction(transaction: TransactionImpl): void {
		for (const logger of this.loggers) {
			logger.handleBeginTransaction(transaction);
		}
	}
	handleEndTransaction(transaction: TransactionImpl): void {
		for (const logger of this.loggers) {
			logger.handleEndTransaction(transaction);
		}
	}
}
