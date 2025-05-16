/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatWidget } from '../../chat/browser/chat.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService } from '../../chat/browser/chatContextPickService.js';
import { ISCMHistoryItemVariableEntry } from '../../chat/common/chatModel.js';
import { ScmHistoryItemResolver } from '../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js';
import { ISCMService, ISCMViewService } from '../common/scm.js';
import { getHistoryItemEditorTitle } from './util.js';

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
	readonly label = localize('chatContext.scmHistoryItems', 'Source Control History Items...');
	readonly icon = Codicon.gitCommit;

	constructor(
		@ISCMViewService private readonly _scmViewService: ISCMViewService
	) { }

	isEnabled(_widget: IChatWidget): Promise<boolean> | boolean {
		const activeRepository = this._scmViewService.activeRepository.get();
		return activeRepository?.provider.historyProvider.get() !== undefined;
	}

	asPicker(_widget: IChatWidget) {
		return {
			placeholder: localize('chatContext.scmHistoryItems.placeholder', 'Select a source control history item'),
			picks: async (_query: string) => {
				const activeRepository = this._scmViewService.activeRepository.get();
				const historyProvider = activeRepository?.provider.historyProvider.get();
				if (!activeRepository || !historyProvider) {
					return [];
				}

				const historyItemRefs = coalesce([
					historyProvider.historyItemRef.get(),
					historyProvider.historyItemRemoteRef.get(),
					historyProvider.historyItemBaseRef.get(),
				]).map(ref => ref.id);

				const historyItems = await historyProvider.provideHistoryItems({ historyItemRefs, limit: 100 }) ?? [];

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
						asAttachment: () => {
							const historyItemTitle = getHistoryItemEditorTitle(historyItem);
							const multiDiffSourceUri = ScmHistoryItemResolver.getMultiDiffSourceUri(activeRepository.provider, historyItem);
							const attachmentName = `$(${Codicon.repo.id})\u00A0${activeRepository.provider.name}\u00A0$(${Codicon.gitCommit.id})\u00A0${historyItem.displayId ?? historyItem.id}`;

							return {
								id: historyItem.id,
								name: attachmentName,
								value: multiDiffSourceUri,
								title: historyItemTitle,
								kind: 'scmHistoryItem'
							} satisfies ISCMHistoryItemVariableEntry;
						}
					} satisfies IChatContextPickerPickItem;
				});
			}
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
