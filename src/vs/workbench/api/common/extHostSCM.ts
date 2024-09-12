/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { URI, UriComponents } from '../../../base/common/uri.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { debounce } from '../../../base/common/decorators.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { asPromise } from '../../../base/common/async.js';
import { ExtHostCommands } from './extHostCommands.js';
import { MainContext, MainThreadSCMShape, SCMRawResource, SCMRawResourceSplice, SCMRawResourceSplices, IMainContext, ExtHostSCMShape, ICommandDto, MainThreadTelemetryShape, SCMGroupFeatures, SCMHistoryItemDto, SCMHistoryItemChangeDto, SCMHistoryItemRefDto } from './extHost.protocol.js';
import { sortedDiff, equals } from '../../../base/common/arrays.js';
import { comparePaths } from '../../../base/common/comparers.js';
import type * as vscode from 'vscode';
import { ISplice } from '../../../base/common/sequence.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { ExtensionIdentifierMap, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { MarshalledId } from '../../../base/common/marshallingIds.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { MarkdownString } from './extHostTypeConverters.js';
import { checkProposedApiEnabled, isProposedApiEnabled } from '../../services/extensions/common/extensions.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import { Schemas } from '../../../base/common/network.js';
import { isLinux } from '../../../base/common/platform.js';

type ProviderHandle = number;
type GroupHandle = number;
type ResourceStateHandle = number;

function isUri(thing: any): thing is vscode.Uri {
	return thing instanceof URI;
}

function uriEquals(a: vscode.Uri, b: vscode.Uri): boolean {
	if (a.scheme === Schemas.file && b.scheme === Schemas.file && isLinux) {
		return a.toString() === b.toString();
	}

	return a.toString().toLowerCase() === b.toString().toLowerCase();
}

function getIconResource(decorations?: vscode.SourceControlResourceThemableDecorations): UriComponents | ThemeIcon | undefined {
	if (!decorations) {
		return undefined;
	} else if (typeof decorations.iconPath === 'string') {
		return URI.file(decorations.iconPath);
	} else if (URI.isUri(decorations.iconPath)) {
		return decorations.iconPath;
	} else if (ThemeIcon.isThemeIcon(decorations.iconPath)) {
		return decorations.iconPath;
	} else {
		return undefined;
	}
}

function getHistoryItemIconDto(icon: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon | undefined): UriComponents | { light: UriComponents; dark: UriComponents } | ThemeIcon | undefined {
	if (!icon) {
		return undefined;
	} else if (URI.isUri(icon)) {
		return icon;
	} else if (ThemeIcon.isThemeIcon(icon)) {
		return icon;
	} else {
		const iconDto = icon as { light: URI; dark: URI };
		return { light: iconDto.light, dark: iconDto.dark };
	}
}

function toSCMHistoryItemDto(historyItem: vscode.SourceControlHistoryItem): SCMHistoryItemDto {
	const references = historyItem.references?.map(r => ({
		...r, icon: getHistoryItemIconDto(r.icon)
	}));

	return { ...historyItem, references };
}

function toSCMHistoryItemRefDto(historyItemRef?: vscode.SourceControlHistoryItemRef): SCMHistoryItemRefDto | undefined {
	return historyItemRef ? { ...historyItemRef, icon: getHistoryItemIconDto(historyItemRef.icon) } : undefined;
}

function compareResourceThemableDecorations(a: vscode.SourceControlResourceThemableDecorations, b: vscode.SourceControlResourceThemableDecorations): number {
	if (!a.iconPath && !b.iconPath) {
		return 0;
	} else if (!a.iconPath) {
		return -1;
	} else if (!b.iconPath) {
		return 1;
	}

	const aPath = typeof a.iconPath === 'string' ? a.iconPath : URI.isUri(a.iconPath) ? a.iconPath.fsPath : (a.iconPath as vscode.ThemeIcon).id;
	const bPath = typeof b.iconPath === 'string' ? b.iconPath : URI.isUri(b.iconPath) ? b.iconPath.fsPath : (b.iconPath as vscode.ThemeIcon).id;
	return comparePaths(aPath, bPath);
}

function compareResourceStatesDecorations(a: vscode.SourceControlResourceDecorations, b: vscode.SourceControlResourceDecorations): number {
	let result = 0;

	if (a.strikeThrough !== b.strikeThrough) {
		return a.strikeThrough ? 1 : -1;
	}

	if (a.faded !== b.faded) {
		return a.faded ? 1 : -1;
	}

	if (a.tooltip !== b.tooltip) {
		return (a.tooltip || '').localeCompare(b.tooltip || '');
	}

	result = compareResourceThemableDecorations(a, b);

	if (result !== 0) {
		return result;
	}

	if (a.light && b.light) {
		result = compareResourceThemableDecorations(a.light, b.light);
	} else if (a.light) {
		return 1;
	} else if (b.light) {
		return -1;
	}

	if (result !== 0) {
		return result;
	}

	if (a.dark && b.dark) {
		result = compareResourceThemableDecorations(a.dark, b.dark);
	} else if (a.dark) {
		return 1;
	} else if (b.dark) {
		return -1;
	}

	return result;
}

function compareCommands(a: vscode.Command, b: vscode.Command): number {
	if (a.command !== b.command) {
		return a.command < b.command ? -1 : 1;
	}

	if (a.title !== b.title) {
		return a.title < b.title ? -1 : 1;
	}

	if (a.tooltip !== b.tooltip) {
		if (a.tooltip !== undefined && b.tooltip !== undefined) {
			return a.tooltip < b.tooltip ? -1 : 1;
		} else if (a.tooltip !== undefined) {
			return 1;
		} else if (b.tooltip !== undefined) {
			return -1;
		}
	}

	if (a.arguments === b.arguments) {
		return 0;
	} else if (!a.arguments) {
		return -1;
	} else if (!b.arguments) {
		return 1;
	} else if (a.arguments.length !== b.arguments.length) {
		return a.arguments.length - b.arguments.length;
	}

	for (let i = 0; i < a.arguments.length; i++) {
		const aArg = a.arguments[i];
		const bArg = b.arguments[i];

		if (aArg === bArg) {
			continue;
		}

		if (isUri(aArg) && isUri(bArg) && uriEquals(aArg, bArg)) {
			continue;
		}

		return aArg < bArg ? -1 : 1;
	}

	return 0;
}

function compareResourceStates(a: vscode.SourceControlResourceState, b: vscode.SourceControlResourceState): number {
	let result = comparePaths(a.resourceUri.fsPath, b.resourceUri.fsPath, true);

	if (result !== 0) {
		return result;
	}

	if (a.command && b.command) {
		result = compareCommands(a.command, b.command);
	} else if (a.command) {
		return 1;
	} else if (b.command) {
		return -1;
	}

	if (result !== 0) {
		return result;
	}

	if (a.decorations && b.decorations) {
		result = compareResourceStatesDecorations(a.decorations, b.decorations);
	} else if (a.decorations) {
		return 1;
	} else if (b.decorations) {
		return -1;
	}

	if (result !== 0) {
		return result;
	}

	if (a.multiFileDiffEditorModifiedUri && b.multiFileDiffEditorModifiedUri) {
		result = comparePaths(a.multiFileDiffEditorModifiedUri.fsPath, b.multiFileDiffEditorModifiedUri.fsPath, true);
	} else if (a.multiFileDiffEditorModifiedUri) {
		return 1;
	} else if (b.multiFileDiffEditorModifiedUri) {
		return -1;
	}

	if (result !== 0) {
		return result;
	}

	if (a.multiDiffEditorOriginalUri && b.multiDiffEditorOriginalUri) {
		result = comparePaths(a.multiDiffEditorOriginalUri.fsPath, b.multiDiffEditorOriginalUri.fsPath, true);
	} else if (a.multiDiffEditorOriginalUri) {
		return 1;
	} else if (b.multiDiffEditorOriginalUri) {
		return -1;
	}

	return result;
}

function compareArgs(a: any[], b: any[]): boolean {
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}

function commandEquals(a: vscode.Command, b: vscode.Command): boolean {
	return a.command === b.command
		&& a.title === b.title
		&& a.tooltip === b.tooltip
		&& (a.arguments && b.arguments ? compareArgs(a.arguments, b.arguments) : a.arguments === b.arguments);
}

function commandListEquals(a: readonly vscode.Command[], b: readonly vscode.Command[]): boolean {
	return equals(a, b, commandEquals);
}

export interface IValidateInput {
	(value: string, cursorPosition: number): vscode.ProviderResult<vscode.SourceControlInputBoxValidation | undefined | null>;
}

export class ExtHostSCMInputBox implements vscode.SourceControlInputBox {

	#proxy: MainThreadSCMShape;
	#extHostDocuments: ExtHostDocuments;

	private _value: string = '';

	get value(): string {
		return this._value;
	}

	set value(value: string) {
		value = value ?? '';
		this.#proxy.$setInputBoxValue(this._sourceControlHandle, value);
		this.updateValue(value);
	}

	private readonly _onDidChange = new Emitter<string>();

	get onDidChange(): Event<string> {
		return this._onDidChange.event;
	}

	private _placeholder: string = '';

	get placeholder(): string {
		return this._placeholder;
	}

	set placeholder(placeholder: string) {
		this.#proxy.$setInputBoxPlaceholder(this._sourceControlHandle, placeholder);
		this._placeholder = placeholder;
	}

	private _validateInput: IValidateInput | undefined;

	get validateInput(): IValidateInput | undefined {
		checkProposedApiEnabled(this._extension, 'scmValidation');

		return this._validateInput;
	}

	set validateInput(fn: IValidateInput | undefined) {
		checkProposedApiEnabled(this._extension, 'scmValidation');

		if (fn && typeof fn !== 'function') {
			throw new Error(`[${this._extension.identifier.value}]: Invalid SCM input box validation function`);
		}

		this._validateInput = fn;
		this.#proxy.$setValidationProviderIsEnabled(this._sourceControlHandle, !!fn);
	}

	private _enabled: boolean = true;

	get enabled(): boolean {
		return this._enabled;
	}

	set enabled(enabled: boolean) {
		enabled = !!enabled;

		if (this._enabled === enabled) {
			return;
		}

		this._enabled = enabled;
		this.#proxy.$setInputBoxEnablement(this._sourceControlHandle, enabled);
	}

	private _visible: boolean = true;

	get visible(): boolean {
		return this._visible;
	}

	set visible(visible: boolean) {
		visible = !!visible;

		if (this._visible === visible) {
			return;
		}

		this._visible = visible;
		this.#proxy.$setInputBoxVisibility(this._sourceControlHandle, visible);
	}

	get document(): vscode.TextDocument {
		checkProposedApiEnabled(this._extension, 'scmTextDocument');

		return this.#extHostDocuments.getDocument(this._documentUri);
	}

	constructor(private _extension: IExtensionDescription, _extHostDocuments: ExtHostDocuments, proxy: MainThreadSCMShape, private _sourceControlHandle: number, private _documentUri: URI) {
		this.#extHostDocuments = _extHostDocuments;
		this.#proxy = proxy;
	}

	showValidationMessage(message: string | vscode.MarkdownString, type: vscode.SourceControlInputBoxValidationType) {
		checkProposedApiEnabled(this._extension, 'scmValidation');

		this.#proxy.$showValidationMessage(this._sourceControlHandle, message, type as any);
	}

	$onInputBoxValueChange(value: string): void {
		this.updateValue(value);
	}

	private updateValue(value: string): void {
		this._value = value;
		this._onDidChange.fire(value);
	}
}

class ExtHostSourceControlResourceGroup implements vscode.SourceControlResourceGroup {

	private static _handlePool: number = 0;
	private _resourceHandlePool: number = 0;
	private _resourceStates: vscode.SourceControlResourceState[] = [];

	private _resourceStatesMap = new Map<ResourceStateHandle, vscode.SourceControlResourceState>();
	private _resourceStatesCommandsMap = new Map<ResourceStateHandle, vscode.Command>();
	private _resourceStatesDisposablesMap = new Map<ResourceStateHandle, IDisposable>();

	private readonly _onDidUpdateResourceStates = new Emitter<void>();
	readonly onDidUpdateResourceStates = this._onDidUpdateResourceStates.event;

	private _disposed = false;
	get disposed(): boolean { return this._disposed; }
	private readonly _onDidDispose = new Emitter<void>();
	readonly onDidDispose = this._onDidDispose.event;

	private _handlesSnapshot: number[] = [];
	private _resourceSnapshot: vscode.SourceControlResourceState[] = [];

	get id(): string { return this._id; }

	get label(): string { return this._label; }
	set label(label: string) {
		this._label = label;
		this._proxy.$updateGroupLabel(this._sourceControlHandle, this.handle, label);
	}

	private _hideWhenEmpty: boolean | undefined = undefined;
	get hideWhenEmpty(): boolean | undefined { return this._hideWhenEmpty; }
	set hideWhenEmpty(hideWhenEmpty: boolean | undefined) {
		this._hideWhenEmpty = hideWhenEmpty;
		this._proxy.$updateGroup(this._sourceControlHandle, this.handle, this.features);
	}

	get features(): SCMGroupFeatures {
		return {
			hideWhenEmpty: this.hideWhenEmpty
		};
	}

	get resourceStates(): vscode.SourceControlResourceState[] { return [...this._resourceStates]; }
	set resourceStates(resources: vscode.SourceControlResourceState[]) {
		this._resourceStates = [...resources];
		this._onDidUpdateResourceStates.fire();
	}

	readonly handle = ExtHostSourceControlResourceGroup._handlePool++;

	constructor(
		private _proxy: MainThreadSCMShape,
		private _commands: ExtHostCommands,
		private _sourceControlHandle: number,
		private _id: string,
		private _label: string,
		public readonly multiDiffEditorEnableViewChanges: boolean,
		private readonly _extension: IExtensionDescription,
	) { }

	getResourceState(handle: number): vscode.SourceControlResourceState | undefined {
		return this._resourceStatesMap.get(handle);
	}

	$executeResourceCommand(handle: number, preserveFocus: boolean): Promise<void> {
		const command = this._resourceStatesCommandsMap.get(handle);

		if (!command) {
			return Promise.resolve(undefined);
		}

		return asPromise(() => this._commands.executeCommand(command.command, ...(command.arguments || []), preserveFocus));
	}

	_takeResourceStateSnapshot(): SCMRawResourceSplice[] {
		const snapshot = [...this._resourceStates].sort(compareResourceStates);
		const diffs = sortedDiff(this._resourceSnapshot, snapshot, compareResourceStates);

		const splices = diffs.map<ISplice<{ rawResource: SCMRawResource; handle: number }>>(diff => {
			const toInsert = diff.toInsert.map(r => {
				const handle = this._resourceHandlePool++;
				this._resourceStatesMap.set(handle, r);

				const sourceUri = r.resourceUri;

				let command: ICommandDto | undefined;
				if (r.command) {
					if (r.command.command === 'vscode.open' || r.command.command === 'vscode.diff' || r.command.command === 'vscode.changes') {
						const disposables = new DisposableStore();
						command = this._commands.converter.toInternal(r.command, disposables);
						this._resourceStatesDisposablesMap.set(handle, disposables);
					} else {
						this._resourceStatesCommandsMap.set(handle, r.command);
					}
				}

				const hasScmMultiDiffEditorProposalEnabled = isProposedApiEnabled(this._extension, 'scmMultiDiffEditor');
				const multiFileDiffEditorOriginalUri = hasScmMultiDiffEditorProposalEnabled ? r.multiDiffEditorOriginalUri : undefined;
				const multiFileDiffEditorModifiedUri = hasScmMultiDiffEditorProposalEnabled ? r.multiFileDiffEditorModifiedUri : undefined;

				const icon = getIconResource(r.decorations);
				const lightIcon = r.decorations && getIconResource(r.decorations.light) || icon;
				const darkIcon = r.decorations && getIconResource(r.decorations.dark) || icon;
				const icons: SCMRawResource[2] = [lightIcon, darkIcon];

				const tooltip = (r.decorations && r.decorations.tooltip) || '';
				const strikeThrough = r.decorations && !!r.decorations.strikeThrough;
				const faded = r.decorations && !!r.decorations.faded;
				const contextValue = r.contextValue || '';

				const rawResource = [handle, sourceUri, icons, tooltip, strikeThrough, faded, contextValue, command, multiFileDiffEditorOriginalUri, multiFileDiffEditorModifiedUri] as SCMRawResource;

				return { rawResource, handle };
			});

			return { start: diff.start, deleteCount: diff.deleteCount, toInsert };
		});

		const rawResourceSplices = splices
			.map(({ start, deleteCount, toInsert }) => [start, deleteCount, toInsert.map(i => i.rawResource)] as SCMRawResourceSplice);

		const reverseSplices = splices.reverse();

		for (const { start, deleteCount, toInsert } of reverseSplices) {
			const handles = toInsert.map(i => i.handle);
			const handlesToDelete = this._handlesSnapshot.splice(start, deleteCount, ...handles);

			for (const handle of handlesToDelete) {
				this._resourceStatesMap.delete(handle);
				this._resourceStatesCommandsMap.delete(handle);
				this._resourceStatesDisposablesMap.get(handle)?.dispose();
				this._resourceStatesDisposablesMap.delete(handle);
			}
		}

		this._resourceSnapshot = snapshot;
		return rawResourceSplices;
	}

	dispose(): void {
		this._disposed = true;
		this._onDidDispose.fire();
	}
}

class ExtHostSourceControl implements vscode.SourceControl {

	private static _handlePool: number = 0;

	#proxy: MainThreadSCMShape;

	private _groups: Map<GroupHandle, ExtHostSourceControlResourceGroup> = new Map<GroupHandle, ExtHostSourceControlResourceGroup>();

	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	get rootUri(): vscode.Uri | undefined {
		return this._rootUri;
	}

	private _inputBox: ExtHostSCMInputBox;
	get inputBox(): ExtHostSCMInputBox { return this._inputBox; }

	private _count: number | undefined = undefined;

	get count(): number | undefined {
		return this._count;
	}

	set count(count: number | undefined) {
		if (this._count === count) {
			return;
		}

		this._count = count;
		this.#proxy.$updateSourceControl(this.handle, { count });
	}

	private _quickDiffProvider: vscode.QuickDiffProvider | undefined = undefined;

	get quickDiffProvider(): vscode.QuickDiffProvider | undefined {
		return this._quickDiffProvider;
	}

	set quickDiffProvider(quickDiffProvider: vscode.QuickDiffProvider | undefined) {
		this._quickDiffProvider = quickDiffProvider;
		let quickDiffLabel = undefined;
		if (isProposedApiEnabled(this._extension, 'quickDiffProvider')) {
			quickDiffLabel = quickDiffProvider?.label;
		}
		this.#proxy.$updateSourceControl(this.handle, { hasQuickDiffProvider: !!quickDiffProvider, quickDiffLabel });
	}

	private _historyProvider: vscode.SourceControlHistoryProvider | undefined;
	private readonly _historyProviderDisposable = new MutableDisposable<DisposableStore>();

	get historyProvider(): vscode.SourceControlHistoryProvider | undefined {
		checkProposedApiEnabled(this._extension, 'scmHistoryProvider');
		return this._historyProvider;
	}

	set historyProvider(historyProvider: vscode.SourceControlHistoryProvider | undefined) {
		checkProposedApiEnabled(this._extension, 'scmHistoryProvider');

		this._historyProvider = historyProvider;
		this._historyProviderDisposable.value = new DisposableStore();

		this.#proxy.$updateSourceControl(this.handle, { hasHistoryProvider: !!historyProvider });

		if (historyProvider) {
			this._historyProviderDisposable.value.add(historyProvider.onDidChangeCurrentHistoryItemRefs(() => {
				const historyItemRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemRef);
				const historyItemRemoteRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemRemoteRef);
				const historyItemBaseRef = toSCMHistoryItemRefDto(historyProvider?.currentHistoryItemBaseRef);

				this.#proxy.$onDidChangeHistoryProviderCurrentHistoryItemRefs(this.handle, historyItemRef, historyItemRemoteRef, historyItemBaseRef);
			}));
			this._historyProviderDisposable.value.add(historyProvider.onDidChangeHistoryItemRefs((e) => {
				if (e.added.length === 0 && e.modified.length === 0 && e.removed.length === 0) {
					return;
				}

				const added = e.added.map(ref => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));
				const modified = e.modified.map(ref => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));
				const removed = e.removed.map(ref => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) }));

				this.#proxy.$onDidChangeHistoryProviderHistoryItemRefs(this.handle, { added, modified, removed, silent: e.silent });
			}));
		}
	}

	private _commitTemplate: string | undefined = undefined;

	get commitTemplate(): string | undefined {
		return this._commitTemplate;
	}

	set commitTemplate(commitTemplate: string | undefined) {
		if (commitTemplate === this._commitTemplate) {
			return;
		}

		this._commitTemplate = commitTemplate;
		this.#proxy.$updateSourceControl(this.handle, { commitTemplate });
	}

	private readonly _acceptInputDisposables = new MutableDisposable<DisposableStore>();
	private _acceptInputCommand: vscode.Command | undefined = undefined;

	get acceptInputCommand(): vscode.Command | undefined {
		return this._acceptInputCommand;
	}

	set acceptInputCommand(acceptInputCommand: vscode.Command | undefined) {
		this._acceptInputDisposables.value = new DisposableStore();

		this._acceptInputCommand = acceptInputCommand;

		const internal = this._commands.converter.toInternal(acceptInputCommand, this._acceptInputDisposables.value);
		this.#proxy.$updateSourceControl(this.handle, { acceptInputCommand: internal });
	}

	private readonly _actionButtonDisposables = new MutableDisposable<DisposableStore>();
	private _actionButton: vscode.SourceControlActionButton | undefined;
	get actionButton(): vscode.SourceControlActionButton | undefined {
		checkProposedApiEnabled(this._extension, 'scmActionButton');
		return this._actionButton;
	}
	set actionButton(actionButton: vscode.SourceControlActionButton | undefined) {
		checkProposedApiEnabled(this._extension, 'scmActionButton');
		this._actionButtonDisposables.value = new DisposableStore();

		this._actionButton = actionButton;

		const internal = actionButton !== undefined ?
			{
				command: this._commands.converter.toInternal(actionButton.command, this._actionButtonDisposables.value),
				secondaryCommands: actionButton.secondaryCommands?.map(commandGroup => {
					return commandGroup.map(command => this._commands.converter.toInternal(command, this._actionButtonDisposables.value!));
				}),
				description: actionButton.description,
				enabled: actionButton.enabled
			} : undefined;
		this.#proxy.$updateSourceControl(this.handle, { actionButton: internal ?? null });
	}


	private readonly _statusBarDisposables = new MutableDisposable<DisposableStore>();
	private _statusBarCommands: vscode.Command[] | undefined = undefined;

	get statusBarCommands(): vscode.Command[] | undefined {
		return this._statusBarCommands;
	}

	set statusBarCommands(statusBarCommands: vscode.Command[] | undefined) {
		if (this._statusBarCommands && statusBarCommands && commandListEquals(this._statusBarCommands, statusBarCommands)) {
			return;
		}

		this._statusBarDisposables.value = new DisposableStore();

		this._statusBarCommands = statusBarCommands;

		const internal = (statusBarCommands || []).map(c => this._commands.converter.toInternal(c, this._statusBarDisposables.value!)) as ICommandDto[];
		this.#proxy.$updateSourceControl(this.handle, { statusBarCommands: internal });
	}

	private _selected: boolean = false;

	get selected(): boolean {
		return this._selected;
	}

	private readonly _onDidChangeSelection = new Emitter<boolean>();
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

	private handle: number = ExtHostSourceControl._handlePool++;

	constructor(
		private readonly _extension: IExtensionDescription,
		_extHostDocuments: ExtHostDocuments,
		proxy: MainThreadSCMShape,
		private _commands: ExtHostCommands,
		private _id: string,
		private _label: string,
		private _rootUri?: vscode.Uri
	) {
		this.#proxy = proxy;

		const inputBoxDocumentUri = URI.from({
			scheme: Schemas.vscodeSourceControl,
			path: `${_id}/scm${this.handle}/input`,
			query: _rootUri ? `rootUri=${encodeURIComponent(_rootUri.toString())}` : undefined
		});

		this._inputBox = new ExtHostSCMInputBox(_extension, _extHostDocuments, this.#proxy, this.handle, inputBoxDocumentUri);
		this.#proxy.$registerSourceControl(this.handle, _id, _label, _rootUri, inputBoxDocumentUri);
	}

	private createdResourceGroups = new Map<ExtHostSourceControlResourceGroup, IDisposable>();
	private updatedResourceGroups = new Set<ExtHostSourceControlResourceGroup>();

	createResourceGroup(id: string, label: string, options?: { multiDiffEditorEnableViewChanges?: boolean }): ExtHostSourceControlResourceGroup {
		const multiDiffEditorEnableViewChanges = isProposedApiEnabled(this._extension, 'scmMultiDiffEditor') && options?.multiDiffEditorEnableViewChanges === true;
		const group = new ExtHostSourceControlResourceGroup(this.#proxy, this._commands, this.handle, id, label, multiDiffEditorEnableViewChanges, this._extension);
		const disposable = Event.once(group.onDidDispose)(() => this.createdResourceGroups.delete(group));
		this.createdResourceGroups.set(group, disposable);
		this.eventuallyAddResourceGroups();
		return group;
	}

	@debounce(100)
	eventuallyAddResourceGroups(): void {
		const groups: [number /*handle*/, string /*id*/, string /*label*/, SCMGroupFeatures, /*multiDiffEditorEnableViewChanges*/ boolean][] = [];
		const splices: SCMRawResourceSplices[] = [];

		for (const [group, disposable] of this.createdResourceGroups) {
			disposable.dispose();

			const updateListener = group.onDidUpdateResourceStates(() => {
				this.updatedResourceGroups.add(group);
				this.eventuallyUpdateResourceStates();
			});

			Event.once(group.onDidDispose)(() => {
				this.updatedResourceGroups.delete(group);
				updateListener.dispose();
				this._groups.delete(group.handle);
				this.#proxy.$unregisterGroup(this.handle, group.handle);
			});

			groups.push([group.handle, group.id, group.label, group.features, group.multiDiffEditorEnableViewChanges]);

			const snapshot = group._takeResourceStateSnapshot();

			if (snapshot.length > 0) {
				splices.push([group.handle, snapshot]);
			}

			this._groups.set(group.handle, group);
		}

		this.#proxy.$registerGroups(this.handle, groups, splices);
		this.createdResourceGroups.clear();
	}

	@debounce(100)
	eventuallyUpdateResourceStates(): void {
		const splices: SCMRawResourceSplices[] = [];

		this.updatedResourceGroups.forEach(group => {
			const snapshot = group._takeResourceStateSnapshot();

			if (snapshot.length === 0) {
				return;
			}

			splices.push([group.handle, snapshot]);
		});

		if (splices.length > 0) {
			this.#proxy.$spliceResourceStates(this.handle, splices);
		}

		this.updatedResourceGroups.clear();
	}

	getResourceGroup(handle: GroupHandle): ExtHostSourceControlResourceGroup | undefined {
		return this._groups.get(handle);
	}

	setSelectionState(selected: boolean): void {
		this._selected = selected;
		this._onDidChangeSelection.fire(selected);
	}

	dispose(): void {
		this._acceptInputDisposables.dispose();
		this._actionButtonDisposables.dispose();
		this._statusBarDisposables.dispose();

		this._groups.forEach(group => group.dispose());
		this.#proxy.$unregisterSourceControl(this.handle);
	}
}

export class ExtHostSCM implements ExtHostSCMShape {

	private static _handlePool: number = 0;

	private _proxy: MainThreadSCMShape;
	private readonly _telemetry: MainThreadTelemetryShape;
	private _sourceControls: Map<ProviderHandle, ExtHostSourceControl> = new Map<ProviderHandle, ExtHostSourceControl>();
	private _sourceControlsByExtension: ExtensionIdentifierMap<ExtHostSourceControl[]> = new ExtensionIdentifierMap<ExtHostSourceControl[]>();

	private readonly _onDidChangeActiveProvider = new Emitter<vscode.SourceControl>();
	get onDidChangeActiveProvider(): Event<vscode.SourceControl> { return this._onDidChangeActiveProvider.event; }

	private _selectedSourceControlHandle: number | undefined;

	constructor(
		mainContext: IMainContext,
		private _commands: ExtHostCommands,
		private _extHostDocuments: ExtHostDocuments,
		@ILogService private readonly logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadSCM);
		this._telemetry = mainContext.getProxy(MainContext.MainThreadTelemetry);

		_commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$mid === MarshalledId.ScmResource) {
					const sourceControl = this._sourceControls.get(arg.sourceControlHandle);

					if (!sourceControl) {
						return arg;
					}

					const group = sourceControl.getResourceGroup(arg.groupHandle);

					if (!group) {
						return arg;
					}

					return group.getResourceState(arg.handle);
				} else if (arg && arg.$mid === MarshalledId.ScmResourceGroup) {
					const sourceControl = this._sourceControls.get(arg.sourceControlHandle);

					if (!sourceControl) {
						return arg;
					}

					return sourceControl.getResourceGroup(arg.groupHandle);
				} else if (arg && arg.$mid === MarshalledId.ScmProvider) {
					const sourceControl = this._sourceControls.get(arg.handle);

					if (!sourceControl) {
						return arg;
					}

					return sourceControl;
				}

				return arg;
			}
		});
	}

	createSourceControl(extension: IExtensionDescription, id: string, label: string, rootUri: vscode.Uri | undefined): vscode.SourceControl {
		this.logService.trace('ExtHostSCM#createSourceControl', extension.identifier.value, id, label, rootUri);

		type TEvent = { extensionId: string };
		type TMeta = {
			owner: 'joaomoreno';
			extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the extension contributing to the Source Control API.' };
			comment: 'This is used to know what extensions contribute to the Source Control API.';
		};
		this._telemetry.$publicLog2<TEvent, TMeta>('api/scm/createSourceControl', {
			extensionId: extension.identifier.value,
		});

		const handle = ExtHostSCM._handlePool++;
		const sourceControl = new ExtHostSourceControl(extension, this._extHostDocuments, this._proxy, this._commands, id, label, rootUri);
		this._sourceControls.set(handle, sourceControl);

		const sourceControls = this._sourceControlsByExtension.get(extension.identifier) || [];
		sourceControls.push(sourceControl);
		this._sourceControlsByExtension.set(extension.identifier, sourceControls);

		return sourceControl;
	}

	// Deprecated
	getLastInputBox(extension: IExtensionDescription): ExtHostSCMInputBox | undefined {
		this.logService.trace('ExtHostSCM#getLastInputBox', extension.identifier.value);

		const sourceControls = this._sourceControlsByExtension.get(extension.identifier);
		const sourceControl = sourceControls && sourceControls[sourceControls.length - 1];
		return sourceControl && sourceControl.inputBox;
	}

	$provideOriginalResource(sourceControlHandle: number, uriComponents: UriComponents, token: CancellationToken): Promise<UriComponents | null> {
		const uri = URI.revive(uriComponents);
		this.logService.trace('ExtHostSCM#$provideOriginalResource', sourceControlHandle, uri.toString());

		const sourceControl = this._sourceControls.get(sourceControlHandle);

		if (!sourceControl || !sourceControl.quickDiffProvider || !sourceControl.quickDiffProvider.provideOriginalResource) {
			return Promise.resolve(null);
		}

		return asPromise(() => sourceControl.quickDiffProvider!.provideOriginalResource!(uri, token))
			.then<UriComponents | null>(r => r || null);
	}

	$onInputBoxValueChange(sourceControlHandle: number, value: string): Promise<void> {
		this.logService.trace('ExtHostSCM#$onInputBoxValueChange', sourceControlHandle);

		const sourceControl = this._sourceControls.get(sourceControlHandle);

		if (!sourceControl) {
			return Promise.resolve(undefined);
		}

		sourceControl.inputBox.$onInputBoxValueChange(value);
		return Promise.resolve(undefined);
	}

	$executeResourceCommand(sourceControlHandle: number, groupHandle: number, handle: number, preserveFocus: boolean): Promise<void> {
		this.logService.trace('ExtHostSCM#$executeResourceCommand', sourceControlHandle, groupHandle, handle);

		const sourceControl = this._sourceControls.get(sourceControlHandle);

		if (!sourceControl) {
			return Promise.resolve(undefined);
		}

		const group = sourceControl.getResourceGroup(groupHandle);

		if (!group) {
			return Promise.resolve(undefined);
		}

		return group.$executeResourceCommand(handle, preserveFocus);
	}

	$validateInput(sourceControlHandle: number, value: string, cursorPosition: number): Promise<[string | IMarkdownString, number] | undefined> {
		this.logService.trace('ExtHostSCM#$validateInput', sourceControlHandle);

		const sourceControl = this._sourceControls.get(sourceControlHandle);

		if (!sourceControl) {
			return Promise.resolve(undefined);
		}

		if (!sourceControl.inputBox.validateInput) {
			return Promise.resolve(undefined);
		}

		return asPromise(() => sourceControl.inputBox.validateInput!(value, cursorPosition)).then(result => {
			if (!result) {
				return Promise.resolve(undefined);
			}

			const message = MarkdownString.fromStrict(result.message);
			if (!message) {
				return Promise.resolve(undefined);
			}

			return Promise.resolve<[string | IMarkdownString, number]>([message, result.type]);
		});
	}

	$setSelectedSourceControl(selectedSourceControlHandle: number | undefined): Promise<void> {
		this.logService.trace('ExtHostSCM#$setSelectedSourceControl', selectedSourceControlHandle);

		if (selectedSourceControlHandle !== undefined) {
			this._sourceControls.get(selectedSourceControlHandle)?.setSelectionState(true);
		}

		if (this._selectedSourceControlHandle !== undefined) {
			this._sourceControls.get(this._selectedSourceControlHandle)?.setSelectionState(false);
		}

		this._selectedSourceControlHandle = selectedSourceControlHandle;
		return Promise.resolve(undefined);
	}

	async $resolveHistoryItemRefsCommonAncestor(sourceControlHandle: number, historyItemRefs: string[], token: CancellationToken): Promise<string | undefined> {
		const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
		return await historyProvider?.resolveHistoryItemRefsCommonAncestor(historyItemRefs, token) ?? undefined;
	}

	async $provideHistoryItemRefs(sourceControlHandle: number, token: CancellationToken): Promise<SCMHistoryItemRefDto[] | undefined> {
		const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
		const historyItemRefs = await historyProvider?.provideHistoryItemRefs(token);

		return historyItemRefs?.map(ref => ({ ...ref, icon: getHistoryItemIconDto(ref.icon) })) ?? undefined;
	}

	async $provideHistoryItems(sourceControlHandle: number, options: any, token: CancellationToken): Promise<SCMHistoryItemDto[] | undefined> {
		const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
		const historyItems = await historyProvider?.provideHistoryItems(options, token);

		return historyItems?.map(item => toSCMHistoryItemDto(item)) ?? undefined;
	}

	async $provideHistoryItemChanges(sourceControlHandle: number, historyItemId: string, historyItemParentId: string | undefined, token: CancellationToken): Promise<SCMHistoryItemChangeDto[] | undefined> {
		const historyProvider = this._sourceControls.get(sourceControlHandle)?.historyProvider;
		return await historyProvider?.provideHistoryItemChanges(historyItemId, historyItemParentId, token) ?? undefined;
	}
}
