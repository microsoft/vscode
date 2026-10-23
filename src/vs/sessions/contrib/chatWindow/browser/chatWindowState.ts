/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ISettableObservable, derived, observableValue } from '../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ChatWindowLayout, ChatWindowSplitLayout, IChatWindowKind } from '../../../services/chatWindow/browser/chatWindowService.js';

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
	getLayout(docked: boolean): ChatWindowLayout | undefined {
		const value = this._storageService.get(`${this._prefix}.${docked ? 'dockedLayout' : 'layout'}`, StorageScope.PROFILE);
		return value === ChatWindowLayout.EditorAboveChat || value === ChatWindowLayout.SideBySide || value === ChatWindowLayout.EditorOnly || value === ChatWindowLayout.ChatOnly ? value : undefined;
	}

	setLayout(docked: boolean, layout: ChatWindowLayout): void {
		this._storageService.store(`${this._prefix}.${docked ? 'dockedLayout' : 'layout'}`, layout, StorageScope.PROFILE, StorageTarget.USER);
	}

	/** Whether the chat below the editor, in a window of its own, was left dragged down to its input. */
	getInputOnly(): boolean {
		return this._storageService.getBoolean(`${this._prefix}.inputOnly`, StorageScope.PROFILE, true);
	}

	setInputOnly(inputOnly: boolean): void {
		this._storageService.store(`${this._prefix}.inputOnly`, inputOnly, StorageScope.PROFILE, StorageTarget.USER);
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

	private readonly _layout: ISettableObservable<ChatWindowLayout>;
	readonly layout: IObservable<ChatWindowLayout>;

	private readonly _inputOnly: ISettableObservable<boolean>;
	/** In {@link ChatWindowLayout.EditorAboveChat} in a window of its own: whether the chat shows only its input. */
	readonly inputOnly: IObservable<boolean>;

	private readonly _lastSplitLayout: ISettableObservable<ChatWindowSplitLayout>;
	/** How the editor and the chat are arranged while both show, or last showed. */
	readonly splitLayout: IObservable<ChatWindowSplitLayout>;

	/** The layouts it can show; see {@link IChatWindow.layouts}. */
	readonly layouts: readonly ChatWindowLayout[];

	constructor(
		readonly kind: IChatWindowKind,
		readonly docked: boolean,
		readonly hasEditor: boolean,
		private readonly _defaults: ChatWindowDefaults,
	) {
		this.layouts = !hasEditor
			? [ChatWindowLayout.ChatOnly]
			: docked
				? [ChatWindowLayout.EditorAboveChat, ChatWindowLayout.EditorOnly, ChatWindowLayout.ChatOnly]
				: [ChatWindowLayout.EditorAboveChat, ChatWindowLayout.SideBySide, ChatWindowLayout.EditorOnly, ChatWindowLayout.ChatOnly];
		const layout = [_defaults.getLayout(docked), kind.defaultLayout].find(candidate => candidate !== undefined && this.layouts.includes(candidate)) ?? this.layouts[0];
		this._layout = observableValue(this, layout);
		this.layout = this._layout;
		this._lastSplitLayout = observableValue<ChatWindowSplitLayout>(this, layout === ChatWindowLayout.SideBySide ? ChatWindowLayout.SideBySide : ChatWindowLayout.EditorAboveChat);
		this.splitLayout = derived(this, reader => {
			const current = this._layout.read(reader);
			return current === ChatWindowLayout.EditorAboveChat || current === ChatWindowLayout.SideBySide ? current : this._lastSplitLayout.read(reader);
		});
		// Docked, the chat keeps to its input below the editor.
		this._inputOnly = observableValue(this, docked || _defaults.getInputOnly());
		this.inputOnly = this._inputOnly;
	}

	setLayout(layout: ChatWindowLayout): void {
		if (!this.layouts.includes(layout) || this._layout.get() === layout) {
			return;
		}
		if (layout === ChatWindowLayout.EditorAboveChat || layout === ChatWindowLayout.SideBySide) {
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
