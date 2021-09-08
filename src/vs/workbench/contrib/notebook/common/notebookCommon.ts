/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDiffResult, ISequence } from 'vs/base/common/diff/diff';
import { Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import { Mimes } from 'vs/base/common/mime';
import { Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { ISplice } from 'vs/base/common/sequence';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Command } from 'vs/editor/common/modes';
import { IAccessibilityInformation } from 'vs/platform/accessibility/common/accessibility';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditorModel } from 'vs/platform/editor/common/editor';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import { IEditorInput, IRevertOptions, ISaveOptions } from 'vs/workbench/common/editor';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { IWorkingCopyBackupMeta } from 'vs/workbench/services/workingCopy/common/workingCopy';

export enum CellKind {
	Markup = 1,
	Code = 2
}

export const NOTEBOOK_DISPLAY_ORDER = [
	'application/json',
	'application/javascript',
	'text/html',
	'image/svg+xml',
	Mimes.markdown,
	'image/png',
	'image/jpeg',
	Mimes.text
];

export const ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER = [
	Mimes.markdown,
	'application/json',
	Mimes.text,
	'text/html',
	'image/svg+xml',
	'image/png',
	'image/jpeg',
];

export const BUILTIN_RENDERER_ID = '_builtin';
export const RENDERER_NOT_AVAILABLE = '_notAvailable';

export type NotebookRendererEntrypoint = string | { extends: string; path: string; };

export enum NotebookRunState {
	Running = 1,
	Idle = 2
}

export type NotebookDocumentMetadata = Record<string, unknown>;

// Aligns with the vscode.d.ts version
export enum NotebookCellExecutionState {
	Pending = 2,
	Executing = 3
}

export interface INotebookCellPreviousExecutionResult {
	executionOrder?: number;
	success?: boolean;
	duration?: number;
}

export interface NotebookCellMetadata {
	inputCollapsed?: boolean;
	outputCollapsed?: boolean;

	/**
	 * custom metadata
	 */
	[key: string]: unknown;
}

export interface NotebookCellInternalMetadata {
	executionOrder?: number;
	lastRunSuccess?: boolean;
	runState?: NotebookCellExecutionState;
	runStartTime?: number;
	runStartTimeAdjustment?: number;
	runEndTime?: number;
	isPaused?: boolean;
	didPause?: boolean;
}

export type TransientCellMetadata = { [K in keyof NotebookCellMetadata]?: boolean };
export type TransientDocumentMetadata = { [K in keyof NotebookDocumentMetadata]?: boolean };

export interface TransientOptions {
	transientOutputs: boolean;
	transientCellMetadata: TransientCellMetadata;
	transientDocumentMetadata: TransientDocumentMetadata;
}



/** Note: enum values are used for sorting */
export const enum NotebookRendererMatch {
	/** Renderer has a hard dependency on an available kernel */
	WithHardKernelDependency = 0,
	/** Renderer works better with an available kernel */
	WithOptionalKernelDependency = 1,
	/** Renderer is kernel-agnostic */
	Pure = 2,
	/** Renderer is for a different mimeType or has a hard dependency which is unsatisfied */
	Never = 3,
}

/**
 * Renderer messaging requirement. While this allows for 'optional' messaging,
 * VS Code effectively treats it the same as true right now. "Partial
 * activation" of extensions is a very tricky problem, which could allow
 * solving this. But for now, optional is mostly only honored for aznb.
 */
export const enum RendererMessagingSpec {
	Always = 'always',
	Never = 'never',
	Optional = 'optional',
}

export interface INotebookRendererInfo {
	id: string;
	displayName: string;
	extends?: string;
	entrypoint: URI;
	preloads: ReadonlyArray<URI>;
	extensionLocation: URI;
	extensionId: ExtensionIdentifier;
	messaging: RendererMessagingSpec;

	readonly mimeTypes: readonly string[];

	readonly dependencies: readonly string[];

	matchesWithoutKernel(mimeType: string): NotebookRendererMatch;
	matches(mimeType: string, kernelProvides: ReadonlyArray<string>): NotebookRendererMatch;
}


export interface IOrderedMimeType {
	mimeType: string;
	rendererId: string;
	isTrusted: boolean;
}

export interface IOutputItemDto {
	readonly mime: string;
	readonly data: VSBuffer;
}

export interface IOutputDto {
	outputs: IOutputItemDto[];
	outputId: string;
	metadata?: Record<string, any>;
}

export interface ICellOutput {
	outputs: IOutputItemDto[];
	metadata?: Record<string, any>;
	outputId: string;
	onDidChangeData: Event<void>;
	replaceData(items: IOutputItemDto[]): void;
	appendData(items: IOutputItemDto[]): void;
}

export interface CellInternalMetadataChangedEvent {
	readonly runStateChanged?: boolean;
	readonly lastRunSuccessChanged?: boolean;
}

export interface ICell {
	readonly uri: URI;
	handle: number;
	language: string;
	cellKind: CellKind;
	outputs: ICellOutput[];
	metadata: NotebookCellMetadata;
	internalMetadata: NotebookCellInternalMetadata;
	onDidChangeOutputs?: Event<NotebookCellOutputsSplice>;
	onDidChangeLanguage: Event<string>;
	onDidChangeMetadata: Event<void>;
	onDidChangeInternalMetadata: Event<CellInternalMetadataChangedEvent>;
}

export interface INotebookTextModel {
	readonly viewType: string;
	metadata: NotebookDocumentMetadata;
	readonly uri: URI;
	readonly versionId: number;

	readonly cells: readonly ICell[];
	onWillDispose: Event<void>;
}

export type NotebookCellTextModelSplice<T> = [
	start: number,
	deleteCount: number,
	newItems: T[]
];

export type NotebookCellOutputsSplice = {
	start: number /* start */;
	deleteCount: number /* delete count */;
	newOutputs: ICellOutput[];
};

export interface IMainCellDto {
	handle: number;
	uri: UriComponents,
	source: string[];
	eol: string;
	language: string;
	cellKind: CellKind;
	outputs: IOutputDto[];
	metadata?: NotebookCellMetadata;
	internalMetadata?: NotebookCellInternalMetadata;
}

export enum NotebookCellsChangeType {
	ModelChange = 1,
	Move = 2,
	ChangeLanguage = 5,
	Initialize = 6,
	ChangeCellMetadata = 7,
	Output = 8,
	OutputItem = 9,
	ChangeCellContent = 10,
	ChangeDocumentMetadata = 11,
	ChangeCellInternalMetadata = 12,
	ChangeCellMime = 13,
	Unknown = 100
}

export interface NotebookCellsInitializeEvent<T> {
	readonly kind: NotebookCellsChangeType.Initialize;
	readonly changes: NotebookCellTextModelSplice<T>[];
}

export interface NotebookCellContentChangeEvent {
	readonly kind: NotebookCellsChangeType.ChangeCellContent;
}

export interface NotebookCellsModelChangedEvent<T> {
	readonly kind: NotebookCellsChangeType.ModelChange;
	readonly changes: NotebookCellTextModelSplice<T>[];
}

export interface NotebookCellsModelMoveEvent<T> {
	readonly kind: NotebookCellsChangeType.Move;
	readonly index: number;
	readonly length: number;
	readonly newIdx: number;
	readonly cells: T[];
}

export interface NotebookOutputChangedEvent {
	readonly kind: NotebookCellsChangeType.Output;
	readonly index: number;
	readonly outputs: IOutputDto[];
	readonly append: boolean;
}

export interface NotebookOutputItemChangedEvent {
	readonly kind: NotebookCellsChangeType.OutputItem;
	readonly index: number;
	readonly outputId: string;
	readonly outputItems: IOutputItemDto[];
	readonly append: boolean;
}

export interface NotebookCellsChangeLanguageEvent {
	readonly kind: NotebookCellsChangeType.ChangeLanguage;
	readonly index: number;
	readonly language: string;
}

export interface NotebookCellsChangeMimeEvent {
	readonly kind: NotebookCellsChangeType.ChangeCellMime;
	readonly index: number;
	readonly mime: string | undefined;
}

export interface NotebookCellsChangeMetadataEvent {
	readonly kind: NotebookCellsChangeType.ChangeCellMetadata;
	readonly index: number;
	readonly metadata: NotebookCellMetadata;
}

export interface NotebookCellsChangeInternalMetadataEvent {
	readonly kind: NotebookCellsChangeType.ChangeCellInternalMetadata;
	readonly index: number;
	readonly internalMetadata: NotebookCellInternalMetadata;
}

export interface NotebookDocumentChangeMetadataEvent {
	readonly kind: NotebookCellsChangeType.ChangeDocumentMetadata;
	readonly metadata: NotebookDocumentMetadata;
}

export interface NotebookDocumentUnknownChangeEvent {
	readonly kind: NotebookCellsChangeType.Unknown;
}

export type NotebookRawContentEventDto = NotebookCellsInitializeEvent<IMainCellDto> | NotebookDocumentChangeMetadataEvent | NotebookCellContentChangeEvent | NotebookCellsModelChangedEvent<IMainCellDto> | NotebookCellsModelMoveEvent<IMainCellDto> | NotebookOutputChangedEvent | NotebookOutputItemChangedEvent | NotebookCellsChangeLanguageEvent | NotebookCellsChangeMimeEvent | NotebookCellsChangeMetadataEvent | NotebookCellsChangeInternalMetadataEvent | NotebookDocumentUnknownChangeEvent;

export type NotebookCellsChangedEventDto = {
	readonly rawEvents: NotebookRawContentEventDto[];
	readonly versionId: number;
};

export type NotebookRawContentEvent = (NotebookCellsInitializeEvent<ICell> | NotebookDocumentChangeMetadataEvent | NotebookCellContentChangeEvent | NotebookCellsModelChangedEvent<ICell> | NotebookCellsModelMoveEvent<ICell> | NotebookOutputChangedEvent | NotebookOutputItemChangedEvent | NotebookCellsChangeLanguageEvent | NotebookCellsChangeMimeEvent | NotebookCellsChangeMetadataEvent | NotebookCellsChangeInternalMetadataEvent | NotebookDocumentUnknownChangeEvent) & { transient: boolean; };

export enum SelectionStateType {
	Handle = 0,
	Index = 1
}

export interface ISelectionHandleState {
	kind: SelectionStateType.Handle;
	primary: number | null;
	selections: number[];
}

export interface ISelectionIndexState {
	kind: SelectionStateType.Index;
	focus: ICellRange;
	selections: ICellRange[];
}

export type ISelectionState = ISelectionHandleState | ISelectionIndexState;

export type NotebookTextModelChangedEvent = {
	readonly rawEvents: NotebookRawContentEvent[];
	readonly versionId: number;
	readonly synchronous: boolean | undefined;
	readonly endSelectionState: ISelectionState | undefined;
};

export type NotebookTextModelWillAddRemoveEvent = {
	readonly rawEvent: NotebookCellsModelChangedEvent<ICell>;
};

export const enum CellEditType {
	Replace = 1,
	Output = 2,
	Metadata = 3,
	CellLanguage = 4,
	DocumentMetadata = 5,
	Move = 6,
	OutputItems = 7,
	PartialMetadata = 8,
	PartialInternalMetadata = 9,
}

export interface ICellDto2 {
	source: string;
	language: string;
	mime: string | undefined;
	cellKind: CellKind;
	outputs: IOutputDto[];
	metadata?: NotebookCellMetadata;
	internalMetadata?: NotebookCellInternalMetadata;
}

export interface ICellReplaceEdit {
	editType: CellEditType.Replace;
	index: number;
	count: number;
	cells: ICellDto2[];
}

export interface ICellOutputEdit {
	editType: CellEditType.Output;
	index: number;
	outputs: IOutputDto[];
	append?: boolean;
}

export interface ICellOutputEditByHandle {
	editType: CellEditType.Output;
	handle: number;
	outputs: IOutputDto[];
	append?: boolean;
}

export interface ICellOutputItemEdit {
	editType: CellEditType.OutputItems;
	outputId: string;
	items: IOutputItemDto[];
	append?: boolean;
}

export interface ICellMetadataEdit {
	editType: CellEditType.Metadata;
	index: number;
	metadata: NotebookCellMetadata;
}

// These types are nullable because we need to use 'null' on the EH side so it is JSON-stringified
export type NullablePartialNotebookCellMetadata = {
	[Key in keyof Partial<NotebookCellMetadata>]: NotebookCellMetadata[Key] | null
};

export interface ICellPartialMetadataEdit {
	editType: CellEditType.PartialMetadata;
	index: number;
	metadata: NullablePartialNotebookCellMetadata;
}

export interface ICellPartialMetadataEditByHandle {
	editType: CellEditType.PartialMetadata;
	handle: number;
	metadata: NullablePartialNotebookCellMetadata;
}

export type NullablePartialNotebookCellInternalMetadata = {
	[Key in keyof Partial<NotebookCellInternalMetadata>]: NotebookCellInternalMetadata[Key] | null
};
export interface ICellPartialInternalMetadataEdit {
	editType: CellEditType.PartialInternalMetadata;
	index: number;
	internalMetadata: NullablePartialNotebookCellInternalMetadata;
}

export interface ICellPartialInternalMetadataEditByHandle {
	editType: CellEditType.PartialInternalMetadata;
	handle: number;
	internalMetadata: NullablePartialNotebookCellInternalMetadata;
}

export interface ICellLanguageEdit {
	editType: CellEditType.CellLanguage;
	index: number;
	language: string;
}

export interface IDocumentMetadataEdit {
	editType: CellEditType.DocumentMetadata;
	metadata: NotebookDocumentMetadata;
}

export interface ICellMoveEdit {
	editType: CellEditType.Move;
	index: number;
	length: number;
	newIdx: number;
}

export type IImmediateCellEditOperation = ICellOutputEditByHandle | ICellPartialMetadataEditByHandle | ICellOutputItemEdit | ICellPartialInternalMetadataEdit | ICellPartialInternalMetadataEditByHandle | ICellPartialMetadataEdit;
export type ICellEditOperation = IImmediateCellEditOperation | ICellReplaceEdit | ICellOutputEdit | ICellMetadataEdit | ICellPartialMetadataEdit | ICellPartialInternalMetadataEdit | IDocumentMetadataEdit | ICellMoveEdit | ICellOutputItemEdit | ICellLanguageEdit;

export interface NotebookData {
	readonly cells: ICellDto2[];
	readonly metadata: NotebookDocumentMetadata;
}


export interface INotebookContributionData {
	extension?: ExtensionIdentifier,
	providerDisplayName: string;
	displayName: string;
	filenamePattern: (string | glob.IRelativePattern | INotebookExclusiveDocumentFilter)[];
	exclusive: boolean;
}


export namespace CellUri {

	export const scheme = Schemas.vscodeNotebookCell;

	const _regex = /^ch(\d{7,})/;

	export function generate(notebook: URI, handle: number): URI {
		return notebook.with({
			scheme,
			fragment: `ch${handle.toString().padStart(7, '0')}${notebook.scheme !== Schemas.file ? notebook.scheme : ''}`
		});
	}

	export function parse(cell: URI): { notebook: URI, handle: number; } | undefined {
		if (cell.scheme !== scheme) {
			return undefined;
		}
		const match = _regex.exec(cell.fragment);
		if (!match) {
			return undefined;
		}
		const handle = Number(match[1]);
		return {
			handle,
			notebook: cell.with({
				scheme: cell.fragment.substr(match[0].length) || Schemas.file,
				fragment: null
			})
		};
	}

	export function parseCellMetadataUri(metadata: URI) {
		if (metadata.scheme !== Schemas.vscodeNotebookCellMetadata) {
			return undefined;
		}
		const match = _regex.exec(metadata.fragment);
		if (!match) {
			return undefined;
		}
		const handle = Number(match[1]);
		return {
			handle,
			notebook: metadata.with({
				scheme: metadata.fragment.substr(match[0].length) || Schemas.file,
				fragment: null
			})
		};
	}

	export function generateCellUri(notebook: URI, handle: number, scheme: string): URI {
		return notebook.with({
			scheme: scheme,
			fragment: `ch${handle.toString().padStart(7, '0')}${notebook.scheme !== Schemas.file ? notebook.scheme : ''}`
		});
	}

	export function parseCellUri(metadata: URI, scheme: string) {
		if (metadata.scheme !== scheme) {
			return undefined;
		}
		const match = _regex.exec(metadata.fragment);
		if (!match) {
			return undefined;
		}
		const handle = Number(match[1]);
		return {
			handle,
			notebook: metadata.with({
				scheme: metadata.fragment.substr(match[0].length) || Schemas.file,
				fragment: null
			})
		};
	}
}

type MimeTypeInfo = {
	alwaysSecure?: boolean;
	supportedByCore?: boolean;
	mergeable?: boolean;
};

const _mimeTypeInfo = new Map<string, MimeTypeInfo>([
	['application/javascript', { supportedByCore: true }],
	['image/png', { alwaysSecure: true, supportedByCore: true }],
	['image/jpeg', { alwaysSecure: true, supportedByCore: true }],
	['image/git', { alwaysSecure: true, supportedByCore: true }],
	['image/svg+xml', { supportedByCore: true }],
	['application/json', { alwaysSecure: true, supportedByCore: true }],
	[Mimes.markdown, { alwaysSecure: true, supportedByCore: true }],
	[Mimes.text, { alwaysSecure: true, supportedByCore: true }],
	['text/html', { supportedByCore: true }],
	['text/x-javascript', { alwaysSecure: true, supportedByCore: true }], // secure because rendered as text, not executed
	['application/vnd.code.notebook.error', { alwaysSecure: true, supportedByCore: true }],
	['application/vnd.code.notebook.stdout', { alwaysSecure: true, supportedByCore: true, mergeable: true }],
	['application/vnd.code.notebook.stderr', { alwaysSecure: true, supportedByCore: true, mergeable: true }],
]);

export function mimeTypeIsAlwaysSecure(mimeType: string): boolean {
	return _mimeTypeInfo.get(mimeType)?.alwaysSecure ?? false;
}

export function mimeTypeSupportedByCore(mimeType: string) {
	return _mimeTypeInfo.get(mimeType)?.supportedByCore ?? false;
}

export function mimeTypeIsMergeable(mimeType: string): boolean {
	return _mimeTypeInfo.get(mimeType)?.mergeable ?? false;
}

function matchGlobUniversal(pattern: string, path: string) {
	if (isWindows) {
		pattern = pattern.replace(/\//g, '\\');
		path = path.replace(/\//g, '\\');
	}

	return glob.match(pattern, path);
}


function getMimeTypeOrder(mimeType: string, userDisplayOrder: string[], defaultOrder: string[]) {
	let order = 0;
	for (let i = 0; i < userDisplayOrder.length; i++) {
		if (matchGlobUniversal(userDisplayOrder[i], mimeType)) {
			return order;
		}
		order++;
	}

	for (let i = 0; i < defaultOrder.length; i++) {
		if (matchGlobUniversal(defaultOrder[i], mimeType)) {
			return order;
		}

		order++;
	}

	return order;
}

export function sortMimeTypes(mimeTypes: string[], userDisplayOrder: string[], defaultOrder: string[]) {
	return mimeTypes.sort((a, b) => getMimeTypeOrder(a, userDisplayOrder, defaultOrder) - getMimeTypeOrder(b, userDisplayOrder, defaultOrder));
}

interface IMutableSplice<T> extends ISplice<T> {
	deleteCount: number;
}

export function diff<T>(before: T[], after: T[], contains: (a: T) => boolean, equal: (a: T, b: T) => boolean = (a: T, b: T) => a === b): ISplice<T>[] {
	const result: IMutableSplice<T>[] = [];

	function pushSplice(start: number, deleteCount: number, toInsert: T[]): void {
		if (deleteCount === 0 && toInsert.length === 0) {
			return;
		}

		const latest = result[result.length - 1];

		if (latest && latest.start + latest.deleteCount === start) {
			latest.deleteCount += deleteCount;
			latest.toInsert.push(...toInsert);
		} else {
			result.push({ start, deleteCount, toInsert });
		}
	}

	let beforeIdx = 0;
	let afterIdx = 0;

	while (true) {
		if (beforeIdx === before.length) {
			pushSplice(beforeIdx, 0, after.slice(afterIdx));
			break;
		}

		if (afterIdx === after.length) {
			pushSplice(beforeIdx, before.length - beforeIdx, []);
			break;
		}

		const beforeElement = before[beforeIdx];
		const afterElement = after[afterIdx];

		if (equal(beforeElement, afterElement)) {
			// equal
			beforeIdx += 1;
			afterIdx += 1;
			continue;
		}

		if (contains(afterElement)) {
			// `afterElement` exists before, which means some elements before `afterElement` are deleted
			pushSplice(beforeIdx, 1, []);
			beforeIdx += 1;
		} else {
			// `afterElement` added
			pushSplice(beforeIdx, 0, [afterElement]);
			afterIdx += 1;
		}
	}

	return result;
}

export interface ICellEditorViewState {
	selections: editorCommon.ICursorState[];
}

export const NOTEBOOK_EDITOR_CURSOR_BOUNDARY = new RawContextKey<'none' | 'top' | 'bottom' | 'both'>('notebookEditorCursorAtBoundary', 'none');


export interface INotebookLoadOptions {
	/**
	 * Go to disk bypassing any cache of the model if any.
	 */
	forceReadFromFile?: boolean;
}

export interface IResolvedNotebookEditorModel extends INotebookEditorModel {
	notebook: NotebookTextModel;
}

export interface INotebookEditorModel extends IEditorModel {
	readonly onDidChangeDirty: Event<void>;
	readonly onDidSave: Event<void>;
	readonly onDidChangeOrphaned: Event<void>;
	readonly onDidChangeReadonly: Event<void>;
	readonly resource: URI;
	readonly viewType: string;
	readonly notebook: NotebookTextModel | undefined;
	isResolved(): this is IResolvedNotebookEditorModel;
	isDirty(): boolean;
	isReadonly(): boolean;
	isOrphaned(): boolean;
	hasAssociatedFilePath(): boolean;
	load(options?: INotebookLoadOptions): Promise<IResolvedNotebookEditorModel>;
	save(options?: ISaveOptions): Promise<boolean>;
	saveAs(target: URI): Promise<IEditorInput | undefined>;
	revert(options?: IRevertOptions): Promise<void>;
}

export interface INotebookDiffEditorModel extends IEditorModel {
	original: IResolvedNotebookEditorModel;
	modified: IResolvedNotebookEditorModel;
}

export interface NotebookDocumentBackupData extends IWorkingCopyBackupMeta {
	readonly viewType: string;
	readonly backupId?: string;
	readonly mtime?: number;
}

export enum NotebookEditorPriority {
	default = 'default',
	option = 'option',
}

export interface INotebookSearchOptions {
	regex?: boolean;
	wholeWord?: boolean;
	caseSensitive?: boolean;
	wordSeparators?: string;
}

export interface INotebookExclusiveDocumentFilter {
	include?: string | glob.IRelativePattern;
	exclude?: string | glob.IRelativePattern;
}

export interface INotebookDocumentFilter {
	viewType?: string | string[];
	filenamePattern?: string | glob.IRelativePattern | INotebookExclusiveDocumentFilter;
}

//TODO@rebornix test

export function isDocumentExcludePattern(filenamePattern: string | glob.IRelativePattern | INotebookExclusiveDocumentFilter): filenamePattern is { include: string | glob.IRelativePattern; exclude: string | glob.IRelativePattern; } {
	const arg = filenamePattern as INotebookExclusiveDocumentFilter;

	if ((typeof arg.include === 'string' || glob.isRelativePattern(arg.include))
		&& (typeof arg.exclude === 'string' || glob.isRelativePattern(arg.exclude))) {
		return true;
	}

	return false;
}
export function notebookDocumentFilterMatch(filter: INotebookDocumentFilter, viewType: string, resource: URI): boolean {
	if (Array.isArray(filter.viewType) && filter.viewType.indexOf(viewType) >= 0) {
		return true;
	}

	if (filter.viewType === viewType) {
		return true;
	}

	if (filter.filenamePattern) {
		let filenamePattern = isDocumentExcludePattern(filter.filenamePattern) ? filter.filenamePattern.include : (filter.filenamePattern as string | glob.IRelativePattern);
		let excludeFilenamePattern = isDocumentExcludePattern(filter.filenamePattern) ? filter.filenamePattern.exclude : undefined;

		if (glob.match(filenamePattern, basename(resource.fsPath).toLowerCase())) {
			if (excludeFilenamePattern) {
				if (glob.match(excludeFilenamePattern, basename(resource.fsPath).toLowerCase())) {
					// should exclude

					return false;
				}
			}
			return true;
		}
	}
	return false;
}

export interface INotebookCellStatusBarItemProvider {
	viewType: string;
	onDidChangeStatusBarItems?: Event<void>;
	provideCellStatusBarItems(uri: URI, index: number, token: CancellationToken): Promise<INotebookCellStatusBarItemList | undefined>;
}

export class CellSequence implements ISequence {

	constructor(readonly textModel: NotebookTextModel) {
	}

	getElements(): string[] | number[] | Int32Array {
		const hashValue = new Int32Array(this.textModel.cells.length);
		for (let i = 0; i < this.textModel.cells.length; i++) {
			hashValue[i] = this.textModel.cells[i].getHashValue();
		}

		return hashValue;
	}
}

export interface INotebookDiffResult {
	cellsDiff: IDiffResult,
	linesDiff?: { originalCellhandle: number, modifiedCellhandle: number, lineChanges: editorCommon.ILineChange[]; }[];
}

export interface INotebookCellStatusBarItem {
	readonly alignment: CellStatusbarAlignment;
	readonly priority?: number;
	readonly text: string;
	readonly color?: string | ThemeColor;
	readonly backgroundColor?: string | ThemeColor;
	readonly tooltip?: string;
	readonly command?: string | Command;
	readonly accessibilityInformation?: IAccessibilityInformation;
	readonly opacity?: string;
	readonly onlyShowWhenActive?: boolean;
}

export interface INotebookCellStatusBarItemList {
	items: INotebookCellStatusBarItem[];
	dispose?(): void;
}

export const DisplayOrderKey = 'notebook.displayOrder';
export const CellToolbarLocation = 'notebook.cellToolbarLocation';
export const CellToolbarVisibility = 'notebook.cellToolbarVisibility';
export type ShowCellStatusBarType = 'hidden' | 'visible' | 'visibleAfterExecute';
export const ShowCellStatusBar = 'notebook.showCellStatusBar';
export const NotebookTextDiffEditorPreview = 'notebook.diff.enablePreview';
export const ExperimentalInsertToolbarAlignment = 'notebook.experimental.insertToolbarAlignment';
export const CompactView = 'notebook.compactView';
export const FocusIndicator = 'notebook.cellFocusIndicator';
export const InsertToolbarLocation = 'notebook.insertToolbarLocation';
export const GlobalToolbar = 'notebook.globalToolbar';
export const UndoRedoPerCell = 'notebook.undoRedoPerCell';
export const ConsolidatedOutputButton = 'notebook.consolidatedOutputButton';
export const ShowFoldingControls = 'notebook.showFoldingControls';
export const DragAndDropEnabled = 'notebook.dragAndDropEnabled';
export const NotebookCellEditorOptionsCustomizations = 'notebook.editorOptionsCustomizations';
export const ConsolidatedRunButton = 'notebook.consolidatedRunButton';
export const OpenGettingStarted = 'notebook.experimental.openGettingStarted';
export const TextOutputLineLimit = 'notebook.output.textLineLimit';
export const GlobalToolbarShowLabel = 'notebook.globalToolbarShowLabel';

export const enum CellStatusbarAlignment {
	Left = 1,
	Right = 2
}

export interface INotebookDecorationRenderOptions {
	backgroundColor?: string | ThemeColor;
	borderColor?: string | ThemeColor;
	top?: editorCommon.IContentDecorationRenderOptions;
}

export class NotebookWorkingCopyTypeIdentifier {

	private static _prefix = 'notebook/';

	static create(viewType: string): string {
		return `${NotebookWorkingCopyTypeIdentifier._prefix}${viewType}`;
	}

	static parse(candidate: string): string | undefined {
		if (candidate.startsWith(NotebookWorkingCopyTypeIdentifier._prefix)) {
			return candidate.substr(NotebookWorkingCopyTypeIdentifier._prefix.length);
		}
		return undefined;
	}
}
