"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.date = void 0;
function getRoundedBuildDate() {
    const now = new Date();
    const minutes = now.getMinutes();
    if (minutes >= 30) {
        now.setHours(now.getHours() + 1);
    }
    now.setMinutes(0, 0, 0);
    return now;
}
/**
 * An attempt to produce a stable date for the build that can be
 * used across processes and build steps that run in parallel almost
 * at the same time. The current time is rounded up or down to the
 * closest hour.
 */
exports.date = getRoundedBuildDate().toISOString();
//# sourceMappingURL=date.js.map