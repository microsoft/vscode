// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect, use } from 'chai';
import * as chaiPromise from 'chai-as-promised';
import { clearCache } from '../../../client/common/utils/cacheUtils';
import { cache, makeDebounceAsyncDecorator, makeDebounceDecorator } from '../../../client/common/utils/decorators';
import { sleep } from '../../core';
use(chaiPromise.default);

suite('Common Utils - Decorators', function () {
    // For some reason, sometimes we have timeouts on CI.
    // Note: setTimeout and similar functions are not guaranteed to execute
    // at the precise time prescribed.

    this.retries(3);
    suite('Cache Decorator', () => {
        const oldValueOfVSC_PYTHON_UNIT_TEST = process.env.VSC_PYTHON_UNIT_TEST;
        const oldValueOfVSC_PYTHON_CI_TEST = process.env.VSC_PYTHON_CI_TEST;

        setup(() => {
            process.env.VSC_PYTHON_UNIT_TEST = undefined;
            process.env.VSC_PYTHON_CI_TEST = undefined;
        });

        teardown(() => {
            process.env.VSC_PYTHON_UNIT_TEST = oldValueOfVSC_PYTHON_UNIT_TEST;
            process.env.VSC_PYTHON_CI_TEST = oldValueOfVSC_PYTHON_CI_TEST;
            clearCache();
        });
        class TestClass {
            public invoked = false;
            @cache(1000)
            public async doSomething(a: number, b: number): Promise<number> {
                this.invoked = true;
                return a + b;
            }
        }

        test('Result should be cached for 1s', async () => {
            const cls = new TestClass();
            expect(cls.invoked).to.equal(false, 'Wrong initialization value');
            await expect(cls.doSomething(1, 2)).to.eventually.equal(3);
            expect(cls.invoked).to.equal(true, 'Should have been invoked');

            // Reset and ensure it is not updated.
            cls.invoked = false;
            await expect(cls.doSomething(1, 2)).to.eventually.equal(3);
            expect(cls.invoked).to.equal(false, 'Should not have been invoked');
            await expect(cls.doSomething(1, 2)).to.eventually.equal(3);
            expect(cls.invoked).to.equal(false, 'Should not have been invoked');

            // Cache should expire.
            await sleep(2000);

            await expect(cls.doSomething(1, 2)).to.eventually.equal(3);
            expect(cls.invoked).to.equal(true, 'Should have been invoked');
            // Reset and ensure it is not updated.
            cls.invoked = false;
            await expect(cls.doSomething(1, 2)).to.eventually.equal(3);
            expect(cls.invoked).to.equal(false, 'Should not have been invoked');
        }).timeout(3000);
    });

    suite('Debounce', () => {
        /*
         * Time in milliseconds (from some arbitrary point in time for current process).
         * Don't use new Date().getTime() to calculate differences in times.
         * Similarly setTimeout doesn't always trigger at prescribed time (accuracy isn't guaranteed).
         * This has an accuracy of around 2-20ms.
         * However we're dealing with tests that need accuracy of 1ms.
         * Use API that'll give us better accuracy when dealing with elapsed times.
         */
        function getHighPrecisionTime(): number {
            const currentTime = process.hrtime();
            // Convert seconds to ms and nanoseconds to ms.
            return currentTime[0] * 1000 + currentTime[1] / 1000_000;
        }

        /**
         * setTimeout doesn't always trigger at prescribed time (accuracy isn't guaranteed).
         * Allow a discrepancy of +-5%.
         * Here's a simple test to prove this (this has been reported by others too):
         * ```js
         * // Execute the following around 100 times, you'll see at least one where elapsed time is < 100.
         * const startTime = ....
         * await new Promise(resolve = setTimeout(resolve, 100))
         * console.log(currentTime - startTijme)
         * ```
         */
        function assertElapsedTimeWithinRange(actualDelay: number, expectedDelay: number) {
            const difference = actualDelay - expectedDelay;
            if (difference >= 0) {
                return;
            }
            expect(Math.abs(difference)).to.be.lessThan(
                expectedDelay * 0.05,
                `Actual delay  ${actualDelay}, expected delay ${expectedDelay}, not within 5% of accuracy`,
            );
        }

        class Base {
            public created: number;
            public calls: string[];
            public timestamps: number[];
            constructor() {
                this.created = getHighPrecisionTime();
                this.calls = [];
                this.timestamps = [];
            }
            protected _addCall(funcname: string, timestamp?: number): void {
                if (!timestamp) {
                    timestamp = getHighPrecisionTime();
                }
                this.calls.push(funcname);
                this.timestamps.push(timestamp);
            }
        }
        async function waitForCalls(timestamps: number[], count: number, delay = 10, timeout = 1000) {
            const steps = timeout / delay;
            for (let i = 0; i < steps; i += 1) {
                if (timestamps.length >= count) {
                    return;
                }
                await sleep(delay);
            }
            if (timestamps.length < count) {
                throw Error(`timed out after ${timeout}ms`);
            }
        }
        test('Debounce: one sync call', async () => {
            const wait = 100;

            class One extends Base {
                @makeDebounceDecorator(wait)
                public run(): void {
                    this._addCall('run');
                }
            }
            const one = new One();

            const start = getHighPrecisionTime();
            one.run();
            await waitForCalls(one.timestamps, 1);
            const delay = one.timestamps[0] - start;

            assertElapsedTimeWithinRange(delay, wait);
            expect(one.calls).to.deep.equal(['run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
        });
        test('Debounce: one async call & no wait', async () => {
            const wait = 100;

            class One extends Base {
                @makeDebounceAsyncDecorator(wait)
                public async run(): Promise<void> {
                    this._addCall('run');
                }
            }
            const one = new One();

            const start = getHighPrecisionTime();
            let errored = false;
            one.run().catch(() => (errored = true));
            await waitForCalls(one.timestamps, 1);
            const delay = one.timestamps[0] - start;

            assertElapsedTimeWithinRange(delay, wait);
            expect(one.calls).to.deep.equal(['run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
            expect(errored).to.be.equal(false, "Exception raised when there shouldn't have been any");
        });
        test('Debounce: one async call', async () => {
            const wait = 100;

            class One extends Base {
                @makeDebounceAsyncDecorator(wait)
                public async run(): Promise<void> {
                    this._addCall('run');
                }
            }
            const one = new One();

            const start = getHighPrecisionTime();
            await one.run();
            await waitForCalls(one.timestamps, 1);
            const delay = one.timestamps[0] - start;

            assertElapsedTimeWithinRange(delay, wait);
            expect(one.calls).to.deep.equal(['run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
        });
        test('Debounce: one async call and ensure exceptions are re-thrown', async () => {
            const wait = 100;

            class One extends Base {
                @makeDebounceAsyncDecorator(wait)
                public async run(): Promise<void> {
                    this._addCall('run');
                    throw new Error('Kaboom');
                }
            }
            const one = new One();

            const start = getHighPrecisionTime();
            let capturedEx: Error | undefined;
            await one.run().catch((ex) => (capturedEx = ex));
            await waitForCalls(one.timestamps, 1);
            const delay = one.timestamps[0] - start;

            assertElapsedTimeWithinRange(delay, wait);
            expect(one.calls).to.deep.equal(['run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
            expect(capturedEx).to.not.be.equal(undefined, 'Exception not re-thrown');
        });
        test('Debounce: multiple async calls', async () => {
            const wait = 100;

            class One extends Base {
                @makeDebounceAsyncDecorator(wait)
                public async run(): Promise<void> {
                    this._addCall('run');
                }
            }
            const one = new One();

            const start = getHighPrecisionTime();
            let errored = false;
            one.run().catch(() => (errored = true));
            one.run().catch(() => (errored = true));
            one.run().catch(() => (errored = true));
            one.run().catch(() => (errored = true));
            await waitForCalls(one.timestamps, 1);
            const delay = one.timestamps[0] - start;

            assertElapsedTimeWithinRange(delay, wait);
            expect(one.calls).to.deep.equal(['run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
            expect(errored).to.be.equal(false, "Exception raised when there shouldn't have been any");
        });
        test('Debounce: multiple async calls when awaiting on all', async function () {
            const wait = 100;

            class One extends Base {
                @makeDebounceAsyncDecorator(wait)
                public async run(): Promise<void> {
                    this._addCall('run');
                }
            }
            const one = new One();

            const start = getHighPrecisionTime();
            await Promise.all([one.run(), one.run(), one.run(), one.run()]);
            await waitForCalls(one.timestamps, 1);
            const delay = one.timestamps[0] - start;

            assertElapsedTimeWithinRange(delay, wait);
            expect(one.calls).to.deep.equal(['run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
        });
        test('Debounce: multiple async calls & wait on some', async () => {
            const wait = 100;

            class One extends Base {
                @makeDebounceAsyncDecorator(wait)
                public async run(): Promise<void> {
                    this._addCall('run');
                }
            }
            const one = new One();

            const start = getHighPrecisionTime();
            let errored = false;
            one.run().catch(() => (errored = true));
            await one.run();
            one.run().catch(() => (errored = true));
            one.run().catch(() => (errored = true));
            await waitForCalls(one.timestamps, 2);
            const delay = one.timestamps[1] - start;

            assertElapsedTimeWithinRange(delay, wait);
            expect(one.calls).to.deep.equal(['run', 'run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
            expect(errored).to.be.equal(false, "Exception raised when there shouldn't have been any");
        });
        test('Debounce: multiple calls grouped', async () => {
            const wait = 100;

            class One extends Base {
                @makeDebounceDecorator(wait)
                public run(): void {
                    this._addCall('run');
                }
            }
            const one = new One();

            const start = getHighPrecisionTime();
            one.run();
            one.run();
            one.run();
            await waitForCalls(one.timestamps, 1);
            const delay = one.timestamps[0] - start;

            assertElapsedTimeWithinRange(delay, wait);
            expect(one.calls).to.deep.equal(['run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
        });
        test('Debounce: multiple calls spread', async () => {
            const wait = 100;

            class One extends Base {
                @makeDebounceDecorator(wait)
                public run(): void {
                    this._addCall('run');
                }
            }
            const one = new One();

            one.run();
            await sleep(wait);
            one.run();
            await waitForCalls(one.timestamps, 2);

            expect(one.calls).to.deep.equal(['run', 'run']);
            expect(one.timestamps).to.have.lengthOf(one.calls.length);
        });
    });
});
