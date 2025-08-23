// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import { getOSType, OSType } from '../../../../../client/common/utils/platform';
import { Disposables } from '../../../../../client/common/utils/resourceLifecycle';
import { PythonEnvInfo, PythonEnvKind } from '../../../../../client/pythonEnvironments/base/info';
import { BasicEnvInfo, IPythonEnvsIterator } from '../../../../../client/pythonEnvironments/base/locator';
import {
    FSWatcherKind,
    FSWatchingLocator,
} from '../../../../../client/pythonEnvironments/base/locators/lowLevel/fsWatchingLocator';
import * as binWatcher from '../../../../../client/pythonEnvironments/common/pythonBinariesWatcher';
import { TEST_LAYOUT_ROOT } from '../../../common/commonTestConstants';

suite('File System Watching Locator Tests', () => {
    const baseDir = TEST_LAYOUT_ROOT;
    const fakeDir = '/this/is/a/fake/path';
    const callback = async () => Promise.resolve(PythonEnvKind.System);
    let watchLocationStub: sinon.SinonStub;

    setup(() => {
        watchLocationStub = sinon.stub(binWatcher, 'watchLocationForPythonBinaries');
        watchLocationStub.resolves(new Disposables());
    });

    teardown(() => {
        sinon.restore();
    });

    class TestWatcher extends FSWatchingLocator {
        public readonly providerId: string = 'test';

        constructor(
            watcherKind: FSWatcherKind,
            opts: {
                envStructure?: binWatcher.PythonEnvStructure;
            } = {},
        ) {
            super(() => [baseDir, fakeDir], callback, opts, watcherKind);
        }

        public async initialize() {
            await this.initWatchers();
        }

        // eslint-disable-next-line class-methods-use-this
        protected doIterEnvs(): IPythonEnvsIterator<BasicEnvInfo> {
            throw new Error('Method not implemented.');
        }

        // eslint-disable-next-line class-methods-use-this
        protected doResolveEnv(): Promise<PythonEnvInfo | undefined> {
            throw new Error('Method not implemented.');
        }
    }

    [
        binWatcher.PythonEnvStructure.Standard,
        binWatcher.PythonEnvStructure.Flat,
        // `undefined` means "use the default".
        undefined,
    ].forEach((envStructure) => {
        suite(`${envStructure || 'default'} structure`, () => {
            const expected =
                getOSType() === OSType.Windows
                    ? [
                          // The first one is the basename glob.
                          'python.exe',
                          '*/python.exe',
                          '*/Scripts/python.exe',
                      ]
                    : [
                          // The first one is the basename glob.
                          'python',
                          '*/python',
                          '*/bin/python',
                      ];
            if (envStructure === binWatcher.PythonEnvStructure.Flat) {
                while (expected.length > 1) {
                    expected.pop();
                }
            }

            const watcherKinds = [FSWatcherKind.Global, FSWatcherKind.Workspace];

            const opts = {
                envStructure,
            };

            watcherKinds.forEach((watcherKind) => {
                test(`watching ${FSWatcherKind[watcherKind]}`, async () => {
                    const testWatcher = new TestWatcher(watcherKind, opts);
                    await testWatcher.initialize();

                    // Watcher should be called for all workspace locators. For global locators it should never be called.
                    if (watcherKind === FSWatcherKind.Workspace) {
                        assert.strictEqual(watchLocationStub.callCount, expected.length);
                        expected.forEach((glob) => {
                            assert.ok(watchLocationStub.calledWithMatch(baseDir, sinon.match.any, glob));
                            assert.strictEqual(
                                // As directory does not exist, it should not be watched.
                                watchLocationStub.calledWithMatch(fakeDir, sinon.match.any, glob),
                                false,
                            );
                        });
                    } else if (watcherKind === FSWatcherKind.Global) {
                        assert.ok(watchLocationStub.notCalled);
                    }
                });
            });
        });
    });
});
