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
				if (!historyProvider) {
					return [];
				}

				const historyItemRefs = coalesce([
					historyProvider.historyItemRef.get(),
					historyProvider.historyItemRemoteRef.get(),
					historyProvider.historyItemBaseRef.get(),
				]).map(ref => ref.id);

				const historyItems = await historyProvider.provideHistoryItems({ historyItemRefs, limit: 100 }) ?? [];
				return historyItems.map(item => ({
					iconClass: ThemeIcon.asClassName(Codicon.gitCommit),
					label: item.subject,
					description: `${item.author} $(${Codicon.circleSmallFilled.id}) ${item.displayId ?? item.id}`,
					asAttachment: () => {
						return {
							icon: Codicon.gitCommit,
							id: item.id,
							name: item.displayId ?? item.id,
							fullName: item.subject,
							value: URI.file('something'),
							kind: 'scmHistoryItem',
						} satisfies ISCMHistoryItemVariableEntry;
					}
				}) satisfies IChatContextPickerPickItem);
			}
		};
	}
}
