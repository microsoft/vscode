/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ScmMultiDiffSourceResolver_1, ScmHistoryItemResolver_1;
import { ValueWithChangeEvent } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableFromEvent, ValueWithChangeEventFromObservable, waitForState } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IActivityService, ProgressBadge } from '../../../services/activity/common/activity.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ISCMService } from '../../scm/common/scm.js';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from './multiDiffSourceResolverService.js';
let ScmMultiDiffSourceResolver = class ScmMultiDiffSourceResolver {
    static { ScmMultiDiffSourceResolver_1 = this; }
    static { this._scheme = 'scm-multi-diff-source'; }
    static getMultiDiffSourceUri(repositoryUri, groupId) {
        return URI.from({
            scheme: ScmMultiDiffSourceResolver_1._scheme,
            query: JSON.stringify({ repositoryUri, groupId }),
        });
    }
    static parseUri(uri) {
        if (uri.scheme !== ScmMultiDiffSourceResolver_1._scheme) {
            return undefined;
        }
        let query;
        try {
            query = JSON.parse(uri.query);
        }
        catch (e) {
            return undefined;
        }
        if (typeof query !== 'object' || query === null) {
            return undefined;
        }
        const { repositoryUri, groupId } = query;
        if (typeof repositoryUri !== 'string' || typeof groupId !== 'string') {
            return undefined;
        }
        return { repositoryUri: URI.parse(repositoryUri), groupId };
    }
    constructor(_scmService, _activityService) {
        this._scmService = _scmService;
        this._activityService = _activityService;
    }
    canHandleUri(uri) {
        return ScmMultiDiffSourceResolver_1.parseUri(uri) !== undefined;
    }
    async resolveDiffSource(uri) {
        const { repositoryUri, groupId } = ScmMultiDiffSourceResolver_1.parseUri(uri);
        const repository = await waitForState(observableFromEvent(this, this._scmService.onDidAddRepository, () => [...this._scmService.repositories].find(r => r.provider.rootUri?.toString() === repositoryUri.toString())));
        const group = await waitForState(observableFromEvent(this, repository.provider.onDidChangeResourceGroups, () => repository.provider.groups.find(g => g.id === groupId)));
        const scmActivities = observableFromEvent(this._activityService.onDidChangeActivity, () => [...this._activityService.getViewContainerActivities('workbench.view.scm')]);
        const scmViewHasNoProgressBadge = scmActivities.map(activities => !activities.some(a => a.badge instanceof ProgressBadge));
        await waitForState(scmViewHasNoProgressBadge, v => v);
        return new ScmResolvedMultiDiffSource(group, repository);
    }
};
ScmMultiDiffSourceResolver = ScmMultiDiffSourceResolver_1 = __decorate([
    __param(0, ISCMService),
    __param(1, IActivityService)
], ScmMultiDiffSourceResolver);
export { ScmMultiDiffSourceResolver };
let ScmHistoryItemResolver = class ScmHistoryItemResolver {
    static { ScmHistoryItemResolver_1 = this; }
    static { this.scheme = 'scm-history-item'; }
    static getMultiDiffSourceUri(provider, historyItemId, historyItemParentId, historyItemDisplayId) {
        return URI.from({
            scheme: ScmHistoryItemResolver_1.scheme,
            path: provider.rootUri?.fsPath,
            query: JSON.stringify({
                repositoryId: provider.id,
                historyItemId,
                historyItemParentId,
                historyItemDisplayId
            })
        }, true);
    }
    static parseUri(uri) {
        if (uri.scheme !== ScmHistoryItemResolver_1.scheme) {
            return undefined;
        }
        let query;
        try {
            query = JSON.parse(uri.query);
        }
        catch (e) {
            return undefined;
        }
        if (typeof query !== 'object' || query === null) {
            return undefined;
        }
        const { repositoryId, historyItemId, historyItemParentId, historyItemDisplayId } = query;
        if (typeof repositoryId !== 'string' || typeof historyItemId !== 'string' ||
            (typeof historyItemParentId !== 'string' && historyItemParentId !== undefined) ||
            (typeof historyItemDisplayId !== 'string' && historyItemDisplayId !== undefined)) {
            return undefined;
        }
        return { repositoryId, historyItemId, historyItemParentId, historyItemDisplayId };
    }
    constructor(_scmService) {
        this._scmService = _scmService;
    }
    canHandleUri(uri) {
        return ScmHistoryItemResolver_1.parseUri(uri) !== undefined;
    }
    async resolveDiffSource(uri) {
        const { repositoryId, historyItemId, historyItemParentId, historyItemDisplayId } = ScmHistoryItemResolver_1.parseUri(uri);
        const repository = this._scmService.getRepository(repositoryId);
        const historyProvider = repository?.provider.historyProvider.get();
        const historyItemChanges = await historyProvider?.provideHistoryItemChanges(historyItemId, historyItemParentId) ?? [];
        const resources = ValueWithChangeEvent.const(historyItemChanges.map(change => {
            const goToFileEditorTitle = change.modifiedUri
                ? `${basename(change.modifiedUri.fsPath)} (${historyItemDisplayId ?? historyItemId})`
                : undefined;
            return new MultiDiffEditorItem(change.originalUri, change.modifiedUri, change.modifiedUri, goToFileEditorTitle);
        }));
        return { resources };
    }
};
ScmHistoryItemResolver = ScmHistoryItemResolver_1 = __decorate([
    __param(0, ISCMService)
], ScmHistoryItemResolver);
export { ScmHistoryItemResolver };
class ScmResolvedMultiDiffSource {
    constructor(_group, _repository) {
        this._group = _group;
        this._repository = _repository;
        this._resources = observableFromEvent(this._group.onDidChangeResources, () => /** @description resources */ this._group.resources.map(e => new MultiDiffEditorItem(e.multiDiffEditorOriginalUri, e.multiDiffEditorModifiedUri, e.sourceUri)));
        this.resources = new ValueWithChangeEventFromObservable(this._resources);
        this.contextKeys = {
            scmResourceGroup: this._group.id,
            scmProvider: this._repository.provider.providerId,
        };
    }
}
let ScmMultiDiffSourceResolverContribution = class ScmMultiDiffSourceResolverContribution extends Disposable {
    static { this.ID = 'workbench.contrib.scmMultiDiffSourceResolver'; }
    constructor(instantiationService, multiDiffSourceResolverService) {
        super();
        this._register(multiDiffSourceResolverService.registerResolver(instantiationService.createInstance(ScmHistoryItemResolver)));
        this._register(multiDiffSourceResolverService.registerResolver(instantiationService.createInstance(ScmMultiDiffSourceResolver)));
    }
};
ScmMultiDiffSourceResolverContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, IMultiDiffSourceResolverService)
], ScmMultiDiffSourceResolverContribution);
export { ScmMultiDiffSourceResolverContribution };
export class OpenScmGroupAction extends Action2 {
    static async openMultiFileDiffEditor(editorService, label, repositoryRootUri, resourceGroupId, options) {
        if (!repositoryRootUri) {
            return;
        }
        const multiDiffSource = ScmMultiDiffSourceResolver.getMultiDiffSourceUri(repositoryRootUri.toString(), resourceGroupId);
        return await editorService.openEditor({ label, multiDiffSource, options });
    }
    constructor() {
        super({
            id: '_workbench.openScmMultiDiffEditor',
            title: localize2('openChanges', 'Open Changes'),
            f1: false
        });
    }
    async run(accessor, options) {
        const editorService = accessor.get(IEditorService);
        await OpenScmGroupAction.openMultiFileDiffEditor(editorService, options.title, URI.revive(options.repositoryUri), options.resourceGroupId);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtTXVsdGlEaWZmU291cmNlUmVzb2x2ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9zY21NdWx0aURpZmZTb3VyY2VSZXNvbHZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxrQ0FBa0MsRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5SCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVwRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDL0MsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXpFLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBbUQsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdkcsT0FBTyxFQUE0QiwrQkFBK0IsRUFBNEIsbUJBQW1CLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV4SixJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEwQjs7YUFDZCxZQUFPLEdBQUcsdUJBQXVCLEFBQTFCLENBQTJCO0lBRW5ELE1BQU0s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