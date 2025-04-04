/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AutorunObserver, AutorunState } from '../../autorun.js';
import { BaseObservable, IObservable, IObserver, ObservableValue, TransactionImpl } from '../../base.js';
import { Derived, DerivedState } from '../../derived.js';
import { IChangeInformation, IObservableLogger } from '../logging.js';
import { formatValue } from '../consoleObservableLogger.js';
import { ObsDebuggerApi, IObsDeclaration, ObsInstanceId, ObsStateUpdate, ITransactionState, ObserverInstanceState } from './debuggerApi.js';
import { registerDebugChannel } from './debuggerRpc.js';
import { deepAssign, deepAssignDeleteNulls, getFirstStackFrameOutsideOf, ILocation, Throttler } from './utils.js';
import { isDefined } from '../../../types.js';
import { FromEventObservable } from '../../utils.js';
import { BugIndicatingError, onUnexpectedError } from '../../../errors.js';

interface IInstanceInfo {
	declarationId: number;
	instanceId: number;
}

interface IObservableInfo extends IInstanceInfo {
	listenerCount: number;
	lastValue: string | undefined;
	updateCount: number;
	changedObservables: Set<IObservable<any>>;
}

interface IAutorunInfo extends IInstanceInfo {
	updateCount: number;
	changedObservables: Set<IObservable<any>>;
}

export class DevToolsLogger implements IObservableLogger {
	private static _instance: DevToolsLogger | undefined = undefined;
	public static getInstance(): DevToolsLogger {
		if (DevToolsLogger._instance === undefined) {
			DevToolsLogger._instance = new DevToolsLogger();
		}
		return DevToolsLogger._instance;
	}

	private _declarationId = 0;
	private _instanceId = 0;

	private readonly _declarations = new Map</* declarationId + type */string, IObsDeclaration>();
	private readonly _instanceInfos = new WeakMap<object, IObservableInfo | IAutorunInfo>();
	private readonly _aliveInstances = new Map<ObsInstanceId, IObservable<any> | AutorunObserver>();
	private readonly _activeTransactions = new Set<TransactionImpl>();

	private readonly _channel = registerDebugChannel<ObsDebuggerApi>('observableDevTools', () => {
		return {
			notifications: {
				setDeclarationIdFilter: declarationIds => {

				},
				logObservableValue: (observableId) => {
					console.log('logObservableValue', observableId);
				},
				flushUpdates: () => {
					this._flushUpdates();
				},
				resetUpdates: () => {
					this._pendingChanges = null;
					this._channel.api.notifications.handleChange(this._fullState, true);
				},
			},
			requests: {
				getDeclarations: () => {
					const result: Record<string, IObsDeclaration> = {};
					for (const decl of this._declarations.values()) {
						result[decl.id] = decl;
					}
					return { decls: result };
				},
				getSummarizedInstances: () => {
					return null!;
				},
				getObservableValueInfo: instanceId => {
					const obs = this._aliveInstances.get(instanceId) as BaseObservable<any>;
					return {
						observers: [...obs.debugGetObservers()].map(d => this._formatObserver(d)).filter(isDefined),
					};
				},
				getDerivedInfo: instanceId => {
					const d = this._aliveInstances.get(instanceId) as Derived<any>;
					return {
						dependencies: [...d.debugGetState().dependencies].map(d => this._formatObservable(d)).filter(isDefined),
						observers: [...d.debugGetObservers()].map(d => this._formatObserver(d)).filter(isDefined),
					};
				},
				getAutorunInfo: instanceId => {
					const obs = this._aliveInstances.get(instanceId) as AutorunObserver;
					return {
						dependencies: [...obs.debugGetState().dependencies].map(d => this._formatObservable(d)).filter(isDefined),
					};
				},
				getTransactionState: () => {
					return this.getTransactionState();
				},
				setValue: (instanceId, jsonValue) => {
					const obs = this._aliveInstances.get(instanceId) as BaseObservable<any>;

					if (obs instanceof Derived) {
						obs.debugSetValue(jsonValue);
					} else if (obs instanceof ObservableValue) {
						obs.debugSetValue(jsonValue);
					} else if (obs instanceof FromEventObservable) {
						obs.debugSetValue(jsonValue);
					} else {
						throw new BugIndicatingError('Observable is not supported');
					}

					const observers = [...obs.debugGetObservers()];
					for (const d of observers) {
						d.beginUpdate(obs);
					}
					for (const d of observers) {
						d.handleChange(obs, undefined);
					}
					for (const d of observers) {
						d.endUpdate(obs);
					}
				},
				getValue: instanceId => {
					const obs = this._aliveInstances.get(instanceId) as BaseObservable<any>;
					if (obs instanceof Derived) {
						return formatValue(obs.debugGetState().value, 200);
					} else if (obs instanceof ObservableValue) {
						return formatValue(obs.debugGetState().value, 200);
					}

					return undefined;
				}
			}
		};
	});

	private getTransactionState(): ITransactionState | undefined {
		const affected: ObserverInstanceState[] = [];
		const txs = [...this._activeTransactions];
		if (txs.length === 0) {
			return undefined;
		}
		const observerQueue = txs.flatMap(t => t.debugGetUpdatingObservers() ?? []).map(o => o.observer);
		const processedObservers = new Set<IObserver>();
		while (observerQueue.length > 0) {
			const observer = observerQueue.shift()!;
			if (processedObservers.has(observer)) {
				continue;
			}
			processedObservers.add(observer);

			const state = this._getInfo(observer, d => {
				if (!processedObservers.has(d)) {
					observerQueue.push(d);
				}
			});

			if (state) {
				affected.push(state);
			}
		}

		return { names: txs.map(t => t.getDebugName() ?? 'tx'), affected };
	}

	private _getObservableInfo(observable: IObservable<any>): IObservableInfo | undefined {
		const info = this._instanceInfos.get(observable);
		if (!info) {
			onUnexpectedError(new BugIndicatingError('No info found'));
			return undefined;
		}
		return info as IObservableInfo;
	}

	private _getAutorunInfo(autorun: AutorunObserver): IAutorunInfo | undefined {
		const info = this._instanceInfos.get(autorun);
		if (!info) {
			onUnexpectedError(new BugIndicatingError('No info found'));
			return undefined;
		}
		return info as IAutorunInfo;
	}

	private _getInfo(observer: IObserver, queue: (observer: IObserver) => void): ObserverInstanceState | undefined {
		if (observer instanceof Derived) {
			const observersToUpdate = [...observer.debugGetObservers()];
			for (const o of observersToUpdate) {
				queue(o);
			}

			const info = this._getObservableInfo(observer);
			if (!info) { return; }

			const observerState = observer.debugGetState();

			const base = { name: observer.debugName, instanceId: info.instanceId, updateCount: observerState.updateCount };
			const changedDependencies = [...info.changedObservables].map(o => this._instanceInfos.get(o)?.instanceId).filter(isDefined);
			if (observerState.isComputing) {
				return { ...base, type: 'observable/derived', state: 'updating', changedDependencies, initialComputation: false };
			}
			switch (observerState.state) {
				case DerivedState.initial:
					return { ...base, type: 'observable/derived', state: 'noValue' };
				case DerivedState.upToDate:
					return { ...base, type: 'observable/derived', state: 'upToDate' };
				case DerivedState.stale:
					return { ...base, type: 'observable/derived', state: 'stale', changedDependencies };
				case DerivedState.dependenciesMightHaveChanged:
					return { ...base, type: 'observable/derived', state: 'possiblyStale' };
			}
		} else if (observer instanceof AutorunObserver) {
			const info = this._getAutorunInfo(observer);
			if (!info) { return undefined; }

			const base = { name: observer.debugName, instanceId: info.instanceId, updateCount: info.updateCount };
			const changedDependencies = [...info.changedObservables].map(o => this._instanceInfos.get(o)!.instanceId);
			if (observer.debugGetState().isRunning) {
				return { ...base, type: 'autorun', state: 'updating', changedDependencies };
			}
			switch (observer.debugGetState().state) {
				case AutorunState.upToDate:
					return { ...base, type: 'autorun', state: 'upToDate' };
				case AutorunState.stale:
					return { ...base, type: 'autorun', state: 'stale', changedDependencies };
				case AutorunState.dependenciesMightHaveChanged:
					return { ...base, type: 'autorun', state: 'possiblyStale' };
			}

		}
		return undefined;
	}

	private _formatObservable(obs: IObservable<any>): { name: string; instanceId: ObsInstanceId } | undefined {
		const info = this._getObservableInfo(obs);
		if (!info) { return undefined; }
		return { name: obs.debugName, instanceId: info.instanceId };
	}

	private _formatObserver(obs: IObserver): { name: string; instanceId: ObsInstanceId } | undefined {
		if (obs instanceof Derived) {
			return { name: obs.toString(), instanceId: this._getObservableInfo(obs)?.instanceId! };
		}
		const autorunInfo = this._getAutorunInfo(obs as AutorunObserver);
		if (autorunInfo) {
			return { name: obs.toString(), instanceId: autorunInfo.instanceId };
		}

		return undefined;
	}

	private constructor() { }

	private _pendingChanges: ObsStateUpdate | null = null;
	private readonly _changeThrottler = new Throttler();

	private readonly _fullState = {};

	private _handleChange(update: ObsStateUpdate): void {
		deepAssignDeleteNulls(this._fullState, update);

		if (this._pendingChanges === null) {
			this._pendingChanges = update;
		} else {
			deepAssign(this._pendingChanges, update);
		}

		this._changeThrottler.throttle(this._flushUpdates, 10);
	}

	private readonly _flushUpdates = () => {
		if (this._pendingChanges !== null) {
			this._channel.api.notifications.handleChange(this._pendingChanges, false);
			this._pendingChanges = null;
		}
	};

	private _getDeclarationId(type: IObsDeclaration['type']): number {

		let shallow = true;
		let loc!: ILocation;

		const Err = Error as any as { stackTraceLimit: number }; // For the monaco editor checks, which don't have the nodejs types.

		while (true) {
			const l = Err.stackTraceLimit;
			Err.stackTraceLimit = shallow ? 6 : 20;
			const stack = new Error().stack!;
			Err.stackTraceLimit = l;

			let result = getFirstStackFrameOutsideOf(stack, /[/\\]observableInternal[/\\]|\.observe|[/\\]util(s)?\./);

			if (!shallow && !result) {
				result = getFirstStackFrameOutsideOf(stack, /[/\\]observableInternal[/\\]|\.observe/)!;
			}
			if (result) {
				loc = result;
				break;
			}
			if (!shallow) {
				console.error('Could not find location for declaration', new Error().stack);
				loc = { fileName: 'unknown', line: 0, column: 0, id: 'unknown' };
				break;
			}
			shallow = false;
		}

		let decInfo = this._declarations.get(loc.id);
		if (decInfo === undefined) {
			decInfo = {
				id: this._declarationId++,
				type,
				url: loc.fileName,
				line: loc.line,
				column: loc.column,
			};
			this._declarations.set(loc.id, decInfo);

			this._handleChange({ decls: { [decInfo.id]: decInfo } });
		}
		return decInfo.id;
	}

	handleObservableCreated(observable: IObservable<any>): void {
		const declarationId = this._getDeclarationId('observable/value');

		const info: IObservableInfo = {
			declarationId,
			instanceId: this._instanceId++,
			listenerCount: 0,
			lastValue: undefined,
			updateCount: 0,
			changedObservables: new Set(),
		};
		this._instanceInfos.set(observable, info);
	}

	handleOnListenerCountChanged(observable: IObservable<any>, newCount: number): void {
		const info = this._getObservableInfo(observable);
		if (!info) { return; }

		if (info.listenerCount === 0 && newCount > 0) {
			const type: IObsDeclaration['type'] =
				observable instanceof Derived ? 'observable/derived' : 'observable/value';
			this._aliveInstances.set(info.instanceId, observable);
			this._handleChange({
				instances: {
					[info.instanceId]: {
						instanceId: info.instanceId,
						declarationId: info.declarationId,
						formattedValue: info.lastValue,
						type,
						name: observable.debugName,
					}
				}
			});
		} else if (info.listenerCount > 0 && newCount === 0) {
			this._handleChange({
				instances: { [info.instanceId]: null }
			});
			this._aliveInstances.delete(info.instanceId);
		}
		info.listenerCount = newCount;
	}

	handleObservableUpdated(observable: IObservable<any>, changeInfo: IChangeInformation): void {
		if (observable instanceof Derived) {
			this._handleDerivedRecomputed(observable, changeInfo);
			return;
		}

		const info = this._getObservableInfo(observable);
		if (info) {
			if (changeInfo.didChange) {
				info.lastValue = formatValue(changeInfo.newValue, 30);
				if (info.listenerCount > 0) {
					this._handleChange({
						instances: { [info.instanceId]: { formattedValue: info.lastValue } }
					});
				}
			}
		}
	}

	handleAutorunCreated(autorun: AutorunObserver): void {
		const declarationId = this._getDeclarationId('autorun');
		const info: IAutorunInfo = {
			declarationId,
			instanceId: this._instanceId++,
			updateCount: 0,
			changedObservables: new Set(),
		};
		this._instanceInfos.set(autorun, info);
		this._aliveInstances.set(info.instanceId, autorun);
		if (info) {
			this._handleChange({
				instances: {
					[info.instanceId]: {
						instanceId: info.instanceId,
						declarationId: info.declarationId,
						runCount: 0,
						type: 'autorun',
						name: autorun.debugName,
					}
				}
			});
		}
	}
	handleAutorunDisposed(autorun: AutorunObserver): void {
		const info = this._getAutorunInfo(autorun);
		if (!info) { return; }

		this._handleChange({
			instances: { [info.instanceId]: null }
		});
		this._instanceInfos.delete(autorun);
		this._aliveInstances.delete(info.instanceId);
	}
	handleAutorunDependencyChanged(autorun: AutorunObserver, observable: IObservable<any>, change: unknown): void {
		const info = this._getAutorunInfo(autorun);
		if (!info) { return; }

		info.changedObservables.add(observable);
	}
	handleAutorunStarted(autorun: AutorunObserver): void {

	}
	handleAutorunFinished(autorun: AutorunObserver): void {
		const info = this._getAutorunInfo(autorun);
		if (!info) { return; }

		info.changedObservables.clear();
		info.updateCount++;
		this._handleChange({
			instances: { [info.instanceId]: { runCount: info.updateCount } }
		});
	}

	handleDerivedDependencyChanged(derived: Derived<any>, observable: IObservable<any>, change: unknown): void {
		const info = this._getObservableInfo(derived);
		if (info) {
			info.changedObservables.add(observable);
		}
	}
	_handleDerivedRecomputed(observable: Derived<any>, changeInfo: IChangeInformation): void {
		const info = this._getObservableInfo(observable);
		if (!info) { return; }

		const formattedValue = formatValue(changeInfo.newValue, 30);
		info.updateCount++;
		info.changedObservables.clear();

		info.lastValue = formattedValue;
		if (info.listenerCount > 0) {
			this._handleChange({
				instances: { [info.instanceId]: { formattedValue: formattedValue, recomputationCount: info.updateCount } }
			});
		}
	}
	handleDerivedCleared(observable: Derived<any>): void {
		const info = this._getObservableInfo(observable);
		if (!info) { return; }

		info.lastValue = undefined;
		info.changedObservables.clear();
		if (info.listenerCount > 0) {
			this._handleChange({
				instances: {
					[info.instanceId]: {
						formattedValue: undefined,
					}
				}
			});
		}
	}
	handleBeginTransaction(transaction: TransactionImpl): void {
		this._activeTransactions.add(transaction);
	}
	handleEndTransaction(transaction: TransactionImpl): void {
		this._activeTransactions.delete(transaction);
	}
}
