/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Menus } from '../../../browser/menus.js';
import { installPullToRefresh } from '../../../browser/mobile/mobilePullToRefresh.js';
import { IAgentHostFilterService } from '../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsListPresentation, SessionNameKind } from '../../../services/presentation/browser/sessionsListPresentation.js';
import { renderMobileSessionToolbar } from './mobileSessionToolbar.js';

export class MobileSessionsListPresentation implements ISessionsListPresentation {
	declare readonly _serviceBrand: undefined;
	readonly sectionRowHeight = 44;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IAgentHostFilterService private readonly hostFilterService: IAgentHostFilterService,
	) { }

	editName(kind: SessionNameKind, value: string, _editInline: () => boolean, accept: (value: string) => void | Promise<void>): boolean {
		void this.promptForName(kind, value).then(async name => {
			if (name !== undefined) {
				await accept(name);
			}
		}).catch(onUnexpectedError);
		return true;
	}

	private async promptForName(kind: SessionNameKind, value: string): Promise<string | undefined> {
		const titles: Record<SessionNameKind, string> = {
			newGroup: localize('newGroup', "Name Group"),
			group: localize('renameGroup', "Rename Group"),
			session: localize('renameSession', "Rename Session"),
			chat: localize('renameChat', "Rename Chat"),
		};
		return (await this.quickInputService.input({
			title: titles[kind], value, valueSelection: [0, value.length], placeHolder: localize('name', "Name"),
		}))?.trim();
	}

	renderHeader(container: HTMLElement): IDisposable {
		return renderMobileSessionToolbar(this.instantiationService, container, 'mobile-sessions-drawer-header', Menus.MobileSessionsDrawerHeader);
	}

	decorateList(container: HTMLElement, refresh: () => void, isAtTop: () => boolean): IDisposable {
		return installPullToRefresh(container, {
			isAtTop,
			refresh: async () => {
				refresh();
				await this.hostFilterService.rediscover();
			},
		});
	}
}
