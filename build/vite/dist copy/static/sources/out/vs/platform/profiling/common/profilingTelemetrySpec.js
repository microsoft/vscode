/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { errorHandler } from '../../../base/common/errors.js';
export function reportSample(data, telemetryService, logService, sendAsErrorTelemtry) {
    const { sample, perfBaseline, source } = data;
    // send telemetry event
    telemetryService.publicLog2(`unresponsive.sample`, {
        perfBaseline,
        selfTime: sample.selfTime,
        totalTime: sample.totalTime,
        percentage: sample.percentage,
        functionName: sample.location,
        callers: sample.caller.map(c => c.location).join('<'),
        callersAnnotated: sample.caller.map(c => `${c.percentage}|${c.location}`).join('<'),
        source
    });
    // log a fake error with a clearer stack
    const fakeError = new PerformanceError(data);
    if (sendAsErrorTelemtry) {
        errorHandler.onUnexpectedError(fakeError);
    }
    else {
        logService.error(fakeError);
    }
}
class PerformanceError extends Error {
    constructor(data) {
        // Since the stacks are available via the sample
        // we can avoid collecting them when constructing the error.
        if (Error.hasOwnProperty('stackTraceLimit')) {
            // eslint-disable-next-line local/code-no-any-casts
            const Err = Error; // For the monaco editor checks.
            const stackTraceLimit = Err.stackTraceLimit;
            Err.stackTraceLimit = 0;
            super(`PerfSampleError: by ${data.source} in ${data.sample.location}`);
            Err.stackTraceLimit = stackTraceLimit;
        }
        else {
            super(`PerfSampleError: by ${data.source} in ${data.sample.location}`);
        }
        this.name = 'PerfSampleError';
        this.selfTime = data.sample.selfTime;
        const trace = [data.sample.absLocation, ...data.sample.caller.map(c => c.absLocation)];
        this.stack = `\n\t at ${trace.join('\n\t at ')}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZmlsaW5nVGVsZW1ldHJ5U3BlYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3Byb2ZpbGluZy9jb21tb24vcHJvZmlsaW5nVGVsZW1ldHJ5U3BlYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFnQzlELE1BQU0sVUFBVSxZQUFZLENBQUMsSUFBZ0IsRUFBRSxnQkFBbUMsRUFBRSxVQUF1QixFQUFFLG1CQUE0QjtJQUV4SSxNQUFNLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUM7SUFFOUMsdUJBQXVCO0lBQ3ZCLGdCQUFnQixDQUFDLFVBQVUsQ0FBeUQscUJBQXFCLEVBQUU7UUFDMUcsWUFBWTtRQUNaLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUTtRQUN6QixTQUFTLEVBQUUsTUFBTSxDQUFDLFNBQVM7UUFDM0IsVUFBVSxFQUFFLE1BQU0sQ0FBQyxVQUFVO1FBQzdCLFlBQVksRUFBRSxNQUFNLENBQUMsUUFBUTtRQUM3QixPQUFPLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUNyRCxnQkFBZ0IsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1FBQ25GLE1BQU07S0FDTixDQUFDLENBQUM7SUFFSCx3Q0FBd0M7SUFDeEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM3QyxJQUFJLG1CQUFtQixFQUFFLENBQUM7UUFDekIsWUFBWSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQzNDLENBQUM7U0FBTSxDQUFDO1FBQ1AsVUFBVSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM3QixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sZ0JBQWlCLFNBQVEsS0FBSztJQUduQyxZQUFZLElBQWdCO1FBQzNCLGdEQUFnRDtRQUNoRCw0REFBNEQ7UUFDNUQsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQztZQUM3QyxtREFBbUQ7WUFDbkQsTUFBTSxHQUFHLEdBQUcsS0FBMkMsQ0FBQyxDQUFDLGdDQUFnQztZQUN6RixNQUFNLGVBQWUsR0FBRyxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQzVDLEdBQUcsQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCLEtBQUssQ0FBQyx1QkFBdUIsSUFBSSxDQUFDLE1BQU0sT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDdkUsR0FBRyxDQUFDLGVBQWUsR0FBRyxlQUFlLENBQUM7UUFDdkMsQ0FBQzthQUFNLENBQUM7WUFDUCxLQUFLLENBQUMsdUJBQXVCLElBQUksQ0FBQyxNQUFNLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLENBQUM7UUFDRCxJQUFJLENBQUMsSUFBSSxHQUFHLGlCQUFpQixDQUFDO1FBQzlCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFFckMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7SUFDbEQsQ0FBQztDQUNEIn0=