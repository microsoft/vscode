/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { IButton } from '../../../../../base/browser/ui/button/button.js';
import { Dialog } from '../../../../../base/browser/ui/dialog/dialog.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { createWorkbenchDialogOptions } from '../../../../browser/parts/dialogs/dialog.js';
import { AutomationInterval, IAutomation, IAutomationSchedule } from '../../common/automations/automation.js';
import { ICreateAutomationOptions, IUpdateAutomationOptions } from '../../common/automations/automationService.js';
import { IAutomationSessionTypeChoice, IAutomationSessionTypeProvider } from '../../common/automations/automationSessionTypes.js';
import { ChatModeKind, ChatPermissionLevel } from '../../common/constants.js';

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

export interface IFolderChoice {
	readonly uri: URI;
	readonly label: string;
}

export interface IShowAutomationDialogOptions {
	/** Folders the user may pick from for the new session's workspace. */
	readonly folders: readonly IFolderChoice[];
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
	keybindingService: IKeybindingService,
	layoutService: ILayoutService,
	hostService: IHostService,
	fileDialogService: IFileDialogService,
	sessionTypeProvider: IAutomationSessionTypeProvider,
	options: IShowAutomationDialogOptions,
): Promise<IAutomationDialogResult | undefined> {
	const disposables = new DisposableStore();

	const initial = options.existing;
	const isEdit = !!initial;

	const initialFolder = initial?.folderUri
		?? options.folders.find(f => f.uri.toString() === initial?.folderUri?.toString())?.uri
		?? options.folders[0]?.uri;

	const state: IFormState = {
		name: initial?.name ?? '',
		prompt: initial?.prompt ?? '',
		interval: initial?.schedule.interval ?? 'daily',
		hour: initial?.schedule.scheduleHour ?? 9,
		minute: initial?.schedule.scheduleMinute ?? 0,
		day: initial?.schedule.scheduleDay ?? 1,
		folderUri: initialFolder,
		providerId: initial?.providerId,
		sessionTypeId: initial?.sessionTypeId,
		modelId: initial?.modelId,
		mode: initial?.mode,
		permissionLevel: initial?.permissionLevel,
		enabled: initial?.enabled ?? true,
	};

	const validation: IValidationState = { nameError: undefined, promptError: undefined, folderError: undefined };

	let saveButton: IButton | undefined;
	let revalidate: () => void = () => { /* assigned below */ };

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
				renderForm(form, state, options, disposables, validation, () => revalidate(), fileDialogService, sessionTypeProvider);
				revalidate = () => updateSaveButtonState(saveButton, state, validation, form);
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

		if (isEdit && initial) {
			const patch: IUpdateAutomationOptions = {
				name: state.name,
				prompt: state.prompt,
				schedule,
				folderUri: state.folderUri,
				providerId: state.providerId ?? null,
				sessionTypeId: state.sessionTypeId ?? null,
				modelId: state.modelId ?? null,
				mode: state.mode ?? null,
				permissionLevel: state.permissionLevel ?? null,
				enabled: state.enabled,
			};
			return { kind: 'update', id: initial.id, value: patch };
		}

		const create: ICreateAutomationOptions = {
			name: state.name,
			prompt: state.prompt,
			schedule,
			folderUri: state.folderUri,
			providerId: state.providerId,
			sessionTypeId: state.sessionTypeId,
			modelId: state.modelId,
			mode: state.mode,
			permissionLevel: state.permissionLevel,
			enabled: state.enabled,
		};
		return { kind: 'create', value: create };
	} finally {
		disposables.dispose();
	}
}

interface IFormState {
	name: string;
	prompt: string;
	interval: AutomationInterval;
	hour: number;
	minute: number;
	day: number;
	folderUri: URI | undefined;
	providerId: string | undefined;
	sessionTypeId: string | undefined;
	modelId: string | undefined;
	mode: string | undefined;
	permissionLevel: string | undefined;
	enabled: boolean;
}

interface IValidationState {
	nameError: string | undefined;
	promptError: string | undefined;
	folderError: string | undefined;
}

function renderForm(
	form: HTMLElement,
	state: IFormState,
	options: IShowAutomationDialogOptions,
	disposables: DisposableStore,
	validation: IValidationState,
	revalidate: () => void,
	fileDialogService: IFileDialogService,
	sessionTypeProvider: IAutomationSessionTypeProvider,
): void {
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

	// --- Prompt ---
	const promptRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(promptRow, $('label.automation-form-label', { for: 'automation-prompt' }, localize('automation.form.prompt', "Prompt")));
	const promptInput = DOM.append(promptRow, $('textarea.automation-form-textarea', { id: 'automation-prompt', rows: '4' })) as HTMLTextAreaElement;
	promptInput.value = state.prompt;
	const promptError = DOM.append(promptRow, $('.automation-form-error'));
	disposables.add(DOM.addStandardDisposableListener(promptInput, 'input', () => {
		state.prompt = promptInput.value;
		revalidate();
		promptError.textContent = validation.promptError ?? '';
	}));

	// --- Interval ---
	const intervalRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(intervalRow, $('label.automation-form-label', { for: 'automation-interval' }, localize('automation.form.interval', "Schedule")));
	const intervalSelect = DOM.append(intervalRow, $('select.automation-form-select', { id: 'automation-interval' })) as HTMLSelectElement;
	for (const item of INTERVALS) {
		const optEl = DOM.append(intervalSelect, $('option', { value: item.value }, item.label)) as HTMLOptionElement;
		if (item.value === state.interval) {
			optEl.selected = true;
		}
	}

	// --- Time row (hour/minute, conditional) ---
	const timeRow = DOM.append(form, $('.automation-form-row.automation-form-time-row'));
	DOM.append(timeRow, $('label.automation-form-label', undefined, localize('automation.form.time', "Time")));
	const timeFields = DOM.append(timeRow, $('.automation-form-time-fields'));
	const hourInput = DOM.append(timeFields, $('input.automation-form-input.automation-form-time-input', { type: 'number', min: '0', max: '23', value: String(state.hour), 'aria-label': localize('automation.form.hour', "Hour (0 to 23)") })) as HTMLInputElement;
	DOM.append(timeFields, $('span.automation-form-time-sep', undefined, ':'));
	const minuteInput = DOM.append(timeFields, $('input.automation-form-input.automation-form-time-input', { type: 'number', min: '0', max: '59', value: String(state.minute), 'aria-label': localize('automation.form.minute', "Minute (0 to 59)") })) as HTMLInputElement;
	disposables.add(DOM.addStandardDisposableListener(hourInput, 'input', () => {
		state.hour = clampInt(hourInput.value, 0, 23, state.hour);
	}));
	disposables.add(DOM.addStandardDisposableListener(minuteInput, 'input', () => {
		state.minute = clampInt(minuteInput.value, 0, 59, state.minute);
	}));

	// --- Day-of-week (weekly only) ---
	const dayRow = DOM.append(form, $('.automation-form-row.automation-form-day-row'));
	DOM.append(dayRow, $('label.automation-form-label', { for: 'automation-day' }, localize('automation.form.day', "Day of week")));
	const daySelect = DOM.append(dayRow, $('select.automation-form-select', { id: 'automation-day' })) as HTMLSelectElement;
	for (let i = 0; i < DAYS_OF_WEEK.length; i++) {
		const opt = DOM.append(daySelect, $('option', { value: String(i) }, DAYS_OF_WEEK[i])) as HTMLOptionElement;
		if (i === state.day) {
			opt.selected = true;
		}
	}
	disposables.add(DOM.addStandardDisposableListener(daySelect, 'change', () => {
		state.day = clampInt(daySelect.value, 0, 6, state.day);
	}));

	const applyIntervalVisibility = () => {
		const showTime = state.interval === 'daily' || state.interval === 'weekly';
		const showDay = state.interval === 'weekly';
		timeRow.style.display = showTime ? '' : 'none';
		dayRow.style.display = showDay ? '' : 'none';
	};
	applyIntervalVisibility();
	disposables.add(DOM.addStandardDisposableListener(intervalSelect, 'change', () => {
		state.interval = (intervalSelect.value as AutomationInterval);
		applyIntervalVisibility();
	}));

	// --- Folder (required) ---
	// Always rendered: a dropdown of currently-open workspace folders
	// plus a Browse button that opens an OS folder picker so the user
	// can target any folder, even when no workspace is open.
	const folderRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(folderRow, $('label.automation-form-label', { for: 'automation-folder' }, localize('automation.form.folder', "Workspace folder")));
	const folderControls = DOM.append(folderRow, $('.automation-form-folder-controls'));
	const folderSelect = DOM.append(folderControls, $('select.automation-form-select', { id: 'automation-folder' })) as HTMLSelectElement;
	const browseButton = DOM.append(folderControls, $('button.automation-form-folder-browse', { type: 'button' }, localize('automation.form.browse', "Browse…"))) as HTMLButtonElement;
	const folderError = DOM.append(folderRow, $('.automation-form-error'));

	// Track folders added at runtime via Browse so we can keep them in
	// the dropdown after re-population.
	const browsedFolders: URI[] = [];

	const populateFolderSelect = () => {
		DOM.clearNode(folderSelect);
		// Sentinel option shown when there is nothing to pick yet.
		if (options.folders.length === 0 && browsedFolders.length === 0 && !state.folderUri) {
			const optEl = DOM.append(folderSelect, $('option', { value: '', disabled: 'true', selected: 'true' }, localize('automation.form.folderPlaceholder', "Browse… to choose a folder"))) as HTMLOptionElement;
			optEl.value = '';
			return;
		}
		const seen = new Set<string>();
		const addOption = (uri: URI, label: string) => {
			const key = uri.toString();
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			const optEl = DOM.append(folderSelect, $('option', { value: key }, label)) as HTMLOptionElement;
			if (state.folderUri && state.folderUri.toString() === key) {
				optEl.selected = true;
			}
		};
		for (const folder of options.folders) {
			addOption(folder.uri, folder.label);
		}
		for (const uri of browsedFolders) {
			addOption(uri, basenameOrUri(uri));
		}
		// If the stored folder is not in either list (e.g. editing an
		// automation whose folder is not currently open and was not
		// just browsed), add it as a fallback so the user sees what is
		// stored and can replace it.
		if (state.folderUri && !seen.has(state.folderUri.toString())) {
			const stored = state.folderUri;
			const optEl = DOM.append(folderSelect, $('option', { value: stored.toString() }, localize('automation.form.folderNotOpen', "{0} (folder not currently open)", basenameOrUri(stored)))) as HTMLOptionElement;
			optEl.selected = true;
		} else if (!state.folderUri && (options.folders.length > 0 || browsedFolders.length > 0)) {
			// Default to the first available folder.
			state.folderUri = options.folders[0]?.uri ?? browsedFolders[0];
			folderSelect.value = state.folderUri.toString();
		}
	};
	populateFolderSelect();

	disposables.add(DOM.addStandardDisposableListener(folderSelect, 'change', () => {
		if (!folderSelect.value) {
			state.folderUri = undefined;
		} else {
			state.folderUri = URI.parse(folderSelect.value);
		}
		revalidate();
		folderError.textContent = validation.folderError ?? '';
		refreshSessionTypeSelect();
	}));

	disposables.add(DOM.addStandardDisposableListener(browseButton, 'click', async () => {
		const picked = await fileDialogService.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			title: localize('automation.form.browseTitle', "Select Workspace Folder"),
			defaultUri: state.folderUri,
		});
		if (!picked || picked.length === 0) {
			return;
		}
		const pickedUri = picked[0];
		if (!browsedFolders.some(u => u.toString() === pickedUri.toString())) {
			browsedFolders.push(pickedUri);
		}
		state.folderUri = pickedUri;
		populateFolderSelect();
		folderSelect.value = pickedUri.toString();
		revalidate();
		folderError.textContent = validation.folderError ?? '';
		refreshSessionTypeSelect();
	}));

	// --- Session type (recomputed when folder changes) ---
	// Captures `providerId` + `sessionTypeId` so scheduled runs spin up the
	// same kind of session every time (e.g. always Copilot CLI on a given
	// remote host), regardless of which provider happens to be the
	// workspace default when the run fires. Hidden when no folder is
	// selected yet or when the active providers cannot serve the folder.
	const sessionTypeRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(sessionTypeRow, $('label.automation-form-label', { for: 'automation-session-type' }, localize('automation.form.sessionType', "Session type")));
	const sessionTypeSelect = DOM.append(sessionTypeRow, $('select.automation-form-select', { id: 'automation-session-type' })) as HTMLSelectElement;

	let availableSessionTypes: readonly IAutomationSessionTypeChoice[] = [];

	const sessionTypeKey = (choice: { providerId: string; sessionTypeId: string }): string => `${choice.providerId}|${choice.sessionTypeId}`;

	const refreshSessionTypeSelect = () => {
		DOM.clearNode(sessionTypeSelect);
		availableSessionTypes = state.folderUri ? sessionTypeProvider.getSessionTypesForFolder(state.folderUri) : [];
		if (availableSessionTypes.length === 0) {
			sessionTypeRow.style.display = 'none';
			// When no session types are known, fall back to whatever the
			// workspace default ends up being at run time.
			state.providerId = undefined;
			state.sessionTypeId = undefined;
			return;
		}
		sessionTypeRow.style.display = '';
		const currentKey = state.providerId && state.sessionTypeId
			? sessionTypeKey({ providerId: state.providerId, sessionTypeId: state.sessionTypeId })
			: undefined;
		let selectedKey: string | undefined;
		for (const choice of availableSessionTypes) {
			const key = sessionTypeKey(choice);
			const label = choice.description ? `${choice.label} — ${choice.description}` : choice.label;
			const optEl = DOM.append(sessionTypeSelect, $('option', { value: key }, label)) as HTMLOptionElement;
			if (key === currentKey) {
				optEl.selected = true;
				selectedKey = key;
			}
		}
		if (!selectedKey) {
			// Either nothing was previously selected, or the previous
			// pick is no longer valid for this folder. Drop down to the
			// first available choice so the runner always has an explicit
			// provider/sessionType pair to use.
			const first = availableSessionTypes[0];
			state.providerId = first.providerId;
			state.sessionTypeId = first.sessionTypeId;
			sessionTypeSelect.value = sessionTypeKey(first);
		}
	};

	disposables.add(DOM.addStandardDisposableListener(sessionTypeSelect, 'change', () => {
		// `split('|', 2)` would silently drop everything after the second
		// pipe, corrupting both providerId and sessionTypeId whenever
		// either contains a `|`. Provider IDs come from external services
		// and are opaque strings, so we split on the FIRST pipe only and
		// keep the remainder as the session-type id.
		const raw = sessionTypeSelect.value;
		const pipeIdx = raw.indexOf('|');
		if (pipeIdx === -1) {
			return;
		}
		const providerId = raw.slice(0, pipeIdx);
		const sessionTypeId = raw.slice(pipeIdx + 1);
		if (providerId && sessionTypeId) {
			state.providerId = providerId;
			state.sessionTypeId = sessionTypeId;
		}
	}));

	refreshSessionTypeSelect();

	// --- Chat mode (Agent / Ask / Edit) ---
	// Captures the chat mode the scheduled run should start in. The runner
	// passes the captured value through {@link ISessionsProvider.setMode}.
	// Providers that don't support setting a mode silently ignore it.
	const MODES: readonly { readonly value: string; readonly label: string; readonly description: string }[] = [
		{
			value: ChatModeKind.Agent,
			label: localize('automation.mode.agent', "Agent"),
			description: localize('automation.mode.agent.description', "Plans, edits and runs tools autonomously."),
		},
		{
			value: ChatModeKind.Ask,
			label: localize('automation.mode.ask', "Ask"),
			description: localize('automation.mode.ask.description', "Answers questions about your code without making changes."),
		},
		{
			value: ChatModeKind.Edit,
			label: localize('automation.mode.edit', "Edit"),
			description: localize('automation.mode.edit.description', "Applies focused edits across the files you reference."),
		},
	];
	const modeRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(modeRow, $('label.automation-form-label', { for: 'automation-mode' }, localize('automation.form.mode', "Agent Mode")));
	const modeSelect = DOM.append(modeRow, $('select.automation-form-select', { id: 'automation-mode' })) as HTMLSelectElement;
	DOM.append(modeSelect, $('option', { value: '' }, localize('automation.mode.default', "Use default")));
	for (const m of MODES) {
		const opt = DOM.append(modeSelect, $('option', { value: m.value }, m.label)) as HTMLOptionElement;
		if (state.mode === m.value) {
			opt.selected = true;
		}
	}
	if (!state.mode) {
		modeSelect.value = '';
	}
	const modeHint = DOM.append(modeRow, $('.automation-form-hint'));
	const updateModeHint = () => {
		const match = MODES.find(m => m.value === modeSelect.value);
		modeHint.textContent = match
			? match.description
			: localize('automation.mode.default.description', "Use the workspace's default chat mode.");
	};
	updateModeHint();
	disposables.add(DOM.addStandardDisposableListener(modeSelect, 'change', () => {
		state.mode = modeSelect.value || undefined;
		updateModeHint();
	}));

	// --- Permission level (Default / Bypass / Autopilot) ---
	// Captures how aggressively scheduled runs should auto-confirm tool
	// invocations. Mirrors the permission picker on the chat composer. The
	// runner passes the captured value through
	// {@link ISessionsProvider.setPermissionLevel}. Providers that don't
	// support permission gating silently ignore it. Labels and descriptions
	// match the composer's permission picker so users see the same
	// terminology in both places.
	const PERMISSIONS: readonly { readonly value: string; readonly label: string; readonly description: string }[] = [
		{
			value: ChatPermissionLevel.Default,
			label: localize('automation.permission.default', "Default Approvals"),
			description: localize('automation.permission.default.description', "Copilot uses your configured settings."),
		},
		{
			value: ChatPermissionLevel.AutoApprove,
			label: localize('automation.permission.autoApprove', "Bypass Approvals"),
			description: localize('automation.permission.autoApprove.description', "All tool calls are auto-approved."),
		},
		{
			value: ChatPermissionLevel.Autopilot,
			label: localize('automation.permission.autopilot', "Autopilot (Preview)"),
			description: localize('automation.permission.autopilot.description', "Autonomously iterates from start to finish."),
		},
	];
	const permRow = DOM.append(form, $('.automation-form-row'));
	DOM.append(permRow, $('label.automation-form-label', { for: 'automation-permission' }, localize('automation.form.permission', "Permission Mode")));
	const permSelect = DOM.append(permRow, $('select.automation-form-select', { id: 'automation-permission' })) as HTMLSelectElement;
	DOM.append(permSelect, $('option', { value: '' }, localize('automation.permission.useDefault', "Use default")));
	for (const p of PERMISSIONS) {
		const opt = DOM.append(permSelect, $('option', { value: p.value }, p.label)) as HTMLOptionElement;
		if (state.permissionLevel === p.value) {
			opt.selected = true;
		}
	}
	if (!state.permissionLevel) {
		permSelect.value = '';
	}
	const permHint = DOM.append(permRow, $('.automation-form-hint'));
	const updatePermHint = () => {
		const match = PERMISSIONS.find(p => p.value === permSelect.value);
		permHint.textContent = match
			? match.description
			: localize('automation.permission.useDefault.description', "Use the workspace's configured approval settings.");
	};
	updatePermHint();
	disposables.add(DOM.addStandardDisposableListener(permSelect, 'change', () => {
		state.permissionLevel = permSelect.value || undefined;
		updatePermHint();
	}));

	// --- Enabled checkbox ---
	const enabledRow = DOM.append(form, $('.automation-form-row.automation-form-checkbox-row'));
	const enabledCheckbox = DOM.append(enabledRow, $('input.automation-form-checkbox', { id: 'automation-enabled', type: 'checkbox' })) as HTMLInputElement;
	enabledCheckbox.checked = state.enabled;
	DOM.append(enabledRow, $('label.automation-form-checkbox-label', { for: 'automation-enabled' }, localize('automation.form.enabled', "Enabled (the scheduler runs this automation when due)")));
	disposables.add(DOM.addStandardDisposableListener(enabledCheckbox, 'change', () => {
		state.enabled = enabledCheckbox.checked;
	}));
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
	const n = Number.parseInt(raw, 10);
	if (Number.isNaN(n)) {
		return fallback;
	}
	return Math.max(min, Math.min(max, n));
}

function updateSaveButtonState(
	saveButton: IButton | undefined,
	state: IFormState,
	validation: IValidationState,
	form: HTMLElement,
): void {
	validation.nameError = state.name.trim() === ''
		? localize('automation.form.nameRequired', "Name is required.")
		: undefined;
	validation.promptError = state.prompt.trim() === ''
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

function basenameOrUri(uri: URI): string {
	const segments = uri.path.split('/').filter(s => s.length > 0);
	return segments[segments.length - 1] ?? uri.toString();
}
