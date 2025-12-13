/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenEvent, WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { $, append, EventHelper } from '../../../../../base/browser/dom.js';
import { IAgentSession, IAgentSessionsModel, isAgentSession, isAgentSessionSection } from './agentSessionsModel.js';
import { AgentSessionListItem, AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsDragAndDrop, AgentSessionsIdentityProvider, AgentSessionsKeyboardNavigationLabelProvider, AgentSessionsListDelegate, AgentSessionSectionRenderer, AgentSessionsSorter, IAgentSessionsFilter, IAgentSessionsSorterOptions } from './agentSessionsViewer.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ACTION_ID_NEW_CHAT } from '../actions/chatActions.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITreeContextMenuEvent } from '../../../../../base/browser/ui/tree/tree.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { Separator } from '../../../../../base/common/actions.js';
import { TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { IStyleOverride } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IAgentSessionsControl, IMarshalledChatSessionContext } from './agentSessions.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { openSession } from './agentSessionsOpener.js';

export interface IAgentSessionsControlOptions extends IAgentSessionsSorterOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly filter?: IAgentSessionsFilter;

	getHoverPosition(): HoverPosition;
}

type AgentSessionOpenedClassification = {
	owner: 'bpasero';
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider type of the opened agent session.' };
	comment: 'Event fired when a agent session is opened from the agent sessions control.';
};

type AgentSessionOpenedEvent = {
	providerType: string;
};

export class AgentSessionsControl extends Disposable implements IAgentSessionsControl {

	private sessionsContainer: HTMLElement | undefined;
	private sessionsList: WorkbenchCompressibleAsyncDataTree<IAgentSessionsModel, AgentSessionListItem, FuzzyScore> | undefined;

	private visible: boolean = true;

	private focusedAgentSessionArchivedContextKey: IContextKey<boolean>;
	private focusedAgentSessionReadContextKey: IContextKey<boolean>;
	private focusedAgentSessionTypeContextKey: IContextKey<string>;

	constructor(
		private readonly container: HTMLElement,
		private readonly options: IAgentSessionsControlOptions,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IMenuService private readonly menuService: IMenuService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.focusedAgentSessionArchivedContextKey = ChatContextKeys.isArchivedAgentSession.bindTo(this.contextKeyService);
		this.focusedAgentSessionReadContextKey = ChatContextKeys.isReadAgentSession.bindTo(this.contextKeyService);
		this.focusedAgentSessionTypeContextKey = ChatContextKeys.agentSessionType.bindTo(this.contextKeyService);

		this.createList(this.container);
	}

	private createList(container: HTMLElement): void {
		this.sessionsContainer = append(container, $('.agent-sessions-viewer'));

		const sorter = new AgentSessionsSorter(this.options);
		const list = this.sessionsList = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree,
			'AgentSessionsView',
			this.sessionsContainer,
			new AgentSessionsListDelegate(),
			new AgentSessionsCompressionDelegate(),
			[
				this.instantiationService.createInstance(AgentSessionRenderer, this.options),
				new AgentSessionSectionRenderer(),
			],
			new AgentSessionsDataSource(this.options.filter, sorter),
			{
				accessibilityProvider: new AgentSessionsAccessibilityProvider(),
				dnd: this.instantiationService.createInstance(AgentSessionsDragAndDrop),
				identityProvider: new AgentSessionsIdentityProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				findWidgetEnabled: true,
				defaultFindMode: TreeFindMode.Filter,
				keyboardNavigationLabelProvider: new AgentSessionsKeyboardNavigationLabelProvider(),
				overrideStyles: this.options.overrideStyles,
				twistieAdditionalCssClass: () => 'force-no-twistie',
			}
		)) as WorkbenchCompressibleAsyncDataTree<IAgentSessionsModel, AgentSessionListItem, FuzzyScore>;

		ChatContextKeys.agentSessionsViewerFocused.bindTo(list.contextKeyService);

		const model = this.agentSessionsService.model;

		this._register(Event.any(
			this.options.filter?.onDidChange ?? Event.None,
			model.onDidChangeSessions
		)(() => {
			if (this.visible) {
				list.updateChildren();
			}
		}));

		list.setInput(model);

		this._register(list.onDidOpen(e => this.openAgentSession(e)));
		this._register(list.onContextMenu(e => this.showContextMenu(e)));

		this._register(list.onMouseDblClick(({ element }) => {
			if (element === null) {
				this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
			}
		}));

		this._register(Event.any(list.onDidChangeFocus, model.onDidChangeSessions)(() => {
			const focused = list.getFocus().at(0);
			if (focused && isAgentSession(focused)) {
				this.focusedAgentSessionArchivedContextKey.set(focused.isArchived());
				this.focusedAgentSessionReadContextKey.set(focused.isRead());
				this.focusedAgentSessionTypeContextKey.set(focused.providerType);
			} else {
				this.focusedAgentSessionArchivedContextKey.reset();
				this.focusedAgentSessionReadContextKey.reset();
				this.focusedAgentSessionTypeContextKey.reset();
			}
		}));
	}

	private async openAgentSession(e: IOpenEvent<AgentSessionListItem | undefined>): Promise<void> {
		const element = e.element;
		if (!element || isAgentSessionSection(element)) {
			return; // Section headers are not openable
		}

		this.telemetryService.publicLog2<AgentSessionOpenedEvent, AgentSessionOpenedClassification>('agentSessionOpened', {
			providerType: element.providerType
		});

		await this.instantiationService.invokeFunction(openSession, element, e);
	}

	private async showContextMenu({ element, anchor, browserEvent }: ITreeContextMenuEvent<AgentSessionListItem>): Promise<void> {
		if (!element || isAgentSessionSection(element)) {
			return; // No context menu for section headers
		}

		EventHelper.stop(browserEvent, true);

		await this.chatSessionsService.activateChatSessionItemProvider(element.providerType);

		const contextOverlay: Array<[string, boolean | string]> = [];
		contextOverlay.push([ChatContextKeys.isArchivedAgentSession.key, element.isArchived()]);
		contextOverlay.push([ChatContextKeys.isReadAgentSession.key, element.isRead()]);
		contextOverlay.push([ChatContextKeys.agentSessionType.key, element.providerType]);
		const menu = this.menuService.createMenu(MenuId.AgentSessionsContext, this.contextKeyService.createOverlay(contextOverlay));

		const marshalledSession: IMarshalledChatSessionContext = { session: element, $mid: MarshalledId.ChatSessionContext };
		this.contextMenuService.showContextMenu({
			getActions: () => Separator.join(...menu.getActions({ arg: marshalledSession, shouldForwardArgs: true }).map(([, actions]) => actions)),
			getAnchor: () => anchor,
			getActionsContext: () => marshalledSession,
		});

		menu.dispose();
	}

	openFind(): void {
		this.sessionsList?.openFind();
	}

	refresh(): Promise<void> {
		return this.agentSessionsService.model.resolve(undefined);
	}

	update(): void {
		this.sessionsList?.updateChildren();
	}

	setVisible(visible: boolean): void {
		if (this.visible === visible) {
			return;
		}

		this.visible = visible;

		if (this.visible) {
			this.sessionsList?.updateChildren();
		}
	}

	layout(height: number, width: number): void {
		this.sessionsList?.layout(height, width);
	}

	focus(): void {
		this.sessionsList?.domFocus();
	}

	clearFocus(): void {
		this.sessionsList?.setFocus([]);
		this.sessionsList?.setSelection([]);
	}

	getFocus(): IAgentSession[] {
		const focused = this.sessionsList?.getFocus() ?? [];

		return focused.filter(e => isAgentSession(e));
	}
}
