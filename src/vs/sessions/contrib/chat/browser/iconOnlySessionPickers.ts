/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, ISettableObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { createConfigureKeybindingAction } from '../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID } from '../../../common/sessionCommands.js';
import { ENVIRONMENT_PICKER_ICON_ONLY_SETTING } from '../common/constants.js';
import { getSessionPickerId } from './sessionPickerToolbar.js';

/** Which new-session pickers the user collapsed to their icon (`true`) or expanded to show their label (`false`). */
const ICON_ONLY_PICKERS_STORAGE_KEY = 'agentSessions.newSession.iconOnlyPickers';

/** The environment picker's id, whose default presentation {@link ENVIRONMENT_PICKER_ICON_ONLY_SETTING} controls. */
export const ENVIRONMENT_PICKER_ID = FOCUS_NEW_SESSION_ENVIRONMENT_PICKER_COMMAND_ID;

/** Lets the user collapse individual pickers in the new-session options row to just their icon. */
export interface ISessionOptionsIconOnlyPickers {
	/** Ids of the pickers that show only their icon. */
	readonly iconOnlyPickerIds: IObservable<ReadonlySet<string>>;
	/** Resolves the stable id of the picker that `element` renders, if it can collapse to its icon. */
	getPickerId(element: HTMLElement): string | undefined;
	/** Shows the picker's context menu, which collapses it to its icon or shows its label again. */
	showContextMenu(pickerId: string, anchor: StandardMouseEvent): void;
}

function readStoredChoices(storageService: IStorageService): ReadonlyMap<string, boolean> {
	const choices = new Map<string, boolean>();
	const raw = storageService.get(ICON_ONLY_PICKERS_STORAGE_KEY, StorageScope.PROFILE);
	if (!raw) {
		return choices;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			for (const [id, iconOnly] of Object.entries(parsed)) {
				if (typeof iconOnly === 'boolean') {
					choices.set(id, iconOnly);
				}
			}
		}
	} catch {
		// Ignore malformed state and fall back to the defaults.
	}
	return choices;
}

/**
 * Remembers which new-session pickers are collapsed to their icon. A choice made from a picker's
 * context menu persists per profile and takes precedence over the experiment-controlled default
 * of the environment picker.
 */
export class IconOnlySessionPickers extends Disposable implements ISessionOptionsIconOnlyPickers {

	private readonly _choices: ISettableObservable<ReadonlyMap<string, boolean>>;
	private readonly _environmentPickerIconOnlyByDefault: IObservable<boolean>;
	readonly iconOnlyPickerIds: IObservable<ReadonlySet<string>>;

	constructor(
		/** Resolves pickers that are not hosted by a session picker toolbar, such as repository controls. */
		private readonly _resolvePickerId: (element: HTMLElement) => string | undefined,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this._choices = observableValue<ReadonlyMap<string, boolean>>(this, readStoredChoices(_storageService));
		this._register(_storageService.onDidChangeValue(StorageScope.PROFILE, ICON_ONLY_PICKERS_STORAGE_KEY, this._store)(() => {
			this._choices.set(readStoredChoices(_storageService), undefined);
		}));
		this._environmentPickerIconOnlyByDefault = observableFromEvent(
			this,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(ENVIRONMENT_PICKER_ICON_ONLY_SETTING)),
			() => configurationService.getValue<boolean>(ENVIRONMENT_PICKER_ICON_ONLY_SETTING) === true,
		);
		this.iconOnlyPickerIds = derived(this, reader => {
			const choices = this._choices.read(reader);
			const ids = new Set<string>();
			for (const [id, iconOnly] of choices) {
				if (iconOnly) {
					ids.add(id);
				}
			}
			if (!choices.has(ENVIRONMENT_PICKER_ID) && this._environmentPickerIconOnlyByDefault.read(reader)) {
				ids.add(ENVIRONMENT_PICKER_ID);
			}
			return ids;
		});
	}

	/** Whether the user chose how the picker is presented, so its default no longer applies. */
	hasChoice(pickerId: string, reader: IReader | undefined): boolean {
		return this._choices.read(reader).has(pickerId);
	}

	getPickerId(element: HTMLElement): string | undefined {
		return getSessionPickerId(element) ?? this._resolvePickerId(element);
	}

	setIconOnly(pickerId: string, iconOnly: boolean): void {
		const choices = new Map(this._choices.get());
		choices.set(pickerId, iconOnly);
		this._choices.set(choices, undefined);
		this._storageService.store(ICON_ONLY_PICKERS_STORAGE_KEY, JSON.stringify(Object.fromEntries(choices)), StorageScope.PROFILE, StorageTarget.USER);
	}

	showContextMenu(pickerId: string, anchor: StandardMouseEvent): void {
		const iconOnly = this.iconOnlyPickerIds.get().has(pickerId);
		const actions: IAction[] = [toAction({
			id: 'sessions.newSession.togglePickerIconOnly',
			label: localize('sessionPicker.collapseToIcon', "Collapse to Icon"),
			checked: iconOnly,
			run: () => this.setIconOnly(pickerId, !iconOnly),
		})];
		// Keep the keybinding entry the picker's own context menu offers.
		if (this._keybindingService.lookupKeybinding(pickerId)) {
			actions.push(new Separator(), createConfigureKeybindingAction(this._commandService, this._keybindingService, pickerId));
		}
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
		});
	}
}
