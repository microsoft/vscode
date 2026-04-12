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
var SCMHistoryItemContext_1, SCMHistoryItemChangeRangeContentProvider_1;
import { coalesce } from '../../../../base/common/arrays.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CodeDataTransfers } from '../../../../platform/dnd/browser/dnd.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatContextPickService, picksWithPromiseFn } from '../../chat/browser/attachments/chatContextPickService.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ScmHistoryItemResolver } from '../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js';
import { ISCMService, ISCMViewService } from '../common/scm.js';
export function extractSCMHistoryItemDropData(e) {
    if (!e.dataTransfer?.types.includes(CodeDataTransfers.SCM_HISTORY_ITEM)) {
        return undefined;
    }
    const data = e.dataTransfer?.getData(CodeDataTransfers.SCM_HISTORY_ITEM);
    if (!data) {
        return undefined;
    }
    return JSON.parse(data);
}
let SCMHistoryItemContextContribution = class SCMHistoryItemContextContribution extends Disposable {
    static { this.ID = 'workbench.contrib.chat.scmHistoryItemContextContribution'; }
    constructor(contextPickService, instantiationService, textModelResolverService) {
        super();
        this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(SCMHistoryItemContext)));
        this._store.add(textModelResolverService.registerTextModelContentProvider(ScmHistoryItemResolver.scheme, instantiationService.createInstance(SCMHistoryItemContextContentProvider)));
        this._store.add(textModelResolverService.registerTextModelContentProvider(SCMHistoryItemChangeRangeContentProvider.scheme, instantiationService.createInstance(SCMHistoryItemChangeRangeContentProvider)));
    }
};
SCMHistoryItemContextContribution = __decorate([
    __param(0, IChatContextPickService),
    __param(1, IInstantiationService),
    __param(2, ITextModelService)
], SCMHistoryItemContextContribution);
export { SCMHistoryItemContextContribution };
let SCMHistoryItemContext = SCMHistoryItemContext_1 = class SCMHistoryItemContext {
    static asAttachment(provider, historyItem) {
        const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;
        const multiDiffSourceUri = ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem.id, historyItemParentId, historyItem.displayId);
        const attachmentName = `$(${Codicon.repo.id})\u00A0${provider.name}\u00A0$(${Codicon.gitCommit.id})\u00A0${historyItem.displayId ?? historyItem.id}`;
        return {
            id: historyItem.id,
            name: attachmentName,
            value: multiDiffSourceUri,
            historyItem: {
                ...historyItem,
                references: []
            },
            kind: 'scmHistoryItem'
        };
    }
    constructor(_scmViewService) {
        this._scmViewService = _scmViewService;
        this.type = 'pickerPick';
        this.label = localize('chatContext.scmHistoryItems', 'Source Control...');
        this.icon = Codicon.gitCommit;
        this._delayer = new ThrottledDelayer(200);
    }
    isEnabled(widget) {
        const activeRepository = this._scmViewService.activeRepository.get();
        const supported = !!widget.attachmentCapabilities.supportsSourceControlAttachments;
        return activeRepository?.repository.provider.historyProvider.get() !== undefined && supported;
    }
    asPicker(_widget) {
        return {
            placeholder: localize('chatContext.scmHistoryItems.placeholder', 'Select a change'),
            picks: picksWithPromiseFn((query, token) => {
                const filterText = query.trim() !== '' ? query.trim() : undefined;
                const activeRepository = this._scmViewService.activeRepository.get();
                const historyProvider = activeRepository?.repository.provider.historyProvider.get();
                if (!activeRepository || !historyProvider) {
                    return Promise.resolve([]);
                }
                const historyItemRefs = coalesce([
                    historyProvider.historyItemRef.get(),
                    historyProvider.historyItemRemoteRef.get(),
                    historyProvider.historyItemBaseRef.get(),
                ]).map(ref => ref.id);
                return this._delayer.trigger(() => {
                    return historyProvider.provideHistoryItems({ historyItemRefs, filterText, limit: 100 }, token)
                        .then(historyItems => {
                        if (!historyItems) {
                            return [];
                        }
                        return historyItems.map(historyItem => {
                            const details = [`${historyItem.displayId ?? historyItem.id}`];
                            if (historyItem.author) {
                                details.push(historyItem.author);
                            }
                            if (historyItem.statistics) {
                                details.push(`${historyItem.statistics.files} ${localize('files', 'file(s)')}`);
                            }
                            if (historyItem.timestamp) {
                                details.push(fromNow(historyItem.timestamp, true, true));
                            }
                            return {
                                iconClass: ThemeIcon.asClassName(Codicon.gitCommit),
                                label: historyItem.subject,
                                detail: details.join(`$(${Codicon.circleSmallFilled.id})`),
                                asAttachment: () => SCMHistoryItemContext_1.asAttachment(activeRepository.repository.provider, historyItem)
                            };
                        });
                    });
                });
            })
        };
    }
};
SCMHistoryItemContext = SCMHistoryItemContext_1 = __decorate([
    __param(0, ISCMViewService)
], SCMHistoryItemContext);
let SCMHistoryItemContextContentProvider = class SCMHistoryItemContextContentProvider {
    constructor(_modelService, _scmService) {
        this._modelService = _modelService;
        this._scmService = _scmService;
    }
    async provideTextContent(resource) {
        const uriFields = ScmHistoryItemResolver.parseUri(resource);
        if (!uriFields) {
            return null;
        }
        const textModel = this._modelService.getModel(resource);
        if (textModel) {
            return textModel;
        }
        const { repositoryId, historyItemId } = uriFields;
        const repository = this._scmService.getRepository(repositoryId);
        const historyProvider = repository?.provider.historyProvider.get();
        if (!repository || !historyProvider) {
            return null;
        }
        const historyItemContext = await historyProvider.resolveHistoryItemChatContext(historyItemId);
        if (!historyItemContext) {
            return null;
        }
        return this._modelService.createModel(historyItemContext, null, resource, false);
    }
};
SCMHistoryItemContextContentProvider = __decorate([
    __param(0, IModelService),
    __param(1, ISCMService)
], SCMHistoryItemContextContentProvider);
let SCMHistoryItemChangeRangeContentProvider = class SCMHistoryItemChangeRangeContentProvider {
    static { SCMHistoryItemChangeRangeContentProvider_1 = this; }
    static { this.scheme = 'scm-history-item-change-range'; }
    constructor(_modelService, _scmService) {
        this._modelService = _modelService;
        this._scmService = _scmService;
    }
    async provideTextContent(resource) {
        const uriFields = this._parseUri(resource);
        if (!uriFields) {
            return null;
        }
        const textModel = this._modelService.getModel(resource);
        if (textModel) {
            return textModel;
        }
        const { repositoryId, start, end } = uriFields;
        const repository = this._scmService.getRepository(repositoryId);
        const historyProvider = repository?.provider.historyProvider.get();
        if (!repository || !historyProvider) {
            return null;
        }
        const historyItemChangeRangeContext = await historyProvider.resolveHistoryItemChangeRangeChatContext(end, start, resource.path);
        if (!historyItemChangeRangeContext) {
            return null;
        }
        return this._modelService.createModel(historyItemChangeRangeContext, null, resource, false);
    }
    _parseUri(uri) {
        if (uri.scheme !== SCMHistoryItemChangeRangeContentProvider_1.scheme) {
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
        const { repositoryId, start, end } = query;
        if (typeof repositoryId !== 'string' || typeof start !== 'string' || typeof end !== 'string') {
            return undefined;
        }
        return { repositoryId, start, end };
    }
};
SCMHistoryItemChangeRangeContentProvider = SCMHistoryItemChangeRangeContentProvider_1 = __decorate([
    __param(0, IModelService),
    __param(1, ISCMService)
], SCMHistoryItemChangeRangeContentProvider);
export { SCMHistoryItemChangeRangeContentProvider };
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.addHistoryItemToChat',
            title: localize('chat.action.scmHistoryItemContext', 'Add to Chat'),
            f1: false,
            menu: {
                id: MenuId.SCMHistoryItemContext,
                group: 'z_chat',
                order: 1,
                when: ChatContextKeys.enabled
            }
        });
    }
    async run(accessor, provider, historyItem) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const widget = await chatWidgetService.revealWidget();
        if (!provider || !historyItem || !widget) {
            return;
        }
        widget.attachmentModel.addContext(SCMHistoryItemContext.asAttachment(provider, historyItem));
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.summarizeHistoryItem',
            title: localize('chat.action.scmHistoryItemSummarize', 'Explain Changes'),
            f1: false,
            menu: {
                id: MenuId.SCMHistoryItemContext,
                group: 'z_chat',
                order: 2,
                when: ChatContextKeys.enabled
            }
        });
    }
    async run(accessor, provider, historyItem) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const widget = await chatWidgetService.revealWidget();
        if (!provider || !historyItem || !widget) {
            return;
        }
        widget.attachmentModel.addContext(SCMHistoryItemContext.asAttachment(provider, historyItem));
        await widget.acceptInput('Summarize the attached history item');
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.scm.action.graph.addHistoryItemChangeToChat',
            title: localize('chat.action.scmHistoryItemContext', 'Add to Chat'),
            f1: false,
            menu: {
                id: MenuId.SCMHistoryItemChangeContext,
                group: 'z_chat',
                order: 1,
                when: ChatContextKeys.enabled
            }
        });
    }
    async run(accessor, historyItem, historyItemChange) {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const widget = await chatWidgetService.revealWidget();
        if (!historyItem || !historyItemChange.modifiedUri || !widget) {
            return;
        }
        widget.attachmentModel.addContext({
            id: historyItemChange.uri.toString(),
            name: `${basename(historyItemChange.modifiedUri)}`,
            value: historyItemChange.modifiedUri,
            historyItem: historyItem,
            kind: 'scmHistoryItemChange',
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtSGlzdG9yeUNoYXRDb250ZXh0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvc2NtL2Jyb3dzZXIvc2NtSGlzdG9yeUNoYXRDb250ZXh0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFcEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdqRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUE2QixpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFFckgsT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDN0UsT0FBTyxFQUFzRCx1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRSxNQUFN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