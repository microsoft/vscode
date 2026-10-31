/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Menus } from '../../../browser/menus.js';
import { installPullToRefresh } from '../../../browser/mobile/mobilePullToRefresh.js';
import { IAgentHostFilterService } from '../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsPresentation, SessionNameKind } from '../../../services/presentation/browser/sessionsPresentation.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { URI } from '../../../../base/common/uri.js';
import { IRepositoryPickResult } from '../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';
import { MobileRepositoryPicker } from './mobileRepositoryPicker.js';

export class MobileSessionsPresentation extends Disposable implements ISessionsPresentation {
	declare readonly _serviceBrand: undefined;
	readonly sectionRowHeight = 44;
	readonly omitEmptyStateIcon = true;
	private readonly repositoryPicker: MobileRepositoryPicker;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IAgentHostFilterService private readonly hostFilterService: IAgentHostFilterService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) {
		super();
		this.repositoryPicker = this._register(this.instantiationService.createInstance(MobileRepositoryPicker));
	}

	pickRepository(getRepositories: (query: string, token: CancellationToken) => Promise<readonly string[]>, token: CancellationToken): Promise<IRepositoryPickResult | undefined> {
		return this.repositoryPicker.pickRepository(getRepositories, token);
	}

	async readDiffText(uri: URI): Promise<string> {
		const reference = await this.textModelService.createModelReference(uri);
		try {
			return reference.object.textEditorModel.getValue();
		} finally {
			reference.dispose();
		}
	}

	async promptForName(kind: SessionNameKind, value: string): Promise<string | undefined> {
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

	renderNewSessionHeader(container: HTMLElement, before: HTMLElement): IDisposable {
		return this.renderToolbar(container, 'sessions-new-session-place-row', Menus.NewSessionPlace, before);
	}

	renderSessionsHeader(container: HTMLElement): IDisposable {
		return this.renderToolbar(container, 'mobile-sessions-drawer-header', Menus.MobileSessionsDrawerHeader);
	}

	private renderToolbar(container: HTMLElement, className: string, menu: MenuId, before?: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const row = dom.$(`div.${className}`);
		store.add(toDisposable(() => row.remove()));
		container.insertBefore(row, before ?? null);
		const toolbar = store.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, row, menu, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true },
		}));
		const update = () => row.toggleAttribute('hidden', toolbar.getItemsLength() === 0);
		store.add(toolbar.onDidChangeMenuItems(update));
		update();
		return store;
	}

	decorateSessionsList(container: HTMLElement, refresh: () => void, isAtTop: () => boolean): IDisposable {
		return installPullToRefresh(container, {
			isAtTop,
			refresh: async () => {
				refresh();
				await this.hostFilterService.rediscover();
			},
		});
	}
}
