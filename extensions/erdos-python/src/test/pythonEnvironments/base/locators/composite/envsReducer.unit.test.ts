// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert, expect } from 'chai';
import * as path from 'path';
import { PythonEnvKind, PythonEnvSource } from '../../../../../client/pythonEnvironments/base/info';
import { PythonEnvsReducer } from '../../../../../client/pythonEnvironments/base/locators/composite/envsReducer';
import { PythonEnvsChangedEvent } from '../../../../../client/pythonEnvironments/base/watcher';
import { assertBasicEnvsEqual } from '../envTestUtils';
import { createBasicEnv, getEnvs, getEnvsWithUpdates, SimpleLocator } from '../../common';
import {
    BasicEnvInfo,
    ProgressReportStage,
    isProgressEvent,
} from '../../../../../client/pythonEnvironments/base/locator';
import { createDeferred } from '../../../../../client/common/utils/async';

suite('Python envs locator - Environments Reducer', () => {
    suite('iterEnvs()', () => {
        test('Iterator only yields unique environments', async () => {
            const env1 = createBasicEnv(PythonEnvKind.Venv, path.join('path', 'to', 'exec1'));
            const env2 = createBasicEnv(PythonEnvKind.Conda, path.join('path', 'to', 'exec2'));
            const env3 = createBasicEnv(PythonEnvKind.System, path.join('path', 'to', 'exec3'));
            const env4 = createBasicEnv(PythonEnvKind.Unknown, path.join('path', 'to', 'exec2')); // Same as env2
            const env5 = createBasicEnv(PythonEnvKind.Venv, path.join('path', 'to', 'exec1')); // Same as env1
            const environmentsToBeIterated = [env1, env2, env3, env4, env5]; // Contains 3 unique environments
            const parentLocator = new SimpleLocator(environmentsToBeIterated);
            const reducer = new PythonEnvsReducer(parentLocator);

            const iterator = reducer.iterEnvs();
            const envs = await getEnvs(iterator);

            const expected = [env1, env2, env3];
            assertBasicEnvsEqual(envs, expected);
        });

        test('Updates are applied correctly', async () => {
            const env1 = createBasicEnv(PythonEnvKind.Venv, path.join('path', 'to', 'exec1'));
            const env2 = createBasicEnv(PythonEnvKind.System, path.join('path', 'to', 'exec2'), [
                PythonEnvSource.PathEnvVar,
            ]);
            const env3 = createBasicEnv(PythonEnvKind.Conda, path.join('path', 'to', 'exec2'), [
                PythonEnvSource.WindowsRegistry,
            ]); // Same as env2
            const env4 = createBasicEnv(PythonEnvKind.Unknown, path.join('path', 'to', 'exec2')); // Same as env2
            const env5 = createBasicEnv(PythonEnvKind.Poetry, path.join('path', 'to', 'exec1')); // Same as env1
            const env6 = createBasicEnv(PythonEnvKind.VirtualEnv, path.join('path', 'to', 'exec1')); // Same as env1
            const environmentsToBeIterated = [env1, env2, env3, env4, env5, env6]; // Contains 3 unique environments
            const parentLocator = new SimpleLocator(environmentsToBeIterated);
            const reducer = new PythonEnvsReducer(parentLocator);

            const iterator = reducer.iterEnvs();
            const envs = await getEnvsWithUpdates(iterator);

            const expected = [
                createBasicEnv(PythonEnvKind.Poetry, path.join('path', 'to', 'exec1')),
                createBasicEnv(PythonEnvKind.Conda, path.join('path', 'to', 'exec2'), [
                    PythonEnvSource.PathEnvVar,
                    PythonEnvSource.WindowsRegistry,
                ]),
            ];
            assertBasicEnvsEqual(envs, expected);
        });

        test('Ensure progress updates are emitted correctly', async () => {
            // Arrange
            const env1 = createBasicEnv(PythonEnvKind.Venv, path.join('path', 'to', 'exec1'));
            const env2 = createBasicEnv(PythonEnvKind.System, path.join('path', 'to', 'exec2'), [
                PythonEnvSource.PathEnvVar,
            ]);
            const envsReturnedByParentLocator = [env1, env2];
            const parentLocator = new SimpleLocator<BasicEnvInfo>(envsReturnedByParentLocator);
            const reducer = new PythonEnvsReducer(parentLocator);

            // Act
            const iterator = reducer.iterEnvs();
            let stage: ProgressReportStage | undefined;
            let waitForProgressEvent = createDeferred<void>();
            iterator.onUpdated!(async (event) => {
                if (isProgressEvent(event)) {
                    stage = event.stage;
                    waitForProgressEvent.resolve();
                }
            });
            // Act
            let result = await iterator.next();
            await waitForProgressEvent.promise;
            // Assert
            expect(stage).to.equal(ProgressReportStage.discoveryStarted);

            // Act
            waitForProgressEvent = createDeferred<void>();
            while (!result.done) {
                // Once all envs are iterated, discovery should be finished.
                result = await iterator.next();
            }
            await waitForProgressEvent.promise;
            // Assert
            expect(stage).to.equal(ProgressReportStage.discoveryFinished);
        });
    });

    test('onChanged fires iff onChanged from locator manager fires', () => {
        const parentLocator = new SimpleLocator([]);
        const event1: PythonEnvsChangedEvent = {};
        const event2: PythonEnvsChangedEvent = { kind: PythonEnvKind.Unknown };
        const expected = [event1, event2];
        const reducer = new PythonEnvsReducer(parentLocator);

        const events: PythonEnvsChangedEvent[] = [];
        reducer.onChanged((e) => events.push(e));

        parentLocator.fire(event1);
        parentLocator.fire(event2);

        assert.deepEqual(events, expected);
    });
});
