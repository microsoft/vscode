/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { timeout } from '../../../../base/common/async.js';
export const IRemoteAgentService = createDecorator('remoteAgentService');
export const remoteConnectionLatencyMeasurer = new class {
    constructor() {
        this.maxSampleCount = 5;
        this.sampleDelay = 2000;
        this.initial = [];
        this.maxInitialCount = 3;
        this.average = [];
        this.maxAverageCount = 100;
        this.highLatencyMultiple = 2;
        this.highLatencyMinThreshold = 500;
        this.highLatencyMaxThreshold = 1500;
        this.lastMeasurement = undefined;
    }
    get latency() { return this.lastMeasurement; }
    async measure(remoteAgentService) {
        let currentLatency = Infinity;
        // Measure up to samples count
        for (let i = 0; i < this.maxSampleCount; i++) {
            const rtt = await remoteAgentService.getRoundTripTime();
            if (rtt === undefined) {
                return undefined;
            }
            currentLatency = Math.min(currentLatency, rtt / 2 /* we want just one way, not round trip time */);
            await timeout(this.sampleDelay);
        }
        // Keep track of average latency
        this.average.push(currentLatency);
        if (this.average.length > this.maxAverageCount) {
            this.average.shift();
        }
        // Keep track of initial latency
        let initialLatency = undefined;
        if (this.initial.length < this.maxInitialCount) {
            this.initial.push(currentLatency);
        }
        else {
            initialLatency = this.initial.reduce((sum, value) => sum + value, 0) / this.initial.length;
        }
        // Remember as last measurement
        this.lastMeasurement = {
            initial: initialLatency,
            current: currentLatency,
            average: this.average.reduce((sum, value) => sum + value, 0) / this.average.length,
            high: (() => {
                // based on the initial, average and current latency, try to decide
                // if the connection has high latency
                // Some rules:
                // - we require the initial latency to be computed
                // - we only consider latency above highLatencyMinThreshold as potentially high
                // - we require the current latency to be above the average latency by a factor of highLatencyMultiple
                // - but not if the latency is actually above highLatencyMaxThreshold
                if (typeof initialLatency === 'undefined') {
                    return false;
                }
                if (currentLatency > this.highLatencyMaxThreshold) {
                    return true;
                }
                if (currentLatency > this.highLatencyMinThreshold && currentLatency > initialLatency * this.highLatencyMultiple) {
                    return true;
                }
                return false;
            })()
        };
        return this.lastMeasurement;
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlQWdlbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQU83RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsZUFBZSxDQUFzQixvQkFBb0IsQ0FBQyxDQUFDO0FBaUU5RixNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRyxJQUFJO0lBQUE7UUFFekMsbUJBQWMsR0FBRyxDQUFDLENBQUM7UUFDbkIsZ0JBQVcsR0FBRyxJQUFJLENBQUM7UUFFbkIsWUFBTyxHQUFhLEVBQUUsQ0FBQztRQUN2QixvQkFBZSxHQUFHLENBQUMsQ0FBQztRQUVwQixZQUFPLEdBQWEsRUFBRSxDQUFDO1FBQ3ZCLG9CQUFlLEdBQUcsR0FBRyxDQUFDO1FBRXRCLHdCQUFtQixHQUFHLENBQUMsQ0FBQztRQUN4Qiw0QkFBdUIsR0FBRyxHQUFHLENBQUM7UUFDOUIsNEJBQXVCLEdBQUcsSUFBSSxDQUFDO1FBRXhDLG9CQUFlLEdBQW9ELFNBQVMsQ0FBQztJQWdFOUUsQ0FBQztJQS9EQSxJQUFJLE9BQU8sS0FBSyxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO0lBRTlDLEtBQUssQ0FBQyxPQUFPLENBQUMsa0JBQXVDO1FBQ3BELElBQUksY0FBYyxHQUFHLFFBQVEsQ0FBQztRQUU5Qiw4QkFBOEI7UUFDOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FB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