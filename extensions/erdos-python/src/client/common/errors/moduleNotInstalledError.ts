// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export class ModuleNotInstalledError extends Error {
    constructor(moduleName: string) {
        super(`Module '${moduleName}' not installed.`);
    }
}
