/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AutorunObserver } from '../../reactions/autorunImpl.js';
import { formatValue } from '../consoleObservableLogger.js';
import { registerDebugChannel } from './debuggerRpc.js';
import { deepAssign, deepAssignDeleteNulls, Throttler } from './utils.js';
import { isDefined } from '../../../types.js';
import { FromEventObservable } from '../../observables/observableFromEvent.js';
import { BugIndicatingError, onUnexpectedError } from '../../../errors.js';
import { Derived } from '../../observables/derivedImpl.js';
import { ObservableValue } from '../../observables/observableValue.js';
import { DebugLocation } from '../../debugLocation.js';
export class DevToolsLogger {
    static { this._instance = undefined; }
    static getInstance() {
        if (DevToolsLogger._instance === undefined) {
            DevToolsLogger._instance = new DevToolsLogger();
        }
        return DevToolsLogger._instance;
    }
    getTransactionState() {
        const affected = [];
        const txs = [...this._activeTransactions];
        if (txs.length === 0) {
            return undefined;
        }
        const observerQueue = txs.flatMap(t => t.debugGetUpdatingObservers() ?? []).map(o => o.observer);
        const processedObservers = new Set();
        while (observerQueue.length > 0) {
            const observer = observerQueue.shift();
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
    _getObservableInfo(observable) {
        const info = this._instanceInfos.get(observable);
        if (!info) {
            onUnexpectedError(new BugIndicatingError('No info found'));
            return undefined;
        }
        return info;
    }
    _getAutorunInfo(autorun) {
        const info = this._instanceInfos.get(autorun);
        if (!info) {
            onUnexpectedError(new BugIndicatingError('No info found'));
            return undefined;
        }
        return info;
    }
    _getInfo(observer, queue) {
        if (observer instanceof Derived) {
            const observersToUpdate = [...observer.debugGetObservers()];
            for (const o of observersToUpdate) {
                queue(o);
            }
            const info = this._getObservableInfo(observer);
            if (!info) {
                return;
            }
            const observerState = observer.debugGetState();
            const base = { name: observer.debugName, instanceId: info.instanceId, updateCount: observerState.updateCount };
            const changedDependencies = [...info.changedObservables].map(o => this._instanceInfos.get(o)?.instanceId).filter(isDefined);
            if (observerState.isComputing) {
                return { ...base, type: 'observable/derived', state: 'updating', changedDependencies, initialComputation: false };
            }
            switch (observerState.state) {
                case 0 /* DerivedState.initial */:
                    return { ...base, type: 'observable/derived', state: 'noValue' };
                case 3 /* DerivedState.upToDate */:
                    return { ...base, type: 'observable/derived', state: 'upToDate' };
                case 2 /* DerivedState.stale */:
                    return { ...base, type: 'observable/derived', state: 'stale', changedDependencies };
                case 1 /* DerivedState.dependenciesMightHaveChanged */:
                    return { ...base, type: 'observable/derived', state: 'possiblyStale' };
            }
        }
        else if (observer instanceof AutorunObserver) {
            const info = this._getAutorunInfo(observer);
            if (!info) {
                return undefined;
            }
            const base = { name: observer.debugName, instanceId: info.instanceId, updateCount: info.updateCount };
            const changedDependencies = [...info.changedObservables].map(o => this._instanceInfos.get(o).instanceId);
            if (observer.debugGetState().isRunning) {
                return { ...base, type: 'autorun', state: 'updating', changedDependencies };
            }
            switch (observer.debugGetState().state) {
                case 3 /* AutorunState.upToDate */:
                    return { ...base, type: 'autorun', state: 'upToDate' };
                case 2 /* AutorunState.stale */:
                    return { ...base, type: 'autorun', state: 'stale', changedDependencies };
                case 1 /* AutorunState.dependenciesMightHaveChanged */:
                    return { ...base, type: 'autorun', state: 'possiblyStale' };
            }
        }
        return undefined;
    }
    _formatObservable(obs) {
        const info = this._getObservableInfo(obs);
        if (!info) {
            return undefined;
        }
        return { name: obs.debugName, instanceId: info.instanceId };
    }
    _formatObserver(obs) {
        if (obs instanceof Derived) {
            return { name: obs.toString(), instanceId: this._getObservableInfo(obs)?.instanceId };
        }
        const autorunInfo = this._getAutorunInfo(obs);
        if (autorunInfo) {
            return { name: obs.toString(), instanceId: autorunInfo.instanceId };
        }
        return undefined;
    }
    constructor() {
        this._declarationId = 0;
        this._instanceId = 0;
        this._declarations = new Map();
        this._instanceInfos = new WeakMap();
        this._aliveInstances = new Map();
        this._activeTransactions = new Set();
        this._channel = registerDebugChannel('observableDevTools', () => {
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
                        const result = {};
                        for (const decl of this._declarations.values()) {
                            result[decl.id] = decl;
                        }
                        return { decls: result };
                    },
                    getSummarizedInstances: () => {
                        return null;
                    },
                    getObservableValueInfo: instanceId => {
                        const obs = this._aliveInstances.get(instanceId);
                        return {
                            observers: [...obs.debugGetObservers()].map(d => this._formatObserver(d)).filter(isDefined),
                        };
                    },
                    getDerivedInfo: instanceId => {
                        const d = this._aliveInstances.get(instanceId);
                        return {
                            dependencies: [...d.debugGetState().dependencies].map(d => this._formatObservable(d)).filter(isDefined),
                            observers: [...d.debugGetObservers()].map(d => this._formatObserver(d)).filter(isDefined),
                        };
                    },
                    getAutorunInfo: instanceId => {
                        const obs = this._aliveInstances.get(instanceId);
                        return {
                            dependencies: [...obs.debugGetState().dependencies].map(d => this._formatObservable(d)).filter(isDefined),
                        };
                    },
                    getTransactionState: () => {
                        return this.getTransactionState();
                    },
                    setValue: (instanceId, jsonValue) => {
                        const obs = this._aliveInstances.get(instanceId);
                        if (obs instanceof Derived) {
                            obs.debugSetValue(jsonValue);
                        }
                        else if (obs instanceof ObservableValue) {
                            obs.debugSetValue(jsonValue);
                        }
                        else if (obs instanceof FromEventObservable) {
                            obs.debugSetValue(jsonValue);
                        }
                        else {
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
                        const obs = this._aliveInstances.get(instanceId);
                        if (obs instanceof Derived) {
                            return formatValue(obs.debugGetState().value, 200);
                        }
                        else if (obs instanceof ObservableValue) {
                            return formatValue(obs.debugGetState().value, 200);
                        }
                        return undefined;
                    },
                    logValue: (instanceId) => {
                        const obs = this._aliveInstances.get(instanceId);
                        if (obs && 'get' in obs) {
                            console.log('Logged Value:', obs.get());
                        }
                        else {
                            throw new BugIndicatingError('Observable is not supported');
                        }
                    },
                    rerun: (instanceId) => {
                        const obs = this._aliveInstances.get(instanceId);
                        if (obs instanceof Derived) {
                            obs.debugRecompute();
                        }
                        else if (obs instanceof AutorunObserver) {
                            obs.debugRerun();
                        }
                        else {
                            throw new BugIndicatingError('Observable is not supported');
                        }
                    },
                }
            };
        });
        this._pendingChanges = null;
        this._changeThrottler = new Throttler();
        this._fullState = {};
        this._flushUpdates = () => {
            if (this._pendingChanges !== null) {
                this._channel.api.notifications.handleChange(this._pendingChanges, false);
                this._pendingChanges = null;
            }
        };
        DebugLocation.enable();
    }
    _handleChange(update) {
        deepAssignDeleteNulls(this._fullState, update);
        if (this._pendingChanges === null) {
            this._pendingChanges = update;
        }
        else {
            deepAssign(this._pendingChanges, update);
        }
        this._changeThrottler.throttle(this._flushUpdates, 10);
    }
    _getDeclarationId(type, location) {
        if (!location) {
            return -1;
        }
        let decInfo = this._declarations.get(location.id);
        if (decInfo === undefined) {
            decInfo = {
                id: this._declarationId++,
                type,
                url: location.fileName,
                line: location.line,
                column: location.column,
            };
            this._declarations.set(location.id, decInfo);
            this._handleChange({ decls: { [decInfo.id]: decInfo } });
        }
        return decInfo.id;
    }
    handleObservableCreated(observable, location) {
        const declarationId = this._getDeclarationId('observable/value', location);
        const info = {
            declarationId,
            instanceId: this._instanceId++,
            listenerCount: 0,
            lastValue: undefined,
            updateCount: 0,
            changedObservables: new Set(),
        };
        this._instanceInfos.set(observable, info);
    }
    handleOnListenerCountChanged(observable, newCount) {
        const info = this._getObservableInfo(observable);
        if (!info) {
            return;
        }
        if (info.listenerCount === 0 && newCount > 0) {
            const type = observable instanceof Derived ? 'observable/derived' : 'observable/value';
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
        }
        else if (info.listenerCount > 0 && newCount === 0) {
            this._handleChange({
                instances: { [info.instanceId]: null }
            });
            this._aliveInstances.delete(info.instanceId);
        }
        info.listenerCount = newCount;
    }
    handleObservableUpdated(observable, changeInfo) {
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
    handleAutorunCreated(autorun, location) {
        const declarationId = this._getDeclarationId('autorun', location);
        const info = {
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
    handleAutorunDisposed(autorun) {
        const info = this._getAutorunInfo(autorun);
        if (!info) {
            return;
        }
        this._handleChange({
            instances: { [info.instanceId]: null }
        });
        this._instanceInfos.delete(autorun);
        this._aliveInstances.delete(info.instanceId);
    }
    handleAutorunDependencyChanged(autorun, observable, change) {
        const info = this._getAutorunInfo(autorun);
        if (!info) {
            return;
        }
        info.changedObservables.add(observable);
    }
    handleAutorunStarted(autorun) {
    }
    handleAutorunFinished(autorun) {
        const info = this._getAutorunInfo(autorun);
        if (!info) {
            return;
        }
        info.changedObservables.clear();
        info.updateCount++;
        this._handleChange({
            instances: { [info.instanceId]: { runCount: info.updateCount } }
        });
    }
    handleDerivedDependencyChanged(derived, observable, change) {
        const info = this._getObservableInfo(derived);
        if (info) {
            info.changedObservables.add(observable);
        }
    }
    _handleDerivedRecomputed(observable, changeInfo) {
        const info = this._getObservableInfo(observable);
        if (!info) {
            return;
        }
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
    handleDerivedCleared(observable) {
        const info = this._getObservableInfo(observable);
        if (!info) {
            return;
        }
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
    handleBeginTransaction(transaction) {
        this._activeTransactions.add(transaction);
    }
    handleEndTransaction(transaction) {
        this._activeTransactions.delete(transaction);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2VG9vbHNMb2dnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvbG9nZ2luZy9kZWJ1Z2dlci9kZXZUb29sc0xvZ2dlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFnQixNQUFNLGdDQUFnQyxDQUFDO0FBRy9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUU1RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUMxRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDOUMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFHM0UsT0FBTyxFQUFFLE9BQU8sRUFBZ0IsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBbUJ2RCxNQUFNLE9BQU8sY0FBYzthQUNYLGNBQVMsR0FBK0IsU0FBUyxBQUF4QyxDQUF5QztJQUMxRCxNQUFNLENBQUMsV0FBVztRQUN4QixJQUFJLGNBQWMsQ0FBQyxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDNUMsY0FBYyxDQUFDLFNBQVMsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ2pELENBQUM7UUFDRCxPQUFPLGNBQWMsQ0FBQyxTQUFTLENBQUM7SUFDakMs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