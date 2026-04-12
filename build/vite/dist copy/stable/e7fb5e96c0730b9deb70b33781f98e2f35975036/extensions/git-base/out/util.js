"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Versions = void 0;
exports.toDisposable = toDisposable;
exports.done = done;
function toDisposable(dispose) {
    return { dispose };
}
function done(promise) {
    return promise.then(() => undefined);
}
var Versions;
(function (Versions) {
    function compare(v1, v2) {
        if (typeof v1 === 'string') {
            v1 = fromString(v1);
        }
        if (typeof v2 === 'string') {
            v2 = fromString(v2);
        }
        if (v1.major > v2.major) {
            return 1;
        }
        if (v1.major < v2.major) {
            return -1;
        }
        if (v1.minor > v2.minor) {
            return 1;
        }
        if (v1.minor < v2.minor) {
            return -1;
        }
        if (v1.patch > v2.patch) {
            return 1;
        }
        if (v1.patch < v2.patch) {
            return -1;
        }
        if (v1.pre === undefined && v2.pre !== undefined) {
            return 1;
        }
        if (v1.pre !== undefined && v2.pre === undefined) {
            return -1;
        }
        if (v1.pre !== undefined && v2.pre !== undefined) {
            return v1.pre.localeCompare(v2.pre);
        }
        return 0;
    }
    Versions.compare = compare;
    function from(major, minor, patch, pre) {
        return {
            major: typeof major === 'string' ? parseInt(major, 10) : major,
            minor: typeof minor === 'string' ? parseInt(minor, 10) : minor,
            patch: patch === undefined || patch === null ? 0 : typeof patch === 'string' ? parseInt(patch, 10) : patch,
            pre: pre,
        };
    }
    Versions.from = from;
    function fromString(version) {
        const [ver, pre] = version.split('-');
        const [major, minor, patch] = ver.split('.');
        return from(major, minor, patch, pre);
    }
    Versions.fromString = fromString;
})(Versions || (exports.Versions = Versions = {}));
//# sourceMappingURL=util.js.map