/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatWidget } from '../../chat/browser/chat.js';
import { IChatContextPickerItem, IChatContextPickerPickItem, IChatContextPickService } from '../../chat/browser/chatContextPickService.js';
import { ISCMHistoryItemVariableEntry } from '../../chat/common/chatModel.js';
import { ISCMViewService } from '../common/scm.js';

export class SCMHistoryItemContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chat.scmHistoryItemContextContribution';

	constructor(
		@IChatContextPickService contextPickService: IChatContextPickService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(SCMHistoryItemContext)));
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
				return historyItems.map(historyItem => ({
					iconClass: ThemeIcon.asClassName(Codicon.gitCommit),
					label: historyItem.subject,
					description: historyItem.displayId ?? historyItem.id,
					asAttachment: () => {
						const rootUri = activeRepository.provider.rootUri;
						const path = rootUri ? rootUri.path : activeRepository.provider.label;
						const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : undefined;
						const multiDiffSourceUri = URI.from({ scheme: 'scm-history-item', path: `${path}/${historyItemParentId}..${historyItem.id}` }, true);

						return {
							id: historyItem.id,
							name: historyItem.displayId ?? historyItem.id,
							value: multiDiffSourceUri,
							repository: activeRepository,
							historyItem,
							kind: 'scmHistoryItem',
						} satisfies ISCMHistoryItemVariableEntry;
					}
				}) satisfies IChatContextPickerPickItem);
			}
		};
	}
}
