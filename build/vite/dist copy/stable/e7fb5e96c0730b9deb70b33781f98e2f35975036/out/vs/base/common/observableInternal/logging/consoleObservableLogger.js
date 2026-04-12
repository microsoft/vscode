/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addLogger } from './logging.js';
import { getClassName } from '../debugName.js';
import { Derived } from '../observables/derivedImpl.js';
let consoleObservableLogger;
export function logObservableToConsole(obs) {
    if (!consoleObservableLogger) {
        consoleObservableLogger = new ConsoleObservableLogger();
        addLogger(consoleObservableLogger);
    }
    consoleObservableLogger.addFilteredObj(obs);
}
export class ConsoleObservableLogger {
    constructor() {
        this.indentation = 0;
        this.changedObservablesSets = new WeakMap();
    }
    addFilteredObj(obj) {
        if (!this._filteredObjects) {
            this._filteredObjects = new Set();
        }
        this._filteredObjects.add(obj);
    }
    _isIncluded(obj) {
        return this._filteredObjects?.has(obj) ?? true;
    }
    textToConsoleArgs(text) {
        return consoleTextToArgs([
            normalText(repeat('|  ', this.indentation)),
            text,
        ]);
    }
    formatInfo(info) {
        if (!info.hadValue) {
            return [
                normalText(` `),
                styled(formatValue(info.newValue, 60), {
                    color: 'green',
                }),
                normalText(` (initial)`),
            ];
        }
        return info.didChange
            ? [
                normalText(` `),
                styled(formatValue(info.oldValue, 70), {
                    color: 'red',
                    strikeThrough: true,
                }),
                normalText(` `),
                styled(formatValue(info.newValue, 60), {
                    color: 'green',
                }),
            ]
            : [normalText(` (unchanged)`)];
    }
    handleObservableCreated(observable) {
        if (observable instanceof Derived) {
            const derived = observable;
            this.changedObservablesSets.set(derived, new Set());
            const debugTrackUpdating = false;
            if (debugTrackUpdating) {
                const updating = [];
                // eslint-disable-next-line local/code-no-any-casts
                derived.__debugUpdating = updating;
                const existingBeginUpdate = derived.beginUpdate;
                derived.beginUpdate = (obs) => {
                    updating.push(obs);
                    return existingBeginUpdate.apply(derived, [obs]);
                };
                const existingEndUpdate = derived.endUpdate;
                derived.endUpdate = (obs) => {
                    const idx = updating.indexOf(obs);
                    if (idx === -1) {
                        console.error('endUpdate called without beginUpdate', derived.debugName, obs.debugName);
                    }
                    updating.splice(idx, 1);
                    return existingEndUpdate.apply(derived, [obs]);
                };
            }
        }
    }
    handleOnListenerCountChanged(observable, newCount) {
    }
    handleObservableUpdated(observable, info) {
        if (!this._isIncluded(observable)) {
            return;
        }
        if (observable instanceof Derived) {
            this._handleDerivedRecomputed(observable, info);
            return;
        }
        console.log(...this.textToConsoleArgs([
            formatKind('observable value changed'),
            styled(observable.debugName, { color: 'BlueViolet' }),
            ...this.formatInfo(info),
        ]));
    }
    formatChanges(changes) {
        if (changes.size === 0) {
            return undefined;
        }
        return styled(' (changed deps: ' +
            [...changes].map((o) => o.debugName).join(', ') +
            ')', { color: 'gray' });
    }
    handleDerivedDependencyChanged(derived, observable, change) {
        if (!this._isIncluded(derived)) {
            return;
        }
        this.changedObservablesSets.get(derived)?.add(observable);
    }
    _handleDerivedRecomputed(derived, info) {
        if (!this._isIncluded(derived)) {
            return;
        }
        const changedObservables = this.changedObservablesSets.get(derived);
        if (!changedObservables) {
            return;
        }
        console.log(...this.textToConsoleArgs([
            formatKind('derived recomputed'),
            styled(derived.debugName, { color: 'BlueViolet' }),
            ...this.formatInfo(info),
            this.formatChanges(changedObservables),
            { data: [{ fn: derived._debugNameData.referenceFn ?? derived._computeFn }] }
        ]));
        changedObservables.clear();
    }
    handleDerivedCleared(derived) {
        if (!this._isIncluded(derived)) {
            return;
        }
        console.log(...this.textToConsoleArgs([
            formatKind('derived cleared'),
            styled(derived.debugName, { color: 'BlueViolet' }),
        ]));
    }
    handleFromEventObservableTriggered(observable, info) {
        if (!this._isIncluded(observable)) {
            return;
        }
        console.log(...this.textToConsoleArgs([
            formatKind('observable from event triggered'),
            styled(observable.debugName, { color: 'BlueViolet' }),
            ...this.formatInfo(info),
            { data: [{ fn: observable._getValue }] }
        ]));
    }
    handleAutorunCreated(autorun) {
        if (!this._isIncluded(autorun)) {
            return;
        }
        this.changedObservablesSets.set(autorun, new Set());
    }
    handleAutorunDisposed(autorun) {
    }
    handleAutorunDependencyChanged(autorun, observable, change) {
        if (!this._isIncluded(autorun)) {
            return;
        }
        this.changedObservablesSets.get(autorun).add(observable);
    }
    handleAutorunStarted(autorun) {
        const changedObservables = this.changedObservablesSets.get(autorun);
        if (!changedObservables) {
            return;
        }
        if (this._isIncluded(autorun)) {
            console.log(...this.textToConsoleArgs([
                formatKind('autorun'),
                styled(autorun.debugName, { color: 'BlueViolet' }),
                this.formatChanges(changedObservables),
                { data: [{ fn: autorun._debugNameData.referenceFn ?? autorun._runFn }] }
            ]));
        }
        changedObservables.clear();
        this.indentation++;
    }
    handleAutorunFinished(autorun) {
        this.indentation--;
    }
    handleBeginTransaction(transaction) {
        let transactionName = transaction.getDebugName();
        if (transactionName === undefined) {
            transactionName = '';
        }
        if (this._isIncluded(transaction)) {
            console.log(...this.textToConsoleArgs([
                formatKind('transaction'),
                styled(transactionName, { color: 'BlueViolet' }),
                { data: [{ fn: transaction._fn }] }
            ]));
        }
        this.indentation++;
    }
    handleEndTransaction() {
        this.indentation--;
    }
}
function consoleTextToArgs(text) {
    const styles = new Array();
    const data = [];
    let firstArg = '';
    function process(t) {
        if ('length' in t) {
            for (const item of t) {
                if (item) {
                    process(item);
                }
            }
        }
        else if ('text' in t) {
            firstArg += `%c${t.text}`;
            styles.push(t.style);
            if (t.data) {
                data.push(...t.data);
            }
        }
        else if ('data' in t) {
            data.push(...t.data);
        }
    }
    process(text);
    const result = [firstArg, ...styles];
    result.push(...data);
    return result;
}
function normalText(text) {
    return styled(text, { color: 'black' });
}
function formatKind(kind) {
    return styled(padStr(`${kind}: `, 10), { color: 'black', bold: true });
}
function styled(text, options = {
    color: 'black',
}) {
    function objToCss(styleObj) {
        return Object.entries(styleObj).reduce((styleString, [propName, propValue]) => {
            return `${styleString}${propName}:${propValue};`;
        }, '');
    }
    const style = {
        color: options.color,
    };
    if (options.strikeThrough) {
        style['text-decoration'] = 'line-through';
    }
    if (options.bold) {
        style['font-weight'] = 'bold';
    }
    return {
        text,
        style: objToCss(style),
    };
}
export function formatValue(value, availableLen) {
    switch (typeof value) {
        case 'number':
            return '' + value;
        case 'string':
            if (value.length + 2 <= availableLen) {
                return `"${value}"`;
            }
            return `"${value.substr(0, availableLen - 7)}"+...`;
        case 'boolean':
            return value ? 'true' : 'false';
        case 'undefined':
            return 'undefined';
        case 'object':
            if (value === null) {
                return 'null';
            }
            if (Array.isArray(value)) {
                return formatArray(value, availableLen);
            }
            return formatObject(value, availableLen);
        case 'symbol':
            return value.toString();
        case 'function':
            return `[[Function${value.name ? ' ' + value.name : ''}]]`;
        default:
            return '' + value;
    }
}
function formatArray(value, availableLen) {
    let result = '[ ';
    let first = true;
    for (const val of value) {
        if (!first) {
            result += ', ';
        }
        if (result.length - 5 > availableLen) {
            result += '...';
            break;
        }
        first = false;
        result += `${formatValue(val, availableLen - result.length)}`;
    }
    result += ' ]';
    return result;
}
function formatObject(value, availableLen) {
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        const val = value.toString();
        if (val.length <= availableLen) {
            return val;
        }
        return val.substring(0, availableLen - 3) + '...';
    }
    const className = getClassName(value);
    let result = className ? className + '(' : '{ ';
    let first = true;
    for (const [key, val] of Object.entries(value)) {
        if (!first) {
            result += ', ';
        }
        if (result.length - 5 > availableLen) {
            result += '...';
            break;
        }
        first = false;
        result += `${key}: ${formatValue(val, availableLen - result.length)}`;
    }
    result += className ? ')' : ' }';
    return result;
}
function repeat(str, count) {
    let result = '';
    for (let i = 1; i <= count; i++) {
        result += str;
    }
    return result;
}
function padStr(str, length) {
    while (str.length < length) {
        str += ' ';
    }
    return str;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc29sZU9ic2VydmFibGVMb2dnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvbG9nZ2luZy9jb25zb2xlT2JzZXJ2YWJsZUxvZ2dlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQXlDLFNBQVMsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUVoRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDL0MsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBR3hELElBQUksdUJBQTRELENBQUM7QUFFakUsTUFBTSxVQUFVLHNCQUFzQixDQUFDLEdBQXFCO0lBQzNELElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQzlCLHVCQUF1QixHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztRQUN4RCxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBQ0QsdUJBQXVCLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzdDLENBQUM7QUFFRCxNQUFNLE9BQU8sdUJBQXVCO0lBQXBDO1FBQ1MsZ0JBQVcsR0FBRyxDQUFDLENBQUM7UUE4RlAsMkJBQXNCLEdBQUcsSUFBSSxPQUFPLEVBQWlDLENBQUM7SUE0R3hGLENBQUM7SUF0TU8sY0FBYyxDQUFDLEdBQVk7UUFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ25DLENBQUM7UUFDRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFTyxXQUFXLENBQUMsR0FBWTtRQUMvQixPQUFP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