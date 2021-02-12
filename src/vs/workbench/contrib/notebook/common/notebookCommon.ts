/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDiffResult, ISequence } from 'vs/base/common/diff/diff';
import { Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
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
import { IRevertOptions } from 'vs/workbench/common/editor';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { ThemeColor } from 'vs/platform/theme/common/themeService';

export enum CellKind {
	Markdown = 1,
	Code = 2
}

export const NOTEBOOK_DISPLAY_ORDER = [
	'application/json',
	'application/javascript',
	'text/html',
	'image/svg+xml',
	'text/markdown',
	'image/png',
	'image/jpeg',
	'text/plain'
];

export const ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER = [
	'text/markdown',
	'application/json',
	'text/plain',
	'text/html',
	'image/svg+xml',
	'image/png',
	'image/jpeg',
];

export const BUILTIN_RENDERER_ID = '_builtin';
export const RENDERER_NOT_AVAILABLE = '_notAvailable';

export enum NotebookRunState {
	Running = 1,
	Idle = 2
}

export const notebookDocumentMetadataDefaults: Required<NotebookDocumentMetadata> = {
	editable: true,
	runnable: true,
	cellEditable: true,
	cellRunnable: true,
	cellHasExecutionOrder: true,
	displayOrder: NOTEBOOK_DISPLAY_ORDER,
	custom: {},
	runState: NotebookRunState.Idle,
	trusted: true
};

export interface NotebookDocumentMetadata {
	editable: boolean;
	runnable: boolean;
	cellEditable: boolean;
	cellRunnable: boolean;
	cellHasExecutionOrder: boolean;
	displayOrder?: (string | glob.IRelativePattern)[];
	custom?: { [key: string]: unknown };
	runState?: NotebookRunState;
	trusted: boolean;
}

export enum NotebookCellRunState {
	Running = 1,
	Idle = 2,
	Success = 3,
	Error = 4
}

export interface NotebookCellMetadata {
	editable?: boolean;
	runnable?: boolean;
	breakpointMargin?: boolean;
	hasExecutionOrder?: boolean;
	executionOrder?: number;
	statusMessage?: string;
	runState?: NotebookCellRunState;
	runStartTime?: number;
	lastRunDuration?: number;
	inputCollapsed?: boolean;
	outputCollapsed?: boolean;
	custom?: { [key: string]: unknown };
}

export type TransientMetadata = { [K in keyof NotebookCellMetadata]?: boolean };

export interface TransientOptions {
	transientOutputs: boolean;
	transientMetadata: TransientMetadata;
}

export interface INotebookDisplayOrder {
	defaultOrder: string[];
	userOrder?: string[];
}

export interface INotebookMimeTypeSelector {
	mimeTypes?: string[];
}

export interface INotebookRendererInfo {
	id: string;
	displayName: string;
	entrypoint: URI;
	preloads: ReadonlyArray<URI>;
	extensionLocation: URI;
	extensionId: ExtensionIdentifier;

	matches(mimeType: string): boolean;
}

export interface INotebookMarkdownRendererInfo {
	readonly entrypoint: URI;
	readonly extensionLocation: URI;
	readonly extensionId: ExtensionIdentifier;
	readonly extensionIsBuiltin: boolean;
}

export interface NotebookCellOutputMetadata {
	/**
	 * Additional attributes of a cell metadata.
	 */
	custom?: { [key: string]: unknown };
}

export interface IOrderedMimeType {
	mimeType: string;
	rendererId: string;
	isTrusted: boolean;
}

export interface IOutputItemDto {
	readonly mime: string;
	readonly value: unknown;
	readonly metadata?: Record<string, unknown>;
}

export interface IOutputDto {
	outputs: IOutputItemDto[];
	/**
	 * { mime_type: value }
	 */
	// data: { [key: string]: unknown; }

	// metadata?: NotebookCellOutputMetadata;
	outputId: string;
}

export interface ICellOutput {
	outputs: IOutputItemDto[];
	// metadata?: NotebookCellOutsputMetadata;
	outputId: string;
	onDidChangeData: Event<void>;
	replaceData(items: IOutputItemDto[]): void;
	appendData(items: IOutputItemDto[]): void;
}

export interface ICell {
	readonly uri: URI;
	handle: number;
	language: string;
	cellKind: CellKind;
	outputs: ICellOutput[];
	metadata?: NotebookCellMetadata;
	onDidChangeOutputs?: Event<NotebookCellOutputsSplice[]>;
	onDidChangeLanguage: Event<string>;
	onDidChangeMetadata: Event<void>;
}

export interface INotebookTextModel {
	readonly viewType: string;
	metadata: NotebookDocumentMetadata
	readonly uri: URI;
	readonly versionId: number;

	readonly cells: readonly ICell[];
	onWillDispose(listener: () => void): IDisposable;
}

export type NotebookCellTextModelSplice<T> = [
	number /* start */,
	number,
	T[]
];

export type NotebookCellOutputsSplice = [
	start: number /* start */,
	deleteCount: number /* delete count */,
	newOutputs: ICellOutput[]
];

export interface IMainCellDto {
	handle: number;
	uri: UriComponents,
	source: string[];
	eol: string;
	language: string;
	cellKind: CellKind;
	outputs: IOutputDto[];
	metadata?: NotebookCellMetadata;
}

export type NotebookCellsSplice2 = [
	number /* start */,
	number /* delete count */,
	IMainCellDto[]
];

export enum NotebookCellsChangeType {
	ModelChange = 1,
	Move = 2,
	CellClearOutput = 3,
	CellsClearOutput = 4,
	ChangeLanguage = 5,
	Initialize = 6,
	ChangeCellMetadata = 7,
	Output = 8,
	ChangeCellContent = 9,
	ChangeDocumentMetadata = 10,
	Unknown = 11
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
}

export interface NotebookCellsChangeLanguageEvent {
	readonly kind: NotebookCellsChangeType.ChangeLanguage;
	readonly index: number;
	readonly language: string;
}

export interface NotebookCellsChangeMetadataEvent {
	readonly kind: NotebookCellsChangeType.ChangeCellMetadata;
	readonly index: number;
	readonly metadata: NotebookCellMetadata | undefined;
}

export interface NotebookDocumentChangeMetadataEvent {
	readonly kind: NotebookCellsChangeType.ChangeDocumentMetadata;
	readonly metadata: NotebookDocumentMetadata | undefined;
}

export interface NotebookDocumentUnknownChangeEvent {
	readonly kind: NotebookCellsChangeType.Unknown;
}

export type NotebookRawContentEventDto = NotebookCellsInitializeEvent<IMainCellDto> | NotebookDocumentChangeMetadataEvent | NotebookCellContentChangeEvent | NotebookCellsModelChangedEvent<IMainCellDto> | NotebookCellsModelMoveEvent<IMainCellDto> | NotebookOutputChangedEvent | NotebookCellsChangeLanguageEvent | NotebookCellsChangeMetadataEvent | NotebookDocumentUnknownChangeEvent;

export type NotebookCellsChangedEventDto = {
	readonly rawEvents: NotebookRawContentEventDto[];
	readonly versionId: number;
};

export type NotebookRawContentEvent = (NotebookCellsInitializeEvent<ICell> | NotebookDocumentChangeMetadataEvent | NotebookCellContentChangeEvent | NotebookCellsModelChangedEvent<ICell> | NotebookCellsModelMoveEvent<ICell> | NotebookOutputChangedEvent | NotebookCellsChangeLanguageEvent | NotebookCellsChangeMetadataEvent | NotebookDocumentUnknownChangeEvent) & { transient: boolean; };
export type NotebookTextModelChangedEvent = {
	readonly rawEvents: NotebookRawContentEvent[];
	readonly versionId: number;
	readonly synchronous: boolean;
	readonly endSelections?: number[];
};

export const enum CellEditType {
	Replace = 1,
	Output = 2,
	Metadata = 3,
	CellLanguage = 4,
	DocumentMetadata = 5,
	OutputsSplice = 6,
	Move = 7,
	Unknown = 8,
	CellContent = 9,
	OutputItems = 10
}

export interface ICellDto2 {
	source: string;
	language: string;
	cellKind: CellKind;
	outputs: IOutputDto[];
	metadata?: NotebookCellMetadata;
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
	append?: boolean
}

export interface ICellOutputItemEdit {
	editType: CellEditType.OutputItems;
	index: number;
	outputId: string;
	items: IOutputItemDto[];
	append?: boolean;
}

export interface ICellMetadataEdit {
	editType: CellEditType.Metadata;
	index: number;
	metadata: NotebookCellMetadata;
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

export type ICellEditOperation = ICellReplaceEdit | ICellOutputEdit | ICellMetadataEdit | ICellLanguageEdit | IDocumentMetadataEdit | ICellMoveEdit | ICellOutputItemEdit;

export interface NotebookDataDto {
	readonly cells: ICellDto2[];
	readonly metadata: NotebookDocumentMetadata;
}

export function getCellUndoRedoComparisonKey(uri: URI) {
	const data = CellUri.parse(uri);
	if (!data) {
		return uri.toString();
	}

	return data.notebook.toString();
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

	export function parse(cell: URI): { notebook: URI, handle: number } | undefined {
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

	export function generateCellMetadataUri(notebook: URI, handle: number): URI {
		return notebook.with({
			scheme: Schemas.vscodeNotebookCellMetadata,
			fragment: `ch${handle.toString().padStart(7, '0')}${notebook.scheme !== Schemas.file ? notebook.scheme : ''}`
		});
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
}

type MimeTypeInfo = {
	alwaysSecure?: boolean;
	supportedByCore?: boolean;
};

const _mimeTypeInfo = new Map<string, MimeTypeInfo>([
	['application/json', { alwaysSecure: true, supportedByCore: true }],
	['text/markdown', { alwaysSecure: true, supportedByCore: true }],
	['image/png', { alwaysSecure: true, supportedByCore: true }],
	['text/plain', { alwaysSecure: true, supportedByCore: true }],
	['application/javascript', { supportedByCore: true }],
	['text/html', { supportedByCore: true }],
	['image/svg+xml', { supportedByCore: true }],
	['image/jpeg', { supportedByCore: true }],
	['text/x-javascript', { supportedByCore: true }],
	['application/x.notebook.error-traceback', { alwaysSecure: true, supportedByCore: true }],
]);

export function mimeTypeIsAlwaysSecure(mimeType: string): boolean {
	return _mimeTypeInfo.get(mimeType)?.alwaysSecure ?? false;
}

export function mimeTypeSupportedByCore(mimeType: string) {
	return _mimeTypeInfo.get(mimeType)?.supportedByCore ?? false;
}

// if (isWindows) {
// 	value = value.replace(/\//g, '\\');
// }

function matchGlobUniversal(pattern: string, path: string) {
	if (isWindows) {
		pattern = pattern.replace(/\//g, '\\');
		path = path.replace(/\//g, '\\');
	}

	return glob.match(pattern, path);
}


function getMimeTypeOrder(mimeType: string, userDisplayOrder: string[], documentDisplayOrder: string[], defaultOrder: string[]) {
	let order = 0;
	for (let i = 0; i < userDisplayOrder.length; i++) {
		if (matchGlobUniversal(userDisplayOrder[i], mimeType)) {
			return order;
		}
		order++;
	}

	for (let i = 0; i < documentDisplayOrder.length; i++) {
		if (matchGlobUniversal(documentDisplayOrder[i], mimeType)) {
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

export function sortMimeTypes(mimeTypes: string[], userDisplayOrder: string[], documentDisplayOrder: string[], defaultOrder: string[]) {
	const sorted = mimeTypes.sort((a, b) => {
		return getMimeTypeOrder(a, userDisplayOrder, documentDisplayOrder, defaultOrder) - getMimeTypeOrder(b, userDisplayOrder, documentDisplayOrder, defaultOrder);
	});

	return sorted;
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
export const NOTEBOOK_EDITOR_CURSOR_BEGIN_END = new RawContextKey<boolean>('notebookEditorCursorAtEditorBeginEnd', false);


export interface INotebookEditorModel extends IEditorModel {
	readonly onDidChangeDirty: Event<void>;
	readonly resource: URI;
	readonly viewType: string;
	readonly notebook: NotebookTextModel;
	readonly lastResolvedFileStat: IFileStatWithMetadata | undefined;
	isDirty(): boolean;
	isUntitled(): boolean;
	save(): Promise<boolean>;
	saveAs(target: URI): Promise<boolean>;
	revert(options?: IRevertOptions | undefined): Promise<void>;
}

export interface INotebookDiffEditorModel extends IEditorModel {
	original: INotebookEditorModel;
	modified: INotebookEditorModel;
	resolveOriginalFromDisk(): Promise<void>;
	resolveModifiedFromDisk(): Promise<void>;
}

export interface INotebookTextModelBackup {
	metadata: NotebookDocumentMetadata;
	languages: string[];
	cells: ICellDto2[]
}

export interface NotebookDocumentBackupData {
	readonly viewType: string;
	readonly name: string;
	readonly backupId?: string;
	readonly mtime?: number;
}

/**
 * [start, end]
 */
export interface ICellRange {
	/**
	 * zero based index
	 */
	start: number;

	/**
	 * zero based index
	 */
	end: number;
}

export interface IEditor extends editorCommon.ICompositeCodeEditor {
	readonly onDidChangeModel: Event<NotebookTextModel | undefined>;
	readonly onDidFocusEditorWidget: Event<void>;
	readonly onDidChangeVisibleRanges: Event<void>;
	readonly onDidChangeSelection: Event<void>;
	getSelectionHandles(): number[];
	isNotebookEditor: boolean;
	visibleRanges: ICellRange[];
	uri?: URI;
	textModel?: NotebookTextModel;
	getId(): string;
	hasFocus(): boolean;
}

export enum NotebookEditorPriority {
	default = 'default',
	option = 'option',
}

export interface INotebookSearchOptions {
	regex?: boolean;
	wholeWord?: boolean;
	caseSensitive?: boolean
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

export interface INotebookKernel {
	id?: string;
	friendlyId: string;
	label: string;
	extension: ExtensionIdentifier;
	extensionLocation: URI;
	providerHandle?: number;
	description?: string;
	detail?: string;
	isPreferred?: boolean;
	preloads?: URI[];
	supportedLanguages?: string[]

	resolve(uri: URI, editorId: string, token: CancellationToken): Promise<void>;
	executeNotebookCell(uri: URI, handle: number | undefined): Promise<void>;
	cancelNotebookCell(uri: URI, handle: number | undefined): Promise<void>;
}

export interface INotebookKernelProvider {
	providerExtensionId: string;
	providerDescription?: string;
	selector: INotebookDocumentFilter;
	onDidChangeKernels: Event<URI | undefined>;
	provideKernels(uri: URI, token: CancellationToken): Promise<INotebookKernel[]>;
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
	linesDiff?: { originalCellhandle: number, modifiedCellhandle: number, lineChanges: editorCommon.ILineChange[] }[];
}

export interface INotebookCellStatusBarEntry {
	readonly cellResource: URI;
	readonly alignment: CellStatusbarAlignment;
	readonly priority?: number;
	readonly text: string;
	readonly tooltip: string | undefined;
	readonly command: string | Command | undefined;
	readonly accessibilityInformation?: IAccessibilityInformation;
	readonly visible: boolean;
	readonly opacity?: string;
}

export const DisplayOrderKey = 'notebook.displayOrder';
export const CellToolbarLocKey = 'notebook.cellToolbarLocation';
export const ShowCellStatusBarKey = 'notebook.showCellStatusBar';
export const NotebookTextDiffEditorPreview = 'notebook.diff.enablePreview';

export const enum CellStatusbarAlignment {
	LEFT,
	RIGHT
}

export interface INotebookDecorationRenderOptions {
	backgroundColor?: string | ThemeColor;
	borderColor?: string | ThemeColor;
	top?: editorCommon.IContentDecorationRenderOptions;
}
