/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentSessionsWelcome.css';
import { $, addDisposableListener, append, clearNode, Dimension, getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { defaultToggleStyles, getListStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext, IEditorSerializer } from '../../../common/editor.js';
import { SIDE_BAR_FOREGROUND } from '../../../common/theme.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatWidget } from '../../chat/browser/widget/chatWidget.js';
import { IAgentSessionsService } from '../../chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../chat/browser/agentSessions/agentSessions.js';
import { IAgentSession } from '../../chat/browser/agentSessions/agentSessionsModel.js';
import { AgentSessionsWelcomeEditorOptions, AgentSessionsWelcomeInput } from './agentSessionsWelcomeInput.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { IChatModel } from '../../chat/common/model/chatModel.js';
import { ISessionTypePickerDelegate } from '../../chat/browser/chat.js';
import { AgentSessionsControl, IAgentSessionsControlOptions } from '../../chat/browser/agentSessions/agentSessionsControl.js';
import { IAgentSessionsFilter } from '../../chat/browser/agentSessions/agentSessionsViewer.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IResolvedWalkthrough, IWalkthroughsService } from '../../welcomeGettingStarted/browser/gettingStartedService.js';

const configurationKey = 'workbench.startupEditor';
const MAX_SESSIONS = 6;

export class AgentSessionsWelcomePage extends EditorPane {

	static readonly ID = 'agentSessionsWelcomePage';

	private container!: HTMLElement;
	private contentContainer!: HTMLElement;
	private scrollableElement: DomScrollableElement | undefined;
	private chatWidget: ChatWidget | undefined;
	private chatModelRef: IReference<IChatModel> | undefined;
	private sessionsControl: AgentSessionsControl | undefined;
	private sessionsControlContainer: HTMLElement | undefined;
	private readonly sessionsControlDisposables = this._register(new DisposableStore());
	private readonly contentDisposables = this._register(new DisposableStore());
	private contextService: IContextKeyService;
	private walkthroughs: IResolvedWalkthrough[] = [];
	private _selectedSessionProvider: AgentSessionProviders = AgentSessionProviders.Local;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IWalkthroughsService private readonly walkthroughsService: IWalkthroughsService,
		@IChatService private readonly chatService: IChatService,
	) {
		super(AgentSessionsWelcomePage.ID, group, telemetryService, themeService, storageService);

		this.container = $('.agentSessionsWelcome', {
			role: 'document',
			tabindex: 0,
			'aria-label': localize('agentSessionsWelcomeAriaLabel', "Overview of agent sessions and how to get started.")
		});

		this.contextService = this._register(contextKeyService.createScoped(this.container));
		ChatContextKeys.inAgentSessionsWelcome.bindTo(this.contextService).set(true);
	}

	protected createEditor(parent: HTMLElement): void {
		parent.appendChild(this.container);

		// Create scrollable content
		this.contentContainer = $('.agentSessionsWelcome-content');
		this.scrollableElement = this._register(new DomScrollableElement(this.contentContainer, {
			className: 'agentSessionsWelcome-scrollable',
			vertical: ScrollbarVisibility.Auto
		}));
		this.container.appendChild(this.scrollableElement.getDomNode());
	}

	override async setInput(input: AgentSessionsWelcomeInput, options: AgentSessionsWelcomeEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		await this.buildContent();
	}

	private async buildContent(): Promise<void> {
		this.contentDisposables.clear();
		this.sessionsControlDisposables.clear();
		this.sessionsControl = undefined;
		clearNode(this.contentContainer);

		// Get walkthroughs
		this.walkthroughs = this.walkthroughsService.getWalkthroughs();

		// Header
		const header = append(this.contentContainer, $('.agentSessionsWelcome-header'));
		append(header, $('h1.product-name', {}, this.productService.nameLong));

		const startEntries = append(header, $('.agentSessionsWelcome-startEntries'));
		this.buildStartEntries(startEntries);

		// Chat input section
		const chatSection = append(this.contentContainer, $('.agentSessionsWelcome-chatSection'));
		this.buildChatWidget(chatSection);

		// Sessions or walkthroughs
		const sessions = this.agentSessionsService.model.sessions;
		const sessionsSection = append(this.contentContainer, $('.agentSessionsWelcome-sessionsSection'));
		if (sessions.length > 0) {
			this.buildSessionsGrid(sessionsSection, sessions);
		} else {
			const walkthroughsSection = append(this.contentContainer, $('.agentSessionsWelcome-walkthroughsSection'));
			this.buildWalkthroughs(walkthroughsSection);
		}

		// Footer
		const footer = append(this.contentContainer, $('.agentSessionsWelcome-footer'));
		this.buildFooter(footer);

		// Listen for session changes - store reference to avoid querySelector
		this.contentDisposables.add(this.agentSessionsService.model.onDidChangeSessions(() => {
			clearNode(sessionsSection);
			this.buildSessionsOrPrompts(sessionsSection);
		}));

		this.scrollableElement?.scanDomNode();
	}

	private buildStartEntries(container: HTMLElement): void {
		const entries = [
			{ icon: Codicon.folderOpened, label: localize('openRecent', "Open Recent..."), command: 'workbench.action.openRecent' },
			{ icon: Codicon.newFile, label: localize('newFile', "New file..."), command: 'workbench.action.files.newUntitledFile' },
			{ icon: Codicon.repoClone, label: localize('cloneRepo', "Clone Git Repository..."), command: 'git.clone' },
		];

		for (const entry of entries) {
			const button = append(container, $('button.agentSessionsWelcome-startEntry'));
			button.appendChild(renderIcon(entry.icon));
			button.appendChild(document.createTextNode(entry.label));
			button.onclick = () => this.commandService.executeCommand(entry.command);
		}
	}

	private buildChatWidget(container: HTMLElement): void {
		const chatWidgetContainer = append(container, $('.agentSessionsWelcome-chatWidget'));

		// Create editor overflow widgets container
		const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatWidgetContainer)).appendChild($('.chat-editor-overflow.monaco-editor'));
		this.contentDisposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));

		// Create ChatWidget with scoped services
		const scopedContextKeyService = this.contentDisposables.add(this.contextService.createScoped(chatWidgetContainer));
		const scopedInstantiationService = this.contentDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));

		// Create a delegate for the session target picker with independent local state
		const onDidChangeActiveSessionProvider = this.contentDisposables.add(new Emitter<AgentSessionProviders>());
		const sessionTypePickerDelegate: ISessionTypePickerDelegate = {
			getActiveSessionProvider: () => this._selectedSessionProvider,
			setActiveSessionProvider: (provider: AgentSessionProviders) => {
				this._selectedSessionProvider = provider;
				onDidChangeActiveSessionProvider.fire(provider);
			},
			onDidChangeActiveSessionProvider: onDidChangeActiveSessionProvider.event
		};

		this.chatWidget = this.contentDisposables.add(scopedInstantiationService.createInstance(
			ChatWidget,
			ChatAgentLocation.Chat,
			// TODO: @osortega should we have a completely different ID and check that context instead in chatInputPart?
			{}, // Empty resource view context
			{
				autoScroll: mode => mode !== ChatModeKind.Ask,
				renderFollowups: false,
				supportsFileReferences: true,
				renderInputOnTop: true,
				rendererOptions: {
					renderTextEditsAsSummary: () => true,
					referencesExpandedWhenEmptyResponse: false,
					progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask,
				},
				editorOverflowWidgetsDomNode,
				enableImplicitContext: true,
				enableWorkingSet: 'explicit',
				supportsChangingModes: true,
				sessionTypePickerDelegate,
			},
			{
				listForeground: SIDE_BAR_FOREGROUND,
				listBackground: editorBackground,
				overlayBackground: editorBackground,
				inputEditorBackground: editorBackground,
				resultEditorBackground: editorBackground,
			}
		));

		this.chatWidget.render(chatWidgetContainer);
		this.chatWidget.setVisible(true);

		// Schedule initial layout at next animation frame to ensure proper input sizing
		this.contentDisposables.add(scheduleAtNextAnimationFrame(getWindow(chatWidgetContainer), () => {
			this.layoutChatWidget();
		}));

		// Start a chat session so the widget has a viewModel
		// This is necessary for actions like mode switching to work properly
		this.chatModelRef = this.chatService.startSession(ChatAgentLocation.Chat);
		this.contentDisposables.add(this.chatModelRef);
		if (this.chatModelRef.object) {
			this.chatWidget.setModel(this.chatModelRef.object);
		}

		// Focus the input when clicking anywhere in the chat widget area
		// This ensures our widget becomes lastFocusedWidget for the chatWidgetService
		this.contentDisposables.add(addDisposableListener(chatWidgetContainer, 'mousedown', () => {
			this.chatWidget?.focusInput();
		}));
	}

	private buildSessionsOrPrompts(container: HTMLElement): void {
		// Clear previous sessions control
		this.sessionsControlDisposables.clear();
		this.sessionsControl = undefined;

		const sessions = this.agentSessionsService.model.sessions;

		if (sessions.length > 0) {
			this.buildSessionsGrid(container, sessions);
		}
	}


	private buildSessionsGrid(container: HTMLElement, _sessions: IAgentSession[]): void {
		this.sessionsControlContainer = append(container, $('.agentSessionsWelcome-sessionsGrid'));

		// Create a filter that limits results and excludes archived sessions
		const onDidChangeEmitter = this.sessionsControlDisposables.add(new Emitter<void>());
		const filter: IAgentSessionsFilter = {
			onDidChange: onDidChangeEmitter.event,
			limitResults: () => MAX_SESSIONS,
			groupResults: () => false,
			exclude: (session: IAgentSession) => session.isArchived(),
			getExcludes: () => ({
				providers: [],
				states: [],
				archived: true,
				read: false,
			}),
		};

		const options: IAgentSessionsControlOptions = {
			overrideStyles: getListStyles({
				listBackground: editorBackground,
			}),
			filter,
			getHoverPosition: () => HoverPosition.BELOW,
			trackActiveEditorSession: () => false,
			source: 'welcomeView',
			notifySessionOpened: () => this.layoutService.setAuxiliaryBarMaximized(true) // TODO@osortega what if the session did not open in the 2nd sidebar?
		};

		this.sessionsControl = this.sessionsControlDisposables.add(this.instantiationService.createInstance(
			AgentSessionsControl,
			this.sessionsControlContainer,
			options
		));

		// Schedule layout at next animation frame to ensure proper rendering
		this.sessionsControlDisposables.add(scheduleAtNextAnimationFrame(getWindow(this.sessionsControlContainer), () => {
			this.layoutSessionsControl();
		}));

		// "Open Agent Sessions" link
		const openButton = append(container, $('button.agentSessionsWelcome-openSessionsButton'));
		openButton.textContent = localize('openAgentSessions', "Open Agent Sessions");
		openButton.onclick = () => {
			this.commandService.executeCommand('workbench.action.chat.open');
			if (!this.layoutService.isAuxiliaryBarMaximized()) {
				this.layoutService.toggleMaximizedAuxiliaryBar();
			}
		};
	}

	private buildWalkthroughs(container: HTMLElement): void {
		const activeWalkthroughs = this.walkthroughs.filter(w =>
			!w.when || this.contextService.contextMatchesRules(w.when)
		).slice(0, 3);

		if (activeWalkthroughs.length === 0) {
			return;
		}

		for (const walkthrough of activeWalkthroughs) {
			const card = append(container, $('.agentSessionsWelcome-walkthroughCard'));
			card.onclick = () => {
				this.commandService.executeCommand('workbench.action.openWalkthrough', walkthrough.id);
			};

			// Icon
			const iconContainer = append(card, $('.agentSessionsWelcome-walkthroughCard-icon'));
			if (walkthrough.icon.type === 'icon') {
				iconContainer.appendChild(renderIcon(walkthrough.icon.icon));
			}

			// Content
			const content = append(card, $('.agentSessionsWelcome-walkthroughCard-content'));
			const title = append(content, $('.agentSessionsWelcome-walkthroughCard-title'));
			title.textContent = walkthrough.title;

			if (walkthrough.description) {
				const desc = append(content, $('.agentSessionsWelcome-walkthroughCard-description'));
				desc.textContent = walkthrough.description;
			}

			// Navigation arrows container
			const navContainer = append(card, $('.agentSessionsWelcome-walkthroughCard-nav'));
			const prevButton = append(navContainer, $('button.nav-button'));
			prevButton.appendChild(renderIcon(Codicon.chevronLeft));
			prevButton.onclick = (e) => { e.stopPropagation(); };

			const nextButton = append(navContainer, $('button.nav-button'));
			nextButton.appendChild(renderIcon(Codicon.chevronRight));
			nextButton.onclick = (e) => { e.stopPropagation(); };
		}
	}

	private buildFooter(container: HTMLElement): void {
		// Learning link
		const learningLink = append(container, $('button.agentSessionsWelcome-footerLink'));
		learningLink.appendChild(renderIcon(Codicon.mortarBoard));
		learningLink.appendChild(document.createTextNode(localize('exploreHelp', "Explore Learning & Help Resources")));
		learningLink.onclick = () => this.commandService.executeCommand('workbench.action.openWalkthrough');

		// Show on startup checkbox
		const showOnStartupContainer = append(container, $('.agentSessionsWelcome-showOnStartup'));
		const showOnStartupCheckbox = this.contentDisposables.add(new Toggle({
			icon: Codicon.check,
			actionClassName: 'agentSessionsWelcome-checkbox',
			isChecked: this.configurationService.getValue(configurationKey) === 'agentSessionsWelcomePage',
			title: localize('checkboxTitle', "When checked, this page will be shown on startup."),
			...defaultToggleStyles
		}));
		showOnStartupCheckbox.domNode.id = 'showOnStartup';
		const showOnStartupLabel = $('label.caption', { for: 'showOnStartup' }, localize('showOnStartup', "Show welcome page on startup"));

		const onShowOnStartupChanged = () => {
			if (showOnStartupCheckbox.checked) {
				this.configurationService.updateValue(configurationKey, 'agentSessionsWelcomePage');
			} else {
				this.configurationService.updateValue(configurationKey, 'none');
			}
		};

		this.contentDisposables.add(showOnStartupCheckbox.onChange(() => onShowOnStartupChanged()));
		this.contentDisposables.add(addDisposableListener(showOnStartupLabel, 'click', () => {
			showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
			onShowOnStartupChanged();
		}));

		showOnStartupContainer.appendChild(showOnStartupCheckbox.domNode);
		showOnStartupContainer.appendChild(showOnStartupLabel);
	}

	private lastDimension: Dimension | undefined;

	override layout(dimension: Dimension): void {
		this.lastDimension = dimension;
		this.container.style.height = `${dimension.height}px`;
		this.container.style.width = `${dimension.width}px`;

		// Layout chat widget
		this.layoutChatWidget();

		// Layout sessions control
		this.layoutSessionsControl();

		this.scrollableElement?.scanDomNode();
	}

	private layoutChatWidget(): void {
		if (!this.chatWidget || !this.lastDimension) {
			return;
		}

		const chatWidth = Math.min(800, this.lastDimension.width - 80);
		// Use a reasonable height for the input part - the CSS will hide the list area
		const inputHeight = 150;
		this.chatWidget.layout(inputHeight, chatWidth);
	}

	private layoutSessionsControl(): void {
		if (!this.sessionsControl || !this.sessionsControlContainer || !this.lastDimension) {
			return;
		}

		// TODO: @osortega this is a weird way of doing this, maybe we handle the 2-colum layout in the control itself?
		const sessionsWidth = Math.min(800, this.lastDimension.width - 80);
		// Calculate height based on actual visible sessions (capped at MAX_SESSIONS)
		// Use 52px per item from AgentSessionsListDelegate.ITEM_HEIGHT
		// Give the list FULL height so virtualization renders all items
		// CSS transforms handle the 2-column visual layout
		const visibleSessions = Math.min(
			this.agentSessionsService.model.sessions.filter(s => !s.isArchived()).length,
			MAX_SESSIONS
		);
		const sessionsHeight = visibleSessions * 52;
		this.sessionsControl.layout(sessionsHeight, sessionsWidth);

		// Set margin offset for 2-column layout: actual height - visual height
		// Visual height = ceil(n/2) * 52, so offset = floor(n/2) * 52
		const marginOffset = Math.floor(visibleSessions / 2) * 52;
		this.sessionsControl.element!.style.marginBottom = `-${marginOffset}px`;
	}

	override focus(): void {
		super.focus();
		this.chatWidget?.focusInput();
	}
}

export class AgentSessionsWelcomeInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: AgentSessionsWelcomeInput): boolean {
		return true;
	}

	serialize(editorInput: AgentSessionsWelcomeInput): string {
		return JSON.stringify({});
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): AgentSessionsWelcomeInput {
		return new AgentSessionsWelcomeInput({});
	}
}
