// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Architecture } from '../../client/common/utils/platform';
import { EnvironmentType, PythonEnvironment } from '../../client/pythonEnvironments/info';

/**
 * Creates a PythonInterpreter object for testing purposes, with unique name, version and path.
 * If required a custom name, version and the like can be provided.
 */
export function createPythonInterpreter(info?: Partial<PythonEnvironment>): PythonEnvironment {
    const rnd = new Date().getTime().toString();
    return {
        displayName: `Something${rnd}`,
        architecture: Architecture.Unknown,
        path: `somePath${rnd}`,
        sysPrefix: `someSysPrefix${rnd}`,
        sysVersion: `1.1.1`,
        envType: EnvironmentType.Unknown,
        ...(info || {}),
    };
}
