/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { StatusBarAlignment as ExtHostStatusBarAlignment, Disposable, ThemeColor, asStatusBarItemIdentifier } from './extHostTypes.js';
import type * as vscode from 'vscode';
import { MainContext, MainThreadStatusBarShape, IMainContext, ICommandDto, ExtHostStatusBarShape, StatusBarItemDto } from './extHost.protocol.js';
import { localize } from '../../../nls.js';
import { CommandsConverter } from './extHostCommands.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { MarkdownString } from './extHostTypeConverters.js';
import { isNumber } from '../../../base/common/types.js';
import * as htmlContent from '../../../base/common/htmlContent.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';


export class ExtHostStatusBarEntry implements vscode.StatusBarItem {

	private static ID_GEN = 0;

	private static ALLOWED_BACKGROUND_COLORS = new Map<string, ThemeColor>(
		[
			['statusBarItem.errorBackground', new ThemeColor('statusBarItem.errorForeground')],
			['statusBarItem.warningBackground', new ThemeColor('statusBarItem.warningForeground')]
		]
	);

	#proxy: MainThreadStatusBarShape;
	#commands: CommandsConverter;

	private readonly _entryId: string;

	private _extension?: IExtensionDescription;

	private _id?: string;
	private _alignment: number;
	private _priority?: number;

	private _disposed: boolean = false;
	private _visible?: boolean;

	private _text: string = '';
	private _tooltip?: string | vscode.MarkdownString;
	private _tooltip2?: string | vscode.MarkdownString | undefined | ((token: vscode.CancellationToken) => Promise<string | vscode.MarkdownString | undefined>);
	private _name?: string;
	private _color?: string | ThemeColor;
	private _backgroundColor?: ThemeColor;
	// eslint-disable-next-line local/code-no-potentially-unsafe-disposables
	private _latestCommandRegistration?: DisposableStore;
	private readonly _staleCommandRegistrations = new DisposableStore();
	private _command?: {
		readonly fromApi: string | vscode.Command;
		readonly internal: ICommandDto;
	};

	private _timeoutHandle: Timeout | undefined;
	private _accessibilityInformation?: vscode.AccessibilityInformation;

	constructor(proxy: MainThreadStatusBarShape, commands: CommandsConverter, staticItems: ReadonlyMap<string, StatusBarItemDto>, extension: IExtensionDescription, id?: string, alignment?: ExtHostStatusBarAlignment, priority?: number, _onDispose?: () => void);
	constructor(proxy: MainThreadStatusBarShape, commands: CommandsConverter, staticItems: ReadonlyMap<string, StatusBarItemDto>, extension: IExtensionDescription | undefined, id: string, alignment?: ExtHostStatusBarAlignment, priority?: number, _onDispose?: () => void);
	constructor(proxy: MainThreadStatusBarShape, commands: CommandsConverter, staticItems: ReadonlyMap<string, StatusBarItemDto>, extension?: IExtensionDescription, id?: string, alignment: ExtHostStatusBarAlignment = ExtHostStatusBarAlignment.Left, priority?: number, private _onDispose?: () => void) {
		this.#proxy = proxy;
		this.#commands = commands;

		if (id && extension) {
			this._entryId = asStatusBarItemIdentifier(extension.identifier, id);
			// if new item already exists mark it as visible and copy properties
			// this can only happen when an item was contributed by an extension
			const item = staticItems.get(this._entryId);
			if (item) {
				alignment = item.alignLeft ? ExtHostStatusBarAlignment.Left : ExtHostStatusBarAlignment.Right;
				priority = item.priority;
				this._visible = true;
				this.name = item.name;
				this.text = item.text;
				this.tooltip = item.tooltip;
				this.command = item.command;
				this.accessibilityInformation = item.accessibilityInformation;
			}
		} else {
			this._entryId = String(ExtHostStatusBarEntry.ID_GEN++);
		}
		this._extension = extension;

		this._id = id;
		this._alignment = alignment;
		this._priority = this.validatePriority(priority);
	}

	private validatePriority(priority?: number): number | undefined {
		if (!isNumber(priority)) {
			return undefined; // using this method to catch `NaN` too!
		}

		// Our RPC mechanism use JSON to serialize data which does
		// not support `Infinity` so we need to fill in the number
		// equivalent as close as possible.
		// https://github.com/microsoft/vscode/issues/133317

		if (priority === Number.POSITIVE_INFINITY) {
			return Number.MAX_VALUE;
		}

		if (priority === Number.NEGATIVE_INFINITY) {
			return -Number.MAX_VALUE;
		}

		return priority;
	}

	public get id(): string {
		return this._id ?? this._extension!.identifier.value;
	}

	public get entryId(): string {
		return this._entryId;
	}

	public get alignment(): vscode.StatusBarAlignment {
		return this._alignment;
	}

	public get priority(): number | undefined {
		return this._priority;
	}

	public get text(): string {
		return this._text;
	}

	public get name(): string | undefined {
		return this._name;
	}

	public get tooltip(): vscode.MarkdownString | string | undefined {
		return this._tooltip;
	}

	public get tooltip2(): vscode.MarkdownString | string | undefined | ((token: vscode.CancellationToken) => Promise<vscode.MarkdownString | string | undefined>) {
		if (this._extension) {
			checkProposedApiEnabled(this._extension, 'statusBarItemTooltip');
		}

		return this._tooltip2;
	}

	public get color(): string | ThemeColor | undefined {
		return this._color;
	}

	public get backgroundColor(): ThemeColor | undefined {
		return this._backgroundColor;
	}

	public get command(): string | vscode.Command | undefined {
		return this._command?.fromApi;
	}

	public get accessibilityInformation(): vscode.AccessibilityInformation | undefined {
		return this._accessibilityInformation;
	}

	public set text(text: string) {
		this._text = text;
		this.update();
	}

	public set name(name: string | undefined) {
		this._name = name;
		this.update();
	}

	public set tooltip(tooltip: vscode.MarkdownString | string | undefined) {
		this._tooltip = tooltip;
		this.update();
	}

	public set tooltip2(tooltip: vscode.MarkdownString | string | undefined | ((token: vscode.CancellationToken) => Promise<vscode.MarkdownString | string | undefined>)) {
		if (this._extension) {
			checkProposedApiEnabled(this._extension, 'statusBarItemTooltip');
		}

		this._tooltip2 = tooltip;
		this.update();
	}

	public set color(color: string | ThemeColor | undefined) {
		this._color = color;
		this.update();
	}

	public set backgroundColor(color: ThemeColor | undefined) {
		if (color && !ExtHostStatusBarEntry.ALLOWED_BACKGROUND_COLORS.has(color.id)) {
			color = undefined;
		}

		this._backgroundColor = color;
		this.update();
	}

	public set command(command: string | vscode.Command | undefined) {
		if (this._command?.fromApi === command) {
			return;
		}

		if (this._latestCommandRegistration) {
			this._staleCommandRegistrations.add(this._latestCommandRegistration);
		}
		this._latestCommandRegistration = new DisposableStore();
		if (typeof command === 'string') {
			this._command = {
				fromApi: command,
				internal: this.#commands.toInternal({ title: '', command }, this._latestCommandRegistration),
			};
		} else if (command) {
			this._command = {
				fromApi: command,
				internal: this.#commands.toInternal(command, this._latestCommandRegistration),
			};
		} else {
			this._command = undefined;
		}
		this.update();
	}

	public set accessibilityInformation(accessibilityInformation: vscode.AccessibilityInformation | undefined) {
		this._accessibilityInformation = accessibilityInformation;
		this.update();
	}

	public show(): void {
		this._visible = true;
		this.update();
	}

	public hide(): void {
		clearTimeout(this._timeoutHandle);
		this._visible = false;
		this.#proxy.$disposeEntry(this._entryId);
	}

	private update(): void {
		if (this._disposed || !this._visible) {
			return;
		}

		clearTimeout(this._timeoutHandle);

		// Defer the update so that multiple changes to setters dont cause a redraw each
		this._timeoutHandle = setTimeout(() => {
			this._timeoutHandle = undefined;

			// If the id is not set, derive it from the extension identifier,
			// otherwise make sure to prefix it with the extension identifier
			// to get a more unique value across extensions.
			let id: string;
			if (this._extension) {
				if (this._id) {
					id = `${this._extension.identifier.value}.${this._id}`;
				} else {
					id = this._extension.identifier.value;
				}
			} else {
				id = this._id!;
			}

			// If the name is not set, derive it from the extension descriptor
			let name: string;
			if (this._name) {
				name = this._name;
			} else {
				name = localize('extensionLabel', "{0} (Extension)", this._extension!.displayName || this._extension!.name);
			}

			// If a background color is set, the foreground is determined
			let color = this._color;
			if (this._backgroundColor) {
				color = ExtHostStatusBarEntry.ALLOWED_BACKGROUND_COLORS.get(this._backgroundColor.id);
			}

			let tooltip: undefined | string | htmlContent.IMarkdownString;
			let hasTooltipProvider: boolean;
			if (typeof this._tooltip2 === 'function') {
				tooltip = MarkdownString.fromStrict(this._tooltip);
				hasTooltipProvider = true;
			} else {
				tooltip = MarkdownString.fromStrict(this._tooltip2 ?? this._tooltip);
				hasTooltipProvider = false;
			}

			// Set to status bar
			this.#proxy.$setEntry(this._entryId, id, this._extension?.identifier.value, name, this._text, tooltip, hasTooltipProvider, this._command?.internal, color,
				this._backgroundColor, this._alignment === ExtHostStatusBarAlignment.Left,
				this._priority, this._accessibilityInformation);

			// clean-up state commands _after_ updating the UI
			this._staleCommandRegistrations.clear();
		}, 0);
	}

	public dispose(): void {
		this.hide();
		this._onDispose?.();
		this._disposed = true;
	}
}

class StatusBarMessage {

	private readonly _item: vscode.StatusBarItem;
	private readonly _messages: { message: string }[] = [];

	constructor(statusBar: ExtHostStatusBar) {
		this._item = statusBar.createStatusBarEntry(undefined, 'status.extensionMessage', ExtHostStatusBarAlignment.Left, Number.MIN_VALUE);
		this._item.name = localize('status.extensionMessage', "Extension Status");
	}

	dispose() {
		this._messages.length = 0;
		this._item.dispose();
	}

	setMessage(message: string): Disposable {
		const data: { message: string } = { message }; // use object to not confuse equal strings
		this._messages.unshift(data);
		this._update();

		return new Disposable(() => {
			const idx = this._messages.indexOf(data);
			if (idx >= 0) {
				this._messages.splice(idx, 1);
				this._update();
			}
		});
	}

	private _update() {
		if (this._messages.length > 0) {
			this._item.text = this._messages[0].message;
			this._item.show();
		} else {
			this._item.hide();
		}
	}
}

export class ExtHostStatusBar implements ExtHostStatusBarShape {

	private readonly _proxy: MainThreadStatusBarShape;
	private readonly _commands: CommandsConverter;
	private readonly _statusMessage: StatusBarMessage;
	private readonly _entries = new Map<string, ExtHostStatusBarEntry>();
	private readonly _existingItems = new Map<string, StatusBarItemDto>();

	constructor(mainContext: IMainContext, commands: CommandsConverter) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadStatusBar);
		this._commands = commands;
		this._statusMessage = new StatusBarMessage(this);
	}

	$acceptStaticEntries(added: StatusBarItemDto[]): void {
		for (const item of added) {
			this._existingItems.set(item.entryId, item);
		}
	}

	async $provideTooltip(entryId: string, cancellation: vscode.CancellationToken): Promise<string | htmlContent.IMarkdownString | undefined> {
		const entry = this._entries.get(entryId);
		if (!entry) {
			return undefined;
		}

		const tooltip = typeof entry.tooltip2 === 'function' ? await entry.tooltip2(cancellation) : entry.tooltip2;
		return !cancellation.isCancellationRequested ? MarkdownString.fromStrict(tooltip) : undefined;
	}

	createStatusBarEntry(extension: IExtensionDescription | undefined, id: string, alignment?: ExtHostStatusBarAlignment, priority?: number): vscode.StatusBarItem;
	createStatusBarEntry(extension: IExtensionDescription, id?: string, alignment?: ExtHostStatusBarAlignment, priority?: number): vscode.StatusBarItem;
	createStatusBarEntry(extension: IExtensionDescription, id: string, alignment?: ExtHostStatusBarAlignment, priority?: number): vscode.StatusBarItem {
		const entry = new ExtHostStatusBarEntry(this._proxy, this._commands, this._existingItems, extension, id, alignment, priority, () => this._entries.delete(entry.entryId));
		this._entries.set(entry.entryId, entry);

		return entry;
	}

	setStatusBarMessage(text: string, timeoutOrThenable?: number | Thenable<any>): Disposable {
		const d = this._statusMessage.setMessage(text);
		let handle: Timeout | undefined;

		if (typeof timeoutOrThenable === 'number') {
			handle = setTimeout(() => d.dispose(), timeoutOrThenable);
		} else if (typeof timeoutOrThenable !== 'undefined') {
			timeoutOrThenable.then(() => d.dispose(), () => d.dispose());
		}

		return new Disposable(() => {
			d.dispose();
			clearTimeout(handle);
		});
	}
}
