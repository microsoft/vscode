/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ISettableObservable, derived, observableValue } from '../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ChatWindowTerminalPosition, IChatWindowKind } from '../../../services/chatWindow/browser/chatWindowService.js';
import { SessionLayoutMode, SessionSplitLayout } from '../../../common/sessionLayoutMode.js';

/**
 * The defaults of a kind of chat window, kept in the profile: what its chat windows were last left as, which a new one
 * of the kind opens with.
 */
export class ChatWindowDefaults {

	private readonly _prefix: string;

	constructor(
		kind: IChatWindowKind,
		private readonly _storageService: IStorageService,
	) {
		this._prefix = `sessions.chatWindow.${kind.id}`;
	}

	/** The layout of its chat windows, docked or in windows of their own, with an editor. */
	getLayout(docked: boolean): SessionLayoutMode | undefined {
		const value = this._storageService.get(`${this._prefix}.${docked ? 'dockedLayout' : 'layout'}`, StorageScope.PROFILE);
		return value === SessionLayoutMode.Stacked || value === SessionLayoutMode.SideBySide || value === SessionLayoutMode.EditorOnly || value === SessionLayoutMode.ChatOnly ? value : undefined;
	}

	setLayout(docked: boolean, layout: SessionLayoutMode): void {
		this._storageService.store(`${this._prefix}.${docked ? 'dockedLayout' : 'layout'}`, layout, StorageScope.PROFILE, StorageTarget.USER);
	}

	/** Whether the chat below the editor, in a window of its own, was left dragged down to its input. */
	getInputOnly(): boolean {
		return this._storageService.getBoolean(`${this._prefix}.inputOnly`, StorageScope.PROFILE, true);
	}

	setInputOnly(inputOnly: boolean): void {
		this._storageService.store(`${this._prefix}.inputOnly`, inputOnly, StorageScope.PROFILE, StorageTarget.USER);
	}

	/** Where the terminal row of its chat windows shows. */
	getTerminalPosition(): ChatWindowTerminalPosition {
		const value = this._storageService.get(`${this._prefix}.terminalPosition`, StorageScope.PROFILE);
		return value === ChatWindowTerminalPosition.UnderEditor || value === ChatWindowTerminalPosition.UnderChat ? value : ChatWindowTerminalPosition.FullWidth;
	}

	setTerminalPosition(position: ChatWindowTerminalPosition): void {
		this._storageService.store(`${this._prefix}.terminalPosition`, position, StorageScope.PROFILE, StorageTarget.USER);
	}

	/** Whether its chat windows open docked in the main window. */
	getDocked(defaultValue: boolean): boolean {
		return this._storageService.getBoolean(`${this._prefix}.docked`, StorageScope.PROFILE, defaultValue);
	}

	setDocked(docked: boolean): void {
		this._storageService.store(`${this._prefix}.docked`, docked, StorageScope.PROFILE, StorageTarget.USER);
	}

	/** The size its chat windows were last resized to when docked. */
	getDockedSize(): { readonly width: number; readonly height: number } | undefined {
		const value = this._storageService.getObject<{ width?: unknown; height?: unknown }>(`${this._prefix}.dockedSize`, StorageScope.PROFILE);
		return typeof value?.width === 'number' && typeof value.height === 'number' && value.width > 0 && value.height > 0 ? { width: value.width, height: value.height } : undefined;
	}

	setDockedSize(size: { readonly width: number; readonly height: number } | undefined): void {
		if (size) {
			this._storageService.store(`${this._prefix}.dockedSize`, JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) }), StorageScope.PROFILE, StorageTarget.USER);
		} else {
			this._storageService.remove(`${this._prefix}.dockedSize`, StorageScope.PROFILE);
		}
	}
}

/**
 * The state of an open chat window: how it shows its chat and its editor. Changes become the defaults of its kind.
 */
export class ChatWindowState {

	private readonly _layout: ISettableObservable<SessionLayoutMode>;
	readonly layout: IObservable<SessionLayoutMode>;

	private readonly _inputOnly: ISettableObservable<boolean>;
	/** In {@link SessionLayoutMode.Stacked} in a window of its own: whether the chat shows only its input. */
	readonly inputOnly: IObservable<boolean>;

	private readonly _lastSplitLayout: ISettableObservable<SessionSplitLayout>;
	/** How the editor and the chat are arranged while both show, or last showed. */
	readonly splitLayout: IObservable<SessionSplitLayout>;

	private readonly _terminalPosition: ISettableObservable<ChatWindowTerminalPosition>;
	/** Where the terminal row shows. */
	readonly terminalPosition: IObservable<ChatWindowTerminalPosition>;

	/** The layouts it can show; see {@link IChatWindow.layouts}. */
	readonly layouts: readonly SessionLayoutMode[];

	/** The group of the terminal row across the bottom of the window, while it shows; see {@link IChatWindow.terminalGroup}. */
	readonly terminalGroup = observableValue<IEditorGroup | undefined>(this, undefined);

	constructor(
		readonly kind: IChatWindowKind,
		readonly docked: boolean,
		readonly hasEditor: boolean,
		private readonly _defaults: ChatWindowDefaults,
	) {
		this.layouts = !hasEditor
			? [SessionLayoutMode.ChatOnly]
			: docked
				? [SessionLayoutMode.Stacked, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly]
				: [SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly];
		const layout = [_defaults.getLayout(docked), kind.defaultLayout].find(candidate => candidate !== undefined && this.layouts.includes(candidate)) ?? this.layouts[0];
		this._layout = observableValue(this, layout);
		this.layout = this._layout;
		this._lastSplitLayout = observableValue<SessionSplitLayout>(this, layout === SessionLayoutMode.SideBySide ? SessionLayoutMode.SideBySide : SessionLayoutMode.Stacked);
		this.splitLayout = derived(this, reader => {
			const current = this._layout.read(reader);
			return current === SessionLayoutMode.Stacked || current === SessionLayoutMode.SideBySide ? current : this._lastSplitLayout.read(reader);
		});
		// Docked, the chat keeps to its input below the editor.
		this._inputOnly = observableValue(this, docked || _defaults.getInputOnly());
		this.inputOnly = this._inputOnly;
		this._terminalPosition = observableValue(this, _defaults.getTerminalPosition());
		this.terminalPosition = this._terminalPosition;
	}

	setTerminalPosition(position: ChatWindowTerminalPosition): void {
		if (this._terminalPosition.get() === position) {
			return;
		}
		this._terminalPosition.set(position, undefined);
		this._defaults.setTerminalPosition(position);
	}

	setLayout(layout: SessionLayoutMode): void {
		if (!this.layouts.includes(layout) || this._layout.get() === layout) {
			return;
		}
		if (layout === SessionLayoutMode.Stacked || layout === SessionLayoutMode.SideBySide) {
			this._lastSplitLayout.set(layout, undefined);
		}
		this._layout.set(layout, undefined);
		if (this.hasEditor) {
			this._defaults.setLayout(this.docked, layout);
		}
	}

	/** Shows both the editor and the chat again, as they were last arranged. */
	showBoth(): void {
		this.setLayout(this._lastSplitLayout.get());
	}

	setInputOnly(inputOnly: boolean): void {
		if (this.docked || this._inputOnly.get() === inputOnly) {
			return;
		}
		this._inputOnly.set(inputOnly, undefined);
		this._defaults.setInputOnly(inputOnly);
	}
}
