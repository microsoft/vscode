/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IButton } from '../../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { ISelectOptionItem, SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { defaultDialogStyles, defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { hasNativeContextMenu } from '../../../../../platform/window/common/window.js';
// eslint-disable-next-line local/code-import-patterns
import { WorkspacePicker } from '../../../../../sessions/contrib/chat/browser/sessionWorkspacePicker.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../../../sessions/services/sessions/common/session.js';
import { createWorkbenchDialogOptions } from '../../../../browser/parts/dialogs/dialog.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { AutomationInterval, IAutomation, IAutomationSchedule } from '../../common/automations/automation.js';
import { ICreateAutomationOptions, IUpdateAutomationOptions } from '../../common/automations/automationService.js';
import { IAutomationSessionTypeChoice, IAutomationSessionTypeProvider } from '../../common/automations/automationSessionTypes.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, isChatPermissionLevel } from '../../common/constants.js';
import { AgentSessionProviders, AgentSessionTarget } from '../agentSessions/agentSessions.js';
import { IChatWidget, ISessionTypePickerDelegate } from '../chat.js';
import { ChatInputPart, IChatInputPartOptions, IChatInputStyles } from '../widget/input/chatInputPart.js';

const $ = DOM.$;

const INTERVALS: { readonly value: AutomationInterval; readonly label: string }[] = [
	{ value: 'manual', label: localize('automation.interval.manual', "Manual") },
	{ value: 'hourly', label: localize('automation.interval.hourly', "Hourly") },
	{ value: 'daily', label: localize('automation.interval.daily', "Daily") },
	{ value: 'weekly', label: localize('automation.interval.weekly', "Weekly") },
];

const DAYS_OF_WEEK: readonly string[] = [
	localize('automation.day.sun', "Sunday"),
	localize('automation.day.mon', "Monday"),
	localize('automation.day.tue', "Tuesday"),
	localize('automation.day.wed', "Wednesday"),
	localize('automation.day.thu', "Thursday"),
	localize('automation.day.fri', "Friday"),
	localize('automation.day.sat', "Saturday"),
];

/**
 * Recognizes the popup container roots used by chat input pickers and
 * other VS Code overlays. Used as the dialog's `isExternalFocusAllowed`
 * predicate so dropdowns mounted at the body level by
 * `IContextViewService` / `IActionWidgetService` / quick picks are not
 * dismissed by the dialog's focus-trap when they take focus.
 */
function isAutomationDialogPopupTarget(relatedTarget: HTMLElement): boolean {
	// IContextViewService (used by IActionWidgetService for chat input
	// pickers) wraps overlays in `.context-view`. Quick picks render as
	// `.quick-input-widget`. Context menus render as
	// `.monaco-menu-container`. Hover widgets render as
	// `.monaco-hover-content` or `.monaco-hover`.
	return !!relatedTarget.closest(
		'.context-view, .quick-input-widget, .monaco-menu-container, .monaco-hover, .monaco-hover-content'
	);
}

export interface IShowAutomationDialogOptions {
	/** Existing automation to edit; omit for create. */
	readonly existing?: IAutomation;
}

/**
 * Form values surfaced by {@link showAutomationDialog}. Either a
 * create or an update payload, depending on whether
 * `IShowAutomationDialogOptions.existing` was provided.
 */
export type IAutomationDialogResult =
	| { readonly kind: 'create'; readonly value: ICreateAutomationOptions }
	| { readonly kind: 'update'; readonly id: string; readonly value: IUpdateAutomationOptions };

/**
 * Shows the create/edit automation modal and resolves with the
 * collected form values, or `undefined` if the user cancelled.
 *
 * Implementation uses the base {@link Dialog} primitive with a
 * `renderBody` callback so we can host arbitrary form controls
 * (multi-line prompt, schedule pickers, folder picker).
 */
export async function showAutomationDialog(
	instantiationService: IInstantiationService,
	contextKeyService: IContextKeyService,
	contextViewService: IContextViewService,
	configurationService: IConfigurationService,
	keybindingService: IKeybindingService,
	layoutService: ILayoutService,
	hostService: IHostService,
	sessionTypeProvider: IAutomationSessionTypeProvider,
	options: IShowAutomationDialogOptions,
): Promise<IAutomationDialogResult | undefined> {
	const disposables = new DisposableStore();

	const initial = options.existing;
	const isEdit = !!initial;

	const state: IFormState = {
		name: initial?.name ?? '',
		interval: initial?.schedule.interval ?? 'daily',
		hour: initial?.schedule.scheduleHour ?? 9,
		minute: initial?.schedule.scheduleMinute ?? 0,
		day: initial?.schedule.scheduleDay ?? 1,
		folderUri: initial?.folderUri,
		providerId: initial?.providerId,
		sessionTypeId: initial?.sessionTypeId,
		enabled: initial?.enabled ?? true,
	};

	const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined };

	let saveButton: IButton | undefined;
	let revalidate: () => void = () => { /* assigned below */ };
	// The prompt's source of truth is the {@link ChatInputPart}'s editor.
	// `renderForm` wires this accessor up; `revalidate` and the Save path
	// read from it instead of mirroring into `state`. Mode and permission
	// level use the same pattern — they are captured directly from the
	// input's built-in pickers at Save time.
	let getPrompt: () => string = () => initial?.prompt ?? '';
	let getMode: () => string | undefined = () => initial?.mode;
	let getPermissionLevel: () => string | undefined = () => initial?.permissionLevel;
	let getModelId: () => string | undefined = () => initial?.modelId;

	const title = isEdit
		? localize('automation.dialog.editTitle', "Edit Automation")
		: localize('automation.dialog.createTitle', "Create Automation");

	const buttonLabels = [
		isEdit ? localize('automation.dialog.save', "Save") : localize('automation.dialog.create', "Create"),
		localize('automation.dialog.cancel', "Cancel"),
	];

	const dialog = disposables.add(new Dialog(
		layoutService.activeContainer,
		title,
		buttonLabels,
		createWorkbenchDialogOptions({
			type: 'none',
			extraClasses: ['automation-dialog'],
			cancelId: 1,
			isExternalFocusAllowed: isAutomationDialogPopupTarget,
			// {@link Dialog.style} walks every `<a>` in `messageContainer` and
			// stamps `el.style.color = textLinkForeground` (inline style) when
			// `textLinkForeground` is truthy. Chat input picker chips render
			// as `<a class="action-label">`, so every chip that exists at
			// `show()` time gets stamped link-blue and that inline color
			// beats every CSS rule until something re-creates the element.
			// Suppress the stamp entirely — the dialog body has no real
			// links to highlight, and the chips inherit the correct neutral
			// color from chat.css.
			dialogStyles: { ...defaultDialogStyles, textLinkForeground: undefined },
			buttonOptions: [
				{
					styleButton: button => {
						saveButton = button;
						revalidate();
					},
				},
			],
			renderBody: container => {
				container.classList.add('automation-dialog-body');
				const form = DOM.append(container, $('.automation-form'));
				const handle = renderForm(form, state, options, disposables, validation, () => revalidate(), instantiationService, contextKeyService, contextViewService, configurationService, layoutService, sessionTypeProvider, initial?.prompt ?? '', initial?.mode, initial?.permissionLevel, initial?.modelId);
				getPrompt = handle.getPrompt;
				getMode = handle.getMode;
				getPermissionLevel = handle.getPermissionLevel;
				getModelId = handle.getModelId;
				revalidate = () => updateSaveButtonState(saveButton, state, validation, form, getPrompt);
				revalidate();
			},
		}, keybindingService, layoutService, hostService),
	));

	try {
		const result = await dialog.show();
		if (result.button !== 0) {
			return undefined;
		}
		// Re-validate one last time in case the user submitted with
		// invalid state via Enter.
		revalidate();
		if (validation.nameError || validation.promptError || validation.folderError) {
			return undefined;
		}
		if (!state.folderUri) {
			return undefined;
		}

		const schedule: IAutomationSchedule = {
			interval: state.interval,
			scheduleHour: state.hour,
			scheduleMinute: state.minute,
			scheduleDay: state.day,
		};

		const prompt = getPrompt();
		const mode = getMode();
		const permissionLevel = getPermissionLevel();
		const modelId = getModelId();

		if (isEdit && initial) {
			const patch: IUpdateAutomationOptions = {
				name: state.name,
				prompt,
				schedule,
				folderUri: state.folderUri,
				providerId: state.providerId ?? null,
				sessionTypeId: state.sessionTypeId ?? null,
				modelId: modelId ?? null,
				mode: mode ?? null,
				permissionLevel: permissionLevel ?? null,
				enabled: state.enabled,
			};
			return { kind: 'update', id: initial.id, value: patch };
		}

		const create: ICreateAutomationOptions = {
			name: state.name,
			prompt,
			schedule,
			folderUri: state.folderUri,
			providerId: state.providerId,
			sessionTypeId: state.sessionTypeId,
			modelId,
			mode,
			permissionLevel,
			enabled: state.enabled,
		};
		return { kind: 'create', value: create };
	} finally {
		disposables.dispose();
	}
}

interface IFormState {
	name: string;
	interval: AutomationInterval;
	hour: number;
	minute: number;
	day: number;
	folderUri: URI | undefined;
	providerId: string | undefined;
	sessionTypeId: string | undefined;
	enabled: boolean;
}

interface IValidationState {
	nameError: string | undefined;
	promptError: string | undefined;
	folderError: string | undefined;
}

interface IRenderFormHandle {
	readonly getPrompt: () => string;
	readonly getMode: () => string | undefined;
	readonly getPermissionLevel: () => string | undefined;
	readonly getModelId: () => string | undefined;
}

/**
 * Session-type ids the automation dialog allows the user to pick. The
 * picker normally surfaces every type the active providers register
 * (Local, Background = Copilot CLI, Claude, Cloud, plus per-host
 * duplicates). For automations we limit to two:
 *
 *   - {@link AgentSessionProviders.Local}  — runs in this window
 *   - {@link AgentSessionProviders.Background} — Copilot CLI
 *
 * Cloud is intentionally out of scope for the preview; Claude and the
 * duplicate `[Local]` variant of Copilot CLI surfaced by certain
 * provider hosts are noise for our use case and hidden via the
 * delegate's `isSessionTypeVisible` hook.
 */
const AUTOMATION_VISIBLE_SESSION_TYPES: ReadonlySet<AgentSessionTarget> = new Set([
	AgentSessionProviders.Local,
	AgentSessionProviders.Background,
]);

/**
 * Two-way binding between the chat input's session-target chip and the
 * automation form's `providerId` + `sessionTypeId` fields.
 *
 * The chip operates at the {@link AgentSessionTarget} (session-type id)
 * granularity. The automation runner stores both a `providerId` and a
 * `sessionTypeId`, so we resolve the chip's pick against the list
 * returned by {@link IAutomationSessionTypeProvider.getSessionTypesForFolder}
 * for the currently-selected folder. The first matching choice wins; if
 * a session type has multiple providers (e.g. two remote hosts both
 * offering Copilot CLI) the user cannot disambiguate from the chip
 * alone — accepted limitation of replacing the dedicated session-type
 * `<select>` with the chip.
 *
 * When the folder changes, the previously-selected pair is re-validated
 * against the new folder's available list; if it's no longer valid we
 * fall back to the Copilot CLI default (or the first available
 * choice).
 */
function createSessionTypeBinder(
	state: IFormState,
	sessionTypeProvider: IAutomationSessionTypeProvider,
	disposables: DisposableStore,
): ISessionTypePickerDelegate & { setFolder(folder: URI | undefined): void } {
	const onDidChange = disposables.add(new Emitter<AgentSessionTarget>());

	const pickDefault = (available: readonly IAutomationSessionTypeChoice[]): IAutomationSessionTypeChoice | undefined => {
		if (available.length === 0) {
			return undefined;
		}
		return available.find(c => c.sessionTypeId === AgentSessionProviders.Background) ?? available[0];
	};

	const validateOrDefault = (folder: URI | undefined): void => {
		if (!folder) {
			state.providerId = undefined;
			state.sessionTypeId = undefined;
			return;
		}
		const available = sessionTypeProvider.getSessionTypesForFolder(folder);
		if (state.providerId && state.sessionTypeId) {
			const match = available.find(c => c.providerId === state.providerId && c.sessionTypeId === state.sessionTypeId);
			if (match) {
				return;
			}
		}
		const def = pickDefault(available);
		state.providerId = def?.providerId;
		state.sessionTypeId = def?.sessionTypeId;
	};

	// Initialize for the current folder before the chip renders so the
	// label reflects the resolved session type rather than 'Local'.
	validateOrDefault(state.folderUri);

	return {
		getActiveSessionProvider: () => state.sessionTypeId as AgentSessionTarget | undefined,
		setActiveSessionProvider: (target: AgentSessionTarget) => {
			if (!state.folderUri) {
				return;
			}
			const available = sessionTypeProvider.getSessionTypesForFolder(state.folderUri);
			const match = available.find(c => c.sessionTypeId === target);
			if (!match) {
				return;
			}
			state.providerId = match.providerId;
			state.sessionTypeId = match.sessionTypeId;
			onDidChange.fire(match.sessionTypeId as AgentSessionTarget);
		},
		onDidChangeActiveSessionProvider: onDidChange.event,
		isSessionTypeVisible: (type: AgentSessionTarget) => {
			// Restrict to session types this dialog allows AND that the
			// current folder's provider offers. Anything else (Claude,
			// Cloud, the duplicate Local entry surfaced by certain
			// provider hosts) is hidden.
			if (!AUTOMATION_VISIBLE_SESSION_TYPES.has(type)) {
				return false;
			}
			if (!state.folderUri) {
				return false;
			}
			return sessionTypeProvider
				.getSessionTypesForFolder(state.folderUri)
				.some(c => c.sessionTypeId === type);
		},
		setFolder: (folder: URI | undefined) => {
			validateOrDefault(folder);
			if (state.sessionTypeId) {
				// Notify the chat input so pickers gated on session type
				// (mode, model, options) re-evaluate against the new
				// folder's resolved session type.
				onDidChange.fire(state.sessionTypeId as AgentSessionTarget);
			}
		},
	};
}

function renderForm(
	form: HTMLElement,
	state: IFormState,
	options: IShowAutomationDialogOptions,
	disposables: DisposableStore,
	validation: IValidationState,
	revalidate: () => void,
	instantiationService: IInstantiationService,
	contextKeyService: IContextKeyService,
	contextViewService: IContextViewService,
	configurationService: IConfigurationService,
	layoutService: ILayoutService,
	sessionTypeProvider: IAutomationSessionTypeProvider,
	initialPrompt: string,
	initialMode: string | undefined,
	initialPermissionLevel: string | undefined,
	initialModelId: string | undefined,
): IRenderFormHandle {
	// --- Name ---
	const nameRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(nameRow, $('label.automation-form-label', { for: 'automation-name' }, localize('automation.form.name', "Name")));
	const nameInput = DOM.append(nameRow, $('input.automation-form-input', { id: 'automation-name', type: 'text', value: state.name })) as HTMLInputElement;
	const nameError = DOM.append(nameRow, $('.automation-form-error'));
	disposables.add(DOM.addStandardDisposableListener(nameInput, 'input', () => {
		state.name = nameInput.value;
		revalidate();
		nameError.textContent = validation.nameError ?? '';
	}));

	// --- Schedule (interval + inline time + inline day) ---
	// All three controls live on the same horizontal axis. The interval
	// select sits first; the time select appears inline to the right when
	// the interval is daily or weekly; the day-of-week select joins the
	// row only for weekly. flex-wrap keeps narrow viewports from
	// overflowing the dialog.
	//
	// All three controls are rendered with VS Code's themed SelectBox
	// (custom-drawn unless the platform prefers native menus) so they
	// match the rest of the workbench. The themed dropdown is wider and
	// more readable than the raw `<select>` it replaces.
	const scheduleRow = DOM.append(form, $('.automation-form-row.automation-form-schedule-row'));
	const useCustomDrawn = !hasNativeContextMenu(configurationService);

	// Interval picker
	const intervalGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group'));
	DOM.append(intervalGroup, $('label.automation-form-label', undefined, localize('automation.form.interval', "Schedule")));
	const intervalOptions: ISelectOptionItem[] = INTERVALS.map(item => ({ text: item.label }));
	const intervalIndex = Math.max(0, INTERVALS.findIndex(item => item.value === state.interval));
	const intervalSelect = disposables.add(new SelectBox(
		intervalOptions,
		intervalIndex,
		contextViewService,
		defaultSelectBoxStyles,
		{ ariaLabel: localize('automation.form.interval', "Schedule"), useCustomDrawn },
	));
	const intervalSelectContainer = DOM.append(intervalGroup, $('.automation-form-schedule-select-container'));
	intervalSelect.render(intervalSelectContainer);

	// Time picker: a single dropdown of every 15-minute increment across
	// the 24-hour day, labelled in 12-hour `h:MM AM/PM` form (no leading
	// zero on the hour). The selected option encodes back to
	// `state.hour` / `state.minute` so the persisted schema doesn't
	// change.
	const timeGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group.automation-form-time-group'));
	DOM.append(timeGroup, $('label.automation-form-label', undefined, localize('automation.form.time', "Time")));
	const timeOptions = buildTimeOptions();
	// Snap the initial selection to the nearest 15-minute slot so a
	// loaded schedule with an off-grid minute (e.g. legacy 9:07) lands
	// on a valid option.
	const initialTimeIndex = nearestTimeOptionIndex(state.hour, state.minute);
	state.hour = timeOptions[initialTimeIndex].hour;
	state.minute = timeOptions[initialTimeIndex].minute;
	const timeSelect = disposables.add(new SelectBox(
		timeOptions.map(opt => ({ text: opt.label } satisfies ISelectOptionItem)),
		initialTimeIndex,
		contextViewService,
		defaultSelectBoxStyles,
		{ ariaLabel: localize('automation.form.time', "Time"), useCustomDrawn },
	));
	const timeSelectContainer = DOM.append(timeGroup, $('.automation-form-schedule-select-container.automation-form-time-select-container'));
	timeSelect.render(timeSelectContainer);
	disposables.add(timeSelect.onDidSelect(e => {
		const opt = timeOptions[e.index];
		state.hour = opt.hour;
		state.minute = opt.minute;
	}));

	// Day-of-week picker
	const dayGroup = DOM.append(scheduleRow, $('.automation-form-schedule-group.automation-form-day-group'));
	DOM.append(dayGroup, $('label.automation-form-label', undefined, localize('automation.form.day', "Day of week")));
	const dayOptions: ISelectOptionItem[] = DAYS_OF_WEEK.map(d => ({ text: d }));
	const daySelect = disposables.add(new SelectBox(
		dayOptions,
		Math.min(Math.max(state.day, 0), DAYS_OF_WEEK.length - 1),
		contextViewService,
		defaultSelectBoxStyles,
		{ ariaLabel: localize('automation.form.day', "Day of week"), useCustomDrawn },
	));
	const daySelectContainer = DOM.append(dayGroup, $('.automation-form-schedule-select-container'));
	daySelect.render(daySelectContainer);
	disposables.add(daySelect.onDidSelect(e => {
		state.day = e.index;
	}));

	const applyIntervalVisibility = () => {
		const showTime = state.interval === 'daily' || state.interval === 'weekly';
		const showDay = state.interval === 'weekly';
		timeGroup.style.display = showTime ? '' : 'none';
		dayGroup.style.display = showDay ? '' : 'none';
	};
	applyIntervalVisibility();
	disposables.add(intervalSelect.onDidSelect(e => {
		state.interval = INTERVALS[e.index].value;
		applyIntervalVisibility();
	}));

	// --- Folder (required) ---
	// Rendered as the shared `WorkspacePicker` from the sessions layer so
	// the chip and dropdown look + behave like the "New Session" view's
	// workspace picker. We subclass to disable the categorical tab bar
	// (`Local` / `GitHub` / `Remote`) — the dialog is local-only — but
	// otherwise inherit the recents list, the local `Select...` browse
	// action, the keyboard handling, and the trigger chip styling.
	//
	// `sessionTypeBinder` is created here (above the prompt section)
	// because the folder picker's `onDidSelectWorkspace` listener calls
	// `sessionTypeBinder.setFolder` and because the binder must exist
	// before `chatInputOptions` reads it.
	const sessionTypeBinder = createSessionTypeBinder(state, sessionTypeProvider, disposables);

	const folderRow = DOM.append(form, $('.automation-form-row.automation-form-folder-row'));
	DOM.append(folderRow, $('label.automation-form-label', undefined, localize('automation.form.folder', "Workspace folder")));
	const folderPickerHost = DOM.append(folderRow, $('.automation-form-folder-picker-host'));
	const folderError = DOM.append(folderRow, $('.automation-form-error'));

	const workspacePicker = disposables.add(instantiationService.createInstance(AutomationsWorkspacePicker));
	workspacePicker.render(folderPickerHost);

	// Push the dialog's initial folder into the picker without firing
	// `onDidSelectWorkspace` (we don't want our listener to revalidate
	// before the form is even mounted, and we don't want to overwrite
	// `state.folderUri` with itself).
	if (state.folderUri) {
		workspacePicker.setSelectedWorkspace(state.folderUri, { fireEvent: false });
	}

	// React to user picks. The picker emits `undefined` on clear; treat
	// that as "no folder selected" so validation re-fires the required
	// error.
	disposables.add(workspacePicker.onDidSelectWorkspace(uri => {
		state.folderUri = uri;
		sessionTypeBinder.setFolder(uri);
		revalidate();
		folderError.textContent = validation.folderError ?? '';
	}));

	// If the dialog opened with no folder yet but the picker resolved one
	// (e.g. the last folder the user picked in a chat session), adopt it
	// so the user can save without an extra click.
	if (!state.folderUri && workspacePicker.selectedFolderUri) {
		state.folderUri = workspacePicker.selectedFolderUri;
		sessionTypeBinder.setFolder(state.folderUri);
	}

	// --- Prompt ---
	// Hosts the chat composer ({@link ChatInputPart}) so the modal mirrors
	// the affordances of the regular chat composer: Monaco editor, `@`-style
	// references, slash commands, model picker, mode picker, and permission
	// picker. Unlike the composer, no Send button is rendered — saving the
	// modal is the only commit path. We achieve that by routing the input's
	// `executeToolbar` to a dedicated empty MenuId.
	const promptRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(promptRow, $('label.automation-form-label', undefined, localize('automation.form.prompt', "Prompt")));
	const promptHost = DOM.append(promptRow, $('.automation-form-prompt-host.interactive-session'));
	const promptError = DOM.append(promptRow, $('.automation-form-error'));

	const chatInputStyles: IChatInputStyles = {
		overlayBackground: 'var(--vscode-editor-background)',
		listForeground: 'var(--vscode-foreground)',
		listBackground: 'var(--vscode-editor-background)',
	};

	const chatInputOptions: IChatInputPartOptions = {
		renderFollowups: false,
		renderInputToolbarBelowInput: false,
		renderWorkingSet: false,
		enableImplicitContext: false,
		supportsChangingModes: true,
		menus: {
			executeToolbar: MenuId.AutomationsDialogInput,
			telemetrySource: 'automations.dialog',
		},
		// Unique tag so the input's draft-state memento doesn't bleed into
		// or out of the chat composer.
		widgetViewKindTag: 'automations-dialog',
		inputEditorMinLines: 3,
		// Drive the session-target chip from form state. Providing
		// `setActiveSessionProvider` switches the chip into "welcome view
		// mode" (see {@link ChatInputPart}), which calls our setter
		// instead of executing the new-session command.
		sessionTypePickerDelegate: sessionTypeBinder,
	};

	// {@link ChatInputPart.render} requires an {@link IChatWidget}. The modal
	// has no live chat session, so we supply a minimal stub. Almost every
	// `_widget` access inside {@link ChatInputPart} is optional-chained, so
	// the input degrades gracefully to a stand-alone composer.
	//
	// Two methods on {@link IChatWidget} ARE invoked on a truthy widget
	// without a method-existence guard: `lockToCodingAgent` and
	// `unlockFromCodingAgent` (called via `this._widget?.lockToCodingAgent(...)`
	// in {@link ChatInputPart.updateWidgetLockStateFromSessionType}). The
	// optional chain only guards against a null/undefined widget; once
	// `_widget` is set, calling a missing method throws TypeError. The
	// session-target chip delegate triggers that lock path whenever the
	// resolved session type is non-local (e.g. our Copilot CLI default),
	// so the stub provides no-op implementations.
	//
	// Pattern otherwise mirrors the component fixture at `chatInput.fixture.ts`.
	// The cast is intentional: the lifetime here never invokes the methods
	// we omit (no live session, no message tree, no editor sibling).
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	const stubWidget = {
		onDidChangeViewModel: Event.None,
		viewModel: undefined,
		contribs: [],
		location: ChatAgentLocation.Chat,
		viewContext: {},
		lockToCodingAgent: () => { /* no-op: dialog has no widget lock state to manage */ },
		unlockFromCodingAgent: () => { /* no-op: dialog has no widget lock state to manage */ },
	} as unknown as IChatWidget;

	// {@link ChatInputPart} does not bind {@link ChatContextKeys.location}
	// itself — that responsibility lives in {@link ChatWidget}. Without
	// the binding, every chat-input picker chip whose `when` clause checks
	// `chatLocation === Chat` (model, mode, permission, session-target,
	// etc.) is filtered out and only the configure-tools chip renders.
	// Mirror {@link ChatWidget}'s setup by creating a scoped context-key
	// service for the prompt host, binding the keys the toolbar `when`
	// clauses read, and feeding that scope to {@link ChatInputPart} via a
	// child instantiation service so its internal {@link MenuWorkbenchToolBar}s
	// resolve `@IContextKeyService` to the scoped instance.
	const scopedContextKeyService = disposables.add(contextKeyService.createScoped(promptHost));
	ChatContextKeys.location.bindTo(scopedContextKeyService).set(ChatAgentLocation.Chat);
	ChatContextKeys.inChatSession.bindTo(scopedContextKeyService).set(true);
	const scopedInstantiationService = disposables.add(
		instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))
	);

	const chatInput = disposables.add(
		scopedInstantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, chatInputOptions, chatInputStyles, false),
	);
	chatInput.render(promptHost, initialPrompt, stubWidget);

	// Pre-seed mode and permission level for edit-mode dialogs so the
	// pickers reflect what was previously captured. For create-mode the
	// pickers show their built-in defaults. We validate the stored
	// permission level against the current enum so a renamed/removed
	// legacy value falls back to the picker default instead of being
	// silently round-tripped to disk.
	if (initialMode) {
		chatInput.setChatMode(initialMode, /* storeSelection */ false);
	}
	if (initialPermissionLevel && isChatPermissionLevel(initialPermissionLevel)) {
		chatInput.setPermissionLevel(initialPermissionLevel);
	}
	// Pre-seed the language model. switchModelByIdentifier returns false
	// when the previously-saved model is no longer registered (e.g. the
	// extension was uninstalled); in that case we leave the picker on its
	// default and the runner will fall back at execution time.
	if (initialModelId) {
		chatInput.switchModelByIdentifier(initialModelId);
	}

	// Track whether the user actually interacted with each picker so that
	// a no-op Save on an existing automation preserves the originally
	// stored value (including the legacy `null` "use default" sentinel
	// from records saved before Phase C). We snapshot the values after
	// the pre-seed completes and only mark the picker as interacted-with
	// when the observable diverges from that baseline.
	//
	// Mode and permission level are only ever mutated by user action or
	// our explicit setters, so an observable-diverged signal is a safe
	// proxy for interaction. The language-model observable is *not* safe
	// the same way -- {@link ChatInputPart} can asynchronously rewrite
	// `selectedLanguageModel` on its own (late-arriving persisted model
	// in `_waitForPersistedLanguageModel`, model-visibility changes via
	// `resetCurrentLanguageModelIfUnavailable`). Tracking interaction
	// via autorun on that observable would silently flip the flag on
	// background events and corrupt the saved `modelId`, so we
	// deliberately do not capture model changes during an edit. For
	// edit-mode the modal preserves `initialModelId`; only create-mode
	// captures the picker's current value at Save. Tracked in
	// `files/deferred-decisions.md` for a true model-edit follow-up.
	let modeUserInteracted = false;
	let permissionUserInteracted = false;
	const baselineModeKind = chatInput.currentModeObs.get().kind;
	const baselinePermissionLevel = chatInput.currentPermissionLevelObs.get();
	disposables.add(autorun(reader => {
		const kind = chatInput.currentModeObs.read(reader).kind;
		if (kind !== baselineModeKind) {
			modeUserInteracted = true;
		}
	}));
	disposables.add(autorun(reader => {
		const level = chatInput.currentPermissionLevelObs.read(reader);
		if (level !== baselinePermissionLevel) {
			permissionUserInteracted = true;
		}
	}));

	// The editor itself is the source of truth for the prompt value; we
	// only listen here to re-run validation and surface the inline error
	// label as the user types. The final value is read once at Save time
	// via {@link IRenderFormHandle.getPrompt}.
	disposables.add(chatInput.inputEditor.onDidChangeModelContent(() => {
		revalidate();
		promptError.textContent = validation.promptError ?? '';
	}));

	// Two layout passes mirror the fixture: the first one establishes the
	// editor's container size, then we let layout settle before re-measuring.
	// 580 matches the prompt host's width inside the 640px dialog (640 -
	// dialog box padding - message row padding - dialog icon column).
	// Picking this value up front (instead of laying out wider) prevents
	// the chat input from visibly shrinking to its real size when the
	// ResizeObserver below reports the host's true width after show().
	chatInput.layout(580);
	queueMicrotask(() => chatInput.layout(580));

	// Once the dialog mounts, the prompt host gets its real dimensions.
	// Re-layout the chat input with the actual host width so the Monaco
	// editor's word wrap and toolbar overflow logic match what the user
	// sees.
	const resizeObserver = disposables.add(new DOM.DisposableResizeObserver('automationDialog.promptHost', entries => {
		for (const entry of entries) {
			const width = entry.contentRect.width;
			if (width > 0) {
				chatInput.layout(width);
			}
		}
	}, DOM.getWindow(promptHost)));
	disposables.add(resizeObserver.observe(promptHost));

	// --- Enabled checkbox ---
	const enabledRow = DOM.append(form, $('.automation-form-row.automation-form-checkbox-row'));
	const enabledCheckbox = DOM.append(enabledRow, $('input.automation-form-checkbox', { id: 'automation-enabled', type: 'checkbox' })) as HTMLInputElement;
	enabledCheckbox.checked = state.enabled;
	DOM.append(enabledRow, $('label.automation-form-checkbox-label', { for: 'automation-enabled' }, localize('automation.form.enabled', "Enabled (the scheduler runs this automation when due)")));
	disposables.add(DOM.addStandardDisposableListener(enabledCheckbox, 'change', () => {
		state.enabled = enabledCheckbox.checked;
	}));

	return {
		getPrompt: () => chatInput.inputEditor.getValue(),
		// Capture the *raw* mode kind the user selected (e.g. 'agent' /
		// 'ask' / 'edit'). We deliberately avoid `currentModeKind` which
		// rewrites Agent → Edit whenever the tools agent isn't currently
		// registered; that environmental concern is the runner's
		// responsibility at execution time, not capture time.
		//
		// If the user never touched a picker, fall through to the
		// originally-stored value so a no-op Save preserves both
		// concrete values and the legacy `undefined`/`null` "use default"
		// sentinel.
		getMode: () => modeUserInteracted ? chatInput.currentModeObs.get().kind : initialMode,
		getPermissionLevel: () => permissionUserInteracted ? chatInput.currentPermissionLevelObs.get() : initialPermissionLevel,
		// Edit-mode preserves the stored modelId verbatim (see the
		// async-write hazard explained above). Create-mode captures
		// whatever the picker resolves to at Save time.
		getModelId: () => initialModelId !== undefined ? initialModelId : chatInput.selectedLanguageModel.get()?.identifier,
	};
}

interface ITimeOption {
	readonly hour: number;
	readonly minute: number;
	readonly label: string;
}

/**
 * Builds the 96-entry time picker options (15-minute increments across a
 * 24-hour day). Labels use a 12-hour `h:MM AM/PM` format with no leading
 * zero on the hour: `12:00 AM`, `12:15 AM`, ..., `1:00 AM`, ..., `12:00 PM`,
 * ..., `11:45 PM`. Storage stays on the 24-hour `hour`/`minute` pair.
 */
function buildTimeOptions(): readonly ITimeOption[] {
	const options: ITimeOption[] = [];
	for (let hour = 0; hour < 24; hour++) {
		for (let minute = 0; minute < 60; minute += 15) {
			const period = hour < 12 ? 'AM' : 'PM';
			const hour12 = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
			const minuteText = minute.toString().padStart(2, '0');
			options.push({
				hour,
				minute,
				label: `${hour12}:${minuteText} ${period}`,
			});
		}
	}
	return options;
}

/**
 * Snaps an arbitrary 24-hour time to the nearest 15-minute slot in the
 * options returned by {@link buildTimeOptions}, returning the option's
 * index. Defaults to `9:00 AM` if the input is somehow out of range.
 */
function nearestTimeOptionIndex(hour: number, minute: number): number {
	const safeHour = Math.max(0, Math.min(23, hour | 0));
	const safeMinute = Math.max(0, Math.min(59, minute | 0));
	const slot = Math.round(safeMinute / 15) % 4;
	const carriedHour = safeMinute >= 53 && slot === 0 ? (safeHour + 1) % 24 : safeHour;
	return carriedHour * 4 + slot;
}

function updateSaveButtonState(
	saveButton: IButton | undefined,
	state: IFormState,
	validation: IValidationState,
	form: HTMLElement,
	getPrompt: () => string,
): void {
	validation.nameError = state.name.trim() === ''
		? localize('automation.form.nameRequired', "Name is required.")
		: undefined;
	validation.promptError = getPrompt().trim() === ''
		? localize('automation.form.promptRequired', "Prompt is required.")
		: undefined;
	validation.folderError = !state.folderUri
		? localize('automation.form.folderRequired', "Workspace folder is required.")
		: undefined;

	const valid = !validation.nameError && !validation.promptError && !validation.folderError;
	if (saveButton) {
		saveButton.enabled = valid;
	}
	form.classList.toggle('automation-form-invalid', !valid);
}

/**
 * Workspace picker for the automation dialog. Subclasses
 * {@link WorkspacePicker} to:
 *
 * - Disable the categorical tab bar (`Local` / `GitHub` / `Remote`) — the
 *   dialog is local-only.
 * - Filter the browse-action list to only the local `Select...` entry.
 *   Without this override, providers contribute their own browse actions
 *   (`Select GitHub repo...`, remote agent-host picks, etc.) and they
 *   all appear in the flat dropdown — leading to a second, confusing
 *   `Select...` row.
 *
 * All other behavior (recents storage, keyboard handling, chip styling
 * hook) is inherited verbatim from the base picker.
 */
class AutomationsWorkspacePicker extends WorkspacePicker {
	protected override _showTabs(): boolean {
		return false;
	}

	protected override _getAllBrowseActions(): ISessionWorkspaceBrowseAction[] {
		return super._getAllBrowseActions().filter(a => a.group === SESSION_WORKSPACE_GROUP_LOCAL);
	}
}
