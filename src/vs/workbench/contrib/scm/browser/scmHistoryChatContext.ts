/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CodeDataTransfers } from '../../../../platform/dnd/browser/dnd.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatWidget, IChatWidgetService } from '../../chat/browser/chat.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService, picksWithPromiseFn } from '../../chat/browser/chatContextPickService.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { ISCMHistoryItemChangeVariableEntry, ISCMHistoryItemVariableEntry } from '../../chat/common/chatVariableEntries.js';
import { ScmHistoryItemResolver } from '../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js';
import { ISCMHistoryItem, ISCMHistoryItemChange } from '../common/history.js';
import { ISCMProvider, ISCMService, ISCMViewService } from '../common/scm.js';

export interface SCMHistoryItemTransferData {
	readonly name: string;
	readonly resource: UriComponents;
	readonly historyItem: ISCMHistoryItem;
}

export function extractSCMHistoryItemDropData(e: DragEvent): SCMHistoryItemTransferData[] | undefined {
	if (!e.dataTransfer?.types.includes(CodeDataTransfers.SCM_HISTORY_ITEM)) {
		return undefined;
	}

	const data = e.dataTransfer?.getData(CodeDataTransfers.SCM_HISTORY_ITEM);
	if (!data) {
		return undefined;
	}

	return JSON.parse(data) as SCMHistoryItemTransferData[];
}

export class SCMHistoryItemContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.scmHistoryItemContextContribution';

	constructor(
		@IChatContextPickService contextPickService: IChatContextPickService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		super();
		this._store.add(contextPickService.registerChatContextItem(
			instantiationService.createInstance(SCMHistoryItemContext)));

		this._store.add(textModelResolverService.registerTextModelContentProvider(
			ScmHistoryItemResolver.scheme,
			instantiationService.createInstance(SCMHistoryItemContextContentProvider)));

		this._store.add(textModelResolverService.registerTextModelContentProvider(
			SCMHistoryItemChangeRangeContentProvider.scheme,
			instantiationService.createInstance(SCMHistoryItemChangeRangeContentProvider)));
	}
}

class SCMHistoryItemContext implements IChatContextPickerItem {
	readonly type = 'pickerPick';
	readonly label = localize('chatContext.scmHistoryItems', 'Source Control...');
	readonly icon = Codicon.gitCommit;

	private readonly _delayer = new ThrottledDelayer<IChatContextPickerPickItem[]>(200);

	public static asAttachment(provider: ISCMProvider, historyItem: ISCMHistoryItem): ISCMHistoryItemVariableEntry {
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
		} satisfies ISCMHistoryItemVariableEntry;
	}

	constructor(
		@ISCMViewService private readonly _scmViewService: ISCMViewService
	) { }

	isEnabled(widget: IChatWidget): Promise<boolean> | boolean {
		const activeRepository = this._scmViewService.activeRepository.get();
		const supported = !!widget.attachmentCapabilities.supportsSourceControlAttachments;
		return activeRepository?.repository.provider.historyProvider.get() !== undefined && supported;
	}

	asPicker(_widget: IChatWidget) {
		return {
			placeholder: localize('chatContext.scmHistoryItems.placeholder', 'Select a change'),
			picks: picksWithPromiseFn((query: string, token: CancellationToken) => {
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
									asAttachment: () => SCMHistoryItemContext.asAttachment(activeRepository.repository.provider, historyItem)
								} satisfies IChatContextPickerPickItem;
							});
						});
				});
			})
		};
	}
}

class SCMHistoryItemContextContentProvider implements ITextModelContentProvider {
	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ISCMService private readonly _scmService: ISCMService
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
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
}

export interface ScmHistoryItemChangeRangeUriFields {
	readonly repositoryId: string;
	readonly start: string;
	readonly end: string;
}

export class SCMHistoryItemChangeRangeContentProvider implements ITextModelContentProvider {
	static readonly scheme = 'scm-history-item-change-range';
	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ISCMService private readonly _scmService: ISCMService
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
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

	private _parseUri(uri: URI): ScmHistoryItemChangeRangeUriFields | undefined {
		if (uri.scheme !== SCMHistoryItemChangeRangeContentProvider.scheme) {
			return undefined;
		}

		let query: ScmHistoryItemChangeRangeUriFields;
		try {
			query = JSON.parse(uri.query) as ScmHistoryItemChangeRangeUriFields;
		} catch (e) {
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
}

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

	override async run(accessor: ServicesAccessor, provider: ISCMProvider, historyItem: ISCMHistoryItem): Promise<void> {
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

	override async run(accessor: ServicesAccessor, provider: ISCMProvider, historyItem: ISCMHistoryItem): Promise<void> {
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

	override async run(accessor: ServicesAccessor, historyItem: ISCMHistoryItem, historyItemChange: ISCMHistoryItemChange): Promise<void> {
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
		} satisfies ISCMHistoryItemChangeVariableEntry);
	}
});
