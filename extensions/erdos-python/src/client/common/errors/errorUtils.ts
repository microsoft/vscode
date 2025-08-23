// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export class ErrorUtils {
    public static outputHasModuleNotInstalledError(moduleName: string, content?: string): boolean {
        return content &&
            (content!.indexOf(`No module named ${moduleName}`) > 0 ||
                content!.indexOf(`No module named '${moduleName}'`) > 0)
            ? true
            : false;
    }
}

/**
 * An error class that contains a telemetry safe reason.
 */
export class ErrorWithTelemetrySafeReason extends Error {
    constructor(message: string, public readonly telemetrySafeReason: string) {
        super(message);
    }
}
