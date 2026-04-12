/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
export const collectTestStateCounts = (isRunning, results) => {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let running = 0;
    let queued = 0;
    for (const result of results) {
        const count = result.counts;
        failed += count[6 /* TestResultState.Errored */] + count[4 /* TestResultState.Failed */];
        passed += count[3 /* TestResultState.Passed */];
        skipped += count[5 /* TestResultState.Skipped */];
        running += count[2 /* TestResultState.Running */];
        queued += count[1 /* TestResultState.Queued */];
    }
    return {
        isRunning,
        passed,
        failed,
        runSoFar: passed + failed,
        totalWillBeRun: passed + failed + queued + running,
        skipped,
    };
};
export const getTestProgressText = ({ isRunning, passed, runSoFar, totalWillBeRun, skipped, failed }) => {
    let percent = passed / runSoFar * 100;
    if (failed > 0) {
        // fix: prevent from rounding to 100 if there's any failed test
        percent = Math.min(percent, 99.9);
    }
    else if (runSoFar === 0) {
        percent = 0;
    }
    if (isRunning) {
        if (runSoFar === 0) {
            return localize('testProgress.runningInitial', 'Running tests...');
        }
        else if (skipped === 0) {
            return localize('testProgress.running', 'Running tests, {0}/{1} passed ({2}%)', passed, totalWillBeRun, percent.toPrecision(3));
        }
        else {
            return localize('testProgressWithSkip.running', 'Running tests, {0}/{1} tests passed ({2}%, {3} skipped)', passed, totalWillBeRun, percent.toPrecision(3), skipped);
        }
    }
    else {
        if (skipped === 0) {
            return localize('testProgress.completed', '{0}/{1} tests passed ({2}%)', passed, runSoFar, percent.toPrecision(3));
        }
        else {
            return localize('testProgressWithSkip.completed', '{0}/{1} tests passed ({2}%, {3} skipped)', passed, runSoFar, percent.toPrecision(3), skipped);
        }
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ1Byb2dyZXNzTWVzc2FnZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0aW5nUHJvZ3Jlc3NNZXNzYWdlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFNOUMsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsQ0FBQyxTQUFrQixFQUFFLE9BQW1DLEVBQUUsRUFBRTtJQUNqRyxJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDZixJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDZixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7SUFDaEIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztJQUVmLEtBQUssTUFBTSxNQUFNLElBQUksT0FBTyxFQUFFLENBQUM7UUFDOUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztRQUM1QixNQUFNLElBQUksS0FBSyxpQ0FBeUIsR0FBRyxLQUFLLGdDQUF3QixDQUFDO1FBQ3pFLE1BQU0sSUFBSSxLQUFLLGdDQUF3QixDQUFDO1FBQ3hDLE9BQU8sSUFBSSxLQUFLLGlDQUF5QixDQUFDO1FBQzFDLE9BQU8sSUFBSSxLQUFLLGlDQUF5QixDQUFDO1FBQzFDLE1BQU0sSUFBSSxLQUFLLGdDQUF3QixDQUFDO0lBQ3pDLENBQUM7SUFFRCxPQUFPO1FBQ04sU0FBUztRQUNULE1BQU07UUFDTixNQUFNO1FBQ04sUUFBUSxFQUFFLE1BQU0sR0FBRyxNQUFNO1FBQ3pCLGNBQWMsRUFBRSxNQUFNLEdBQUcsTUFBTSxHQUFHLE1BQU0sR0FBRyxPQUFPO1FBQ2xELE9BQU87S0FDUCxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFnQixFQUFFLEVBQUU7SUFDckgsSUFBSSxPQUFPLEdBQUcsTUFBTSxHQUFHLFFBQVEsR0FBRyxHQUFHLENBQUM7SUFDdEMsSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDaEIsK0RBQStEO1FBQy9ELE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNuQyxDQUFDO1NBQU0sSUFBSSxRQUFRLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDM0IsT0FBTyxHQUFHLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRCxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQ2YsSUFBSSxRQUFRLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDcEIsT0FBTyxRQUFRLENBQUMsNkJBQTZCLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUNwRSxDQUFDO2FBQU0sSUFBSSxPQUFPLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDMUIsT0FBTyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsc0NBQXNDLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBRSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakksQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSx5REFBeUQsRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDckssQ0FBQztJQUNGLENBQUM7U0FBTSxDQUFDO1FBQ1AsSUFBSSxPQUFPLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDbkIsT0FBTyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEgsQ0FBQzthQUFNLENBQUM7WUFDUCxPQUFPLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSwwQ0FBMEMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbEosQ0FBQztJQUNGLENBQUM7QUFDRixDQUFDLENBQUMifQ==