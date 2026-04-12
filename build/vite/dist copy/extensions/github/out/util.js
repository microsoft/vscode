/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class DisposableStore {
    disposables = new Set();
    add(disposable) {
        this.disposables.add(disposable);
    }
    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.clear();
    }
}
function decorate(decorator) {
    return (_target, key, descriptor) => {
        if (typeof descriptor.value === 'function') {
            descriptor.value = decorator(descriptor.value, key);
        }
        else if (typeof descriptor.get === 'function') {
            descriptor.get = decorator(descriptor.get, key);
        }
        else {
            throw new Error('not supported');
        }
    };
}
function _sequentialize(fn, key) {
    const currentKey = `__$sequence$${key}`;
    return function (...args) {
        const currentPromise = this[currentKey] || Promise.resolve(null);
        const run = async () => await fn.apply(this, args);
        this[currentKey] = currentPromise.then(run, run);
        return this[currentKey];
    };
}
export const sequentialize = decorate(_sequentialize);
export function groupBy(data, compare) {
    const result = [];
    let currentGroup = undefined;
    for (const element of data.slice(0).sort(compare)) {
        if (!currentGroup || compare(currentGroup[0], element) !== 0) {
            currentGroup = [element];
            result.push(currentGroup);
        }
        else {
            currentGroup.push(element);
        }
    }
    return result;
}
export function getRepositoryFromUrl(url) {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/i.exec(url)
        || /^git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/i.exec(url);
    return match ? { owner: match[1], repo: match[2] } : undefined;
}
export function getRepositoryFromQuery(query) {
    const match = /^([^/]+)\/([^/]+)$/i.exec(query);
    return match ? { owner: match[1], repo: match[2] } : undefined;
}
export function repositoryHasGitHubRemote(repository) {
    return !!repository.state.remotes.find(remote => remote.fetchUrl ? getRepositoryFromUrl(remote.fetchUrl) : undefined);
}
export function getRepositoryDefaultRemoteUrl(repository, order) {
    const remotes = repository.state.remotes
        .filter(remote => remote.fetchUrl && getRepositoryFromUrl(remote.fetchUrl));
    if (remotes.length === 0) {
        return undefined;
    }
    for (const name of order) {
        const remote = remotes
            .find(remote => remote.name === name);
        if (remote) {
            return remote.fetchUrl;
        }
    }
    // Fallback to first remote
    return remotes[0].fetchUrl;
}
export function getRepositoryDefaultRemote(repository, order) {
    const fetchUrl = getRepositoryDefaultRemoteUrl(repository, order);
    return fetchUrl ? getRepositoryFromUrl(fetchUrl) : undefined;
}
//# sourceMappingURL=util.js.map