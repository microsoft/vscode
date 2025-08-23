// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import '../../../common/extensions';
import { getDebugpyPath } from '../../pythonDebugger';

type RemoteDebugOptions = {
    host: string;
    port: number;
    waitUntilDebuggerAttaches: boolean;
};

export async function getDebugpyLauncherArgs(options: RemoteDebugOptions, debuggerPath?: string) {
    if (!debuggerPath) {
        debuggerPath = await getDebugpyPath();
    }

    const waitArgs = options.waitUntilDebuggerAttaches ? ['--wait-for-client'] : [];
    return [
        debuggerPath.fileToCommandArgumentForPythonExt(),
        '--listen',
        `${options.host}:${options.port}`,
        ...waitArgs,
    ];
}
