/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Derived } from '../observables/derivedImpl.js';
import { FromEventObservable } from '../observables/observableFromEvent.js';
import { ObservableValue } from '../observables/observableValue.js';
import { AutorunObserver } from '../reactions/autorunImpl.js';
import { formatValue } from './consoleObservableLogger.js';
export function debugGetObservableGraph(obs, options) {
    const debugNamePostProcessor = options?.debugNamePostProcessor ?? ((str) => str);
    const info = Info.from(obs, debugNamePostProcessor);
    if (!info) {
        return '';
    }
    const alreadyListed = new Set();
    if (options.type === 'observers') {
        return formatObservableInfoWithObservers(info, 0, alreadyListed, options).trim();
    }
    else {
        return formatObservableInfoWithDependencies(info, 0, alreadyListed, options).trim();
    }
}
function formatObservableInfoWithDependencies(info, indentLevel, alreadyListed, options) {
    const indent = '\t\t'.repeat(indentLevel);
    const lines = [];
    const isAlreadyListed = alreadyListed.has(info.sourceObj);
    if (isAlreadyListed) {
        lines.push(`${indent}* ${info.type} ${info.name} (already listed)`);
        return lines.join('\n');
    }
    alreadyListed.add(info.sourceObj);
    lines.push(`${indent}* ${info.type} ${info.name}:`);
    lines.push(`${indent}  value: ${formatValue(info.value, 50)}`);
    lines.push(`${indent}  state: ${info.state}`);
    if (info.dependencies.length > 0) {
        lines.push(`${indent}  dependencies:`);
        for (const dep of info.dependencies) {
            const info = Info.from(dep, options.debugNamePostProcessor ?? (name => name)) ?? Info.unknown(dep);
            lines.push(formatObservableInfoWithDependencies(info, indentLevel + 1, alreadyListed, options));
        }
    }
    return lines.join('\n');
}
function formatObservableInfoWithObservers(info, indentLevel, alreadyListed, options) {
    const indent = '\t\t'.repeat(indentLevel);
    const lines = [];
    const isAlreadyListed = alreadyListed.has(info.sourceObj);
    if (isAlreadyListed) {
        lines.push(`${indent}* ${info.type} ${info.name} (already listed)`);
        return lines.join('\n');
    }
    alreadyListed.add(info.sourceObj);
    lines.push(`${indent}* ${info.type} ${info.name}:`);
    lines.push(`${indent}  value: ${formatValue(info.value, 50)}`);
    lines.push(`${indent}  state: ${info.state}`);
    if (info.observers.length > 0) {
        lines.push(`${indent}  observers:`);
        for (const observer of info.observers) {
            const info = Info.from(observer, options.debugNamePostProcessor ?? (name => name)) ?? Info.unknown(observer);
            lines.push(formatObservableInfoWithObservers(info, indentLevel + 1, alreadyListed, options));
        }
    }
    return lines.join('\n');
}
class Info {
    static from(obs, debugNamePostProcessor) {
        if (obs instanceof AutorunObserver) {
            const state = obs.debugGetState();
            return new Info(obs, debugNamePostProcessor(obs.debugName), 'autorun', undefined, state.stateStr, Array.from(state.dependencies), []);
        }
        else if (obs instanceof Derived) {
            const state = obs.debugGetState();
            return new Info(obs, debugNamePostProcessor(obs.debugName), 'derived', state.value, state.stateStr, Array.from(state.dependencies), Array.from(obs.debugGetObservers()));
        }
        else if (obs instanceof ObservableValue) {
            const state = obs.debugGetState();
            return new Info(obs, debugNamePostProcessor(obs.debugName), 'observableValue', state.value, 'upToDate', [], Array.from(obs.debugGetObservers()));
        }
        else if (obs instanceof FromEventObservable) {
            const state = obs.debugGetState();
            return new Info(obs, debugNamePostProcessor(obs.debugName), 'fromEvent', state.value, state.hasValue ? 'upToDate' : 'initial', [], Array.from(obs.debugGetObservers()));
        }
        return undefined;
    }
    static unknown(obs) {
        return new Info(obs, '(unknown)', 'unknown', undefined, 'unknown', [], []);
    }
    constructor(sourceObj, name, type, value, state, dependencies, observers) {
        this.sourceObj = sourceObj;
        this.name = name;
        this.type = type;
        this.value = value;
        this.state = state;
        this.dependencies = dependencies;
        this.observers = observers;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdHZXREZXBlbmRlbmN5R3JhcGguanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvbG9nZ2luZy9kZWJ1Z0dldERlcGVuZGVuY3lHcmFwaC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFPM0QsTUFBTSxVQUFVLHVCQUF1QixDQUFDLEdBQWlDLEVBQUUsT0FBaUI7SUFDM0YsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLEVBQUUsc0JBQXNCLElBQUksQ0FBQyxDQUFDLEdBQVcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDekYsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztJQUNwRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWCxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsRUFBZ0MsQ0FBQztJQUU5RCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssV0FBVyxFQUFFLENBQUM7UUFDbEMsT0FBTyxpQ0FBaUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNsRixDQUFDO1NBQU0sQ0FBQztRQUNQLE9BQU8sb0NBQW9DLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDckYsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLG9DQUFvQyxDQUFDLElBQVUsRUFBRSxXQUFtQixFQUFFLGFBQWdELEVBQUUsT0FBaUI7SUFDakosTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUMxQyxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFFM0IsTUFBTSxlQUFlLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDMUQsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNyQixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxLQUFLLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksbUJBQW1CLENBQUMsQ0FBQztRQUNwRSxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVELGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRWxDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLEtBQUssSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUNwRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxZQUFZLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMvRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxZQUFZLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBRTlDLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbEMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0saUJBQWlCLENBQUMsQ0FBQztRQUN2QyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNyQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsc0JBQXNCLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNuRyxLQUFLLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLElBQUksRUFBRSxXQUFXLEdBQUcsQ0FBQyxFQUFFLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2pHLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3pCLENBQUM7QUFFRCxTQUFTLGlDQUFpQyxDQUFDLElBQVUsRUFBRSxXQUFtQixFQUFFLGFBQWdELEVBQUUsT0FBaUI7SUFDOUksTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUMxQyxNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7SUFFM0IsTUFBTSxlQUFlLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDMUQsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNyQixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxLQUFLLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksbUJBQW1CLENBQUMsQ0FBQztRQUNwRSxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVELGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRWxDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxNQUFNLEtBQUssSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUNwRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxZQUFZLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMvRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxZQUFZLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBRTlDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDL0IsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLE1BQU0sY0FBYyxDQUFDLENBQUM7UUFDcEMsS0FBSyxNQUFNLFFBQVEsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDdkMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLHNCQUFzQixJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDN0csS0FBSyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxJQUFJLEVBQUUsV0FBVyxHQUFHLENBQUMsRUFBRSxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUM5RixDQUFDO0lBQ0YsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN6QixDQUFDO0FBRUQsTUFBTSxJQUFJO0lBQ0YsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFpQyxFQUFFLHNCQUFnRDtRQUNyRyxJQUFJLEdBQUcsWUFBWSxlQUFlLEVBQUUsQ0FBQztZQUNwQyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDbEMsT0FBTyxJQUFJLElBQUksQ0FDZCxHQUFHLEVBQ0gsc0JBQXNCLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUNyQyxTQUFTLEVBQ1QsU0FBUyxFQUNULEtBQUssQ0FBQyxRQUFRLEVBQ2QsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQzlCLEVBQUUsQ0FDRixDQUFDO1FBQ0gsQ0FBQzthQUFNLElBQUksR0FBRyxZQUFZLE9BQU8sRUFBRSxDQUFDO1lBQ25DLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNsQyxPQUFPLElBQUksSUFBSSxDQUNkLEdBQUcsRUFDSCxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQ3JDLFNBQVMsRUFDVCxLQUFLLENBQUMsS0FBSyxFQUNYLEtBQUssQ0FBQyxRQUFRLEVBQ2QsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQzlCLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FDbkMsQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLEdBQUcsWUFBWSxlQUFlLEVBQUUsQ0FBQztZQUMzQyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDbEMsT0FBTyxJQUFJLElBQUksQ0FDZCxHQUFHLEVBQ0gsc0JBQXNCLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUNyQyxpQkFBaUIsRUFDakIsS0FBSyxDQUFDLEtBQUssRUFDWCxVQUFVLEVBQ1YsRUFBRSxFQUNGLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FDbkMsQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLEdBQUcsWUFBWSxtQkFBbUIsRUFBRSxDQUFDO1lBQy9DLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNsQyxPQUFPLElBQUksSUFBSSxDQUNkLEdBQUcsRUFDSCxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQ3JDLFdBQVcsRUFDWCxLQUFLLENBQUMsS0FBSyxFQUNYLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUN2QyxFQUFFLEVBQ0YsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUNuQyxDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTSxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQWlDO1FBQ3RELE9BQU8sSUFBSSxJQUFJLENBQ2QsR0FBRyxFQUNILFdBQVcsRUFDWCxTQUFTLEVBQ1QsU0FBUyxFQUNULFNBQVMsRUFDVCxFQUFFLEVBQ0YsRUFBRSxDQUNGLENBQUM7SUFDSCxDQUFDO0lBRUQsWUFDaUIsU0FBdUMsRUFDdkMsSUFBWSxFQUNaLElBQVksRUFDWixLQUFVLEVBQ1YsS0FBYSxFQUNiLFlBQThDLEVBQzlDLFNBQTJDO1FBTjNDLGNBQVMsR0FBVCxTQUFTLENBQThCO1FBQ3ZDLFNBQUksR0FBSixJQUFJLENBQVE7UUFDWixTQUFJLEdBQUosSUFBSSxDQUFRO1FBQ1osVUFBSyxHQUFMLEtBQUssQ0FBSztRQUNWLFVBQUssR0FBTCxLQUFLLENBQVE7UUFDYixpQkFBWSxHQUFaLFlBQVksQ0FBa0M7UUFDOUMsY0FBUyxHQUFULFNBQVMsQ0FBa0M7SUFDeEQsQ0FBQztDQUNMIn0=