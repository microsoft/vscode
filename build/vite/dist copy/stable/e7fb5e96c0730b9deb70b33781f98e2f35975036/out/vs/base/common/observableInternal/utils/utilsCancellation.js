/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DebugNameData } from '../debugName.js';
import { CancellationError, CancellationTokenSource } from '../commonFacade/cancellation.js';
import { strictEquals } from '../commonFacade/deps.js';
import { autorun } from '../reactions/autorun.js';
import { Derived } from '../observables/derivedImpl.js';
import { DebugLocation } from '../debugLocation.js';
export function waitForState(observable, predicate, isError, cancellationToken) {
    if (!predicate) {
        predicate = state => state !== null && state !== undefined;
    }
    return new Promise((resolve, reject) => {
        let isImmediateRun = true;
        let shouldDispose = false;
        const stateObs = observable.map(state => {
            /** @description waitForState.state */
            return {
                isFinished: predicate(state),
                error: isError ? isError(state) : false,
                state
            };
        });
        const d = autorun(reader => {
            /** @description waitForState */
            const { isFinished, error, state } = stateObs.read(reader);
            if (isFinished || error) {
                if (isImmediateRun) {
                    // The variable `d` is not initialized yet
                    shouldDispose = true;
                }
                else {
                    d.dispose();
                }
                if (error) {
                    reject(error === true ? state : error);
                }
                else {
                    resolve(state);
                }
            }
        });
        if (cancellationToken) {
            const dc = cancellationToken.onCancellationRequested(() => {
                d.dispose();
                dc.dispose();
                reject(new CancellationError());
            });
            if (cancellationToken.isCancellationRequested) {
                d.dispose();
                dc.dispose();
                reject(new CancellationError());
                return;
            }
        }
        isImmediateRun = false;
        if (shouldDispose) {
            d.dispose();
        }
    });
}
export function derivedWithCancellationToken(computeFnOrOwner, computeFnOrUndefined) {
    let computeFn;
    let owner;
    if (computeFnOrUndefined === undefined) {
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrOwner;
        owner = undefined;
    }
    else {
        owner = computeFnOrOwner;
        // eslint-disable-next-line local/code-no-any-casts
        computeFn = computeFnOrUndefined;
    }
    let cancellationTokenSource = undefined;
    return new Derived(new DebugNameData(owner, undefined, computeFn), r => {
        if (cancellationTokenSource) {
            cancellationTokenSource.dispose(true);
        }
        cancellationTokenSource = new CancellationTokenSource();
        return computeFn(r, cancellationTokenSource.token);
    }, undefined, () => cancellationTokenSource?.dispose(), strictEquals, DebugLocation.ofCaller());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHNDYW5jZWxsYXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvdXRpbHMvdXRpbHNDYW5jZWxsYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFjLGFBQWEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzVELE9BQU8sRUFBRSxpQkFBaUIsRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNoSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFRcEQsTUFBTSxVQUFVLFlBQVksQ0FBSSxVQUEwQixFQUFFLFNBQWlDLEVBQUUsT0FBcUQsRUFBRSxpQkFBcUM7SUFDMUwsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2hCLFNBQVMsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxJQUFJLElBQUksS0FBSyxLQUFLLFNBQVMsQ0FBQztJQUM1RCxDQUFDO0lBQ0QsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUN0QyxJQUFJLGNBQWMsR0FBRyxJQUFJLENBQUM7UUFDMUIsSUFBSSxhQUFhLEdBQUcsS0FBSyxDQUFDO1FBQzFCLE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDdkMsc0NBQXNDO1lBQ3RDLE9BQU87Z0JBQ04sVUFBVSxFQUFFLFNBQVMsQ0FBQyxLQUFLLENBQUM7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