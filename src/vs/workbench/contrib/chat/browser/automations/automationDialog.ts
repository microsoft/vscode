/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IButton } from '../../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { ISelectOptionItem, SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles, defaultSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { hasNativeContextMenu } from '../../../../../platform/window/common/window.js';
// eslint-disable-next-line local/code-import-patterns
import { WorkspacePicker } from '../../../../../sessions/contrib/chat/browser/sessionWorkspacePicker.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_LOCAL } from '../../../../../sessions/services/sessions/common/session.js';
import { createWorkbenchDialogOptions } from '../../../../browser/parts/dialogs/dialog.js';
import { IGitService } from '../../../git/common/gitService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { AutomationInterval, IAutomation, IAutomationSchedule } from '../../common/automations/automation.js';
import { ICreateAutomationOptions, IUpdateAutomationOptions } from '../../common/automations/automationService.js';
import { IAutomationSessionTypeChoice, IAutomationSessionTypeProvider } from '../../common/automations/automationSessionTypes.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
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
		? localize('automation.dialog.editTitle', "Edit automation")
		: localize('automation.dialog.createTitle', "New automation");

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

				// Mirror the QuickInput chrome (see `Add Task` →
				// `Create New Task`): a solid-stripe titlebar at the top,
				// a small description paragraph below it, then the form
				// pane. The visual "line" between titlebar and body is
				// the background contrast between
				// `quickInputTitle.background` and `quickInput.background`
				// — no `border-bottom`. Aria-hidden because Dialog's own
				// title (in `.dialog-message-text`) is what
				// `aria-labelledby="monaco-dialog-message-text"` points
				// at; this element is decorative.
				const titlebar = DOM.append(container, $('.automation-titlebar'));
				titlebar.setAttribute('aria-hidden', 'true');
				titlebar.textContent = title;

				const description = DOM.append(container, $('.automation-description'));
				description.textContent = isEdit
					? localize('automation.dialog.editDescription', "Update the schedule, prompt, or run target for this automation.")
					: localize('automation.dialog.createDescription', "Define a prompt that Copilot will run on a schedule against the selected folder.");

				const formPane = DOM.append(container, $('.automation-form-pane'));
				const form = DOM.append(formPane, $('.automation-form'));
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
		setFolder: (folder: URI | undefined) => {
			validateOrDefault(folder);
			if (state.sessionTypeId) {
				// Notify the chat input so pickers gated on session type
				// (mode, model, options) re-evaluate against the new
				// folder's resolved session type.
				onDidChange.fire(state.sessionTypeId as AgentSessionTarget);
			}
		},
		// Scope the session-type dropdown to (a) the two providers the
		// dialog supports at all today — Local and Copilot CLI
		// (`Background`) — *and* (b) what the currently-selected folder
		// actually offers. The intersection means picking a folder that
		// doesn't expose Copilot CLI hides that row, mirroring the
		// new-session view's behavior.
		//
		// `_isVisible` is called fresh every time the picker dropdown
		// opens (inside `SessionTypePickerActionItem.actionProvider.getActions`),
		// so reading `state.folderUri` here is enough to track folder
		// changes — no extra event plumbing required. When the current
		// selection itself becomes invalid for a new folder,
		// `setFolder` -> `validateOrDefault` already swaps `state.sessionTypeId`
		// and fires `onDidChangeActiveSessionProvider`, which makes the
		// chat input refresh the picker's trigger label.
		isSessionTypeVisible: (type: AgentSessionTarget) => {
			if (type !== AgentSessionProviders.Local && type !== AgentSessionProviders.Background) {
				return false;
			}
			if (!state.folderUri) {
				// No folder selected yet — show the dialog-level
				// allow-list so the user sees the same options the
				// scheduler will eventually permit.
				return true;
			}
			const available = sessionTypeProvider.getSessionTypesForFolder(state.folderUri);
			return available.some(c => c.sessionTypeId === type);
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
	DOM.append(nameRow, $('span.automation-form-label', undefined, localize('automation.form.name', "Name")));
	const nameInputContainer = DOM.append(nameRow, $('.automation-form-input-host'));
	const nameInput = disposables.add(new InputBox(nameInputContainer, contextViewService, {
		inputBoxStyles: defaultInputBoxStyles,
		placeholder: localize('automation.form.namePlaceholder', "e.g. Morning standup notes"),
		ariaLabel: localize('automation.form.name', "Name"),
	}));
	nameInput.value = state.name;
	disposables.add(nameInput.onDidChange(value => {
		state.name = value;
		revalidate();
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

	// --- Folder selection (no form row) ---
	// The folder is selected via the workspace picker chip in the chat
	// input's primary toolbar (between Mode and Model), so there's no
	// dedicated form row above the prompt. Hosting the picker instance
	// here is still required: `chatInputOptions` (built below) needs a
	// reference to pass through `workspacePickerInput`, and the
	// isolation+branch group below subscribes to `onDidSelectWorkspace`.
	//
	// The picker is not `render()`-ed into any container — only
	// `WorkspacePickerInputActionItem` calls `renderTrigger()` on it
	// (additive multi-trigger API on the shared {@link WorkspacePicker}).
	//
	// Subclassing {@link WorkspacePicker} (as `AutomationsWorkspacePicker`)
	// disables the categorical tab bar (`Local` / `GitHub` / `Remote`)
	// since the dialog is local-only; the picker otherwise inherits the
	// recents list, per-tab browse actions (including `Select...`),
	// keyboard handling, and trigger label updates.
	//
	// `sessionTypeBinder` is created here because the picker's
	// `onDidSelectWorkspace` listener calls `sessionTypeBinder.setFolder`
	// and because `chatInputOptions` (built below) reads it.
	const sessionTypeBinder = createSessionTypeBinder(state, sessionTypeProvider, disposables);

	const workspacePicker = disposables.add(instantiationService.createInstance(AutomationsWorkspacePicker));

	// Push the dialog's initial folder into the picker without firing
	// `onDidSelectWorkspace` (we don't want our listener to revalidate
	// before the form is even mounted, and we don't want to overwrite
	// `state.folderUri` with itself).
	if (state.folderUri) {
		workspacePicker.setSelectedWorkspace(state.folderUri, { fireEvent: false });
	}

	// No inline "required" errors are surfaced in the form. The Save
	// button being disabled is the signal for every required field —
	// name, prompt, and workspace. Inline messages flashed annoyingly
	// as the user typed and deleted, and the reserved spacer they
	// occupied (always-on `min-height` to avoid a layout shift on
	// validity flip) ate ~15px of vertical space below the chat input
	// even when no error was visible.

	// React to user picks. The picker emits `undefined` on clear; treat
	// that as "no folder selected" so validation re-fires.
	disposables.add(workspacePicker.onDidSelectWorkspace(uri => {
		state.folderUri = uri;
		sessionTypeBinder.setFolder(uri);
		revalidate();
	}));

	// If the dialog opened with no folder yet but the picker resolved one
	// (e.g. the last folder the user picked in a chat session), adopt it
	// so the user can save without an extra click.
	if (!state.folderUri && workspacePicker.selectedFolderUri) {
		state.folderUri = workspacePicker.selectedFolderUri;
		sessionTypeBinder.setFolder(state.folderUri);
	}

	// --- Isolation + branch (read-only preview) ---
	// Visual mirror of the new-session view's bottom-right indicator: a
	// disabled `folder` chip + `branch` text. Tells the user
	// *where* the automation will run (folder, on whatever branch is
	// checked out at run time) without claiming to be configurable.
	//
	// Worktree isolation isn't supported for scheduled automations today
	// — the shared {@link IsolationPicker} / {@link BranchPicker} from
	// the sessions layer bind to a *live* {@link ICopilotChatSession},
	// which doesn't exist for an unstarted schedule. Persisting the
	// choice + teaching the runner to honor it is a separate slice.
	//
	// Built here as detached DOM and parented into the chat input's
	// `.chat-secondary-toolbar` after `chatInput.render()` runs, so the
	// chips share a row with `Copilot CLI | Default Approvals` and sit
	// at the bottom-right of the chat input — matching the new-session
	// view's layout.
	//
	// Branch is read live from {@link IGitService}; the label updates if
	// HEAD moves while the dialog is open. Neither value is persisted.
	const isolationGroup = $('span.automation-form-isolation-group');
	const folderChip = DOM.append(isolationGroup, $('span.automation-form-isolation-chip.automation-form-isolation-chip-disabled')) as HTMLSpanElement;
	folderChip.setAttribute('role', 'img');
	folderChip.setAttribute('aria-label', localize('automation.form.isolation.folderAria', "Isolation: Folder (Worktree not supported for scheduled automations)"));
	folderChip.title = localize('automation.form.isolation.folderTitle', "Scheduled automations run in the workspace folder. Worktree isolation is not yet supported.");
	DOM.append(folderChip, renderIcon(Codicon.folder));
	DOM.append(folderChip, $('span.automation-form-isolation-label', undefined, localize('automation.form.isolation.folder', "Folder")));

	const branchSlot = DOM.append(isolationGroup, $('span.automation-form-branch-slot')) as HTMLSpanElement;
	branchSlot.setAttribute('aria-live', 'polite');

	const gitService = instantiationService.invokeFunction(accessor => accessor.get(IGitService));
	const branchRepoDisposable = disposables.add(new MutableDisposable());
	const renderBranchLabel = (text: string, isMissing: boolean) => {
		DOM.clearNode(branchSlot);
		branchSlot.classList.toggle('automation-form-branch-missing', isMissing);
		DOM.append(branchSlot, renderIcon(Codicon.gitBranch));
		DOM.append(branchSlot, $('span.automation-form-branch-name', undefined, text));
	};
	renderBranchLabel(localize('automation.form.branch.unknown', "—"), true);

	const updateBranchForFolder = async (folder: URI | undefined) => {
		branchRepoDisposable.clear();
		if (!folder) {
			renderBranchLabel(localize('automation.form.branch.noFolder', "—"), true);
			return;
		}
		const repo = await gitService.openRepository(folder);
		if (!repo) {
			renderBranchLabel(localize('automation.form.branch.noRepo', "no git repo"), true);
			return;
		}
		// Observable: re-render whenever HEAD moves (e.g. user checks
		// out a different branch in the workbench between save and
		// reopen).
		const watcher = new DisposableStore();
		watcher.add(autorun(reader => {
			const head = repo.state.read(reader).HEAD;
			const name = head?.name;
			if (name) {
				renderBranchLabel(name, false);
			} else if (head?.commit) {
				renderBranchLabel(localize('automation.form.branch.detached', "({0})", head.commit.slice(0, 7)), false);
			} else {
				renderBranchLabel(localize('automation.form.branch.noBranch', "—"), true);
			}
		}));
		branchRepoDisposable.value = watcher;
	};
	updateBranchForFolder(state.folderUri);

	// Refresh branch whenever the workspace picker emits.
	disposables.add(workspacePicker.onDidSelectWorkspace(uri => {
		updateBranchForFolder(uri);
	}));

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
		// Custom-agent discovery walks the workbench's open folders, not
		// the dialog's selected folder — surfacing them here would
		// mislead the user about which agents are actually available at
		// the scheduled folder. Hide them; built-in modes (Agent / Ask /
		// Edit / Plan) are always shown.
		hideCustomChatModes: true,
		// Mode-declared preferred models (e.g. extension modes that pin
		// a specific model) would re-fire after our reset and overwrite
		// the default (auto) we set. Also gates the storage-write side
		// effect on the shared chat.currentLanguageModel.{location} key.
		suppressModePreferredModel: true,
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
		// Mirror the form-row folder picker into the primary chat input
		// toolbar (between Mode and Model) as a chip. Same underlying
		// {@link WorkspacePicker} instance; the chip's trigger is a second
		// render via {@link WorkspacePicker.renderTrigger}, so selection
		// state, recents, and label updates stay single-sourced.
		workspacePickerInput: workspacePicker,
		// The dialog has no live chat session — its stub widget reports
		// `viewModel: undefined`. Unrelated workbench activity (another
		// chat session completing a turn, focus shifting between editors)
		// fires `onDidActiveEditorChange`, which would otherwise cause
		// `refreshChatSessionPickers` to run against a session-less state
		// and hide the dialog's mode / workspace / model pickers mid-edit.
		respondsToGlobalEditorChanges: false,
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
	// Gate the toolbar workspace picker chip's menu contribution: the
	// `OpenAutomationsWorkspacePickerAction`'s `when` clause checks this
	// key so the chip only renders inside this dialog.
	ChatContextKeys.inAutomationsDialog.bindTo(scopedContextKeyService).set(true);
	const scopedInstantiationService = disposables.add(
		instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))
	);

	const chatInput = disposables.add(
		scopedInstantiationService.createInstance(ChatInputPart, ChatAgentLocation.Chat, chatInputOptions, chatInputStyles, false),
	);
	chatInput.render(promptHost, initialPrompt, stubWidget);

	// Parent the isolation + branch group into the chat input's
	// `.chat-secondary-toolbar` so it shares a row with `Copilot CLI |
	// Default Approvals` and lands at the bottom-right of the chat
	// input — same position as the new-session view's indicator.
	// `.chat-secondary-toolbar` is a stable DOM element created by
	// `ChatInputPart`'s template (see `dom.h('.chat-secondary-toolbar@secondaryToolbar', ...)`
	// in `chatInputPart.ts`). It's not refreshed by `MenuWorkbenchToolBar`
	// — only the action items inside it are — so appending a sibling
	// element is safe across toolbar updates.
	// eslint-disable-next-line no-restricted-syntax
	const secondaryToolbar = promptHost.querySelector('.chat-secondary-toolbar');
	if (secondaryToolbar) {
		secondaryToolbar.appendChild(isolationGroup);
	}

	// Pre-seed mode and permission level for edit-mode dialogs so the
	// pickers reflect what was previously captured. For create-mode the
	// pickers show their built-in defaults. We validate the stored
	// permission level against the current enum so a renamed/removed
	// legacy value falls back to the picker default instead of being
	// silently round-tripped to disk.
	if (initialMode) {
		chatInput.setChatMode(initialMode, /* storeSelection */ false);
		// {@link ChatInputPart.setChatMode} silently falls back to the
		// default Agent mode when `findModeById(initialMode)` and
		// `findModeByName(initialMode)` both miss. That happens on
		// extension cold-start for any mode contributed by an extension
		// (e.g. 'plan' from copilot-chat, or any custom agent). Mirror
		// the late-arriving model handling below: when the mode set
		// updates, retry our pre-seed and dispose the listener on the
		// first successful apply so we never fight a later user pick.
		if (chatInput.currentModeObs.get().id !== initialMode) {
			const retry = disposables.add(new MutableDisposable<IDisposable>());
			const tryApply = () => {
				const modes = chatInput.currentChatModesObs.get();
				if (modes.findModeById(initialMode) || modes.findModeByName(initialMode)) {
					chatInput.setChatMode(initialMode, /* storeSelection */ false);
					if (chatInput.currentModeObs.get().id === initialMode) {
						retry.clear();
					}
				}
			};
			retry.value = autorun(reader => {
				const modes = chatInput.currentChatModesObs.read(reader);
				// Track both the outer observable (full set swap) and
				// each IChatModes instance's own onDidChange (individual
				// mode contributions arriving on the same set).
				reader.store.add(modes.onDidChange(tryApply));
				tryApply();
			});
		}
	}
	if (initialPermissionLevel && isChatPermissionLevel(initialPermissionLevel)) {
		chatInput.setPermissionLevel(initialPermissionLevel);
	}
	// --- Pre-seed the language model ---
	//
	// The dialog has its own opinion about the initial model:
	//   * Create: always "auto" (the location's default), regardless of
	//     what the user last picked in regular chat.
	//   * Edit: the model the automation was saved with — falling back to
	//     "auto" if that model can't be resolved (e.g. extension was
	//     uninstalled since the automation was created).
	//
	// `ChatInputPart`'s constructor already ran `initSelectedModel`, which
	// restored the workbench-global "last used" selection from APPLICATION
	// storage and (in the cold-start case) armed `_waitForPersistedLanguageModel`
	// to apply that same workbench-global id on the first registry change.
	// We need to override both: snap to default now, tear down the waiter
	// so it can't stomp us later. `resetLanguageModelToDefault(false)` does
	// both without persisting the reset back to the regular chat input's key.
	chatInput.resetLanguageModelToDefault(/* storeSelection */ false);

	// On edit, try to apply the saved model on top of the default. The
	// `false` second arg keeps the apply dialog-local — we must not
	// overwrite the user's regular-chat selection just because they opened
	// an automation.
	//
	// If the registry hasn't loaded the model yet (extension cold start),
	// retry on each registry change. The retry self-clears once the model
	// applies, and also bails if the user has manually picked something
	// else in the meantime (so a late-arriving model doesn't override a
	// deliberate user choice). A model that never arrives just leaves the
	// picker on the default — which is exactly the desired fallback.
	if (initialModelId && !chatInput.switchModelByIdentifier(initialModelId, /* storeSelection */ false)) {
		const languageModelsService = instantiationService.invokeFunction(accessor => accessor.get(ILanguageModelsService));
		const baseline = chatInput.selectedLanguageModel.get()?.identifier;
		const retry = disposables.add(new MutableDisposable<IDisposable>());
		retry.value = languageModelsService.onDidChangeLanguageModels(() => {
			if (chatInput.selectedLanguageModel.get()?.identifier !== baseline) {
				// User picked away from the default while we were waiting.
				// Don't fight them.
				retry.clear();
				return;
			}
			if (chatInput.switchModelByIdentifier(initialModelId, /* storeSelection */ false)) {
				retry.clear();
			}
		});
	}

	// The editor itself is the source of truth for the prompt value; we
	// only listen here to re-run validation so the Save button enables
	// the moment the prompt becomes non-empty. The final value is read
	// once at Save time via {@link IRenderFormHandle.getPrompt}.
	disposables.add(chatInput.inputEditor.onDidChangeModelContent(() => {
		revalidate();
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
	const enabledLabelText = localize('automation.form.enabled', "Enabled (the scheduler runs this automation when due)");
	const enabledCheckbox = disposables.add(new Checkbox(enabledLabelText, state.enabled, defaultCheckboxStyles));
	DOM.append(enabledRow, enabledCheckbox.domNode);
	const enabledLabel = DOM.append(enabledRow, $('span.automation-form-checkbox-label', undefined, enabledLabelText));
	// `Checkbox.checked = ...` does NOT fire `onChange`; centralise state
	// writes through this helper so the click handler on the sibling
	// label stays in sync with both the checkbox and `state.enabled`.
	const setEnabled = (value: boolean) => {
		if (enabledCheckbox.checked !== value) {
			enabledCheckbox.checked = value;
		}
		state.enabled = value;
	};
	disposables.add(enabledCheckbox.onChange(() => {
		state.enabled = enabledCheckbox.checked;
	}));
	disposables.add(DOM.addStandardDisposableListener(enabledLabel, 'click', () => {
		setEnabled(!enabledCheckbox.checked);
	}));

	return {
		getPrompt: () => chatInput.inputEditor.getValue(),
		// Capture the mode's stable `id` (e.g. 'agent', 'ask', 'plan',
		// or any extension-contributed mode id) rather than `kind`,
		// which is a 3-value enum (`ask` | `edit` | `agent`) that
		// collapses every extension-contributed mode into 'agent'.
		//
		// We also deliberately avoid `currentModeKind`, which rewrites
		// Agent -> Edit whenever the tools agent isn't currently
		// registered; that environmental concern is the runner's
		// responsibility at execution time, not capture time.
		//
		// Always reading from the picker (rather than gating on whether
		// the user "changed" it from a baseline) is what makes a
		// create-mode save honour the picker's default — previously a
		// same-as-default click was saved as `null` and the runner
		// silently fell back to the provider's default at run time.
		// Edit-mode round-trips still preserve the previously stored
		// value because we pre-seed the picker with `initialMode`
		// above, so an untouched picker still reads back that value.
		getMode: () => chatInput.currentModeObs.get().id,
		getPermissionLevel: () => chatInput.currentPermissionLevelObs.get(),
		// Read the picker's current value at Save time, same as mode and
		// permission. Edit-mode round-trips still preserve the previously
		// stored value because the pre-seed (and its late-arrival re-apply
		// listener) above settles the picker on `initialModelId`, so an
		// untouched picker reads back that value.
		getModelId: () => chatInput.selectedLanguageModel.get()?.identifier,
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

// Override the Enter keybinding inside the automations dialog's prompt
// editor so it inserts a newline instead of triggering `ChatSubmitAction`.
// `ChatSubmitAction` registers Enter at `KeybindingWeight.EditorContrib`
// gated by `ChatContextKeys.inChatInput`. The dialog also sets
// `inChatInput`+`location:Chat` on its scoped context-key service so the
// embedded `ChatInputPart` renders mode/model/session pickers correctly
// (see gotcha #8), which means the submit binding would otherwise fire
// even though we render no Send button (`executeToolbar:
// MenuId.AutomationsDialogInput`, an empty menu) and the prompt is
// authored, not sent. Higher weight + `inAutomationsDialog` makes this
// rule win only inside the dialog; the regular chat composer keeps
// Enter = submit. The handler calls the default Monaco `type` command
// with `\n`, matching what Shift+Enter does in the regular composer.
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.action.chat.automationsDialog.insertNewline',
	weight: KeybindingWeight.EditorContrib + 100,
	when: ContextKeyExpr.and(
		EditorContextKeys.textInputFocus,
		ChatContextKeys.inAutomationsDialog,
	),
	primary: KeyCode.Enter,
	handler: (accessor) => {
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		editor?.trigger('keyboard', 'type', { text: '\n' });
	},
});
