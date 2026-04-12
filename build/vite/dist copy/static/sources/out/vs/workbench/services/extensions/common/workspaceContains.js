/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as resources from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import * as errors from '../../../../base/common/errors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { QueryBuilder } from '../../search/common/queryBuilder.js';
import { ISearchService } from '../../search/common/search.js';
import { toWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { promiseWithResolvers } from '../../../../base/common/async.js';
const WORKSPACE_CONTAINS_TIMEOUT = 7000;
export function checkActivateWorkspaceContainsExtension(host, desc) {
    const activationEvents = desc.activationEvents;
    if (!activationEvents) {
        return Promise.resolve(undefined);
    }
    const fileNames = [];
    const globPatterns = [];
    for (const activationEvent of activationEvents) {
        if (/^workspaceContains:/.test(activationEvent)) {
            const fileNameOrGlob = activationEvent.substr('workspaceContains:'.length);
            if (fileNameOrGlob.indexOf('*') >= 0 || fileNameOrGlob.indexOf('?') >= 0 || host.forceUsingSearch) {
                globPatterns.push(fileNameOrGlob);
            }
            else {
                fileNames.push(fileNameOrGlob);
            }
        }
    }
    if (fileNames.length === 0 && globPatterns.length === 0) {
        return Promise.resolve(undefined);
    }
    const { promise, resolve } = promiseWithResolvers();
    const activate = (activationEvent) => resolve({ activationEvent });
    const fileNamePromise = Promise.all(fileNames.map((fileName) => _activateIfFileName(host, fileName, activate))).then(() => { });
    const globPatternPromise = _activateIfGlobPatterns(host, desc.identifier, globPatterns, activate);
    Promise.all([fileNamePromise, globPatternPromise]).then(() => {
        // when all are done, resolve with undefined (relevant only if it was not activated so far)
        resolve(undefined);
    });
    return promise;
}
async function _activateIfFileName(host, fileName, activate) {
    // find exact path
    for (const uri of host.folders) {
        if (await host.exists(resources.joinPath(URI.revive(uri), fileName))) {
            // the file was found
            activate(`workspaceContains:${fileName}`);
            return;
        }
    }
}
async function _activateIfGlobPatterns(host, extensionId, globPatterns, activate) {
    if (globPatterns.length === 0) {
        return Promise.resolve(undefined);
    }
    const tokenSource = new CancellationTokenSource();
    const searchP = host.checkExists(host.folders, globPatterns, tokenSource.token);
    const timer = setTimeout(async () => {
        tokenSource.cancel();
        host.logService.info(`Not activating extension '${extensionId.value}': Timed out while searching for 'workspaceContains' pattern ${globPatterns.join(',')}`);
    }, WORKSPACE_CONTAINS_TIMEOUT);
    let exists = false;
    try {
        exists = await searchP;
    }
    catch (err) {
        if (!errors.isCancellationError(err)) {
            errors.onUnexpectedError(err);
        }
    }
    tokenSource.dispose();
    clearTimeout(timer);
    if (exists) {
        // a file was found matching one of the glob patterns
        activate(`workspaceContains:${globPatterns.join(',')}`);
    }
}
export function checkGlobFileExists(accessor, folders, includes, token) {
    const instantiationService = accessor.get(IInstantiationService);
    const searchService = accessor.get(ISearchService);
    const queryBuilder = instantiationService.createInstance(QueryBuilder);
    const query = queryBuilder.file(folders.map(folder => toWorkspaceFolder(URI.revive(folder))), {
        _reason: 'checkExists',
        includePattern: includes,
        exists: true
    });
    return searchService.fileSearch(query, token).then(result => {
        return !!result.limitHit;
    }, err => {
        if (!errors.isCancellationError(err)) {
            return Promise.reject(err);
        }
        return false;
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlQ29udGFpbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vd29ya3NwYWNlQ29udGFpbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx1QkFBdUIsRUFBcUIsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRXZGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXhFLE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxDQUFDO0FBZXhDLE1BQU0sVUFBVSx1Q0FBdUMsQ0FBQyxJQUE4QixFQUFFLElBQTJCO0lBQ2xILE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDO0lBQy9DLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsTUFBTSxTQUFTLEdBQWEsRUFBRSxDQUFDO0lBQy9CLE1BQU0sWUFBWSxHQUFhLEVBQUUsQ0FBQztJQUVsQyxLQUFLLE1BQU0sZUFBZSxJQUFJLGdC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