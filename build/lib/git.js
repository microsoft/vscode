/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
var path = require("path");
var fs = require("fs");
/**
 * Returns the sha1 commit version of a repository or undefined in case of failure.
 */
function getVersion(repo) {
    var git = path.join(repo, '.git');
    var headPath = path.join(git, 'HEAD');
    var head;
    try {
        head = fs.readFileSync(headPath, 'utf8').trim();
    }
    catch (e) {
        return void 0;
    }
    if (/^[0-9a-f]{40}$/i.test(head)) {
        return head;
    }
    var refMatch = /^ref: (.*)$/.exec(head);
    if (!refMatch) {
        return void 0;
    }
    var ref = refMatch[1];
    var refPath = path.join(git, ref);
    try {
        return fs.readFileSync(refPath, 'utf8').trim();
    }
    catch (e) {
    }
    var packedRefsPath = path.join(git, 'packed-refs');
    var refsRaw;
    try {
        refsRaw = fs.readFileSync(packedRefsPath, 'utf8').trim();
    }
    catch (e) {
        return void 0;
    }
    var refsRegex = /^([0-9a-f]{40})\s+(.+)$/gm;
    var refsMatch;
    var refs = {};
    while (refsMatch = refsRegex.exec(refsRaw)) {
        refs[refsMatch[2]] = refsMatch[1];
    }
    return refs[ref];
}
exports.getVersion = getVersion;
