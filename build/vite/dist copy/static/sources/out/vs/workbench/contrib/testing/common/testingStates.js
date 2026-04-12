/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mapValues } from '../../../../base/common/objects.js';
/**
 * List of display priorities for different run states. When tests update,
 * the highest-priority state from any of their children will be the state
 * reflected in the parent node.
 */
export const statePriority = {
    [2 /* TestResultState.Running */]: 6,
    [6 /* TestResultState.Errored */]: 5,
    [4 /* TestResultState.Failed */]: 4,
    [1 /* TestResultState.Queued */]: 3,
    [3 /* TestResultState.Passed */]: 2,
    [0 /* TestResultState.Unset */]: 0,
    [5 /* TestResultState.Skipped */]: 1,
};
export const isFailedState = (s) => s === 6 /* TestResultState.Errored */ || s === 4 /* TestResultState.Failed */;
export const isStateWithResult = (s) => s === 6 /* TestResultState.Errored */ || s === 4 /* TestResultState.Failed */ || s === 3 /* TestResultState.Passed */;
export const stateNodes = mapValues(statePriority, (priority, stateStr) => {
    const state = Number(stateStr);
    return { statusNode: true, state, priority };
});
export const cmpPriority = (a, b) => statePriority[b] - statePriority[a];
export const maxPriority = (...states) => {
    switch (states.length) {
        case 0:
            return 0 /* TestResultState.Unset */;
        case 1:
            return states[0];
        case 2:
            return statePriority[states[0]] > statePriority[states[1]] ? states[0] : states[1];
        default: {
            let max = states[0];
            for (let i = 1; i < states.length; i++) {
                if (statePriority[max] < statePriority[states[i]]) {
                    max = states[i];
                }
            }
            return max;
        }
    }
};
export const statesInOrder = Object.keys(statePriority).map(s => Number(s)).sort(cmpPriority);
/**
 * Some states are considered terminal; once these are set for a given test run, they
 * are not reset back to a non-terminal state, or to a terminal state with lower
 * priority.
 */
export const terminalStatePriorities = {
    [3 /* TestResultState.Passed */]: 0,
    [5 /* TestResultState.Skipped */]: 1,
    [4 /* TestResultState.Failed */]: 2,
    [6 /* TestResultState.Errored */]: 3,
};
export const makeEmptyCounts = () => {
    // shh! don't tell anyone this is actually an array!
    return new Uint32Array(statesInOrder.length);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ1N0YXRlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RpbmdTdGF0ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBSy9EOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsTUFBTSxhQUFhLEdBQXVDO0lBQ2hFLGlDQUF5QixFQUFFLENBQUM7SUFDNUIsaUNBQXlCLEVBQUUsQ0FBQztJQUM1QixnQ0FBd0IsRUFBRSxDQUFDO0lBQzNCLGdDQUF3QixFQUFFLENBQUM7SUFDM0IsZ0NBQXdCLEVBQUUsQ0FBQztJQUMzQiwrQkFBdUIsRUFBRSxDQUFDO0lBQzFCLGlDQUF5QixFQUFFLENBQUM7Q0FDNUIsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLGFBQWEsR0FBRyxDQUFDLENBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUMsb0NBQTRCLElBQUksQ0FBQyxtQ0FBMkIsQ0FBQztBQUNuSCxNQUFNLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLENBQWtCLEVBQUUsRUFBRSxDQUFDLENBQUMsb0NBQTRCLElBQUksQ0FBQyxtQ0FBMkIsSUFBSSxDQUFDLG1DQUEyQixDQUFDO0FBRXZKLE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBOEMsU0FBUyxDQUFDLGFBQWEsRUFBRSxDQUFDLFFBQVEsRUFBRSxRQUFRLEVBQWlCLEVBQUU7SUFDbkksTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBb0IsQ0FBQztJQUNsRCxPQUFPLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUM7QUFDOUMsQ0FBQyxDQUFDLENBQUM7QUFFSCxNQUFNLENBQUMsTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFrQixFQUFFLENBQWtCLEVBQUUsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFM0csTUFBTSxDQUFDLE1BQU0sV0FBVyxHQUFHLENBQUMsR0FBRyxNQUF5QixFQUFFLEVBQUU7SUFDM0QsUUFBUSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDdkIsS0FBSyxDQUFDO1lBQ0wscUNBQTZCO1FBQzlCLEtBQUssQ0FBQztZQUNMLE9BQU8sTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xCLEtBQUssQ0FBQztZQUNMLE9BQU8sYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEYsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNULElBQUksR0FBRyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN4QyxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUMsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDbkQsR0FBRyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDakIsQ0FBQztZQUNGLENBQUM7WUFFRCxPQUFPLEdBQUcsQ0FBQztRQUNaLENBQUM7SUFDRixDQUFDO0FBQ0YsQ0FBQyxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBb0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztBQUVqSDs7OztHQUlHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQTBDO0lBQzdFLGdDQUF3QixFQUFFLENBQUM7SUFDM0IsaUNBQXlCLEVBQUUsQ0FBQztJQUM1QixnQ0FBd0IsRUFBRSxDQUFDO0lBQzNCLGlDQUF5QixFQUFFLENBQUM7Q0FDNUIsQ0FBQztBQU9GLE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxHQUFtQixFQUFFO0lBQ25ELG9EQUFvRDtJQUNwRCxPQUFPLElBQUksV0FBVyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQThCLENBQUM7QUFDM0UsQ0FBQyxDQUFDIn0=