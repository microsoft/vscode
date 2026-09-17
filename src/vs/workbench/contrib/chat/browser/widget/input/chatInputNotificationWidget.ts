/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { isMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IChatInputNoticeFocusTarget } from './chatInputNoticeHost.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../common/languageModels.js';
import { filterConfigurationToSchema } from './chatModelConfigurationLogic.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from './chatInputNoticeWidget.js';
import { ChatInputStackSlot, setChatInputStackSlot } from './chatInputStack.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, getChatInputNotificationAnnouncementSignature, IChatInputNotification, IChatInputNotificationAction, IChatInputNotificationBody, IChatInputNotificationCommandAction, IChatInputNotificationContext, IChatInputNotificationModelState, IChatInputNotificationService, IChatInputNotificationSwitchToModelAction, isChatInputNotificationApplicableToSession, resolveChatInputNotificationBody } from './chatInputNotificationService.js';
import './media/chatInputNotificationWidget.css';

const $ = dom.$;

type ChatInputNotificationTelemetryEvent = {
	id: string;
	telemetryId?: string;
};

type ChatInputNotificationTelemetryClassification = {
	id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the chat input notification.' };
	telemetryId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The feature-provided identifier for the notification message that was shown or dismissed.' };
	owner: 'rfeltis';
	comment: 'Tracks chat input notification visibility and user dismissals.';
};

type ChatInputNotificationActionTelemetryEvent = ChatInputNotificationTelemetryEvent & {
	actionKind: ChatInputNotificationActionKind;
	actionId: string;
};

type ChatInputNotificationActionTelemetryClassification = {
	id: ChatInputNotificationTelemetryClassification['id'];
	telemetryId?: ChatInputNotificationTelemetryClassification['telemetryId'];
	actionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of notification action selected by the user.' };
	actionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The feature-provided identifier of the notification action selected by the user.' };
	owner: 'rfeltis';
	comment: 'Tracks actions selected from chat input notifications.';
};

const severityToClass: Record<ChatInputNotificationSeverity, string> = {
	[ChatInputNotificationSeverity.Info]: 'severity-info',
	[ChatInputNotificationSeverity.Warning]: 'severity-warning',
	[ChatInputNotificationSeverity.Error]: 'severity-error',
};

const severityToIcon: Record<ChatInputNotificationSeverity, ThemeIcon> = {
	[ChatInputNotificationSeverity.Info]: Codicon.info,
	[ChatInputNotificationSeverity.Warning]: Codicon.warning,
	[ChatInputNotificationSeverity.Error]: Codicon.error,
};

const emptyModelState: IChatInputNotificationModelState = { currentModel: undefined, models: [] };

/** Input-local model state and picker operations. */
export interface IChatInputNotificationModelSelection {
	readonly state: IObservable<IChatInputNotificationModelState>;
	readonly openPicker: () => void;
	readonly selectModel: (modelIdentifier: string) => boolean;
	/** Applies model configuration such as a thinking level, scoped to this input. */
	readonly applyModelConfiguration?: (modelIdentifier: string, values: IStringDictionary<unknown>) => Promise<void>;
}

/** Input-local capabilities used to filter and execute semantic notification actions. */
export interface IChatInputNotificationDelegate {
	readonly modelTargetChatSessionType?: IObservable<string | undefined>;
	readonly sessionResource?: IObservable<URI | undefined>;
	readonly deferredNotificationsEnabled?: IObservable<boolean>;
	/** Whether this input is a transient surface (inline, terminal, quick chat, chat input window). */
	readonly isTransientChat?: IObservable<boolean>;
	/** Whether the session this input is bound to already has a request. */
	readonly sessionStarted?: IObservable<boolean>;
	readonly modelSelection?: IChatInputNotificationModelSelection;
	/**
	 * Reports whether a notification is rendered. `focusTarget` is the widget
	 * itself, so a host can route notice-focus commands into it while it shows.
	 */
	readonly onDidChangeVisibility?: (visible: boolean, focusTarget: IChatInputNoticeFocusTarget) => void;
	/**
	 * Hands focus back to the input. Called when a notification that had keyboard
	 * focus goes away, so focus is not stranded on `<body>`.
	 */
	readonly focusInput?: () => void;
}

/**
 * Widget that renders a single notification banner above the chat input area.
 * Subscribes to {@link IChatInputNotificationService} and shows the highest-severity
 * active notification with severity-colored borders, action buttons, and a dismiss button.
 */
export class ChatInputNotificationWidget extends Disposable implements IChatInputNoticeFocusTarget {

	private readonly _notice: ChatInputNoticeWidget;

	get domNode(): HTMLElement {
		return this._notice.domNode;
	}

	private readonly _contentDisposables = this._register(new DisposableStore());
	private _lastShownTelemetryData: ChatInputNotificationTelemetryEvent | undefined;
	private _modelTargetChatSessionType: string | undefined;
	private _sessionResource: URI | undefined;
	private _deferredNotificationsEnabled = true;
	private _sessionStarted = false;
	private _modelState = emptyModelState;
	private _isTransientChat = false;
	private _lastAnnouncementSignature: string | undefined;
	private _visible = false;
	private _slot: HTMLElement | undefined;

	constructor(
		private readonly _delegate: IChatInputNotificationDelegate | undefined,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IHoverService private readonly _hoverService: IHoverService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// Built detached: the input part parents this widget itself, into the lane
		// it lays out above the input.
		this._notice = this._register(new ChatInputNoticeWidget({
			variant: ChatInputNoticeVariant.Notification,
			className: 'chat-input-notification-widget',
			ariaRoleDescription: localize('chatInputNotificationRoleDescription', "notification"),
		}));
		this._notice.setVisible(false);

		this._register(this._notificationService.onDidChange(() => this._render()));
		this._register(autorun(reader => {
			this._modelTargetChatSessionType = this._delegate?.modelTargetChatSessionType?.read(reader);
			this._sessionResource = this._delegate?.sessionResource?.read(reader);
			this._deferredNotificationsEnabled = this._delegate?.deferredNotificationsEnabled?.read(reader) ?? true;
			this._sessionStarted = this._delegate?.sessionStarted?.read(reader) ?? false;
			this._modelState = this._delegate?.modelSelection?.state.read(reader) ?? emptyModelState;
			this._isTransientChat = this._delegate?.isTransientChat?.read(reader) ?? false;
			this._render();
		}));
	}

	private _render(): void {
		// Tearing the content down would strand keyboard focus on <body>, which also
		// drops the context keys the chat keybindings depend on. Hand it back to the
		// input instead, the same way an onboarding card does when it stands down.
		const hadFocus = this.hasFocus();
		this._contentDisposables.clear();
		dom.clearNode(this.domNode);
		this.domNode.classList.remove(...Object.values(severityToClass));

		const bodies = new Map<string, IChatInputNotificationBody>();
		const notification = this._notificationService.getActiveNotification(candidate => {
			const body = this._resolveBody(candidate);
			if (body) {
				bodies.set(candidate.id, body);
				return true;
			}
			return false;
		});
		const body = notification ? bodies.get(notification.id) : undefined;
		this._setVisible(!!notification && !!body);
		const announcementSignature = notification && body ? getChatInputNotificationAnnouncementSignature(notification, body) : undefined;
		if (announcementSignature !== this._lastAnnouncementSignature) {
			this._lastAnnouncementSignature = announcementSignature;
			this._notificationService.announceRendered(body ? notification : undefined, body);
		}
		if (!notification || !body) {
			setChatInputStackSlot(this._slot, ChatInputStackSlot.Empty);
			this._lastShownTelemetryData = undefined;
			if (hadFocus) {
				this._delegate?.focusInput?.();
			}
			return;
		}

		setChatInputStackSlot(this._slot, ChatInputStackSlot.Docked);
		this._renderNotification(notification, body);
		this._logShownTelemetry(notification);
		if (hadFocus) {
			// The region is rebuilt on every render; keep focus inside it.
			this.focus();
		}
	}

	private _setVisible(visible: boolean): void {
		if (this._visible === visible) {
			return;
		}

		this._visible = visible;
		this._notice.setVisible(visible);
		this._delegate?.onDidChangeVisibility?.(visible, this);
	}

	hasFocus(): boolean {
		return this._notice.hasFocus();
	}

	/**
	 * Add the notification to its slot and report what the slot is showing.
	 *
	 * The widget is built detached and renders in its constructor, so an already
	 * active notification has no slot to report to at that point. Owners add it
	 * through here so the slot cannot end up marked empty while it has content.
	 */
	attachTo(slot: HTMLElement): void {
		this._slot = slot;
		slot.appendChild(this.domNode);
		setChatInputStackSlot(slot, this._visible ? ChatInputStackSlot.Docked : ChatInputStackSlot.Empty);
	}

	focus(): void {
		this._notice.focus();
	}

	private _resolveBody(notification: IChatInputNotification): IChatInputNotificationBody | undefined {
		const context = this._getContext();
		if (!isChatInputNotificationApplicableToSession(notification, context.sessionType, context.sessionResource)) {
			return undefined;
		}
		return resolveChatInputNotificationBody(notification, context, error => this._logError(error));
	}

	private _getContext(): IChatInputNotificationContext {
		return {
			sessionType: this._modelTargetChatSessionType,
			sessionResource: this._sessionResource,
			deferredNotificationsEnabled: this._deferredNotificationsEnabled,
			isTransientChat: this._isTransientChat,
			sessionStarted: this._sessionStarted,
			modelState: this._modelState,
		};
	}

	private _renderNotification(notification: IChatInputNotification, body: IChatInputNotificationBody): void {
		const container = this.domNode;
		container.classList.add(severityToClass[notification.severity]);

		// Header row: icon + title + mute + dismiss
		const headerRow = dom.append(container, $('.chat-input-notification-header'));

		// Severity icon
		const iconElement = dom.append(headerRow, $('.chat-input-notification-icon'));
		iconElement.appendChild(dom.$(ThemeIcon.asCSSSelector(severityToIcon[notification.severity])));

		// Title
		const titleElement = dom.append(headerRow, $('.chat-input-notification-title'));
		if (isMarkdownString(notification.message)) {
			const rendered = this._contentDisposables.add(this._markdownRendererService.render(notification.message));
			rendered.element.classList.add('chat-input-notification-title-markdown');
			titleElement.appendChild(rendered.element);
		} else {
			titleElement.textContent = notification.message;
		}
		const ariaTitle = isMarkdownString(notification.message) ? notification.message.value : notification.message;
		// Names the focusable region: `aria-roledescription` alone would have focus
		// land on something announced only as "notification".
		this._notice.setAriaLabel(ariaTitle);

		if (notification.mute) {
			const mute = notification.mute;

			// Defer to a microtask for the same reason as the dismiss button:
			// the command synchronously tears down the notification, and the
			// resulting re-render must happen after the click has propagated.
			const muteButton = this._notice.addAction({
				ariaLabel: mute.tooltip,
				icon: Codicon.bellSlash,
				parent: headerRow,
				store: this._contentDisposables,
				onActivate: () => queueMicrotask(() => {
					this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
						id: mute.commandId,
						from: 'chatInputNotification',
					});
					this._commandService.executeCommand(mute.commandId, ...(mute.commandArgs ?? []));
				}),
			});
			this._contentDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), muteButton, mute.tooltip));
		}

		// Dismiss button (in header row, pushed to the right)
		if (notification.dismissible) {
			// Defer the dismiss to a microtask so the synchronous re-render
			// (which clears all children of the widget) happens after the
			// browser has finished propagating the click event. Otherwise
			// blur handlers fired by removing the button from focus can
			// move/remove nodes that `clearNode` then trips over.
			this._notice.addDismissAction({
				className: 'chat-input-notification-dismiss',
				ariaLabel: localize('dismissNotification', "Dismiss notification"),
				parent: headerRow,
				store: this._contentDisposables,
				onActivate: () => queueMicrotask(() => {
					this._telemetryService.publicLog2<ChatInputNotificationTelemetryEvent, ChatInputNotificationTelemetryClassification>('chatInputNotificationDismissed', this._getTelemetryData(notification));
					this._notificationService.dismissNotification(notification.id);
				}),
			});
		}

		// Body row: description + actions on the same line
		const actions = body.actions.filter(action => this._supportsAction(action));
		const hasBody = body.description || actions.length > 0;
		if (hasBody) {
			const bodyRow = dom.append(container, $('.chat-input-notification-body'));

			if (body.description) {
				const descriptionElement = dom.append(bodyRow, $('.chat-input-notification-description'));
				if (isMarkdownString(body.description)) {
					const rendered = this._contentDisposables.add(this._markdownRendererService.render(body.description));
					rendered.element.classList.add('chat-input-notification-description-markdown');
					descriptionElement.appendChild(rendered.element);
				} else {
					descriptionElement.textContent = body.description;
				}
			}

			if (actions.length > 0) {
				const actionsContainer = dom.append(bodyRow, $('.chat-input-notification-actions'));

				for (let i = 0; i < actions.length; i++) {
					const action = actions[i];
					const isLast = i === actions.length - 1;

					const button = this._contentDisposables.add(new Button(actionsContainer, {
						...defaultButtonStyles,
						...(!isLast ? {
							buttonBackground: undefined,
							buttonHoverBackground: undefined,
							buttonForeground: undefined,
							buttonSecondaryBackground: undefined,
							buttonSecondaryHoverBackground: undefined,
							buttonSecondaryForeground: undefined,
							buttonSecondaryBorder: undefined,
						} : {}),
						supportIcons: true,
						secondary: !isLast,
					}));
					button.element.classList.add('chat-input-notification-action-button');
					button.label = action.label;
					button.element.ariaLabel = `${ariaTitle} ${action.label}`;

					this._contentDisposables.add(button.onDidClick(() => {
						void this._executeAction(notification, action);
					}));
				}
			}
		}
	}

	private _supportsAction(action: IChatInputNotificationAction): boolean {
		switch (action.kind) {
			case ChatInputNotificationActionKind.Command:
				return true;
			case ChatInputNotificationActionKind.OpenModelPicker:
				return !!this._delegate?.modelSelection;
			case ChatInputNotificationActionKind.SwitchToModel:
				return !!this._delegate?.modelSelection;
		}
	}

	private async _executeAction(notification: IChatInputNotification, action: IChatInputNotificationAction): Promise<void> {
		this._telemetryService.publicLog2<ChatInputNotificationActionTelemetryEvent, ChatInputNotificationActionTelemetryClassification>('chatInputNotificationAction', {
			...this._getTelemetryData(notification),
			actionKind: action.kind,
			actionId: action.telemetryActionId ?? '',
		});
		switch (action.kind) {
			case ChatInputNotificationActionKind.Command:
				try {
					await this._executeCommandAction(action);
				} catch (error) {
					this._logError(error);
				}
				break;
			case ChatInputNotificationActionKind.OpenModelPicker:
				this._openModelPicker();
				break;
			case ChatInputNotificationActionKind.SwitchToModel:
				this._switchToModel(action);
				break;
		}
		if (!action.keepOpen) {
			this._notificationService.dismissNotification(notification.id);
		}
	}

	private _resolveModel(action: Extract<IChatInputNotificationAction, { kind: ChatInputNotificationActionKind.SwitchToModel }>): ILanguageModelChatMetadataAndIdentifier | undefined {
		const matches = this._modelState.models.filter(model => this._matchesModel(action, model));
		// A broad selector could otherwise switch the user to a model the notification did not mean.
		return action.requireUniqueModel && matches.length !== 1 ? undefined : matches[0];
	}

	private _matchesModel(action: Extract<IChatInputNotificationAction, { kind: ChatInputNotificationActionKind.SwitchToModel }>, model: ILanguageModelChatMetadataAndIdentifier): boolean {
		try {
			return action.matchesModel(model);
		} catch (error) {
			this._logError(error);
			return false;
		}
	}

	private _switchToModel(action: IChatInputNotificationSwitchToModelAction): void {
		const model = this._resolveModel(action);
		let switched = false;
		if (model) {
			try {
				switched = this._delegate?.modelSelection?.selectModel(model.identifier) ?? false;
			} catch (error) {
				this._logError(error);
			}
			// Only configure a model the user actually ended up on, and never block the
			// switch on the profile-wide write this kicks off.
			if (switched) {
				this._applyModelConfiguration(model, action.config).catch(error => this._logError(error));
			}
		}
		if (!switched) {
			this._openModelPicker();
		}
	}

	/** Key names are model-specific (`thinkingLevel`, `reasoningEffort`, ...), so a key meant for another model is logged rather than stored. */
	private async _applyModelConfiguration(model: ILanguageModelChatMetadataAndIdentifier, config: IStringDictionary<unknown> | undefined): Promise<void> {
		const modelSelection = this._delegate?.modelSelection;
		if (!config || !modelSelection?.applyModelConfiguration) {
			return;
		}
		const schema = model.metadata.configurationSchema;
		const values = filterConfigurationToSchema(config, schema);
		const dropped = Object.keys(config).filter(key => !Object.hasOwn(values, key));
		if (dropped.length) {
			this._logService.warn(`[ChatInputNotificationWidget] ${model.identifier} does not accept ${dropped.join(', ')}; supported: ${Object.keys(schema?.properties ?? {}).join(', ') || 'none'}`);
		}
		if (Object.keys(values).length) {
			await modelSelection.applyModelConfiguration(model.identifier, values);
		}
	}

	private _openModelPicker(): void {
		try {
			this._delegate?.modelSelection?.openPicker();
		} catch (error) {
			this._logError(error);
		}
	}

	private _logError(error: unknown): void {
		this._logService.error('[ChatInputNotificationWidget] Failed to process notification', error);
	}

	private async _executeCommandAction(action: IChatInputNotificationCommandAction): Promise<void> {
		this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
			id: action.commandId,
			from: 'chatInputNotification',
		});
		await this._commandService.executeCommand(action.commandId, ...(action.commandArgs ?? []));
	}

	private _logShownTelemetry(notification: IChatInputNotification): void {
		const data = this._getTelemetryData(notification);
		if (this._lastShownTelemetryData?.id === data.id && this._lastShownTelemetryData.telemetryId === data.telemetryId) {
			return;
		}
		this._lastShownTelemetryData = data;
		this._telemetryService.publicLog2<ChatInputNotificationTelemetryEvent, ChatInputNotificationTelemetryClassification>('chatInputNotificationShown', data);
	}

	private _getTelemetryData(notification: IChatInputNotification): ChatInputNotificationTelemetryEvent {
		return {
			id: notification.id,
			telemetryId: notification.telemetryId,
		};
	}
}
