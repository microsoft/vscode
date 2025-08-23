// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import { Uri } from 'vscode';
import { createDeferred } from '../../../client/common/utils/async';
import { PythonEnvInfo, PythonEnvKind } from '../../../client/pythonEnvironments/base/info';
import { PythonLocatorQuery } from '../../../client/pythonEnvironments/base/locator';
import { Locators } from '../../../client/pythonEnvironments/base/locators';
import { PythonEnvsChangedEvent } from '../../../client/pythonEnvironments/base/watcher';
import { createLocatedEnv, createNamedEnv, getEnvs, SimpleLocator } from './common';

suite('Python envs locators - Locators', () => {
    suite('onChanged consolidates', () => {
        test('one', () => {
            const event1: PythonEnvsChangedEvent = {};
            const expected = [event1];
            const sub1 = new SimpleLocator([]);
            const locators = new Locators([sub1]);

            const events: PythonEnvsChangedEvent[] = [];
            locators.onChanged((e) => events.push(e));
            sub1.fire(event1);

            assert.deepEqual(events, expected);
        });

        test('many', () => {
            const loc1 = Uri.file('some-dir');
            const event1: PythonEnvsChangedEvent = { kind: PythonEnvKind.Unknown, searchLocation: loc1 };
            const event2: PythonEnvsChangedEvent = { kind: PythonEnvKind.Venv };
            const event3: PythonEnvsChangedEvent = {};
            const event4: PythonEnvsChangedEvent = { searchLocation: loc1 };
            const event5: PythonEnvsChangedEvent = {};
            const expected = [event1, event2, event3, event4, event5];
            const sub1 = new SimpleLocator([]);
            const sub2 = new SimpleLocator([]);
            const sub3 = new SimpleLocator([]);
            const locators = new Locators([sub1, sub2, sub3]);

            const events: PythonEnvsChangedEvent[] = [];
            locators.onChanged((e) => events.push(e));
            sub2.fire(event1);
            sub3.fire(event2);
            sub1.fire(event3);
            sub2.fire(event4);
            sub1.fire(event5);

            assert.deepEqual(events, expected);
        });
    });

    suite('iterEnvs() consolidates', () => {
        test('no envs', async () => {
            const expected: PythonEnvInfo[] = [];
            const sub1 = new SimpleLocator([]);
            const locators = new Locators([sub1]);

            const iterator = locators.iterEnvs();
            const envs = await getEnvs(iterator);

            assert.deepEqual(envs, expected);
        });

        test('one', async () => {
            const env1 = createNamedEnv('foo', '3.8', PythonEnvKind.Venv);
            const expected: PythonEnvInfo[] = [env1];
            const sub1 = new SimpleLocator(expected);
            const locators = new Locators([sub1]);

            const iterator = locators.iterEnvs();
            const envs = await getEnvs(iterator);

            assert.deepEqual(envs, expected);
        });

        test('many', async () => {
            const env1 = createNamedEnv('foo', '3.5.12b1', PythonEnvKind.Venv);
            const env2 = createLocatedEnv('some-dir', '3.8.1', PythonEnvKind.Conda);
            const env3 = createNamedEnv('python2', '2.7', PythonEnvKind.System);
            const env4 = createNamedEnv('42', '3.9.0rc2', PythonEnvKind.Pyenv);
            const env5 = createNamedEnv('hello world', '3.8', PythonEnvKind.System);
            const expected = [env1, env2, env3, env4, env5];
            const sub1 = new SimpleLocator([env1]);
            const sub2 = new SimpleLocator([], { before: () => sub1.done });
            const sub3 = new SimpleLocator([env2, env3, env4], { before: () => sub2.done });
            const sub4 = new SimpleLocator([env5], { before: () => sub3.done });
            const locators = new Locators([sub1, sub2, sub3, sub4]);

            const iterator = locators.iterEnvs();
            const envs = await getEnvs(iterator);

            assert.deepEqual(envs, expected);
        });

        test('with query', async () => {
            const expected: PythonLocatorQuery = {
                kinds: [PythonEnvKind.Venv],
                searchLocations: { roots: [Uri.file('???')] },
            };
            let query: PythonLocatorQuery | undefined;
            async function onQuery(q: PythonLocatorQuery | undefined, e: PythonEnvInfo[]) {
                query = q;
                return e;
            }
            const env1 = createNamedEnv('foo', '3.8', PythonEnvKind.Venv);
            const sub1 = new SimpleLocator([env1], { onQuery });
            const locators = new Locators([sub1]);

            const iterator = locators.iterEnvs(expected);
            await getEnvs(iterator);

            assert.deepEqual(query, expected);
        });

        test('iterate out of order', async () => {
            const env1 = createNamedEnv('foo', '3.5.12b1', PythonEnvKind.Venv);
            const env2 = createLocatedEnv('some-dir', '3.8.1', PythonEnvKind.Conda);
            const env3 = createNamedEnv('python2', '2.7', PythonEnvKind.System);
            const env4 = createNamedEnv('42', '3.9.0rc2', PythonEnvKind.Pyenv);
            const env5 = createNamedEnv('hello world', '3.8', PythonEnvKind.System);
            const env6 = createNamedEnv('spam', '3.10.0a0', PythonEnvKind.Custom);
            const env7 = createNamedEnv('eggs', '3.9.1a0', PythonEnvKind.Custom);
            const expected = [env5, env1, env2, env3, env4, env6, env7];
            const sub4 = new SimpleLocator([env5]);
            const sub2 = new SimpleLocator([env1], { before: () => sub4.done });
            const sub1 = new SimpleLocator([]);
            const sub3 = new SimpleLocator([env2, env3, env4], { before: () => sub2.done });
            const sub5 = new SimpleLocator([env6, env7], { before: () => sub3.done });
            const locators = new Locators([sub1, sub2, sub3, sub4, sub5]);

            const iterator = locators.iterEnvs();
            const envs = await getEnvs(iterator);

            assert.deepEqual(envs, expected);
        });

        test('iterate intermingled', async () => {
            const env1 = createNamedEnv('foo', '3.5.12b1', PythonEnvKind.Venv);
            const env2 = createLocatedEnv('some-dir', '3.8.1', PythonEnvKind.Conda);
            const env3 = createNamedEnv('python2', '2.7', PythonEnvKind.System);
            const env4 = createNamedEnv('42', '3.9.0rc2', PythonEnvKind.Pyenv);
            const env5 = createNamedEnv('hello world', '3.8', PythonEnvKind.System);
            const expected = [env1, env4, env2, env5, env3];
            const deferred1 = createDeferred<void>();
            const deferred2 = createDeferred<void>();
            const deferred4 = createDeferred<void>();
            const deferred5 = createDeferred<void>();
            const sub1 = new SimpleLocator([env1, env2, env3], {
                beforeEach: async (env) => {
                    if (env === env2) {
                        await deferred4.promise;
                    } else if (env === env3) {
                        await deferred5.promise;
                    }
                },
                afterEach: async (env) => {
                    if (env === env1) {
                        deferred1.resolve();
                    } else if (env === env2) {
                        deferred2.resolve();
                    }
                },
            });
            const sub2 = new SimpleLocator([env4, env5], {
                beforeEach: async (env) => {
                    if (env === env4) {
                        await deferred1.promise;
                    } else if (env === env5) {
                        await deferred2.promise;
                    }
                },
                afterEach: async (env) => {
                    if (env === env4) {
                        deferred4.resolve();
                    } else if (env === env5) {
                        deferred5.resolve();
                    }
                },
            });
            const locators = new Locators([sub1, sub2]);

            const iterator = locators.iterEnvs();
            const envs = await getEnvs(iterator);

            assert.deepEqual(envs, expected);
        });
    });
});
