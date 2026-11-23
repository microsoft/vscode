/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Gesture, GestureEvent, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button, ButtonBar, IButton } from '../../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { toAction } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, constObservable, derived, IObservable, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { SubmenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { getAutomationAfterDate } from '../../../../../platform/agentHost/common/automationDisableConditions.js';
import { IMissionControlEnvironmentService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { extractEditorsDropData } from '../../../../../platform/dnd/browser/dnd.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { Link } from '../../../../../platform/opener/browser/link.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import type { AutomationTarget, IAutomationDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AUTOMATION_BLUEPRINT_FILE_SUFFIX } from '../../../../../workbench/contrib/chat/common/automations/automationBlueprint.js';
import { type AutomationDialogCreateInitialValues, IAutomationDialogService } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationRunner } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { type AutomationCatalogueState, type IAutomationProviderDescriptor, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { automationTriggerSummary, hasAutomationEventTrigger } from '../../../../../workbench/contrib/chat/common/automations/automationTriggers.js';
import { observableShowSharedAutomationsByOthers } from '../../../../../workbench/contrib/chat/common/automations/automationViewState.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IAgentPluginService } from '../../../../../workbench/contrib/chat/common/plugins/agentPluginService.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { AUTOMATIONS_CUSTOM_VIEW_ID } from '../../../../../workbench/contrib/sessions/browser/automationsConstants.js';
import { AbstractCustomView, ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ChatEntitlementContextKeys } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { AutomationsCustomViewFocusContext, AutomationsHasItemsContext, AutomationsHasOthersContext, ShowSharedAutomationsByOthersContext } from '../../../../common/agentsWindowContextKeys.js';
import { logAutomationViewShown, withAutomationDialogPersistenceTelemetry } from '../../../automations/browser/automationTelemetry.js';
import { formatSchedule, getAutomationOwnershipGroups, getAutomationRemoteStatusPresentation, getAutomationsViewContent, getConnectedAutomationRemoteCount, getUnavailableAutomationsReasons, hasEmptyAutomationSection } from './automationCataloguePresentation.js';
import { isLocalAutomationRunStarting } from './automationRunProgress.js';
import { IAutomationTemplate, readAutomationTemplates } from './automationTemplates.js';
import { AUTOMATIONS_MODAL_SETTING } from '../../../automations/browser/automationsEditorInput.js';


import '../../../../../workbench/contrib/sessions/browser/media/disclosure.css';
import '../media/automationsCards.css';
import './automationsAccessibility.js';


import { AutomationHeaderButtonActionViewItem, AutomationHeaderSplitButtonActionViewItem } from '../../../automations/browser/automationActionViewItems.js';
import { AutomationCommands, getErrorMessage, importAutomationBlueprint, isAutomationBlueprintResource, refreshAutomations, showAutomationEditDialog, showAutomationsDisabled } from '../../../automations/browser/automationCommands.js';

import { AutomationHistorySection, markAllAutomationRunsRead, resolveAutomationRunSessions } from '../../../automations/browser/automationRunHistory.js';


const $ = DOM.$;










export const SEEN_PLUGIN_AUTOMATION_TEMPLATES_STORAGE_KEY = 'sessions.automations.seenPluginTemplateIds';
export const SHOW_DISABLED_AUTOMATIONS_STORAGE_KEY = 'sessions.automations.showDisabled';
const ShowDisabledAutomationsContext = new RawContextKey<boolean>('sessionsAutomationsShowDisabled', true);
const AutomationsHasVisibleCardsContext = new RawContextKey<boolean>('sessionsAutomationsHasVisibleCards', false);
const TOGGLE_SHOW_DISABLED_AUTOMATIONS_COMMAND_ID = 'sessions.automations.toggleShowDisabled';
/** Onboarding spotlight targets shared by creation introductions and checklist tours. */
const AUTOMATION_TEMPLATES_ONBOARDING_TARGET_ID = 'sessions.automations.templates';
const CREATE_AUTOMATION_ONBOARDING_TARGET_ID = 'sessions.automations.create';
const CREATE_AUTOMATION_WITH_AGENT_COMMAND_ID = 'sessions.automations.createWithAgent';
const AutomationCardCanDeleteContext = new RawContextKey<boolean>('sessionsAutomationCardCanDelete', false);
const AutomationCardCanUpdateContext = new RawContextKey<boolean>('sessionsAutomationCardCanUpdate', false);
const AutomationCardHasExternalResourceContext = new RawContextKey<boolean>('sessionsAutomationCardHasExternalResource', false);
const AutomationCardEnabledContext = new RawContextKey<boolean>('sessionsAutomationCardEnabled', false);
const AutomationCardHasLimitsContext = new RawContextKey<boolean>('sessionsAutomationCardHasLimits', false);


const AutomationCardIsCloudContext = new RawContextKey<boolean>('sessionsAutomationCardIsCloud', false);
const AutomationCardHasEventTriggerContext = new RawContextKey<boolean>('sessionsAutomationCardHasEventTrigger', false);

function areAutomationTemplatesEqual(first: readonly IAutomationTemplate[], second: readonly IAutomationTemplate[]): boolean {
	return first.length === second.length && first.every((template, index) => {
		const other = second[index];
		return template.id === other.id
			&& template.name === other.name
			&& template.description === other.description
			&& template.prompt === other.prompt
			&& template.enabled === other.enabled
			&& template.schedule.interval === other.schedule.interval
			&& template.schedule.cronExpression === other.schedule.cronExpression
			&& template.schedule.cronTimeZone === other.schedule.cronTimeZone
			&& template.schedule.scheduleHour === other.schedule.scheduleHour
			&& template.schedule.scheduleMinute === other.schedule.scheduleMinute
			&& template.schedule.scheduleDay === other.schedule.scheduleDay
			&& equals(template.disableConditions ?? [], other.disableConditions ?? [])
			&& template.source?.label === other.source?.label
			&& ((!template.source && !other.source) || (!!template.source && !!other.source && isEqual(template.source.uri, other.source.uri)));
	});
}

function setsEqual(first: ReadonlySet<string>, second: ReadonlySet<string>): boolean {
	return first.size === second.size && [...first].every(value => second.has(value));
}

interface IAutomationCardEntry {
	readonly element: HTMLElement;
	readonly card: HTMLElement;
	readonly main: HTMLButtonElement;
	readonly actions: HTMLElement;
	readonly runButton: IButton;
	readonly moreActionsButton: IButton;
	readonly canDeleteContext: IContextKey<boolean>;
	readonly hasExternalResourceContext: IContextKey<boolean>;
	readonly canUpdateContext: IContextKey<boolean>;
	readonly enabledContext: IContextKey<boolean>;
	readonly hasLimitsContext: IContextKey<boolean>;
	readonly isCloudContext: IContextKey<boolean>;
	readonly hasEventTriggerContext: IContextKey<boolean>;
	readonly nameText: HTMLElement;
	readonly startingIcon: HTMLElement;
	readonly startingRuns: ISettableObservable<ReadonlySet<string> | undefined>;
	readonly scheduleEl: HTMLElement;
	readonly scheduleHover: MutableDisposable<IDisposable>;
	readonly scheduleRefresh: MutableDisposable<IDisposable>;
	readonly folderEl: HTMLElement;
	readonly folderHover: MutableDisposable<IDisposable>;
	readonly promptEl: HTMLElement;
	readonly disposables: DisposableStore;
}

interface IAutomationOwnershipSection {
	readonly section: HTMLDetailsElement;
	readonly summary: HTMLElement;
	readonly title: HTMLElement;
	readonly grid: HTMLElement;
	readonly emptyState: HTMLElement | undefined;
	readonly disposables: DisposableStore;
}











interface IAutomationTemplateSectionOptions {
	readonly className: string;
	readonly title: string;
	readonly description: string;
	readonly templates: readonly IAutomationTemplate[];
	readonly expanded: boolean;
	readonly showUnreadIndicator?: boolean;
	readonly onDidToggle: (expanded: boolean) => void;
}

interface IRenderedAutomationTemplateSection {
	readonly section: HTMLDetailsElement;
	readonly summary: HTMLElement;
	readonly unreadIndicator: HTMLElement | undefined;
}

type AutomationDropData =
	| { readonly kind: 'resource'; readonly resource: URI }
	| { readonly kind: 'file'; readonly file: File }
	| { readonly kind: 'invalid'; readonly reason: 'multiple' | 'unsupported' }
	| { readonly kind: 'none' };

/**
 * Card-style view of automations for the Agents window sessions grid.
 * Uses native VS Code components and styling patterns matching the
 * automationsListWidget in AI Customization.
 */
export class AutomationsCardsWidget extends Disposable {

	readonly element: HTMLElement;

	private readonly cardsSection: AutomationCardsSection;
	private readonly historySection: AutomationHistorySection;
	private readonly isMarkingAllRead = observableValue(this, false);

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@IAgentPluginService private readonly agentPluginService: IAgentPluginService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		logAutomationViewShown(this.telemetryService);
		const showSharedByOthers = observableShowSharedAutomationsByOthers(this, storageService, this._store);
		const configurationChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		const visibleContent = derived(this, reader => {
			configurationChanged.read(reader);
			return getAutomationsViewContent(
				this.automationService.automations.read(reader),
				this.automationService.runs.read(reader),
				showSharedByOthers.read(reader),
				configurationService.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING) === true,
			);
		});
		const visibleAutomations = derived(this, reader => {
			configurationChanged.read(reader);
			return getAutomationsViewContent(
				this.automationService.automations.read(reader), [],
				showSharedByOthers.read(reader),
				configurationService.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING) === true,
			).automations;
		});
		this.element = $('.automations-cards-widget');
		this.element.tabIndex = -1;
		const focusContext = AutomationsCustomViewFocusContext.bindTo(contextKeyService);
		const focusTracker = this._register(DOM.trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusContext.set(false)));
		this._register(toDisposable(() => focusContext.reset()));
		const scrollContent = DOM.append(this.element, $('.automations-cards-scroll-content'));
		this.cardsSection = this._register(instantiationService.createInstance(AutomationCardsSection, scrollContent, this.element));
		const historyState = DOM.append(scrollContent, $('.automations-history-state', { role: 'status' }));
		this._register(autorun(reader => {
			const state = this.automationService.historyState?.read(reader);
			const catalogueState = this.automationService.catalogueState.read(reader);
			const hasAutomations = visibleAutomations.read(reader).length > 0;
			const hasRuns = visibleContent.read(reader).runs.length > 0;
			const message = state === 'error'
				? hasRuns
					? localize('historyRefreshFailed', "Run history could not be refreshed. Showing the last available history. Use Refresh to try again.")
					: localize('historyLoadFailed', "Run history could not be loaded. Use Refresh to try again.")
				: catalogueState === 'ready' && (state === undefined || state === 'ready') && hasAutomations && !hasRuns ? localize('historyEmpty', "No runs yet. Wait for the automation's next trigger, or run it now when available.") : '';
			historyState.textContent = message;
			historyState.style.display = message ? '' : 'none';
		}));
		this.historySection = this._register(instantiationService.createInstance(AutomationHistorySection, scrollContent, this.element, this.isMarkingAllRead, {}));

		const hasVisibleCardsContext = AutomationsHasVisibleCardsContext.bindTo(contextKeyService);
		this._register(toDisposable(() => hasVisibleCardsContext.reset()));
		this._register(autorun(reader => {
			const catalogueState = this.automationService.catalogueState.read(reader);
			this.automationService.availableProviders.read(reader);
			const unavailableProviders = this.automationService.unavailableProviders.read(reader);
			const items = visibleAutomations.read(reader);
			const templates = readAutomationTemplates(this.agentPluginService.plugins.read(reader), reader);
			const showDisabled = this.cardsSection.showDisabled.read(reader);
			hasVisibleCardsContext.set(items.some(automation => showDisabled || automation.enabled));
			this.cardsSection.render(items, catalogueState, unavailableProviders, templates, showDisabled);
		}));

		const sessionDeleted = observableSignalFromEvent(this, this.sessionsManagementService.onDidDeleteSession);
		const sessionsChanged = observableSignalFromEvent(this, this.sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			if (this.isMarkingAllRead.read(reader)) {
				return;
			}
			sessionDeleted.read(reader);
			sessionsChanged.read(reader);
			this.automationService.availableProviders.read(reader);
			this.automationService.catalogueState.read(reader);
			this.automationService.automations.read(reader);
			const allRuns = visibleContent.read(reader).runs;
			const sessions = resolveAutomationRunSessions(allRuns, this.sessionsManagementService.getSessions(), this.uriIdentityService);
			this.historySection.render(allRuns, sessions, reader);
			this.cardsSection.setPresentedRunIds(sessions.keys());
		}));
		const refreshScheduler = this._register(new RunOnceScheduler(() => {
			void refresh();
		}, 60_000));
		const refresh = async (): Promise<void> => {
			refreshScheduler.cancel();
			await refreshAutomations(this.automationService, this.logService, undefined, { background: true });
			if (!this._store.isDisposed && !this.automationService.isRefreshing?.get()) {
				refreshScheduler.schedule();
			}
		};
		this._register(autorun(reader => {
			if (this.automationService.isRefreshing?.read(reader)) {
				refreshScheduler.cancel();
			} else {
				refreshScheduler.schedule();
			}
		}));
		void refresh();
	}

	layout(width: number, height: number): void {
		this.element.style.width = `${width}px`;
		this.historySection.layout();
	}

	focus(): void {
		this.element.focus();
	}
}

//#region AutomationCardsSection

/**
 * Renders the automation card grid and empty state.
 */
class AutomationCardsSection extends Disposable {

	readonly showDisabled: ISettableObservable<boolean>;
	private readonly hiddenDisabledOwnerships = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly container: HTMLElement;
	private readonly emptyContainer: HTMLElement;
	private readonly loadingContainer: HTMLElement;
	private readonly unavailableContainer: HTMLElement;
	private readonly errorContainer: HTMLElement;
	private readonly templatesContainer: HTMLElement;
	private readonly partialStateContainer: HTMLElement;
	private readonly dropOverlay: HTMLElement;
	private readonly partialErrorIcon: HTMLElement;
	private readonly partialStateMessage: HTMLElement;
	private readonly persistentCards = new Map<string, IAutomationCardEntry>();
	private readonly ownershipSections = new Map<string, IAutomationOwnershipSection>();
	private readonly latestAutomations = new Map<string, IAutomationDescriptor>();
	private readonly presentedRunIds = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly emptyStateDisposables = this._register(new DisposableStore());
	private readonly templateDisposables = this._register(new DisposableStore());
	private readonly stateDisposables = this._register(new DisposableStore());
	private readonly templateAriaId = generateUuid();
	private emptyStateRendered = false;
	private renderedTemplates: readonly IAutomationTemplate[] = [];
	private builtInTemplatesSection: HTMLDetailsElement | undefined;
	private builtInTemplatesExpanded: boolean | undefined;
	private builtInTemplatesUserToggled = false;
	private pluginTemplatesSection: HTMLDetailsElement | undefined;
	private pluginTemplatesSummary: HTMLElement | undefined;
	private pluginTemplatesUnreadIndicator: HTMLElement | undefined;
	private pluginTemplatesExpanded: boolean | undefined;
	private pluginTemplatesUserToggled = false;
	private currentPluginTemplateIds = new Set<string>();
	private seenPluginTemplateIds: Set<string>;
	private emptyCreateButton: IButton | undefined;
	private readonly loadingCreateButton: IButton;
	private readonly unavailableCreateButton: IButton;
	private readonly unavailableDescription: HTMLElement;
	private readonly errorCreateButton: IButton;
	private visibleContainer: HTMLElement | undefined;
	private partialState: AutomationCatalogueState = 'ready';
	private partialUnavailableProviders: readonly IAutomationProviderDescriptor[] = [];
	private manageRemotesVisible = false;
	private managedDisconnectedProviderIds: ReadonlySet<string> = new Set();
	private ignoredGitHubEnvironmentProviderIds: ReadonlySet<string> = new Set();
	private pendingFocusAutomationId: string | undefined;
	private focusRequestGeneration = 0;

	constructor(
		parent: HTMLElement,
		private readonly focusRoot: HTMLElement,
		@IAutomationService private readonly automationService: IAutomationService,
		@IAutomationRunner private readonly automationRunner: IAutomationRunner,
		@IAutomationDialogService private readonly automationDialogService: IAutomationDialogService,
		@IHoverService private readonly hoverService: IHoverService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@IMissionControlEnvironmentService private readonly missionControlEnvironmentService: IMissionControlEnvironmentService,
	) {
		super();
		// Storage restores the preference; delayed storage echoes must not overwrite live input.
		this.showDisabled = observableValue(this, this.storageService.getBoolean(SHOW_DISABLED_AUTOMATIONS_STORAGE_KEY, StorageScope.PROFILE, true));
		const showDisabledContext = ShowDisabledAutomationsContext.bindTo(this.contextKeyService);
		this._register(toDisposable(() => showDisabledContext.reset()));
		this._register(autorun(reader => showDisabledContext.set(this.showDisabled.read(reader))));
		this._register(CommandsRegistry.registerCommand(TOGGLE_SHOW_DISABLED_AUTOMATIONS_COMMAND_ID, () => {
			this.setShowDisabled(!this.showDisabled.get());
		}));
		this.seenPluginTemplateIds = this.readSeenPluginTemplateIds();
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, SEEN_PLUGIN_AUTOMATION_TEMPLATES_STORAGE_KEY, this._store)(() => {
			this.seenPluginTemplateIds = this.readSeenPluginTemplateIds();
			this.updatePluginTemplateUnreadState(false);
		}));
		this.container = DOM.append(parent, $('.automations-cards-grid'));
		this.container.style.display = 'none';
		this.partialStateContainer = DOM.append(parent, $('.automations-cards-partial-state'));
		this.partialStateContainer.setAttribute('role', 'status');
		this.partialStateContainer.setAttribute('aria-live', 'polite');
		this.partialStateContainer.style.display = 'none';
		this.partialErrorIcon = DOM.append(this.partialStateContainer, $('span.automations-cards-partial-state-icon'));
		this.partialErrorIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
		this.partialErrorIcon.setAttribute('aria-hidden', 'true');
		const partialStateContent = DOM.append(this.partialStateContainer, $('.automations-cards-partial-state-content'));
		this.partialStateMessage = DOM.append(partialStateContent, $('div.automations-cards-partial-state-message'));
		this.emptyContainer = DOM.append(parent, $('.automations-cards-empty'));
		this.emptyContainer.style.display = 'none';
		this.loadingContainer = DOM.append(parent, $('.automations-cards-state.automations-cards-loading'));
		this.loadingContainer.style.display = 'none';
		this.loadingCreateButton = this.renderLoadingState();
		this.unavailableContainer = DOM.append(parent, $('.automations-cards-state.automations-cards-unavailable'));
		this.unavailableContainer.style.display = 'none';
		const unavailableState = this.renderUnavailableState();
		this.unavailableCreateButton = unavailableState.createButton;
		this.unavailableDescription = unavailableState.description;
		this.renderManageRemotesLink(partialStateContent);
		this.renderManageRemotesLink(unavailableState.manageRemotesTarget);
		this.errorContainer = DOM.append(parent, $('.automations-cards-state.automations-cards-error'));
		this.errorContainer.style.display = 'none';
		this.errorCreateButton = this.renderErrorState();
		this.templatesContainer = DOM.append(parent, $('.automations-templates'));
		this.templatesContainer.style.display = 'none';
		this.dropOverlay = DOM.append(this.focusRoot, $('.automations-drop-overlay'));
		this.dropOverlay.setAttribute('role', 'status');
		this.dropOverlay.setAttribute('aria-live', 'polite');
		const dropIcon = DOM.append(this.dropOverlay, $('span.automations-drop-overlay-icon'));
		dropIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.cloudUpload));
		dropIcon.setAttribute('aria-hidden', 'true');
		const dropTitle = DOM.append(this.dropOverlay, $('span.automations-drop-overlay-title'));
		dropTitle.textContent = localize('automationDropTitle', "Drop to import automation");
		const dropDescription = DOM.append(this.dropOverlay, $('span.automations-drop-overlay-description'));
		dropDescription.textContent = localize('automationDropDescription', "You can review the Automation before creating it.");
		this._register(new DOM.DragAndDropObserver(this.focusRoot, {
			onDragEnter: event => this.updateDropOverlay(event),
			onDragOver: event => this.updateDropOverlay(event),
			onDragLeave: () => this.hideDropOverlay(),
			onDragEnd: () => this.hideDropOverlay(),
			onDrop: event => this.handleDrop(event),
		}));
		const focusTracker = this._register(DOM.trackFocus(this.focusRoot));
		this._register(focusTracker.onDidBlur(() => this.clearPendingFocus()));
		this._register(DOM.addDisposableListener(this.focusRoot, DOM.EventType.FOCUS_OUT, (event: FocusEvent) => {
			if (event.relatedTarget && (!DOM.isHTMLElement(event.relatedTarget) || !this.focusRoot.contains(event.relatedTarget))) {
				this.clearPendingFocus();
			}
		}));
		this._register(DOM.addDisposableListener(DOM.getWindow(this.focusRoot), DOM.EventType.BLUR, () => this.clearPendingFocus()));
		this._register(DOM.addDisposableListener(this.focusRoot, DOM.EventType.MOUSE_DOWN, () => this.clearPendingFocus()));
		this._register(DOM.addDisposableListener(this.focusRoot, DOM.EventType.KEY_DOWN, () => this.clearPendingFocus()));
		this._register(toDisposable(() => {
			this.clearPendingFocus();
			for (const card of this.persistentCards.values()) {
				card.disposables.dispose();
				card.element.remove();
			}
			this.persistentCards.clear();
			this.latestAutomations.clear();
			for (const section of this.ownershipSections.values()) {
				section.disposables.dispose();
				section.section.remove();
			}
			this.ownershipSections.clear();
		}));
	}

	private setShowDisabled(showDisabled: boolean): void {
		this.showDisabled.set(showDisabled, undefined);
		this.storageService.store(SHOW_DISABLED_AUTOMATIONS_STORAGE_KEY, showDisabled, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private updateDropOverlay(event: DragEvent): void {
		const dropData = getAutomationDropData(event);
		const canImport = dropData.kind === 'resource' || dropData.kind === 'file';
		this.dropOverlay.classList.toggle('visible', canImport);
		if (canImport && event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	private hideDropOverlay(): void {
		this.dropOverlay.classList.remove('visible');
	}

	private handleDrop(event: DragEvent): void {
		const dropData = getAutomationDropData(event);
		this.hideDropOverlay();
		if (dropData.kind === 'none') {
			return;
		}
		DOM.EventHelper.stop(event, true);
		if (dropData.kind === 'invalid') {
			const detail = dropData.reason === 'multiple'
				? localize('automationDropMultiple', "Drop one Automation blueprint file at a time.")
				: localize('automationDropUnsupported', "Only .automation.md files can be imported.");
			void this.dialogService.error(localize('automationDropFailed', "Unable to import automation."), detail);
			return;
		}
		const readContent = dropData.kind === 'resource'
			? async () => (await this.fileService.readFile(dropData.resource)).value.toString()
			: async () => VSBuffer.wrap(new Uint8Array(await dropData.file.arrayBuffer())).toString();
		void importAutomationBlueprint(
			readContent,
			this.automationDialogService,
			this.automationService,
			this.configurationService,
			this.dialogService,
			this.logService,
			this.telemetryService,
		);
	}

	render(automations: readonly IAutomationDescriptor[], catalogueState: AutomationCatalogueState, unavailableProviders: readonly IAutomationProviderDescriptor[], templates: readonly IAutomationTemplate[], showDisabled: boolean): void {
		const activeElement = DOM.getActiveElement();
		const contentOwnedFocus = DOM.isHTMLElement(activeElement) && (
			this.visibleContainer?.contains(activeElement) || this.templatesContainer.contains(activeElement)
		);
		let movedEmptyStateFocus = false;
		const activeAutomationIds = new Set(automations.map(automation => automation.id));
		for (const [automationId, card] of this.persistentCards) {
			if (activeAutomationIds.has(automationId)) {
				continue;
			}
			card.disposables.dispose();
			card.element.remove();
			this.persistentCards.delete(automationId);
			this.latestAutomations.delete(automationId);
		}

		const visibleAutomations = automations.filter(automation => showDisabled || automation.enabled);
		this.hiddenDisabledOwnerships.set(new Set(automations
			.filter(automation => !showDisabled && !automation.enabled)
			.map(automation => automation.ownership ?? 'user')), undefined);
		const hiddenDisabledDescription = visibleAutomations.length < automations.length
			? localize('hiddenDisabledAutomations', "Disabled automations are hidden. Use View options, then Show disabled automations to reveal them.")
			: undefined;
		const groups = getAutomationOwnershipGroups(automations);
		for (const [ownership, rendered] of this.ownershipSections) {
			if (!groups.some(group => group.ownership === ownership)) {
				rendered.disposables.dispose();
				rendered.section.remove();
				this.ownershipSections.delete(ownership);
			}
		}
		for (const [groupIndex, group] of groups.entries()) {
			let rendered = this.ownershipSections.get(group.ownership);
			if (!rendered) {
				rendered = this.renderOwnershipSection(group.ownership, group.label, group.description);
				this.ownershipSections.set(group.ownership, rendered);
			}
			rendered.title.textContent = group.label;
			if (hiddenDisabledDescription && this.hiddenDisabledOwnerships.get().has(group.ownership)) {
				rendered.summary.setAttribute('aria-description', [group.description, hiddenDisabledDescription].filter(Boolean).join(' '));
			} else if (group.description) {
				rendered.summary.setAttribute('aria-description', group.description);
			} else {
				rendered.summary.removeAttribute('aria-description');
			}
			if (rendered.emptyState) {
				const showEmptyState = group.automations.every(automation => !showDisabled && !automation.enabled);
				if (!showEmptyState && DOM.isHTMLElement(activeElement) && rendered.emptyState.contains(activeElement)) {
					rendered.summary.focus();
					movedEmptyStateFocus = true;
				}
				rendered.emptyState.style.display = showEmptyState ? '' : 'none';
			}
			const currentSection = Array.from(this.container.children).filter(child => child !== this.builtInTemplatesSection)[groupIndex];
			if (currentSection !== rendered.section) {
				this.container.insertBefore(rendered.section, currentSection ?? null);
			}
			this.renderCardsInto(rendered.grid, group.automations, showDisabled);
		}

		const showBuiltInTemplates = hasEmptyAutomationSection(visibleAutomations);
		if (!this.builtInTemplatesUserToggled) {
			const defaultExpanded = showBuiltInTemplates;
			if (this.builtInTemplatesExpanded !== defaultExpanded) {
				this.builtInTemplatesExpanded = defaultExpanded;
				if (this.builtInTemplatesSection) {
					this.builtInTemplatesSection.open = defaultExpanded;
				}
			}
		}

		if (!this.pluginTemplatesUserToggled) {
			const defaultExpanded = visibleAutomations.length === 0;
			if (this.pluginTemplatesExpanded !== defaultExpanded) {
				this.pluginTemplatesExpanded = defaultExpanded;
				if (this.pluginTemplatesSection) {
					this.pluginTemplatesSection.open = defaultExpanded;
				}
			}
		}

		if (!areAutomationTemplatesEqual(this.renderedTemplates, templates)) {
			this.renderTemplates(templates);
			this.renderedTemplates = templates;
		}
		if (this.builtInTemplatesSection) {
			this.builtInTemplatesSection.style.display = showBuiltInTemplates ? '' : 'none';
			const sharedSection = showBuiltInTemplates && visibleAutomations.length > 0 ? this.ownershipSections.get('repository')?.section : undefined;
			const parent = sharedSection ? this.container : this.templatesContainer;
			const nextSibling = sharedSection ?? this.pluginTemplatesSection ?? null;
			if (this.builtInTemplatesSection.parentElement !== parent || this.builtInTemplatesSection.nextSibling !== nextSibling) {
				parent.insertBefore(this.builtInTemplatesSection, nextSibling);
			}
		}

		this.updatePluginTemplateUnreadState(
			this.pluginTemplatesUserToggled || (catalogueState === 'ready' && visibleAutomations.length === 0)
		);
		const showTemplateSections = templates.some(template => template.source || showBuiltInTemplates && this.builtInTemplatesSection?.parentElement === this.templatesContainer);
		this.templatesContainer.style.display = showTemplateSections ? '' : 'none';

		this.renderUnavailableMessage(this.unavailableDescription, unavailableProviders);
		const nextContainer = visibleAutomations.length === 0 ? this.getEmptyStateContainer(catalogueState) : this.container;
		for (const button of [this.emptyCreateButton, this.loadingCreateButton, this.unavailableCreateButton, this.errorCreateButton]) {
			if (hiddenDisabledDescription && visibleAutomations.length === 0) {
				button?.element.setAttribute('aria-description', hiddenDisabledDescription);
			} else {
				button?.element.removeAttribute('aria-description');
			}
		}
		const previousContainer = this.visibleContainer;
		if (previousContainer !== nextContainer) {
			nextContainer.style.display = '';
			this.visibleContainer = nextContainer;
		}
		this.renderPartialState(visibleAutomations.length > 0 ? catalogueState : 'ready', unavailableProviders);

		// Move focus before hiding its previous container.
		if (!this.focusPendingAutomation() && !movedEmptyStateFocus && contentOwnedFocus && DOM.isHTMLElement(activeElement)) {
			const hiddenCard = activeElement.closest<HTMLElement>('.automations-card-wrapper');
			if (hiddenCard?.style.display === 'none') {
				const hiddenAutomation = automations.find(automation => this.persistentCards.get(automation.id)?.element === hiddenCard);
				this.focusHiddenAutomation(hiddenAutomation?.ownership);
			} else if (!nextContainer.contains(activeElement) && !this.isVisibleTemplateElement(activeElement)) {
				this.focusVisibleState(visibleAutomations, catalogueState);
			} else if (!DOM.isActiveElement(activeElement)) {
				activeElement.focus();
			}
		}

		if (previousContainer && previousContainer !== nextContainer) {
			previousContainer.style.display = 'none';
		}
	}

	private renderOwnershipSection(ownership: string, label: string, description?: string): IAutomationOwnershipSection {
		const disposables = new DisposableStore();
		const section = $<HTMLDetailsElement>('details.automations-ownership-section');
		section.open = true;
		const summary = DOM.append(section, $('summary.automations-ownership-summary'));
		const heading = DOM.append(summary, $('span.automations-ownership-heading.agent-sessions-interactive.agent-sessions-interactive-list'));
		const chevron = DOM.append(heading, $('span.automations-ownership-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
		chevron.setAttribute('aria-hidden', 'true');
		const title = DOM.append(heading, $('span.automations-ownership-title'));
		title.id = `automations-${ownership}-${this.templateAriaId}`;
		title.setAttribute('role', 'heading');
		title.setAttribute('aria-level', '3');
		title.textContent = label;
		summary.setAttribute('aria-labelledby', title.id);
		if (description) {
			summary.setAttribute('aria-description', description);
			const info = DOM.append(heading, renderIcon(Codicon.info));
			info.classList.add('automations-ownership-info');
			info.setAttribute('aria-hidden', 'true');
			disposables.add(this.hoverService.setupDelayedHover(info, { content: description, style: HoverStyle.Pointer }, { groupId: this.templateAriaId }));
			disposables.add(DOM.addDisposableListener(info, DOM.EventType.CLICK, event => {
				event.preventDefault();
				event.stopPropagation();
			}));
		}
		const grid = DOM.append(section, $('.automations-ownership-grid'));
		grid.setAttribute('role', 'group');
		grid.setAttribute('aria-labelledby', title.id);
		const emptyState = DOM.append(section, $('.automations-ownership-empty.automations-cards-empty'));
		this.renderEmptyState(emptyState, disposables, ownership);
		emptyState.style.display = 'none';
		return { section, summary, title, grid, emptyState, disposables };
	}

	private isVisibleTemplateElement(element: HTMLElement): boolean {
		if (!this.templatesContainer.contains(element) && !this.builtInTemplatesSection?.contains(element)) {
			return false;
		}
		const section = element.closest<HTMLDetailsElement>('details.automations-template-section');
		const summary = element.closest<HTMLElement>('summary');
		return !section || section.style.display !== 'none' && (section.open || summary?.parentElement === section);
	}

	private renderCardsInto(grid: HTMLElement, automations: readonly IAutomationDescriptor[], showDisabled: boolean): void {
		for (const [cardIndex, automation] of automations.entries()) {
			const prev = this.latestAutomations.get(automation.id);
			this.latestAutomations.set(automation.id, automation);
			let card = this.persistentCards.get(automation.id);
			if (!card) {
				card = this.renderCard(automation);
				this.persistentCards.set(automation.id, card);
			} else {
				this.updateCard(card, automation, prev);
			}
			card.element.style.display = automation.enabled || showDisabled ? '' : 'none';
			const currentElement = grid.children.item(cardIndex);
			if (currentElement !== card.element) {
				grid.insertBefore(card.element, currentElement);
			}
		}
	}

	private getEmptyStateContainer(catalogueState: AutomationCatalogueState): HTMLElement {
		switch (catalogueState) {
			case 'loading':
				return this.loadingContainer;
			case 'unavailable':
				return this.unavailableContainer;
			case 'error':
				return this.errorContainer;
			case 'ready':
				if (!this.emptyStateRendered) {
					this.emptyCreateButton = this.renderEmptyState(this.emptyContainer, this.emptyStateDisposables);
					this.emptyStateRendered = true;
				}
				return this.emptyContainer;
		}
	}

	private renderCard(automation: IAutomationDescriptor): IAutomationCardEntry {
		const disposables = new DisposableStore();
		const wrapper = $('.automations-card-wrapper');
		const card = DOM.append(wrapper, $('.automations-card.agent-sessions-interactive.agent-sessions-interactive-list.agent-sessions-interactive-bordered'));
		card.setAttribute('role', 'group');
		const cardContextKeyService = disposables.add(this.contextKeyService.createScoped(card));
		const canDeleteContext = AutomationCardCanDeleteContext.bindTo(cardContextKeyService);
		const canUpdateContext = AutomationCardCanUpdateContext.bindTo(cardContextKeyService);
		const hasExternalResourceContext = AutomationCardHasExternalResourceContext.bindTo(cardContextKeyService);
		const enabledContext = AutomationCardEnabledContext.bindTo(cardContextKeyService);
		const hasLimitsContext = AutomationCardHasLimitsContext.bindTo(cardContextKeyService);
		const isCloudContext = AutomationCardIsCloudContext.bindTo(cardContextKeyService);
		const hasEventTriggerContext = AutomationCardHasEventTriggerContext.bindTo(cardContextKeyService);
		disposables.add(Gesture.addTarget(card));

		const main = DOM.append(card, $<HTMLButtonElement>('button.automations-card-main', {
			type: 'button',
		}));

		const nameRow = DOM.append(main, $('.automations-card-name'));
		const nameTextEl = DOM.append(nameRow, $('span.automations-card-name-text'));
		const startingIcon = DOM.append(nameRow, $('span' + ThemeIcon.asCSSSelector(ThemeIcon.modify(Codicon.loading, 'spin')), { 'aria-hidden': 'true' }));
		const startingRuns = observableValue<ReadonlySet<string> | undefined>(this, undefined);

		const promptEl = DOM.append(main, $('.automations-card-prompt'));
		const promptHover = disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), promptEl, () => promptEl.textContent ?? ''));
		const promptFocusHover = disposables.add(new MutableDisposable());
		disposables.add(DOM.addDisposableListener(main, DOM.EventType.FOCUS, () => {
			if (main.matches(':focus-visible')) {
				promptFocusHover.value = this.hoverService.showInstantHover({
					content: promptEl.textContent ?? '',
					target: promptEl,
					appearance: { showPointer: true },
					position: { hoverPosition: HoverPosition.BELOW },
				});
			}
		}));
		disposables.add(DOM.addDisposableListener(main, DOM.EventType.BLUR, () => {
			promptHover.hide();
			promptFocusHover.clear();
		}));

		const metaEl = DOM.append(main, $('.automations-card-meta'));
		const scheduleEl = DOM.append(metaEl, $('span.automations-card-meta-item.automations-card-schedule'));
		const folderEl = DOM.append(metaEl, $('span.automations-card-meta-item.automations-card-folder'));
		const folderHover = disposables.add(new MutableDisposable());

		const actions = DOM.append(card, $('.automations-card-actions'));
		actions.setAttribute('role', 'group');
		const buttonBar = disposables.add(new ButtonBar(actions));
		const runNowLabel = localize('runNow', "Run now");
		const runBtn = this.createIconButton(buttonBar, Codicon.play, runNowLabel, !this.automationService.canRunAutomation(automation.id));
		runBtn.element.classList.add('automations-card-run-button');
		disposables.add(runBtn.onDidClick((e) => {
			e?.stopPropagation();
			const currentAutomation = this.latestAutomations.get(automation.id);
			if (!currentAutomation || startingRuns.get() || !this.automationService.canRunAutomation(automation.id)) {
				return;
			}
			startingRuns.set(new Set(this.automationService.runs.get().map(run => run.id)), undefined);
			status(localize('automationStartingStatus', "Starting automation {0}", currentAutomation.name));
			void this.runNow(currentAutomation, entry);
		}));

		const moreActionsButton = this.createIconButton(buttonBar, Codicon.kebabVertical, localize('moreActions', "More Actions..."), false);
		moreActionsButton.element.classList.add('automations-card-more-actions-button');
		moreActionsButton.element.setAttribute('aria-haspopup', 'menu');
		moreActionsButton.element.setAttribute('aria-expanded', 'false');
		disposables.add(moreActionsButton.onDidClick(event => {
			event?.stopPropagation();
			const currentAutomation = this.latestAutomations.get(automation.id);
			if (!currentAutomation) {
				return;
			}
			actions.classList.add('menu-open');
			moreActionsButton.element.setAttribute('aria-expanded', 'true');
			this.contextMenuService.showContextMenu({
				menuId: AgentsWindowMenus.AutomationCardContext,
				menuActionOptions: { shouldForwardArgs: true, arg: currentAutomation },
				getAnchor: () => moreActionsButton.element,
				contextKeyService: cardContextKeyService,
				onHide: () => {
					actions.classList.remove('menu-open');
					moreActionsButton.element.setAttribute('aria-expanded', 'false');
				},
			});
		}));

		for (const eventType of [DOM.EventType.CLICK, TouchEventType.Tap]) {
			disposables.add(DOM.addDisposableListener(card, eventType, event => {
				const target = (event as GestureEvent).initialTarget ?? event.target;
				if (target instanceof Node && DOM.isAncestor(target, actions)) {
					return;
				}
				const currentAutomation = this.latestAutomations.get(automation.id);
				if (!currentAutomation || !this.automationService.canUpdateAutomation(automation.id)) {
					return;
				}
				void this.openEditDialog(currentAutomation);
			}));
		}

		const entry = {
			element: wrapper,
			card,
			main,
			actions,
			runButton: runBtn,
			moreActionsButton,
			canDeleteContext,
			hasExternalResourceContext,
			canUpdateContext,
			enabledContext,
			hasLimitsContext,
			isCloudContext,
			hasEventTriggerContext,
			nameText: nameTextEl,
			startingIcon,
			startingRuns,
			scheduleEl,
			scheduleHover: disposables.add(new MutableDisposable<IDisposable>()),
			scheduleRefresh: disposables.add(new MutableDisposable<IDisposable>()),
			folderEl,
			folderHover,
			promptEl,
			disposables,
		};
		this.updateCard(entry, automation);
		disposables.add(autorun(reader => {
			const starting = startingRuns.read(reader);
			const runs = this.automationService.runs.read(reader);
			const presentedRunIds = this.presentedRunIds.read(reader);
			const state = this.automationService.catalogueState.read(reader);
			const historyState = this.automationService.historyState?.read(reader);
			if (starting && (runs.some(run => run.automationId === automation.id && !starting.has(run.id)
				&& !isLocalAutomationRunStarting(run, () => presentedRunIds.has(run.id), resource => this.sessionsManagementService.getSession(resource) !== undefined))
				|| (state === 'unavailable' && !this.automationService.canRunAutomation(automation.id)) || state === 'error' || historyState === 'error')) {
				startingRuns.set(undefined, undefined);
			}
			this.updateCardRunState(entry, this.latestAutomations.get(automation.id) ?? automation);
		}));
		return entry;
	}

	private updateCard(card: IAutomationCardEntry, automation: IAutomationDescriptor, previous?: IAutomationDescriptor): void {
		card.main.disabled = !this.automationService.canUpdateAutomation(automation.id);
		this.updateCardRunState(card, automation);
		card.canDeleteContext.set(this.automationService.canDeleteAutomation(automation.id));
		card.hasExternalResourceContext.set(automation.externalResource !== undefined);
		card.canUpdateContext.set(this.automationService.canUpdateAutomation(automation.id));
		card.enabledContext.set(automation.enabled);
		card.hasLimitsContext.set(getAutomationAfterDate(automation.disableConditions) !== undefined);
		card.isCloudContext.set(automation.cloudTrigger !== undefined || automation.ownership !== undefined);
		card.hasEventTriggerContext.set(hasAutomationEventTrigger(automation.cloudTrigger?.triggers ?? {}));
		const triggerSummary = automationTriggerSummary(automation.cloudTrigger?.triggers ?? {});
		const enabledChanged = !previous || previous.enabled !== automation.enabled;
		const scheduleChanged = !previous || enabledChanged || formatSchedule(previous.schedule) !== formatSchedule(automation.schedule)
			|| automationTriggerSummary(previous.cloudTrigger?.triggers ?? {}) !== triggerSummary
			|| !equals(previous.disableConditions, automation.disableConditions);
		const nameChanged = !previous || previous.name !== automation.name;
		if (nameChanged) {
			card.main.setAttribute('aria-label', localize('editAutomationNamed', "Edit automation {0}", automation.name));
			card.actions.setAttribute('aria-label', localize('automationActions', "Actions for {0}", automation.name));
			const moreActionsLabel = localize('moreActionsForAutomation', "More Actions for {0}", automation.name);
			card.moreActionsButton.setAriaLabel(moreActionsLabel);
			card.nameText.textContent = automation.name;
		}
		if (enabledChanged) {
			card.card.classList.toggle('automation-disabled', !automation.enabled);
		}
		if (scheduleChanged) {
			this.updateCardSchedule(card, automation);
		}

		const folderLabel = automation.targetDisplay?.label ?? getAutomationTargetLabel(automation.target);
		const folderName = automation.targetDisplay ? folderLabel.substring(folderLabel.lastIndexOf('/') + 1) : folderLabel;
		if (!previous || enabledChanged || previous.targetDisplay !== automation.targetDisplay || getAutomationTargetLabel(previous.target) !== folderLabel) {
			const showFolder = (automation.enabled || !!automation.targetDisplay) && automation.target.kind === 'workspace';
			card.folderEl.style.display = showFolder ? '' : 'none';
			DOM.reset(card.folderEl,
				$('span' + ThemeIcon.asCSSSelector(automation.targetDisplay?.icon ?? Codicon.folder), { 'aria-hidden': 'true' }),
				$('span.automations-card-meta-label', undefined, folderName));
			card.folderEl.setAttribute('aria-label', folderLabel);
			card.folderHover.value = showFolder
				? this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), card.folderEl, folderLabel)
				: undefined;
		}

	}

	private updateCardSchedule(card: IAutomationCardEntry, automation: IAutomationDescriptor): void {
		const triggerSummary = automationTriggerSummary(automation.cloudTrigger?.triggers ?? {});
		const schedule = automation.enabled ? automationTriggerSummary(automation.cloudTrigger?.triggers ?? {}, true) ?? formatSchedule(automation.schedule) : localize('disabled', "Disabled");
		const limit = automation.enabled ? formatAutomationLimit(automation) : undefined;
		const label = limit ? localize('automationScheduleWithEndDate', "{0} {1}", schedule, limit.label) : schedule;
		const icon = !automation.enabled ? Codicon.circleSlash : automation.schedule.interval === 'manual' ? Codicon.person : Codicon.clockface;
		DOM.reset(card.scheduleEl,
			$('span' + ThemeIcon.asCSSSelector(icon), { 'aria-hidden': 'true' }),
			$('span.automations-card-meta-label', undefined, label));
		card.scheduleHover.value = triggerSummary || limit
			? this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), card.scheduleEl, triggerSummary ?? limit!.description)
			: undefined;
		if (!limit) {
			card.main.removeAttribute('aria-description');
			card.scheduleRefresh.clear();
			return;
		}
		card.main.setAttribute('aria-description', limit.description);
		const targetWindow = DOM.getWindow(card.scheduleEl);
		const now = new Date();
		const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
		const handle = targetWindow.setTimeout(() => {
			const currentAutomation = this.latestAutomations.get(automation.id);
			if (currentAutomation) {
				this.updateCardSchedule(card, currentAutomation);
			}
		}, nextDay.getTime() - now.getTime());
		card.scheduleRefresh.value = toDisposable(() => targetWindow.clearTimeout(handle));
	}

	private updateCardRunState(card: IAutomationCardEntry, automation: IAutomationDescriptor): void {
		const eventTriggered = hasAutomationEventTrigger(automation.cloudTrigger?.triggers ?? {});
		if (eventTriggered && DOM.isActiveElement(card.runButton.element)) {
			card.moreActionsButton.focus();
		}
		card.runButton.element.style.display = eventTriggered ? 'none' : '';
		const starting = card.startingRuns.get() !== undefined || this.automationService.runs.get().some(run =>
			run.automationId === automation.id
			&& isLocalAutomationRunStarting(run, () => this.presentedRunIds.get().has(run.id), resource => this.sessionsManagementService.getSession(resource) !== undefined)
		);
		card.startingIcon.style.display = starting ? '' : 'none';
		card.promptEl.textContent = starting ? localize('automationStarting', "Starting run...") : automation.prompt;
		card.runButton.enabled = !starting && this.automationService.canRunAutomation(automation.id);
		const label = starting ? localize('running', "Running") : localize('runNow', "Run now");
		card.runButton.setAriaLabel(label);
		card.runButton.setTitle(label);
		const triggerSummary = automationTriggerSummary(automation.cloudTrigger?.triggers ?? {});
		const schedule = automation.enabled ? triggerSummary ?? formatSchedule(automation.schedule) : localize('disabled', "Disabled");
		card.card.setAttribute('aria-label', localize('automationCard', "{0} — {1}", automation.name, starting ? localize('running', "Running") : schedule));
	}

	setPresentedRunIds(runIds: Iterable<string>): void {
		this.presentedRunIds.set(new Set(runIds), undefined);
	}

	private createIconButton(buttonBar: ButtonBar, icon: ThemeIcon, tooltip: string, disabled: boolean): IButton {
		const button = buttonBar.addButton({
			ariaLabel: tooltip,
			disabled,
			supportIcons: true,
			title: tooltip,
		});
		button.label = `$(${icon.id})`;
		button.element.classList.add('automations-card-action-button');
		return button;
	}

	private async runNow(automation: IAutomationDescriptor, card: IAutomationCardEntry): Promise<void> {
		let accepted = false;
		try {
			if (!await this.ensureEnabled()) {
				return;
			}
			const operation = this.automationRunner.runOnce(automation, CancellationToken.None);
			const dispatch = await operation.whenDispatched;
			switch (dispatch.kind) {
				case 'accepted':
					accepted = true;
					status(localize('automationAcceptedStatus', "Run requested for {0}. Its history will update when available.", automation.name));
					break;
				case 'started':
					status(localize('automationStartedStatus', "Started automation {0}", automation.name));
					break;
				case 'alreadyRunning':
					status(localize('automationAlreadyRunningStatus', "Automation {0} is already running", automation.name));
					break;
				case 'notStarted':
					status(localize('automationNotStartedStatus', "Automation {0} did not start", automation.name));
					break;
			}
			if (!accepted) {
				card.startingRuns.set(undefined, undefined);
			}
			await operation.whenCompleted;
		} catch (error) {
			accepted = false;
			this.logService.error('[AutomationsCards] Failed to run automation', error);
			await this.dialogService.error(
				localize('automationRunActionFailed', "Failed to run automation."),
				getErrorMessage(error),
			);
		} finally {
			if (!accepted) {
				card.startingRuns.set(undefined, undefined);
			}
		}
	}

	private renderEmptyState(container: HTMLElement, disposables: DisposableStore, ownership?: string): IButton {
		const title = DOM.append(container, $('h3.automations-cards-empty-title'));
		const desc = DOM.append(container, $('p.automations-cards-empty-description'));
		const descriptionText = DOM.append(desc, $('span'));
		const reveal = DOM.append(desc, $('span.automations-show-disabled'));
		const revealLabel = $('em');
		disposables.add(this.instantiationService.createInstance(Link, reveal, {
			label: revealLabel,
			href: `command:${TOGGLE_SHOW_DISABLED_AUTOMATIONS_COMMAND_ID}`,
		}, {
			opener: () => {
				this.setShowDisabled(true);
				const automation = [...this.latestAutomations.values()].find(automation => !ownership || (automation.ownership ?? 'user') === ownership);
				const card = automation && this.persistentCards.get(automation.id);
				if (card) {
					this.focusCard(card);
				}
			},
		}));
		const createButton = this.renderCreateWithAgentButton(container, disposables, 'automations-cards-create-button');
		disposables.add(autorun(reader => {
			const hiddenOwnerships = this.hiddenDisabledOwnerships.read(reader);
			const hasHiddenDisabled = ownership ? hiddenOwnerships.has(ownership) : hiddenOwnerships.size > 0;
			title.textContent = hasHiddenDisabled
				? localize('noEnabledAutomations', "No enabled automations")
				: localize('noAutomationsYet', "No automations yet");
			descriptionText.textContent = hasHiddenDisabled
				? localize('disabledAutomationsHidden', "Your disabled automations are hidden.") + ' '
				: localize('noAutomationsDesc', "Describe what you want to automate, then choose when it runs.");
			revealLabel.textContent = hasHiddenDisabled ? localize('showDisabled', "Show disabled") : '';
			reveal.style.display = hasHiddenDisabled ? '' : 'none';
		}));
		return createButton;
	}

	private renderCreateWithAgentButton(container: HTMLElement, disposables: DisposableStore, buttonClassName: string): IButton {
		const label = localize('createWithAgent', "Create with Agent");
		const createButton = disposables.add(new Button(container, {
			...defaultButtonStyles,
			title: label,
		}));
		createButton.label = label;
		this.configureCreateWithAgentButton(createButton, disposables, buttonClassName, createButton.element);
		return createButton;
	}

	private configureCreateWithAgentButton(button: IButton, disposables: DisposableStore, buttonClassName: string, onboardingElement: HTMLElement): void {
		button.element.classList.add(buttonClassName);
		const updateEnabled = () => {
			button.enabled = this.contextKeyService.contextMatchesRules(ChatContextKeys.enabled);
		};
		updateEnabled();
		const enabledContextKeys = new Set([ChatContextKeys.enabled.key]);
		disposables.add(this.contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(enabledContextKeys)) {
				updateEnabled();
			}
		}));
		disposables.add(button.onDidClick(() => {
			void this.commandService.executeCommand(CREATE_AUTOMATION_WITH_AGENT_COMMAND_ID).catch(error => {
				if (!isCancellationError(error)) {
					this.logService.error('[Automations] Failed to open agent creation session', error);
					this.notificationService.error(localize('automationsAgentCreationFailed', "Could not open a session to create an automation: {0}", getErrorMessage(error)));
				}
			});
		}));
		disposables.add(markOnboardingTarget(onboardingElement, CREATE_AUTOMATION_ONBOARDING_TARGET_ID, {
			onDidActivate: Event.map(button.onDidClick, () => undefined),
		}));
	}

	private renderTemplates(templates: readonly IAutomationTemplate[]): void {
		this.templateDisposables.clear();
		this.builtInTemplatesSection?.remove();
		DOM.clearNode(this.templatesContainer);
		const builtInTemplates = templates.filter(template => !template.source);
		const pluginTemplates = templates.filter(template => !!template.source);
		this.currentPluginTemplateIds = new Set(pluginTemplates.map(template => template.id));
		this.pluginTemplatesSection = undefined;
		this.pluginTemplatesSummary = undefined;
		this.pluginTemplatesUnreadIndicator = undefined;

		this.builtInTemplatesSection = this.renderTemplateSection({
			className: 'automations-built-in-templates',
			title: localize('automationBuiltInTemplatesTitle', "Built-in Templates"),
			description: localize('automationBuiltInTemplatesDescription', "Choose a starting point, then review and customize it before creating."),
			templates: builtInTemplates,
			expanded: this.builtInTemplatesExpanded ?? false,
			onDidToggle: expanded => {
				if (expanded !== this.builtInTemplatesExpanded) {
					this.builtInTemplatesExpanded = expanded;
					this.builtInTemplatesUserToggled = true;
				}
			},
		}).section;
		this.templateDisposables.add(markOnboardingTarget(this.builtInTemplatesSection, AUTOMATION_TEMPLATES_ONBOARDING_TARGET_ID, {
			open: () => {
				if (this.builtInTemplatesSection) {
					this.builtInTemplatesSection.open = true;
				}
			},
		}));

		if (pluginTemplates.length > 0) {
			const rendered = this.renderTemplateSection({
				className: 'automations-plugin-templates',
				title: localize('automationPluginTemplatesTitle', "Templates from Plugins"),
				description: localize('automationPluginTemplatesDescription', "Templates provided by enabled plugins start disabled."),
				templates: pluginTemplates,
				expanded: this.pluginTemplatesExpanded ?? false,
				showUnreadIndicator: true,
				onDidToggle: expanded => {
					this.pluginTemplatesExpanded = expanded;
					this.pluginTemplatesUserToggled = true;
					this.updatePluginTemplateUnreadState(expanded);
				},
			});
			this.pluginTemplatesSection = rendered.section;
			this.pluginTemplatesSummary = rendered.summary;
			this.pluginTemplatesUnreadIndicator = rendered.unreadIndicator;
		}
	}

	private renderTemplateSection(options: IAutomationTemplateSectionOptions): IRenderedAutomationTemplateSection {
		const section = DOM.append(this.templatesContainer, $<HTMLDetailsElement>(`details.automations-template-section.${options.className}`));
		section.open = options.expanded;
		const summary = DOM.append(section, $('summary.automations-template-section-summary.agent-sessions-interactive.agent-sessions-interactive-list.sessions-disclosure'));
		const chevron = DOM.append(summary, $('span.automations-template-section-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
		chevron.setAttribute('aria-hidden', 'true');
		const title = DOM.append(summary, $('span.automations-template-section-title'));
		title.id = `${options.className}-${this.templateAriaId}`;
		title.setAttribute('role', 'heading');
		title.setAttribute('aria-level', '3');
		title.textContent = options.title;
		const unreadIndicator = options.showUnreadIndicator
			? DOM.append(summary, $('span.automations-template-section-unread'))
			: undefined;
		unreadIndicator?.setAttribute('aria-hidden', 'true');
		const count = DOM.append(summary, $('span.automations-template-section-count'));
		count.textContent = String(options.templates.length);
		this.templateDisposables.add(DOM.addDisposableListener(section, 'toggle', () => options.onDidToggle(section.open)));
		const description = DOM.append(section, $('p.automations-templates-description'));
		description.textContent = options.description;
		const grid = DOM.append(section, $('.automations-templates-grid'));
		grid.setAttribute('role', 'group');
		grid.setAttribute('aria-labelledby', title.id);
		for (const template of options.templates) {
			this.renderTemplateCard(grid, template);
		}
		return { section, summary, unreadIndicator };
	}

	private updatePluginTemplateUnreadState(markExpandedAsSeen: boolean): void {
		if (!this.pluginTemplatesSection || !this.pluginTemplatesSummary || !this.pluginTemplatesUnreadIndicator) {
			return;
		}
		if (this.pluginTemplatesSection.open && markExpandedAsSeen) {
			this.markCurrentPluginTemplatesSeen();
		}
		const unreadCount = this.pluginTemplatesSection.open
			? 0
			: [...this.currentPluginTemplateIds].filter(id => !this.seenPluginTemplateIds.has(id)).length;
		this.pluginTemplatesUnreadIndicator.classList.toggle('visible', unreadCount > 0);
		if (unreadCount === 0) {
			this.pluginTemplatesSummary.removeAttribute('aria-label');
		} else {
			this.pluginTemplatesSummary.setAttribute('aria-label', unreadCount === 1
				? localize('automationPluginTemplatesOneNewAriaLabel', "Templates from Plugins, 1 new template")
				: localize('automationPluginTemplatesManyNewAriaLabel', "Templates from Plugins, {0} new templates", unreadCount));
		}
	}

	private markCurrentPluginTemplatesSeen(): void {
		if (setsEqual(this.currentPluginTemplateIds, this.seenPluginTemplateIds)) {
			return;
		}
		this.seenPluginTemplateIds = new Set(this.currentPluginTemplateIds);
		this.storageService.store(
			SEEN_PLUGIN_AUTOMATION_TEMPLATES_STORAGE_KEY,
			JSON.stringify([...this.seenPluginTemplateIds].sort()),
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);
	}

	private readSeenPluginTemplateIds(): Set<string> {
		const raw = this.storageService.get(SEEN_PLUGIN_AUTOMATION_TEMPLATES_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return new Set();
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.every(id => typeof id === 'string')) {
				return new Set(parsed);
			}
		} catch (error) {
			this.logService.warn('[Automations] Failed to read seen plugin Automation templates.', error);
			return new Set();
		}
		this.logService.warn('[Automations] Ignoring invalid seen plugin Automation templates storage.');
		return new Set();
	}

	private renderLoadingState(): IButton {
		this.loadingContainer.setAttribute('role', 'status');
		const icon = DOM.append(this.loadingContainer, $('span.automations-cards-state-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), 'codicon-modifier-spin');
		icon.setAttribute('aria-hidden', 'true');
		const title = DOM.append(this.loadingContainer, $('h3.automations-cards-state-title'));
		title.textContent = localize('loadingAutomations', "Loading automations...");
		const description = DOM.append(this.loadingContainer, $('p.automations-cards-state-description'));
		description.textContent = localize('loadingAutomationsDescription', "You can create a new automation while existing automations load.");
		return this.renderStateCreateButton(this.loadingContainer);
	}

	private renderUnavailableState(): { readonly createButton: IButton; readonly description: HTMLElement; readonly manageRemotesTarget: HTMLElement } {
		const title = DOM.append(this.unavailableContainer, $('h3.automations-cards-state-title'));
		title.textContent = localize('noAutomationsYet', "No automations yet");
		const emptyDescription = DOM.append(this.unavailableContainer, $('p.automations-cards-state-description'));
		emptyDescription.textContent = localize('noAutomationsDesc', "Describe what you want to automate, then choose when it runs.");
		const manageRemotesTarget = DOM.append(this.unavailableContainer, $('div.automations-manage-remotes-target'));
		const description = DOM.append(this.unavailableContainer, $('div.automations-cards-state-description.automations-cards-unavailable-message'));
		description.textContent = localize('automationsUnavailableDescription', "One or more providers are disconnected, disabled, or do not support automations.");
		return { createButton: this.renderStateCreateButton(this.unavailableContainer), description, manageRemotesTarget };
	}

	private renderManageRemotesLink(parent: HTMLElement): void {
		const container = DOM.append(parent, $('span.automations-manage-remotes'));
		const count = DOM.append(container, $('span.automations-manage-remotes-count'));
		count.setAttribute('aria-hidden', 'true');
		this._register(this.instantiationService.createInstance(Link, container, {
			label: localize('automationsManageRemotes', "Manage Remotes"),
			href: `command:${OPEN_REMOTES_EDITOR_COMMAND_ID}`,
		}, {
			opener: () => {
				void this.commandService.executeCommand(OPEN_REMOTES_EDITOR_COMMAND_ID).catch(error => {
					this.logService.error('[Automations] Failed to open Remote Environments.', error);
					this.notificationService.error(error);
				});
			},
		}));
		const link = container.lastElementChild as HTMLAnchorElement;
		const configurationChanged = observableSignalFromEvent(this, this.configurationService.onDidChangeConfiguration);
		const remoteHostsChanged = observableSignalFromEvent(this, Event.any(
			this.remoteAgentHostService.onDidChangeConnections,
			this.remoteAgentHostService.onDidChangeConfiguredEntries,
		));
		this._register(autorun(reader => {
			configurationChanged.read(reader);
			remoteHostsChanged.read(reader);
			const catalogueState = this.automationService.catalogueState.read(reader);
			const automations = this.automationService.automations.read(reader);
			const unavailableProviders = this.automationService.unavailableProviders.read(reader);
			const configuredEntries = this.remoteAgentHostService.configuredEntries;
			const remoteManagementEnabled = this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId)
				&& this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING)
				&& this.configurationService.getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING);
			const presentation = getAutomationRemoteStatusPresentation(
				unavailableProviders,
				configuredEntries,
				this.missionControlEnvironmentService.hosts.read(reader).map(host => host.id),
				remoteManagementEnabled,
			);
			const managedDisconnectedProviderIds = presentation.replacedTunnelProviderIds;
			const ignoredGitHubEnvironmentProviderIds = presentation.ignoredGitHubEnvironmentProviderIds;
			const visible = catalogueState === 'unavailable' && managedDisconnectedProviderIds.size > 0;
			const connectedCount = getConnectedAutomationRemoteCount(presentation.tunnelEntries, this.remoteAgentHostService.connections);
			const countLabel = localize('automationsDetectedRemotes', "{0}/{1} remotes detected", connectedCount, presentation.tunnelEntries.length);
			count.textContent = countLabel;
			link.setAttribute('aria-label', localize('automationsManageRemotesWithCount', "{0}, Manage Remotes", countLabel));
			if (!visible && container.contains(DOM.getActiveElement())) {
				this.focusRoot.focus();
			}
			container.style.display = visible ? '' : 'none';
			const managedProvidersChanged = managedDisconnectedProviderIds.size !== this.managedDisconnectedProviderIds.size
				|| [...managedDisconnectedProviderIds].some(id => !this.managedDisconnectedProviderIds.has(id));
			const ignoredProvidersChanged = ignoredGitHubEnvironmentProviderIds.size !== this.ignoredGitHubEnvironmentProviderIds.size
				|| [...ignoredGitHubEnvironmentProviderIds].some(id => !this.ignoredGitHubEnvironmentProviderIds.has(id));
			if (this.manageRemotesVisible !== visible || managedProvidersChanged || ignoredProvidersChanged) {
				this.manageRemotesVisible = visible;
				this.managedDisconnectedProviderIds = managedDisconnectedProviderIds;
				this.ignoredGitHubEnvironmentProviderIds = ignoredGitHubEnvironmentProviderIds;
				if (catalogueState === 'unavailable') {
					this.renderUnavailableMessage(this.unavailableDescription, unavailableProviders);
					const hasPartialMessage = this.renderUnavailableMessage(this.partialStateMessage, unavailableProviders);
					if (automations.length > 0) {
						this.partialStateContainer.style.display = hasPartialMessage || visible ? '' : 'none';
					}
				}
			}
		}));
	}

	private renderErrorState(): IButton {
		this.errorContainer.setAttribute('role', 'alert');
		const icon = DOM.append(this.errorContainer, $('span.automations-cards-state-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
		icon.setAttribute('aria-hidden', 'true');
		const title = DOM.append(this.errorContainer, $('h3.automations-cards-state-title'));
		title.textContent = localize('automationsLoadError', "Unable to load automations");
		const description = DOM.append(this.errorContainer, $('p.automations-cards-state-description'));
		description.textContent = localize('automationsLoadErrorDescription', "The complete automation catalogue could not be read.");
		return this.renderStateCreateButton(this.errorContainer);
	}

	private renderStateCreateButton(container: HTMLElement): IButton {
		return this.renderCreateWithAgentButton(container, this.stateDisposables, 'automations-cards-state-create-button');
	}

	private renderPartialState(catalogueState: AutomationCatalogueState, unavailableProviders: readonly IAutomationProviderDescriptor[]): void {
		const unavailableProvidersChanged = catalogueState === 'unavailable'
			&& (unavailableProviders.length !== this.partialUnavailableProviders.length
				|| unavailableProviders.some((provider, index) => provider.id !== this.partialUnavailableProviders[index].id
					|| provider.label !== this.partialUnavailableProviders[index].label
					|| provider.unavailableReasonCode !== this.partialUnavailableProviders[index].unavailableReasonCode
					|| provider.unavailableReason !== this.partialUnavailableProviders[index].unavailableReason
					|| provider.unavailableMessage !== this.partialUnavailableProviders[index].unavailableMessage));
		if (this.partialState === catalogueState && !unavailableProvidersChanged) {
			return;
		}
		this.partialState = catalogueState;
		this.partialUnavailableProviders = catalogueState === 'unavailable' ? [...unavailableProviders] : [];
		if (catalogueState === 'ready' || catalogueState === 'loading') {
			this.partialStateContainer.style.display = 'none';
			return;
		}
		const isError = catalogueState === 'error';
		this.partialStateContainer.style.display = '';
		this.partialStateContainer.classList.toggle('automations-cards-partial-state-error', isError);
		if (catalogueState === 'unavailable') {
			const hasMessage = this.renderUnavailableMessage(this.partialStateMessage, unavailableProviders);
			this.partialStateContainer.style.display = hasMessage || this.manageRemotesVisible ? '' : 'none';
		} else {
			this.partialStateMessage.style.display = '';
			this.partialStateMessage.textContent = localize('automationsPartialLoadError', "Some automations could not be loaded.");
		}
	}

	private renderUnavailableMessage(container: HTMLElement, unavailableProviders: readonly IAutomationProviderDescriptor[]): boolean {
		const visibleProviders = unavailableProviders.filter(provider =>
			!this.ignoredGitHubEnvironmentProviderIds.has(provider.id)
			&& (!this.manageRemotesVisible || !this.managedDisconnectedProviderIds.has(provider.id)));
		const reasons = getUnavailableAutomationsReasons(visibleProviders);
		const suppressedAllReasons = unavailableProviders.length > 0 && visibleProviders.length === 0;
		container.style.display = suppressedAllReasons ? 'none' : '';
		if (reasons.length === 1) {
			container.textContent = reasons[0];
		} else if (reasons.length > 1) {
			DOM.reset(container, $('ul.automations-unavailable-reasons', undefined, ...reasons.map(reason => $('li', undefined, reason))));
		} else if (!suppressedAllReasons) {
			container.textContent = localize('automationsPartialUnavailable', "Some automations are unavailable.");
		} else {
			DOM.clearNode(container);
		}
		return !suppressedAllReasons;
	}

	private renderTemplateCard(container: HTMLElement, template: IAutomationTemplate): void {
		const card = DOM.append(container, $<HTMLButtonElement>('button.automations-template-card.agent-sessions-interactive.agent-sessions-interactive-list.agent-sessions-interactive-bordered', { type: 'button' }));
		const schedule = formatSchedule(template.schedule);
		card.setAttribute('aria-label', template.source
			? localize('usePluginAutomationTemplate', "Use template: {0}, {1}, from {2}", template.name, schedule, template.source.label)
			: localize('useAutomationTemplate', "Use template: {0}, {1}", template.name, schedule));

		const nameRow = DOM.append(card, $('.automations-template-card-name'));
		const name = DOM.append(nameRow, $('span.automations-template-card-name-text'));
		name.textContent = template.name;
		this.templateDisposables.add(this.hoverService.setupDelayedHover(name, { content: template.name, style: HoverStyle.Pointer }, { groupId: this.templateAriaId }));
		const badge = DOM.append(nameRow, $('span.automations-template-card-badge'));
		badge.textContent = template.source
			? localize('automationPluginTemplateBadge', "Plugin")
			: localize('automationTemplateBadge', "Template");
		badge.setAttribute('aria-hidden', 'true');

		if (template.source) {
			const source = DOM.append(card, $('span.automations-template-card-source'));
			source.textContent = localize('automationTemplateSource', "From {0}", template.source.label);
			this.templateDisposables.add(this.hoverService.setupDelayedHover(source, { content: template.source.label, style: HoverStyle.Pointer }, { groupId: this.templateAriaId }));
		}
		const description = DOM.append(card, $('span.automations-template-card-prompt'));
		description.id = `automations-template-${this.templateAriaId}-${template.id}-description`;
		description.textContent = template.description;
		this.templateDisposables.add(this.hoverService.setupDelayedHover(description, { content: template.prompt, style: HoverStyle.Pointer, position: { hoverPosition: HoverPosition.RIGHT } }, { groupId: this.templateAriaId }));
		card.setAttribute('aria-describedby', description.id);
		const scheduleElement = DOM.append(card, $('span.automations-template-card-schedule'));
		scheduleElement.textContent = schedule;

		this.templateDisposables.add(DOM.addDisposableListener(card, DOM.EventType.CLICK, () => {
			void this.openCreateDialog({
				name: template.name,
				prompt: template.prompt,
				schedule: template.schedule,
				...(template.disableConditions !== undefined ? { disableConditions: template.disableConditions } : {}),
				...(template.enabled !== undefined ? { enabled: template.enabled } : {}),
			});
		}));
	}

	private async openCreateDialog(initialValues?: AutomationDialogCreateInitialValues): Promise<void> {
		this.clearPendingFocus();
		if (!await this.ensureEnabled()) {
			return;
		}
		try {
			let created: IAutomationDescriptor | undefined;
			let restoreFocus = false;
			let focusRequestGeneration = this.focusRequestGeneration;
			const result = await this.automationDialogService.showAutomationDialog({
				...(initialValues ? { initialValues } : {}),
				commit: async result => {
					if (result.kind === 'create') {
						if (this._store.isDisposed) {
							throw new Error(localize('automationViewClosedBeforeSave', "The automations view was closed before the automation could be saved."));
						}
						this.throwIfDisabled();
						restoreFocus = DOM.isAncestorOfActiveElement(this.focusRoot) || !!this.focusRoot.closest('.automation-dialog-open');
						focusRequestGeneration = this.focusRequestGeneration;
						created = await withAutomationDialogPersistenceTelemetry(this.telemetryService, 'create', () =>
							this.automationService.createAutomation(result.value, () => this.throwIfDisabled()));
					}
				},
			});
			if (!result || !created || this._store.isDisposed) {
				return;
			}
			if (restoreFocus && focusRequestGeneration === this.focusRequestGeneration && !this._store.isDisposed && DOM.isAncestorOfActiveElement(this.focusRoot)) {
				this.pendingFocusAutomationId = created.id;
				this.focusPendingAutomation();
			}
			status(localize('automationCreatedStatus', "Created automation {0}", created.name));
		} catch (err) {
			this.logService.error('[AutomationsCards] Failed to create automation', err);
			await this.dialogService.error(
				localize('automationCreateFailed', "Failed to create automation."),
				getErrorMessage(err),
			);
		}
	}

	private clearPendingFocus(): void {
		this.pendingFocusAutomationId = undefined;
		this.focusRequestGeneration++;
	}

	private focusPendingAutomation(): boolean {
		if (!this.pendingFocusAutomationId) {
			return false;
		}
		if (this._store.isDisposed || !DOM.isAncestorOfActiveElement(this.focusRoot)) {
			this.clearPendingFocus();
			return false;
		}
		const card = this.persistentCards.get(this.pendingFocusAutomationId);
		if (!card) {
			return false;
		}
		this.pendingFocusAutomationId = undefined;
		this.focusCard(card);
		return true;
	}

	private focusVisibleState(automations: readonly IAutomationDescriptor[], catalogueState: AutomationCatalogueState): void {
		if (automations.length > 0) {
			const firstSection = [...this.ownershipSections.values()].find(section => section.section === this.container.firstElementChild);
			const card = [...this.persistentCards.values()].find(card => card.element === firstSection?.grid.firstElementChild) ?? this.persistentCards.get(automations[0].id);
			if (card) {
				this.focusCard(card);
			} else {
				this.focusRoot.focus();
			}
			return;
		}
		switch (catalogueState) {
			case 'loading':
				this.loadingCreateButton.focus();
				return;
			case 'unavailable':
				this.unavailableCreateButton.focus();
				return;
			case 'error':
				this.errorCreateButton.focus();
				return;
			case 'ready':
				(this.emptyCreateButton ?? this.focusRoot).focus();
		}
	}

	private focusCard(card: IAutomationCardEntry): void {
		const section = card.element.closest<HTMLDetailsElement>('details.automations-ownership-section');
		const ownershipSection = [...this.ownershipSections.entries()].find(([, rendered]) => rendered.section === section);
		if (card.element.style.display === 'none') {
			this.focusHiddenAutomation(ownershipSection?.[0]);
			return;
		}
		if (section) {
			section.open = true;
		}
		if (card.main.disabled) {
			(ownershipSection?.[1].summary ?? this.focusRoot).focus();
		} else {
			card.main.focus();
		}
	}

	private focusHiddenAutomation(ownership = 'user'): void {
		if (this.visibleContainer === this.container) {
			this.ownershipSections.get(ownership)?.summary.focus();
		} else {
			this.focusVisibleState([], this.automationService.catalogueState.get());
		}
	}

	private async openEditDialog(automation: IAutomationDescriptor): Promise<void> {
		if (!await this.ensureEnabled()) {
			return;
		}
		const focusedElement = DOM.getActiveElement();
		try {
			const result = await showAutomationEditDialog(automation, this.automationDialogService, this.automationService, this.configurationService, this.telemetryService);
			// The dialog cannot restore focus to a card hidden by the filter.
			if (!this._store.isDisposed && this.focusRoot.isConnected && DOM.isHTMLElement(focusedElement)
				&& focusedElement.closest<HTMLElement>('.automations-card-wrapper')?.style.display === 'none'
				&& DOM.getActiveElement() === DOM.getWindow(this.focusRoot).document.body) {
				this.focusHiddenAutomation(automation.ownership);
			}
			if (!result || result.kind !== 'update') {
				return;
			}
			status(localize('automationUpdatedStatus', "Updated automation {0}", automation.name));
		} catch (err) {
			this.logService.error('[AutomationsCards] Failed to update automation', err);
			await this.dialogService.error(
				localize('automationUpdateFailed', "Failed to update automation."),
				getErrorMessage(err),
			);
		}
	}

	private isEnabled(): boolean {
		return this.configurationService.getValue<boolean>(CHAT_AUTOMATIONS_ENABLED_SETTING) === true;
	}

	private async ensureEnabled(): Promise<boolean> {
		if (this.isEnabled()) {
			return true;
		}
		await showAutomationsDisabled(this.dialogService);
		return false;
	}

	private throwIfDisabled(): void {
		if (!this.isEnabled()) {
			throw new Error(localize('automationsDisabledBeforeSave', "Automations were disabled before the change could be saved."));
		}
	}
}

//#endregion

//#region AutomationHistorySection

/** Combines authoritative run history with newer local conversation progress. */


/**
 * Renders the run history list grouped by date. Groups are persistent to avoid
 * the context-key default-value flash that a full tear-down/rebuild would cause.
 */



//#endregion

//#region Helpers





function getAutomationTargetLabel(target: AutomationTarget): string {
	return target.kind === 'workspace' ? basename(target.folderUri) : '';
}

function formatAutomationLimit(automation: IAutomationDescriptor): { label: string; description: string } | undefined {
	const date = getAutomationAfterDate(automation.disableConditions);
	if (date === undefined) {
		return undefined;
	}
	const endDate = new Date(date);
	const formattedDate = endDate.toLocaleString(undefined, {
		year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
	});
	const time = endDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	const today = new Date();
	const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
	const label = isSameLocalDate(endDate, today)
		? localize('automationCardEndDateToday', "until today at {0}", time)
		: isSameLocalDate(endDate, tomorrow)
			? localize('automationCardEndDateTomorrow', "until tomorrow at {0}", time)
			: localize('automationCardEndDate', "until {0} {1}", endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), time);
	return {
		label,
		description: localize('automationCardEndDateDescription', "Stops scheduling at {0}.", formattedDate),
	};
}

function isSameLocalDate(first: Date, second: Date): boolean {
	return first.getFullYear() === second.getFullYear()
		&& first.getMonth() === second.getMonth()
		&& first.getDate() === second.getDate();
}













function getAutomationDropData(event: DragEvent): AutomationDropData {
	const editors = extractEditorsDropData(event);
	if (editors.length > 0) {
		if (editors.length !== 1 || !editors[0].resource) {
			return { kind: 'invalid', reason: 'multiple' };
		}
		return isAutomationBlueprintResource(editors[0].resource)
			? { kind: 'resource', resource: editors[0].resource }
			: { kind: 'invalid', reason: 'unsupported' };
	}

	const files: File[] = [];
	if (event.dataTransfer?.files) {
		for (let index = 0; index < event.dataTransfer.files.length; index++) {
			const file = event.dataTransfer.files.item(index);
			if (file) {
				files.push(file);
			}
		}
	}
	if (files.length === 0) {
		return { kind: 'none' };
	}
	if (files.length !== 1) {
		return { kind: 'invalid', reason: 'multiple' };
	}
	return files[0].name.toLowerCase().endsWith(AUTOMATION_BLUEPRINT_FILE_SUFFIX)
		? { kind: 'file', file: files[0] }
		: { kind: 'invalid', reason: 'unsupported' };
}











//#endregion

//#region AutomationsView (Custom View)

/**
 * A custom view that hosts the automations management page inside the
 * agents window, using the CustomViewGridPart infrastructure.
 */
export class AutomationsCustomView extends AbstractCustomView {

	readonly title: IObservable<string> = constObservable(localize('automationsTitle', "Automations"));
	override readonly description: IObservable<string | undefined> = constObservable(
		localize('automationsDescription', "Configure agent sessions to run automatically from events or on a schedule."));

	private _widget: AutomationsCardsWidget | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	render(container: HTMLElement): void {
		container.classList.add('automations-cards-content');
		this._widget = this._register(this.instantiationService.createInstance(AutomationsCardsWidget));
		container.appendChild(this._widget.element);
	}

	layout(width: number, height: number): void {
		this._widget?.layout(width, height);
	}

	override focus(): void {
		this._widget?.focus();
	}
}

/**
 * Registers the Automations custom view with the custom view service.
 */
export class AutomationsCustomViewContribution extends Disposable {

	static readonly ID = 'sessions.contrib.automationsCustomView';
	private readonly viewRegistration = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IAutomationService automationService: IAutomationService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const hasItemsContext = AutomationsHasItemsContext.bindTo(contextKeyService);
		const hasOthersContext = AutomationsHasOthersContext.bindTo(contextKeyService);
		const showOthersContext = ShowSharedAutomationsByOthersContext.bindTo(contextKeyService);
		const showSharedByOthers = observableShowSharedAutomationsByOthers(this, storageService, this._store);
		const configurationChanged = observableSignalFromEvent(this, configurationService.onDidChangeConfiguration);
		this._register(autorun(reader => {
			configurationChanged.read(reader);
			showOthersContext.set(showSharedByOthers.read(reader));
			const automations = automationService.automations.read(reader);
			hasOthersContext.set(automations.some(automation => automation.ownership === 'repository' && automation.isCreatedByCurrentUser !== true));
			hasItemsContext.set(getAutomationsViewContent(
				automations, [],
				showSharedByOthers.read(reader),
				configurationService.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING) === true,
			).automations.length > 0);
		}));

		const updateRegistration = () => {
			if (configurationService.getValue<boolean>(AUTOMATIONS_MODAL_SETTING) === true) {
				if (customViewService.activeCustomView.get()?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
					customViewService.hideCustomView();
				}
				this.viewRegistration.clear();
			} else if (!this.viewRegistration.value) {
				this.viewRegistration.value = customViewService.registerCustomView({
					id: AUTOMATIONS_CUSTOM_VIEW_ID,
					ctor: new SyncDescriptor(AutomationsCustomView),
					actions: { style: 'buttonBar', menuId: AgentsWindowMenus.CustomViewAutomations },
				}, {
					restore: contextKeyService.getContextKeyValue<boolean>(ChatAutomationsEnabledContext.key) === true,
				});
			}
		};
		updateRegistration();
		this._register(configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AUTOMATIONS_MODAL_SETTING)) {
				updateRegistration();
			}
		}));

		const automationContextKeys = new Set([ChatAutomationsEnabledContext.key]);
		this._register(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(automationContextKeys)
				&& !contextKeyService.getContextKeyValue<boolean>(ChatAutomationsEnabledContext.key)
				&& customViewService.activeCustomView.get()?.id === AUTOMATIONS_CUSTOM_VIEW_ID) {
				customViewService.hideCustomView();
			}
		}));

		// Header actions share one control treatment while preserving primary/secondary hierarchy.
		this._register(actionViewItemService.register(AgentsWindowMenus.CustomViewAutomations, CREATE_AUTOMATION_WITH_AGENT_COMMAND_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(AutomationHeaderButtonActionViewItem, undefined, action, options, false, CREATE_AUTOMATION_ONBOARDING_TARGET_ID);
		}));
		this._register(actionViewItemService.register(AgentsWindowMenus.CustomViewAutomations, 'sessionsView.newAutomation', (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			const importAutomation = toAction({ id: 'sessions.automations.import', label: localize('importAutomationMenu', "Import Automation..."), run: () => commandService.executeCommand('sessions.automations.import') });
			return instantiationService.createInstance(AutomationHeaderSplitButtonActionViewItem, action, options, [importAutomation]);
		}));
		this._register(actionViewItemService.register(AgentsWindowMenus.CustomViewAutomations, AgentsWindowMenus.AutomationsMoreActions, (action, options, instantiationService) => {
			if (!(action instanceof SubmenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(SubmenuEntryActionViewItem, action, {
				...options,
				classNames: [...ThemeIcon.asClassNameArray(Codicon.more), 'automations-more-actions'],
				menuClassName: 'automations-more-actions-menu',
			});
		}));
	}
}









registerAction2(class MarkAllAutomationRunsReadAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.automations.markAllRead',
			title: localize2('markAllAutomationRunsRead', "Mark All as Read"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
			menu: {
				id: Menus.AutomationsContext,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await markAllAutomationRunsRead(
			accessor.get(IAutomationService), accessor.get(ISessionsManagementService), accessor.get(IUriIdentityService),
			accessor.get(IChatService).chatModels.get(), accessor.get(ILogService), accessor.get(IDialogService),
			accessor.get(IConfigurationService),
			accessor.get(IStorageService),
		);
	}
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.CustomViewAutomations, {
	submenu: AgentsWindowMenus.AutomationsMoreActions,
	title: localize('automationsViewOptions', "View options"),
	icon: Codicon.more,
	group: 'navigation',
	order: 4,
	when: ContextKeyExpr.and(ChatAutomationsEnabledContext, ChatEntitlementContextKeys.Setup.hidden.negate()),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsMoreActions, {
	command: {
		id: TOGGLE_SHOW_DISABLED_AUTOMATIONS_COMMAND_ID,
		title: localize2('showDisabledAutomations', "Show disabled automations"),
		toggled: ShowDisabledAutomationsContext,
		precondition: ContextKeyExpr.and(ChatAutomationsEnabledContext, ChatEntitlementContextKeys.Setup.hidden.negate()),
	},
	group: '1_state',
	order: 0,
	when: ContextKeyExpr.and(ChatAutomationsEnabledContext, ChatEntitlementContextKeys.Setup.hidden.negate()),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsMoreActions, {
	command: { ...AutomationCommands.showSharedByOthers, precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext) },
	group: '1_state',
	order: 2,
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext, ContextKeyExpr.equals(`config.${CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING}`, true), AutomationsHasOthersContext),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsMoreActions, {
	command: { ...AutomationCommands.refresh, precondition: ChatAutomationsEnabledContext },
	group: '1_state',
	order: 1,
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext, ContextKeyExpr.equals(`config.${CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING}`, true)),

});

MenuRegistry.appendMenuItem(AgentsWindowMenus.CustomViewAutomations, {
	command: { ...AutomationCommands.createManually, precondition: ChatAutomationsEnabledContext },
	group: 'navigation',
	order: 2,
	when: ChatAutomationsEnabledContext,
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.CustomViewAutomations, {
	command: { ...AutomationCommands.createWithAgent, precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext) },
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationsHasVisibleCardsContext),

});



MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationCardContext, {
	command: { ...AutomationCommands.duplicate, precondition: ChatAutomationsEnabledContext },
	group: '3_copy',
	order: 1,
	when: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardHasEventTriggerContext.negate()),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationCardContext, {
	command: { ...AutomationCommands.export, precondition: ChatAutomationsEnabledContext },
	group: '3_copy',
	order: 2,
	when: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardIsCloudContext.negate()),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationCardContext, {
	command: { ...AutomationCommands.openOnGitHub, precondition: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardHasExternalResourceContext) },
	group: 'navigation',
	order: 1,
	when: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardHasExternalResourceContext),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationCardContext, {
	command: { ...AutomationCommands.delete, precondition: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardCanDeleteContext) },
	group: '4_manage',
	order: 1,
	when: ChatAutomationsEnabledContext,
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationCardContext, {
	command: { ...AutomationCommands.disable, precondition: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardCanUpdateContext) },
	group: '1_state',
	order: 1,
	when: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardEnabledContext),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationCardContext, {
	command: { ...AutomationCommands.removeEndDate, precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext, AutomationCardCanUpdateContext, AutomationCardHasLimitsContext) },
	group: '1_state',
	order: 1.5,
	when: ContextKeyExpr.and(ChatContextKeys.enabled, ChatAutomationsEnabledContext, AutomationCardHasLimitsContext),
});

MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationCardContext, {
	command: { ...AutomationCommands.enable, precondition: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardCanUpdateContext) },
	group: '1_state',
	order: 1,
	when: ContextKeyExpr.and(ChatAutomationsEnabledContext, AutomationCardEnabledContext.negate()),
});





//#endregion
