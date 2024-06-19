"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersion = getVersion;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path = require("path");
const fs = require("fs");
/**
 * Returns the sha1 commit version of a repository or undefined in case of failure.
 */
function getVersion(repo) {
    // MEMBRANE: make `getVersion` work when vscode is a submodule and it's .git was hoisted.
    const maybeGit = path.join(repo, '.git');
    const stat = fs.statSync(maybeGit);
    let git;
    if (stat.isFile()) {
        const data = fs.readFileSync(maybeGit, 'utf8');
        const gitdir = data.match(/^gitdir: (.*)$/m)?.[1];
        if (!gitdir) {
            throw new Error(`Failed to parse .git submodule info in ${maybeGit}`);
        }
        git = path.join(repo, gitdir);
    }
    else if (stat.isDirectory()) {
        git = maybeGit;
    }
    else {
        return undefined;
    }
    const headPath = path.join(git, 'HEAD');
    let head;
    try {
        head = fs.readFileSync(headPath, 'utf8').trim();
    }
    catch (e) {
        return undefined;
    }
    if (/^[0-9a-f]{40}$/i.test(head)) {
        return head;
    }
    const refMatch = /^ref: (.*)$/.exec(head);
    if (!refMatch) {
        return undefined;
    }
    const ref = refMatch[1];
    const refPath = path.join(git, ref);
    try {
        return fs.readFileSync(refPath, 'utf8').trim();
    }
    catch (e) {
        // noop
    }
    const packedRefsPath = path.join(git, 'packed-refs');
    let refsRaw;
    try {
        refsRaw = fs.readFileSync(packedRefsPath, 'utf8').trim();
    }
    catch (e) {
        return undefined;
    }
    const refsRegex = /^([0-9a-f]{40})\s+(.+)$/gm;
    let refsMatch;
    const refs = {};
    while (refsMatch = refsRegex.exec(refsRaw)) {
        refs[refsMatch[2]] = refsMatch[1];
    }
    return refs[ref];
}
//# sourceMappingURL=git.js.map