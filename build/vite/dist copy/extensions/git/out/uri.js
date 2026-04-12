"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGitUri = isGitUri;
exports.fromGitUri = fromGitUri;
exports.toGitUri = toGitUri;
exports.toMergeUris = toMergeUris;
exports.toMultiFileDiffEditorUris = toMultiFileDiffEditorUris;
const git_constants_1 = require("./api/git.constants");
function isGitUri(uri) {
    return /^git$/.test(uri.scheme);
}
function fromGitUri(uri) {
    return JSON.parse(uri.query);
}
// As a mitigation for extensions like ESLint showing warnings and errors
// for git URIs, let's change the file extension of these uris to .git,
// when `replaceFileExtension` is true.
function toGitUri(uri, ref, options = {}) {
    const params = {
        path: uri.fsPath,
        ref
    };
    if (options.submoduleOf) {
        params.submoduleOf = options.submoduleOf;
    }
    let path = uri.path;
    if (options.replaceFileExtension) {
        path = `${path}.git`;
    }
    else if (options.submoduleOf) {
        path = `${path}.diff`;
    }
    return uri.with({ scheme: options.scheme ?? 'git', path, query: JSON.stringify(params) });
}
/**
 * Assuming `uri` is being merged it creates uris for `base`, `ours`, and `theirs`
 */
function toMergeUris(uri) {
    return {
        base: toGitUri(uri, ':1'),
        ours: toGitUri(uri, ':2'),
        theirs: toGitUri(uri, ':3'),
    };
}
function toMultiFileDiffEditorUris(change, originalRef, modifiedRef) {
    switch (change.status) {
        case git_constants_1.Status.INDEX_ADDED:
            return {
                originalUri: undefined,
                modifiedUri: toGitUri(change.uri, modifiedRef)
            };
        case git_constants_1.Status.DELETED:
            return {
                originalUri: toGitUri(change.uri, originalRef),
                modifiedUri: undefined
            };
        case git_constants_1.Status.INDEX_RENAMED:
            return {
                originalUri: toGitUri(change.originalUri, originalRef),
                modifiedUri: toGitUri(change.uri, modifiedRef)
            };
        default:
            return {
                originalUri: toGitUri(change.uri, originalRef),
                modifiedUri: toGitUri(change.uri, modifiedRef)
            };
    }
}
//# sourceMappingURL=uri.js.map