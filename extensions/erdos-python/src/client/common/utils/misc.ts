// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
'use strict';
import type { TextDocument, Uri } from 'vscode';
import { InteractiveInputScheme, NotebookCellScheme } from '../constants';
import { InterpreterUri } from '../installer/types';
import { isParentPath } from '../platform/fs-paths';
import { Resource } from '../types';

export function noop() {}

/**
 * Like `Readonly<>`, but recursive.
 *
 * See https://github.com/Microsoft/TypeScript/pull/21316.
 */

type DeepReadonly<T> = T extends any[] ? IDeepReadonlyArray<T[number]> : DeepReadonlyNonArray<T>;
type DeepReadonlyNonArray<T> = T extends object ? DeepReadonlyObject<T> : T;
interface IDeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}
type DeepReadonlyObject<T> = {
    readonly [P in NonFunctionPropertyNames<T>]: DeepReadonly<T[P]>;
};
type NonFunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? never : K }[keyof T];

/**
 * Checking whether something is a Resource (Uri/undefined).
 * Using `instanceof Uri` doesn't always work as the object is not an instance of Uri (at least not in tests).
 * That's why VSC too has a helper method `URI.isUri` (though not public).
 */
export function isResource(resource?: InterpreterUri): resource is Resource {
    if (!resource) {
        return true;
    }
    const uri = resource as Uri;
    return typeof uri.path === 'string' && typeof uri.scheme === 'string';
}

/**
 * Checking whether something is a Uri.
 * Using `instanceof Uri` doesn't always work as the object is not an instance of Uri (at least not in tests).
 * That's why VSC too has a helper method `URI.isUri` (though not public).
 */

function isUri(resource?: Uri | any): resource is Uri {
    if (!resource) {
        return false;
    }
    const uri = resource as Uri;
    return typeof uri.path === 'string' && typeof uri.scheme === 'string';
}

/**
 * Create a filter func that determine if the given URI and candidate match.
 *
 * Only compares path.
 *
 * @param checkParent - if `true`, match if the candidate is rooted under `uri`
 * or if the candidate matches `uri` exactly.
 * @param checkChild - if `true`, match if `uri` is rooted under the candidate
 * or if the candidate matches `uri` exactly.
 */
export function getURIFilter(
    uri: Uri,
    opts: {
        checkParent?: boolean;
        checkChild?: boolean;
    } = { checkParent: true },
): (u: Uri) => boolean {
    let uriPath = uri.path;
    while (uriPath.endsWith('/')) {
        uriPath = uriPath.slice(0, -1);
    }
    const uriRoot = `${uriPath}/`;
    function filter(candidate: Uri): boolean {
        // Do not compare schemes as it is sometimes not available, in
        // which case file is assumed as scheme.
        let candidatePath = candidate.path;
        while (candidatePath.endsWith('/')) {
            candidatePath = candidatePath.slice(0, -1);
        }
        if (opts.checkParent && isParentPath(candidatePath, uriRoot)) {
            return true;
        }
        if (opts.checkChild) {
            const candidateRoot = `${candidatePath}/`;
            if (isParentPath(uriPath, candidateRoot)) {
                return true;
            }
        }
        return false;
    }
    return filter;
}

export function isNotebookCell(documentOrUri: TextDocument | Uri): boolean {
    const uri = isUri(documentOrUri) ? documentOrUri : documentOrUri.uri;
    return uri.scheme.includes(NotebookCellScheme) || uri.scheme.includes(InteractiveInputScheme);
}
