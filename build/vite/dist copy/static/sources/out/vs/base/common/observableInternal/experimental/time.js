/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../lifecycle.js';
import { DisposableStore, toDisposable } from '../commonFacade/deps.js';
import { observableValue } from '../observables/observableValue.js';
import { autorun } from '../reactions/autorun.js';
/** Measures the total time an observable had the value "true". */
export class TotalTrueTimeObservable extends Disposable {
    constructor(value) {
        super();
        this.value = value;
        this._totalTime = 0;
        this._startTime = undefined;
        this._register(autorun(reader => {
            const isTrue = this.value.read(reader);
            if (isTrue) {
                this._startTime = Date.now();
            }
            else {
                if (this._startTime !== undefined) {
                    const delta = Date.now() - this._startTime;
                    this._totalTime += delta;
                    this._startTime = undefined;
                }
            }
        }));
    }
    /**
     * Reports the total time the observable has been true in milliseconds.
     * E.g. `true` for 100ms, then `false` for 50ms, then `true` for 200ms results in 300ms.
    */
    totalTimeMs() {
        if (this._startTime !== undefined) {
            return this._totalTime + (Date.now() - this._startTime);
        }
        return this._totalTime;
    }
    /**
     * Runs the callback when the total time the observable has been true increased by the given delta in milliseconds.
    */
    fireWhenTimeIncreasedBy(deltaTimeMs, callback) {
        const store = new DisposableStore();
        let accumulatedTime = 0;
        let startTime = undefined;
        store.add(autorun(reader => {
            const isTrue = this.value.read(reader);
            if (isTrue) {
                startTime = Date.now();
                const remainingTime = deltaTimeMs - accumulatedTime;
                if (remainingTime <= 0) {
                    callback();
                    store.dispose();
                    return;
                }
                const handle = setTimeout(() => {
                    accumulatedTime += (Date.now() - startTime);
                    startTime = undefined;
                    callback();
                    store.dispose();
                }, remainingTime);
                reader.store.add(toDisposable(() => {
                    clearTimeout(handle);
                    if (startTime !== undefined) {
                        accumulatedTime += (Date.now() - startTime);
                        startTime = undefined;
                    }
                }));
            }
        }));
        return store;
    }
}
/**
 * Returns an observable that is true when the input observable was true within the last `timeMs` milliseconds.
 */
export function wasTrueRecently(obs, timeMs, store) {
    const result = observableValue('wasTrueRecently', false);
    let timeout;
    store.add(autorun(reader => {
        const value = obs.read(reader);
        if (value) {
            result.set(true, undefined);
            if (timeout !== undefined) {
                clearTimeout(timeout);
                timeout = undefined;
            }
        }
        else {
            timeout = setTimeout(() => {
                result.set(false, undefined);
                timeout = undefined;
            }, timeMs);
        }
    }));
    store.add(toDisposable(() => {
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
    }));
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGltZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9leHBlcmltZW50YWwvdGltZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFaEQsT0FBTyxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRWxELGtFQUFrRTtBQUNsRSxNQUFNLE9BQU8sdUJBQXdCLFNBQVEsVUFBVTtJQUl0RCxZQUNrQixLQUEyQjtRQUU1QyxLQUFLLEVBQUUsQ0FBQztRQUZTLFVBQUssR0FBTCxLQUFLLENBQXNCO1FBSnJDLGVBQVUsR0FBRyxDQUFDLENBQUM7UUFDZixlQUFVLEdBQXVCLFNBQVMsQ0FBQztRQU1sRCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMvQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2QyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUNaLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzlCLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQ25DLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO29CQUMzQyxJQUFJLENBQUMsVUFBVSxJQUFJLEtBQUssQ0FBQztvQkFDekIsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUM7Z0JBQzdCLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7O01BR0U7SUFDSyxXQUFXO1FBQ2pCLElBQUksSUFBSSxDQUFDLFVBQVUsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNuQyxPQUFPLElBQUksQ0FBQyxVQUFVLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pELENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDeEIsQ0FBQztJQUVEOztNQUVFO0lBQ0ssdUJBQXVCLENBQUMsV0FBbUIsRUFBRSxRQUFvQjtRQUN2RSxNQUFNLEtBQUssR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3BDLElBQUksZUFBZSxHQUFHLENBQUMsQ0FBQztRQUN4QixJQUFJLFNBQVMsR0FBdUIsU0FBUyxDQUFDO1FBRTlDLEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQzFCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRXZDLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDdkIsTUFBTSxhQUFhLEdBQUcsV0FBVyxHQUFHLGVBQWUsQ0FBQztnQkFFcEQsSUFBSSxhQUFhLElBQUksQ0FBQyxFQUFFLENBQUM7b0JBQ3hCLFFBQVEsRUFBRSxDQUFDO29CQUNYLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztvQkFDaEIsT0FBTztnQkFDUixDQUFDO2dCQUVELE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7b0JBQzlCLGVBQWUsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFVLENBQUMsQ0FBQztvQkFDN0MsU0FBUyxHQUFHLFNBQVMsQ0FBQztvQkFDdEIsUUFBUSxFQUFFLENBQUM7b0JBQ1gsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNqQixDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBRWxCLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7b0JBQ2xDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDckIsSUFBSSxTQUFTLEtBQUssU0FBUyxFQUFFLENBQUM7d0JBQzdCLGVBQWUsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTLENBQUMsQ0FBQzt3QkFDNUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztvQkFDdkIsQ0FBQztnQkFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRDtBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLGVBQWUsQ0FBQyxHQUF5QixFQUFFLE1BQWMsRUFBRSxLQUFzQjtJQUNoRyxNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDekQsSUFBSSxPQUFrRCxDQUFDO0lBRXZELEtBQUssQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQzFCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDL0IsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQzVCLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUMzQixZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3RCLE9BQU8sR0FBRyxTQUFTLENBQUM7WUFDckIsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUU7Z0JBQ3pCLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUM3QixPQUFPLEdBQUcsU0FBUyxDQUFDO1lBQ3JCLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNaLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRUosS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFO1FBQzNCLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQzNCLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2QixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQyJ9