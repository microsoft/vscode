// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import { Uri } from 'vscode';
import { PythonEnvKind } from '../../../client/pythonEnvironments/base/info';
import {
    BasicPythonEnvsChangedEvent,
    PythonEnvsChangedEvent,
    PythonEnvsWatcher,
} from '../../../client/pythonEnvironments/base/watcher';

const KINDS_TO_TEST = [
    PythonEnvKind.Unknown,
    PythonEnvKind.System,
    PythonEnvKind.Custom,
    PythonEnvKind.OtherGlobal,
    PythonEnvKind.Venv,
    PythonEnvKind.Conda,
    PythonEnvKind.OtherVirtual,
];

suite('Python envs watcher - PythonEnvsWatcher', () => {
    const location = Uri.file('some-dir');

    suite('fire()', () => {
        test('empty event', () => {
            const expected: PythonEnvsChangedEvent = {};
            const watcher = new PythonEnvsWatcher();
            let event: PythonEnvsChangedEvent | undefined;
            watcher.onChanged((e) => {
                event = e;
            });

            watcher.fire(expected);

            assert.strictEqual(event, expected);
        });

        KINDS_TO_TEST.forEach((kind) => {
            test(`non-empty event ("${kind}")`, () => {
                const expected: PythonEnvsChangedEvent = {
                    kind,
                    searchLocation: location,
                };
                const watcher = new PythonEnvsWatcher();
                let event: PythonEnvsChangedEvent | undefined;
                watcher.onChanged((e) => {
                    event = e;
                });

                watcher.fire(expected);

                assert.strictEqual(event, expected);
            });
        });

        test('kind-only', () => {
            const expected: PythonEnvsChangedEvent = { kind: PythonEnvKind.Venv };
            const watcher = new PythonEnvsWatcher();
            let event: PythonEnvsChangedEvent | undefined;
            watcher.onChanged((e) => {
                event = e;
            });

            watcher.fire(expected);

            assert.strictEqual(event, expected);
        });

        test('searchLocation-only', () => {
            const expected: PythonEnvsChangedEvent = { searchLocation: Uri.file('foo') };
            const watcher = new PythonEnvsWatcher();
            let event: PythonEnvsChangedEvent | undefined;
            watcher.onChanged((e) => {
                event = e;
            });

            watcher.fire(expected);

            assert.strictEqual(event, expected);
        });
    });

    suite('using BasicPythonEnvsChangedEvent', () => {
        test('empty event', () => {
            const expected: BasicPythonEnvsChangedEvent = {};
            const watcher = new PythonEnvsWatcher<BasicPythonEnvsChangedEvent>();
            let event: BasicPythonEnvsChangedEvent | undefined;
            watcher.onChanged((e) => {
                event = e;
            });

            watcher.fire(expected);

            assert.strictEqual(event, expected);
        });

        KINDS_TO_TEST.forEach((kind) => {
            test(`non-empty event ("${kind}")`, () => {
                const expected: BasicPythonEnvsChangedEvent = {
                    kind,
                };
                const watcher = new PythonEnvsWatcher<BasicPythonEnvsChangedEvent>();
                let event: BasicPythonEnvsChangedEvent | undefined;
                watcher.onChanged((e) => {
                    event = e;
                });

                watcher.fire(expected);

                assert.strictEqual(event, expected);
            });
        });
    });
});
