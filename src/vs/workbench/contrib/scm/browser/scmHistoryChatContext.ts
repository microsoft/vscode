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
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IChatWidget, showChatView } from '../../chat/browser/chat.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService, picksWithPromiseFn } from '../../chat/browser/chatContextPickService.js';
import { ChatContextKeys } from '../../chat/common/chatContextKeys.js';
import { ISCMHistoryItemVariableEntry } from '../../chat/common/chatModel.js';
import { ScmHistoryItemResolver } from '../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js';
import { ISCMHistoryItem } from '../common/history.js';
import { ISCMProvider, ISCMService, ISCMViewService } from '../common/scm.js';

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
	}
}

class SCMHistoryItemContext implements IChatContextPickerItem {
	readonly type = 'pickerPick';
	readonly label = localize('chatContext.scmHistoryItems', 'Source Control...');
	readonly icon = Codicon.gitCommit;

	private readonly _delayer = new ThrottledDelayer<IChatContextPickerPickItem[]>(200);

	public static asAttachment(provider: ISCMProvider, historyItem: ISCMHistoryItem): ISCMHistoryItemVariableEntry {
		const multiDiffSourceUri = ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem);
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

	isEnabled(_widget: IChatWidget): Promise<boolean> | boolean {
		const activeRepository = this._scmViewService.activeRepository.get();
		return activeRepository?.provider.historyProvider.get() !== undefined;
	}

	asPicker(_widget: IChatWidget) {
		return {
			placeholder: localize('chatContext.scmHistoryItems.placeholder', 'Select a change'),
			picks: picksWithPromiseFn((query: string, token: CancellationToken) => {
				const filterText = query.trim() !== '' ? query.trim() : undefined;
				const activeRepository = this._scmViewService.activeRepository.get();
				const historyProvider = activeRepository?.provider.historyProvider.get();
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
									asAttachment: () => SCMHistoryItemContext.asAttachment(activeRepository.provider, historyItem)
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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.scm.action.graph.addHistoryItemToChat',
			title: localize('chat.action.scmHistoryItemContext', 'Add History Item to Chat'),
			f1: false,
			menu: {
				id: MenuId.SCMHistoryItemChatContext,
				when: ChatContextKeys.Setup.installed
			}
		});
	}

	override async run(accessor: ServicesAccessor, provider: ISCMProvider, historyItem: ISCMHistoryItem): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const widget = await showChatView(viewsService);
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
			title: localize('chat.action.scmHistoryItemSummarize', 'Summarize History Item'),
			f1: false,
			menu: {
				id: MenuId.SCMHistoryItemChatContext,
				when: ChatContextKeys.Setup.installed
			}
		});
	}

	override async run(accessor: ServicesAccessor, provider: ISCMProvider, historyItem: ISCMHistoryItem): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const widget = await showChatView(viewsService);
		if (!provider || !historyItem || !widget) {
			return;
		}

		widget.attachmentModel.addContext(SCMHistoryItemContext.asAttachment(provider, historyItem));
		await widget.acceptInput('Summarize the attached history item');
	}
});
