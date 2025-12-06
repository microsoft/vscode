/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenEvent, WorkbenchCompressibleAsyncDataTree } from '../../../../../platform/list/browser/listService.js';
import { $, append } from '../../../../../base/browser/dom.js';
import { IAgentSession, IAgentSessionsModel, isLocalAgentSessionItem } from './agentSessionsModel.js';
import { AgentSessionRenderer, AgentSessionsAccessibilityProvider, AgentSessionsCompressionDelegate, AgentSessionsDataSource, AgentSessionsDragAndDrop, AgentSessionsIdentityProvider, AgentSessionsKeyboardNavigationLabelProvider, AgentSessionsListDelegate, AgentSessionsSorter, IAgentSessionsFilter } from './agentSessionsViewer.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { getSessionItemContextOverlay } from '../chatSessions/common.js';
import { ACTION_ID_OPEN_CHAT } from '../actions/chatActions.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ITreeContextMenuEvent } from '../../../../../base/browser/ui/tree/tree.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IChatService } from '../../common/chatService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { TreeFindMode } from '../../../../../base/browser/ui/tree/abstractTree.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IMarshalledChatSessionContext } from '../actions/chatSessionActions.js';
import { distinct } from '../../../../../base/common/arrays.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { IStyleOverride } from '../../../../../platform/theme/browser/defaultStyles.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { IAgentSessionsControl } from './agentSessions.js';

export interface IAgentSessionsControlOptions {
	readonly overrideStyles?: IStyleOverride<IListStyles>;
	readonly filter?: IAgentSessionsFilter;
	readonly allowNewSessionFromEmptySpace?: boolean;
	readonly allowOpenSessionsInPanel?: boolean; // TODO@bpasero retire this option eventually
	readonly trackActiveEditor?: boolean;
}

type AgentSessionOpenedClassification = {
	owner: 'bpasero';
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'From where the session was opened.' };
	providerType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider type of the opened agent session.' };
	comment: 'Event fired when a agent session is opened from the agent sessions control.';
};

type AgentSessionOpenedEvent = {
	source: 'agentsView' | 'chatView';
	providerType: string;
};

export class AgentSessionsControl extends Disposable implements IAgentSessionsControl {

	private sessionsContainer: HTMLElement | undefined;
	private sessionsList: WorkbenchCompressibleAsyncDataTree<IAgentSessionsModel, IAgentSession, FuzzyScore> | undefined;

	private visible: boolean = true;

	constructor(
		private readonly container: HTMLElement,
		private readonly options: IAgentSessionsControlOptions | undefined,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IChatService private readonly chatService: IChatService,
		@IMenuService private readonly menuService: IMenuService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();

		this.createList(this.container);

		this.registerListeners();
	}

	private registerListeners(): void {
		if (this.options?.trackActiveEditor) {
			this._register(this.editorService.onDidActiveEditorChange(() => this.revealAndFocusActiveEditorSession()));
		}
	}

	private revealAndFocusActiveEditorSession(): void {
		if (!this.visible) {
			return;
		}

		const input = this.editorService.activeEditor;
		if (!(input instanceof ChatEditorInput)) {
			return;
		}

		const sessionResource = input.sessionResource;
		if (!sessionResource) {
			return;
		}

		const matchingSession = this.agentSessionsService.model.getSession(sessionResource);
		if (matchingSession && this.sessionsList?.hasNode(matchingSession)) {
			if (this.sessionsList.getRelativeTop(matchingSession) === null) {
				this.sessionsList.reveal(matchingSession, 0.5); // only reveal when not already visible
			}

			this.sessionsList.setFocus([matchingSession]);
			this.sessionsList.setSelection([matchingSession]);
		}
	}

	private createList(container: HTMLElement): void {
		this.sessionsContainer = append(container, $('.agent-sessions-viewer'));

		const sorter = new AgentSessionsSorter();
		const list = this.sessionsList = this._register(this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree,
			'AgentSessionsView',
			this.sessionsContainer,
			new AgentSessionsListDelegate(),
			new AgentSessionsCompressionDelegate(),
			[
				this.instantiationService.createInstance(AgentSessionRenderer)
			],
			new AgentSessionsDataSource(this.options?.filter, sorter),
			{
				accessibilityProvider: new AgentSessionsAccessibilityProvider(),
				dnd: this.instantiationService.createInstance(AgentSessionsDragAndDrop),
				identityProvider: new AgentSessionsIdentityProvider(),
				horizontalScrolling: false,
				multipleSelectionSupport: false,
				findWidgetEnabled: true,
				defaultFindMode: TreeFindMode.Filter,
				keyboardNavigationLabelProvider: new AgentSessionsKeyboardNavigationLabelProvider(),
				sorter,
				overrideStyles: this.options?.overrideStyles,
				paddingBottom: this.options?.allowNewSessionFromEmptySpace ? AgentSessionsListDelegate.ITEM_HEIGHT : undefined,
				twistieAdditionalCssClass: () => 'force-no-twistie',
			}
		)) as WorkbenchCompressibleAsyncDataTree<IAgentSessionsModel, IAgentSession, FuzzyScore>;

		const model = this.agentSessionsService.model;

		this._register(Event.any(
			this.options?.filter?.onDidChange ?? Event.None,
			model.onDidChangeSessions
		)(() => {
			if (this.visible) {
				list.updateChildren();
			}
		}));

		list.setInput(model);

		this._register(list.onDidOpen(e => this.openAgentSession(e)));
		this._register(list.onContextMenu(e => this.showContextMenu(e)));

		if (this.options?.allowNewSessionFromEmptySpace) {
			this._register(list.onMouseDblClick(({ element }) => {
				if (element === null) {
					this.commandService.executeCommand(ACTION_ID_OPEN_CHAT);
				}
			}));
		}
	}

	private async openAgentSession(e: IOpenEvent<IAgentSession | undefined>): Promise<void> {
		const session = e.element;
		if (!session) {
			return;
		}

		this.telemetryService.publicLog2<AgentSessionOpenedEvent, AgentSessionOpenedClassification>('agentSessionOpened', {
			source: this.options?.allowOpenSessionsInPanel ? 'chatView' : 'agentsView',
			providerType: session.providerType
		});

		let sessionOptions: IChatEditorOptions;
		if (isLocalAgentSessionItem(session)) {
			sessionOptions = {};
		} else {
			sessionOptions = { title: { preferred: session.label } };
		}

		sessionOptions.ignoreInView = true;

		const options: IChatEditorOptions = {
			...sessionOptions,
			...e.editorOptions,
			revealIfOpened: this.options?.allowOpenSessionsInPanel // always try to reveal if already opened
		};

		await this.chatSessionsService.activateChatSessionItemProvider(session.providerType); // ensure provider is activated before trying to open

		let target: typeof SIDE_GROUP | typeof ACTIVE_GROUP | typeof ChatViewPaneTarget | undefined;
		if (e.sideBySide) {
			target = this.options?.allowOpenSessionsInPanel ? ACTIVE_GROUP : SIDE_GROUP;
		} else if (this.options?.allowOpenSessionsInPanel) {
			target = ChatViewPaneTarget;
		} else {
			target = ACTIVE_GROUP;
		}

		await this.chatWidgetService.openSession(session.resource, target, options);
	}

	private async showContextMenu({ element: session, anchor }: ITreeContextMenuEvent<IAgentSession>): Promise<void> {
		if (!session) {
			return;
		}

		const provider = await this.chatSessionsService.activateChatSessionItemProvider(session.providerType);
		const contextOverlay = getSessionItemContextOverlay(session, provider, this.chatService, this.editorGroupsService);
		contextOverlay.push([ChatContextKeys.isCombinedAgentSessionsViewer.key, true]);
		const menu = this.menuService.createMenu(MenuId.AgentSessionsContext, this.contextKeyService.createOverlay(contextOverlay));

		const marshalledSession: IMarshalledChatSessionContext = { session, $mid: MarshalledId.ChatSessionContext };
		this.contextMenuService.showContextMenu({
			getActions: () => distinct(getFlatActionBarActions(menu.getActions({ arg: marshalledSession, shouldForwardArgs: true })), action => action.id),
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
}
