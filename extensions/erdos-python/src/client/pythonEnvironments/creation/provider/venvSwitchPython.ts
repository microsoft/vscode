// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { Disposable, Uri } from 'vscode';
import { createDeferred } from '../../../common/utils/async';
import { getExtension } from '../../../common/vscodeApis/extensionsApi';
import { PVSC_EXTENSION_ID, PythonExtension } from '../../../api/types';
import { traceInfo } from '../../../logging';

export async function switchSelectedPython(interpreter: string, uri: Uri, purpose: string): Promise<void> {
    let dispose: Disposable | undefined;
    try {
        const deferred = createDeferred<void>();
        const api: PythonExtension = getExtension(PVSC_EXTENSION_ID)?.exports as PythonExtension;
        dispose = api.environments.onDidChangeActiveEnvironmentPath(async (e) => {
            if (path.normalize(e.path) === path.normalize(interpreter)) {
                traceInfo(`Switched to interpreter ${purpose}: ${interpreter}`);
                deferred.resolve();
            }
        });
        api.environments.updateActiveEnvironmentPath(interpreter, uri);
        traceInfo(`Switching interpreter ${purpose}: ${interpreter}`);
        await deferred.promise;
    } finally {
        dispose?.dispose();
    }
}
