/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editorstatus';
import * as nls from 'vs/nls';
import { runAtThisOrScheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { format } from 'vs/base/common/strings';
import { extname, basename } from 'vs/base/common/resources';
import { areFunctions, withNullAsUndefined, withUndefinedAsNull } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { Language } from 'vs/base/common/platform';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { IFileEditorInput, EncodingMode, IEncodingSupport, toResource, SideBySideEditorInput, IEditor as IBaseEditor, IEditorInput, SideBySideEditor, IModeSupport } from 'vs/workbench/common/editor';
import { Disposable, MutableDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorAction } from 'vs/editor/common/editorCommon';
import { EndOfLineSequence } from 'vs/editor/common/model';
import { IModelLanguageChangedEvent, IModelOptionsChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { TrimTrailingWhitespaceAction } from 'vs/editor/contrib/linesOperations/linesOperations';
import { IndentUsingSpaces, IndentUsingTabs, DetectIndentation, IndentationToSpacesAction, IndentationToTabsAction } from 'vs/editor/contrib/indentation/indentation';
import { BaseBinaryResourceEditor } from 'vs/workbench/browser/parts/editor/binaryEditor';
import { BinaryResourceDiffEditor } from 'vs/workbench/browser/parts/editor/binaryDiffEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFileService, FILES_ASSOCIATIONS_CONFIG } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModeService, ILanguageSelection } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { TabFocus } from 'vs/editor/common/config/commonEditorConfig';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ITextFileService, SUPPORTED_ENCODINGS } from 'vs/workbench/services/textfile/common/textfiles';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { IConfigurationChangedEvent, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { deepClone } from 'vs/base/common/objects';
import { ICodeEditor, isCodeEditor, isDiffEditor, getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Schemas } from 'vs/base/common/network';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { timeout } from 'vs/base/common/async';
import { INotificationHandle, INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { Event } from 'vs/base/common/event';
import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment, IStatusbarEntry } from 'vs/platform/statusbar/common/statusbar';

class SideBySideEditorEncodingSupport implements IEncodingSupport {
	constructor(private master: IEncodingSupport, private details: IEncodingSupport) { }

	getEncoding(): string {
		return this.master.getEncoding(); // always report from modified (right hand) side
	}

	setEncoding(encoding: string, mode: EncodingMode): void {
		[this.master, this.details].forEach(editor => editor.setEncoding(encoding, mode));
	}
}

class SideBySideEditorModeSupport implements IModeSupport {
	constructor(private master: IModeSupport, private details: IModeSupport) { }

	setMode(mode: string): void {
		[this.master, this.details].forEach(editor => editor.setMode(mode));
	}
}

function toEditorWithEncodingSupport(input: IEditorInput): IEncodingSupport | null {

	// Untitled Editor
	if (input instanceof UntitledEditorInput) {
		return input;
	}

	// Side by Side (diff) Editor
	if (input instanceof SideBySideEditorInput) {
		const masterEncodingSupport = toEditorWithEncodingSupport(input.master);
		const detailsEncodingSupport = toEditorWithEncodingSupport(input.details);

		if (masterEncodingSupport && detailsEncodingSupport) {
			return new SideBySideEditorEncodingSupport(masterEncodingSupport, detailsEncodingSupport);
		}

		return masterEncodingSupport;
	}

	// File or Resource Editor
	const encodingSupport = input as IFileEditorInput;
	if (areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding)) {
		return encodingSupport;
	}

	// Unsupported for any other editor
	return null;
}

function toEditorWithModeSupport(input: IEditorInput): IModeSupport | null {

	// Untitled Editor
	if (input instanceof UntitledEditorInput) {
		return input;
	}

	// Side by Side (diff) Editor
	if (input instanceof SideBySideEditorInput) {
		const masterModeSupport = toEditorWithModeSupport(input.master);
		const detailsModeSupport = toEditorWithModeSupport(input.details);

		if (masterModeSupport && detailsModeSupport) {
			return new SideBySideEditorModeSupport(masterModeSupport, detailsModeSupport);
		}

		return masterModeSupport;
	}

	// File or Resource Editor
	const modeSupport = input as IFileEditorInput;
	if (typeof modeSupport.setMode === 'function') {
		return modeSupport;
	}

	// Unsupported for any other editor
	return null;
}

interface IEditorSelectionStatus {
	selections?: Selection[];
	charactersSelected?: number;
}

class StateChange {
	indentation: boolean = false;
	selectionStatus: boolean = false;
	mode: boolean = false;
	encoding: boolean = false;
	EOL: boolean = false;
	tabFocusMode: boolean = false;
	screenReaderMode: boolean = false;
	metadata: boolean = false;

	combine(other: StateChange) {
		this.indentation = this.indentation || other.indentation;
		this.selectionStatus = this.selectionStatus || other.selectionStatus;
		this.mode = this.mode || other.mode;
		this.encoding = this.encoding || other.encoding;
		this.EOL = this.EOL || other.EOL;
		this.tabFocusMode = this.tabFocusMode || other.tabFocusMode;
		this.screenReaderMode = this.screenReaderMode || other.screenReaderMode;
		this.metadata = this.metadata || other.metadata;
	}

	hasChanges(): boolean {
		return this.indentation
			|| this.selectionStatus
			|| this.mode
			|| this.encoding
			|| this.EOL
			|| this.tabFocusMode
			|| this.screenReaderMode
			|| this.metadata;
	}
}

interface StateDelta {
	selectionStatus?: string;
	mode?: string;
	encoding?: string;
	EOL?: string;
	indentation?: string;
	tabFocusMode?: boolean;
	screenReaderMode?: boolean;
	metadata?: string | undefined;
}

class State {
	private _selectionStatus: string | undefined;
	get selectionStatus(): string | undefined { return this._selectionStatus; }

	private _mode: string | undefined;
	get mode(): string | undefined { return this._mode; }

	private _encoding: string | undefined;
	get encoding(): string | undefined { return this._encoding; }

	private _EOL: string | undefined;
	get EOL(): string | undefined { return this._EOL; }

	private _indentation: string | undefined;
	get indentation(): string | undefined { return this._indentation; }

	private _tabFocusMode: boolean | undefined;
	get tabFocusMode(): boolean | undefined { return this._tabFocusMode; }

	private _screenReaderMode: boolean | undefined;
	get screenReaderMode(): boolean | undefined { return this._screenReaderMode; }

	private _metadata: string | undefined;
	get metadata(): string | undefined { return this._metadata; }

	constructor() { }

	update(update: StateDelta): StateChange {
		const change = new StateChange();

		if ('selectionStatus' in update) {
			if (this._selectionStatus !== update.selectionStatus) {
				this._selectionStatus = update.selectionStatus;
				change.selectionStatus = true;
			}
		}

		if ('indentation' in update) {
			if (this._indentation !== update.indentation) {
				this._indentation = update.indentation;
				change.indentation = true;
			}
		}

		if ('mode' in update) {
			if (this._mode !== update.mode) {
				this._mode = update.mode;
				change.mode = true;
			}
		}

		if ('encoding' in update) {
			if (this._encoding !== update.encoding) {
				this._encoding = update.encoding;
				change.encoding = true;
			}
		}

		if ('EOL' in update) {
			if (this._EOL !== update.EOL) {
				this._EOL = update.EOL;
				change.EOL = true;
			}
		}

		if ('tabFocusMode' in update) {
			if (this._tabFocusMode !== update.tabFocusMode) {
				this._tabFocusMode = update.tabFocusMode;
				change.tabFocusMode = true;
			}
		}

		if ('screenReaderMode' in update) {
			if (this._screenReaderMode !== update.screenReaderMode) {
				this._screenReaderMode = update.screenReaderMode;
				change.screenReaderMode = true;
			}
		}

		if ('metadata' in update) {
			if (this._metadata !== update.metadata) {
				this._metadata = update.metadata;
				change.metadata = true;
			}
		}

		return change;
	}
}

const nlsSingleSelectionRange = nls.localize('singleSelectionRange', "Ln {0}, Col {1} ({2} selected)");
const nlsSingleSelection = nls.localize('singleSelection', "Ln {0}, Col {1}");
const nlsMultiSelectionRange = nls.localize('multiSelectionRange', "{0} selections ({1} characters selected)");
const nlsMultiSelection = nls.localize('multiSelection', "{0} selections");
const nlsEOLLF = nls.localize('endOfLineLineFeed', "LF");
const nlsEOLCRLF = nls.localize('endOfLineCarriageReturnLineFeed', "CRLF");

export class EditorStatus extends Disposable implements IWorkbenchContribution {
	private readonly tabFocusModeElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly screenRedearModeElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly indentationElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly selectionElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly encodingElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly eolElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly modeElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
	private readonly metadataElement = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

	private readonly state = new State();
	private readonly activeEditorListeners = this._register(new DisposableStore());
	private readonly delayedRender = this._register(new MutableDisposable());
	private toRender: StateChange | null = null;
	private screenReaderNotification: INotificationHandle | null = null;
	private promptedScreenReader: boolean = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IModeService private readonly modeService: IModeService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		super();

		this.registerCommands();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateStatusBar()));
		this._register(this.untitledEditorService.onDidChangeEncoding(r => this.onResourceEncodingChange(r)));
		this._register(this.textFileService.models.onModelEncodingChanged(e => this.onResourceEncodingChange((e.resource))));
		this._register(TabFocus.onDidChangeTabFocus(e => this.onTabFocusModeChange()));
	}

	private registerCommands(): void {
		CommandsRegistry.registerCommand({ id: 'showEditorScreenReaderNotification', handler: () => this.showScreenReaderNotification() });
		CommandsRegistry.registerCommand({ id: 'changeEditorIndentation', handler: () => this.showIndentationPicker() });
	}

	private showScreenReaderNotification(): void {
		if (!this.screenReaderNotification) {
			this.screenReaderNotification = this.notificationService.prompt(
				Severity.Info,
				nls.localize('screenReaderDetectedExplanation.question', "Are you using a screen reader to operate VS Code? (Certain features like folding, minimap or word wrap are disabled when using a screen reader)"),
				[{
					label: nls.localize('screenReaderDetectedExplanation.answerYes', "Yes"),
					run: () => {
						this.configurationService.updateValue('editor.accessibilitySupport', 'on', ConfigurationTarget.USER);
					}
				}, {
					label: nls.localize('screenReaderDetectedExplanation.answerNo', "No"),
					run: () => {
						this.configurationService.updateValue('editor.accessibilitySupport', 'off', ConfigurationTarget.USER);
					}
				}],
				{ sticky: true }
			);

			Event.once(this.screenReaderNotification.onDidClose)(() => this.screenReaderNotification = null);
		}
	}

	private async showIndentationPicker(): Promise<unknown> {
		const activeTextEditorWidget = getCodeEditor(this.editorService.activeTextEditorWidget);
		if (!activeTextEditorWidget) {
			return this.quickInputService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		if (!isWritableCodeEditor(activeTextEditorWidget)) {
			return this.quickInputService.pick([{ label: nls.localize('noWritableCodeEditor', "The active code editor is read-only.") }]);
		}

		const picks: QuickPickInput<IQuickPickItem & { run(): void }>[] = [
			activeTextEditorWidget.getAction(IndentUsingSpaces.ID),
			activeTextEditorWidget.getAction(IndentUsingTabs.ID),
			activeTextEditorWidget.getAction(DetectIndentation.ID),
			activeTextEditorWidget.getAction(IndentationToSpacesAction.ID),
			activeTextEditorWidget.getAction(IndentationToTabsAction.ID),
			activeTextEditorWidget.getAction(TrimTrailingWhitespaceAction.ID)
		].map((a: IEditorAction) => {
			return {
				id: a.id,
				label: a.label,
				detail: Language.isDefaultVariant() ? undefined : a.alias,
				run: () => {
					activeTextEditorWidget.focus();
					a.run();
				}
			};
		});

		picks.splice(3, 0, { type: 'separator', label: nls.localize('indentConvert', "convert file") });
		picks.unshift({ type: 'separator', label: nls.localize('indentView', "change view") });

		const action = await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickAction', "Select Action"), matchOnDetail: true });
		return action && action.run();
	}

	private updateTabFocusModeElement(visible: boolean): void {
		if (visible) {
			if (!this.tabFocusModeElement.value) {
				this.tabFocusModeElement.value = this.statusbarService.addEntry({
					text: nls.localize('tabFocusModeEnabled', "Tab Moves Focus"),
					tooltip: nls.localize('disableTabMode', "Disable Accessibility Mode"),
					command: 'editor.action.toggleTabFocusMode'
				}, 'status.editor.tabFocusMode', nls.localize('status.editor.tabFocusMode', "Accessibility Mode"), StatusbarAlignment.RIGHT, 100.7);
			}
		} else {
			this.tabFocusModeElement.clear();
		}
	}

	private updateScreenReaderModeElement(visible: boolean): void {
		if (visible) {
			if (!this.screenRedearModeElement.value) {
				this.screenRedearModeElement.value = this.statusbarService.addEntry({
					text: nls.localize('screenReaderDetected', "Screen Reader Optimized"),
					tooltip: nls.localize('screenReaderDetectedExtra', "If you are not using a Screen Reader, please change the setting `editor.accessibilitySupport` to \"off\"."),
					command: 'showEditorScreenReaderNotification'
				}, 'status.editor.screenReaderMode', nls.localize('status.editor.screenReaderMode', "Screen Reader Mode"), StatusbarAlignment.RIGHT, 100.6);
			}
		} else {
			this.screenRedearModeElement.clear();
		}
	}

	private updateSelectionElement(text: string | undefined): void {
		if (!text) {
			this.selectionElement.clear();
			return;
		}

		const props = {
			text,
			tooltip: nls.localize('gotoLine', "Go to Line"),
			command: 'workbench.action.gotoLine'
		};

		this.updateElement(this.selectionElement, props, 'status.editor.selection', nls.localize('status.editor.selection', "Editor Selection"), StatusbarAlignment.RIGHT, 100.5);
	}

	private updateIndentationElement(text: string | undefined): void {
		if (!text) {
			this.indentationElement.clear();
			return;
		}

		const props = {
			text,
			tooltip: nls.localize('selectIndentation', "Select Indentation"),
			command: 'changeEditorIndentation'
		};

		this.updateElement(this.indentationElement, props, 'status.editor.indentation', nls.localize('status.editor.indentation', "Editor Indentation"), StatusbarAlignment.RIGHT, 100.4);
	}

	private updateEncodingElement(text: string | undefined): void {
		if (!text) {
			this.encodingElement.clear();
			return;
		}

		const props = {
			text,
			tooltip: nls.localize('selectEncoding', "Select Encoding"),
			command: 'workbench.action.editor.changeEncoding'
		};

		this.updateElement(this.encodingElement, props, 'status.editor.encoding', nls.localize('status.editor.encoding', "Editor Encoding"), StatusbarAlignment.RIGHT, 100.3);
	}

	private updateEOLElement(text: string | undefined): void {
		if (!text) {
			this.eolElement.clear();
			return;
		}

		const props = {
			text,
			tooltip: nls.localize('selectEOL', "Select End of Line Sequence"),
			command: 'workbench.action.editor.changeEOL'
		};

		this.updateElement(this.eolElement, props, 'status.editor.eol', nls.localize('status.editor.eol', "Editor End of Line"), StatusbarAlignment.RIGHT, 100.2);
	}

	private updateModeElement(text: string | undefined): void {
		if (!text) {
			this.modeElement.clear();
			return;
		}

		const props = {
			text,
			tooltip: nls.localize('selectLanguageMode', "Select Language Mode"),
			command: 'workbench.action.editor.changeLanguageMode'
		};

		this.updateElement(this.modeElement, props, 'status.editor.mode', nls.localize('status.editor.mode', "Editor Language"), StatusbarAlignment.RIGHT, 100.1);
	}

	private updateMetadataElement(text: string | undefined): void {
		if (!text) {
			this.metadataElement.clear();
			return;
		}

		const props = {
			text,
			tooltip: nls.localize('fileInfo', "File Information")
		};

		this.updateElement(this.metadataElement, props, 'status.editor.info', nls.localize('status.editor.info', "File Information"), StatusbarAlignment.RIGHT, 100);
	}

	private updateElement(element: MutableDisposable<IStatusbarEntryAccessor>, props: IStatusbarEntry, id: string, name: string, alignment: StatusbarAlignment, priority: number) {
		if (!element.value) {
			element.value = this.statusbarService.addEntry(props, id, name, alignment, priority);
		} else {
			element.value.update(props);
		}
	}

	private updateState(update: StateDelta): void {
		const changed = this.state.update(update);
		if (!changed.hasChanges()) {
			return; // Nothing really changed
		}

		if (!this.toRender) {
			this.toRender = changed;

			this.delayedRender.value = runAtThisOrScheduleAtNextAnimationFrame(() => {
				this.delayedRender.clear();

				const toRender = this.toRender;
				this.toRender = null;
				if (toRender) {
					this.doRenderNow(toRender);
				}
			});
		} else {
			this.toRender.combine(changed);
		}
	}

	private doRenderNow(changed: StateChange): void {
		this.updateTabFocusModeElement(!!this.state.tabFocusMode);
		this.updateScreenReaderModeElement(!!this.state.screenReaderMode);
		this.updateIndentationElement(this.state.indentation);
		this.updateSelectionElement(this.state.selectionStatus && !this.state.screenReaderMode ? this.state.selectionStatus : undefined);
		this.updateEncodingElement(this.state.encoding);
		this.updateEOLElement(this.state.EOL ? this.state.EOL === '\r\n' ? nlsEOLCRLF : nlsEOLLF : undefined);
		this.updateModeElement(this.state.mode);
		this.updateMetadataElement(this.state.metadata);
	}

	private getSelectionLabel(info: IEditorSelectionStatus): string | undefined {
		if (!info || !info.selections) {
			return undefined;
		}

		if (info.selections.length === 1) {
			if (info.charactersSelected) {
				return format(nlsSingleSelectionRange, info.selections[0].positionLineNumber, info.selections[0].positionColumn, info.charactersSelected);
			}

			return format(nlsSingleSelection, info.selections[0].positionLineNumber, info.selections[0].positionColumn);
		}

		if (info.charactersSelected) {
			return format(nlsMultiSelectionRange, info.selections.length, info.charactersSelected);
		}

		if (info.selections.length > 0) {
			return format(nlsMultiSelection, info.selections.length);
		}

		return undefined;
	}

	private updateStatusBar(): void {
		const activeControl = this.editorService.activeControl;
		const activeCodeEditor = activeControl ? withNullAsUndefined(getCodeEditor(activeControl.getControl())) : undefined;

		// Update all states
		this.onScreenReaderModeChange(activeCodeEditor);
		this.onSelectionChange(activeCodeEditor);
		this.onModeChange(activeCodeEditor);
		this.onEOLChange(activeCodeEditor);
		this.onEncodingChange(activeControl);
		this.onIndentationChange(activeCodeEditor);
		this.onMetadataChange(activeControl);

		// Dispose old active editor listeners
		this.activeEditorListeners.clear();

		// Attach new listeners to active editor
		if (activeCodeEditor) {

			// Hook Listener for Configuration changes
			this.activeEditorListeners.add(activeCodeEditor.onDidChangeConfiguration((event: IConfigurationChangedEvent) => {
				if (event.accessibilitySupport) {
					this.onScreenReaderModeChange(activeCodeEditor);
				}
			}));

			// Hook Listener for Selection changes
			this.activeEditorListeners.add(activeCodeEditor.onDidChangeCursorPosition((event: ICursorPositionChangedEvent) => {
				this.onSelectionChange(activeCodeEditor);
			}));

			// Hook Listener for mode changes
			this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelLanguage((event: IModelLanguageChangedEvent) => {
				this.onModeChange(activeCodeEditor);
			}));

			// Hook Listener for content changes
			this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelContent((e) => {
				this.onEOLChange(activeCodeEditor);

				const selections = activeCodeEditor.getSelections();
				if (selections) {
					for (const change of e.changes) {
						if (selections.some(selection => Range.areIntersecting(selection, change.range))) {
							this.onSelectionChange(activeCodeEditor);
							break;
						}
					}
				}
			}));

			// Hook Listener for content options changes
			this.activeEditorListeners.add(activeCodeEditor.onDidChangeModelOptions((event: IModelOptionsChangedEvent) => {
				this.onIndentationChange(activeCodeEditor);
			}));
		}

		// Handle binary editors
		else if (activeControl instanceof BaseBinaryResourceEditor || activeControl instanceof BinaryResourceDiffEditor) {
			const binaryEditors: BaseBinaryResourceEditor[] = [];
			if (activeControl instanceof BinaryResourceDiffEditor) {
				const details = activeControl.getDetailsEditor();
				if (details instanceof BaseBinaryResourceEditor) {
					binaryEditors.push(details);
				}

				const master = activeControl.getMasterEditor();
				if (master instanceof BaseBinaryResourceEditor) {
					binaryEditors.push(master);
				}
			} else {
				binaryEditors.push(activeControl);
			}

			binaryEditors.forEach(editor => {
				this.activeEditorListeners.add(editor.onMetadataChanged(metadata => {
					this.onMetadataChange(activeControl);
				}));

				this.activeEditorListeners.add(editor.onDidOpenInPlace(() => {
					this.updateStatusBar();
				}));
			});
		}
	}

	private onModeChange(editorWidget: ICodeEditor | undefined): void {
		let info: StateDelta = { mode: undefined };

		// We only support text based editors
		if (editorWidget) {
			const textModel = editorWidget.getModel();
			if (textModel) {
				const modeId = textModel.getLanguageIdentifier().language;
				info = { mode: this.modeService.getLanguageName(modeId) || undefined };
			}
		}

		this.updateState(info);
	}

	private onIndentationChange(editorWidget: ICodeEditor | undefined): void {
		const update: StateDelta = { indentation: undefined };

		if (editorWidget) {
			const model = editorWidget.getModel();
			if (model) {
				const modelOpts = model.getOptions();
				update.indentation = (
					modelOpts.insertSpaces
						? nls.localize('spacesSize', "Spaces: {0}", modelOpts.indentSize)
						: nls.localize({ key: 'tabSize', comment: ['Tab corresponds to the tab key'] }, "Tab Size: {0}", modelOpts.tabSize)
				);
			}
		}

		this.updateState(update);
	}

	private onMetadataChange(editor: IBaseEditor | undefined): void {
		const update: StateDelta = { metadata: undefined };

		if (editor instanceof BaseBinaryResourceEditor || editor instanceof BinaryResourceDiffEditor) {
			update.metadata = editor.getMetadata();
		}

		this.updateState(update);
	}

	private onScreenReaderModeChange(editorWidget: ICodeEditor | undefined): void {
		let screenReaderMode = false;

		// We only support text based editors
		if (editorWidget) {
			const screenReaderDetected = (this.accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Enabled);
			if (screenReaderDetected) {
				const screenReaderConfiguration = this.configurationService.getValue<IEditorOptions>('editor').accessibilitySupport;
				if (screenReaderConfiguration === 'auto') {
					if (!this.promptedScreenReader) {
						this.promptedScreenReader = true;
						setTimeout(() => this.showScreenReaderNotification(), 100);
					}
				}
			}

			screenReaderMode = (editorWidget.getConfiguration().accessibilitySupport === AccessibilitySupport.Enabled);
		}

		if (screenReaderMode === false && this.screenReaderNotification) {
			this.screenReaderNotification.close();
		}

		this.updateState({ screenReaderMode: screenReaderMode });
	}

	private onSelectionChange(editorWidget: ICodeEditor | undefined): void {
		const info: IEditorSelectionStatus = Object.create(null);

		// We only support text based editors
		if (editorWidget) {

			// Compute selection(s)
			info.selections = editorWidget.getSelections() || [];

			// Compute selection length
			info.charactersSelected = 0;
			const textModel = editorWidget.getModel();
			if (textModel) {
				info.selections.forEach(selection => {
					info.charactersSelected! += textModel.getValueLengthInRange(selection);
				});
			}

			// Compute the visible column for one selection. This will properly handle tabs and their configured widths
			if (info.selections.length === 1) {
				const visibleColumn = editorWidget.getVisibleColumnFromPosition(editorWidget.getPosition()!);

				let selectionClone = info.selections[0].clone(); // do not modify the original position we got from the editor
				selectionClone = new Selection(
					selectionClone.selectionStartLineNumber,
					selectionClone.selectionStartColumn,
					selectionClone.positionLineNumber,
					visibleColumn
				);

				info.selections[0] = selectionClone;
			}
		}

		this.updateState({ selectionStatus: this.getSelectionLabel(info) });
	}

	private onEOLChange(editorWidget: ICodeEditor | undefined): void {
		const info: StateDelta = { EOL: undefined };

		if (editorWidget && !editorWidget.getConfiguration().readOnly) {
			const codeEditorModel = editorWidget.getModel();
			if (codeEditorModel) {
				info.EOL = codeEditorModel.getEOL();
			}
		}

		this.updateState(info);
	}

	private onEncodingChange(e?: IBaseEditor): void {
		if (e && !this.isActiveEditor(e)) {
			return;
		}

		const info: StateDelta = { encoding: undefined };

		// We only support text based editors
		if (e && (isCodeEditor(e.getControl()) || isDiffEditor(e.getControl()))) {
			const encodingSupport: IEncodingSupport | null = e.input ? toEditorWithEncodingSupport(e.input) : null;
			if (encodingSupport) {
				const rawEncoding = encodingSupport.getEncoding();
				const encodingInfo = SUPPORTED_ENCODINGS[rawEncoding];
				if (encodingInfo) {
					info.encoding = encodingInfo.labelShort; // if we have a label, take it from there
				} else {
					info.encoding = rawEncoding; // otherwise use it raw
				}
			}
		}

		this.updateState(info);
	}

	private onResourceEncodingChange(resource: URI): void {
		const activeControl = this.editorService.activeControl;
		if (activeControl) {
			const activeResource = toResource(activeControl.input, { supportSideBySide: SideBySideEditor.MASTER });
			if (activeResource && activeResource.toString() === resource.toString()) {
				return this.onEncodingChange(activeControl); // only update if the encoding changed for the active resource
			}
		}
	}

	private onTabFocusModeChange(): void {
		const info: StateDelta = { tabFocusMode: TabFocus.getTabFocusMode() };

		this.updateState(info);
	}

	private isActiveEditor(control: IBaseEditor): boolean {
		const activeControl = this.editorService.activeControl;

		return !!activeControl && activeControl === control;
	}
}

function isWritableCodeEditor(codeEditor: ICodeEditor | undefined): boolean {
	if (!codeEditor) {
		return false;
	}
	const config = codeEditor.getConfiguration();
	return (!config.readOnly);
}

function isWritableBaseEditor(e: IBaseEditor): boolean {
	return e && isWritableCodeEditor(getCodeEditor(e.getControl()) || undefined);
}

export class ShowLanguageExtensionsAction extends Action {

	static readonly ID = 'workbench.action.showLanguageExtensions';

	constructor(
		private fileExtension: string,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionGalleryService galleryService: IExtensionGalleryService
	) {
		super(ShowLanguageExtensionsAction.ID, nls.localize('showLanguageExtensions', "Search Marketplace Extensions for '{0}'...", fileExtension));

		this.enabled = galleryService.isEnabled();
	}

	async run(): Promise<void> {
		await this.commandService.executeCommand('workbench.extensions.action.showExtensionsForLanguage', this.fileExtension);
	}
}

export class ChangeModeAction extends Action {

	static readonly ID = 'workbench.action.editor.changeLanguageMode';
	static readonly LABEL = nls.localize('changeMode', "Change Language Mode");

	constructor(
		actionId: string,
		actionLabel: string,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService
	) {
		super(actionId, actionLabel);
	}

	async run(): Promise<any> {
		const activeTextEditorWidget = getCodeEditor(this.editorService.activeTextEditorWidget);
		if (!activeTextEditorWidget) {
			return this.quickInputService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		const textModel = activeTextEditorWidget.getModel();
		const resource = this.editorService.activeEditor ? toResource(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.MASTER }) : null;

		let hasLanguageSupport = !!resource;
		if (resource && resource.scheme === Schemas.untitled && !this.untitledEditorService.hasAssociatedFilePath(resource)) {
			hasLanguageSupport = false; // no configuration for untitled resources (e.g. "Untitled-1")
		}

		// Compute mode
		let currentModeId: string | undefined;
		let modeId: string | undefined;
		if (textModel) {
			modeId = textModel.getLanguageIdentifier().language;
			currentModeId = this.modeService.getLanguageName(modeId) || undefined;
		}

		// All languages are valid picks
		const languages = this.modeService.getRegisteredLanguageNames();
		const picks: QuickPickInput[] = languages.sort().map((lang, index) => {
			let description: string;
			if (currentModeId === lang) {
				description = nls.localize('languageDescription', "({0}) - Configured Language", this.modeService.getModeIdForLanguageName(lang.toLowerCase()));
			} else {
				description = nls.localize('languageDescriptionConfigured', "({0})", this.modeService.getModeIdForLanguageName(lang.toLowerCase()));
			}

			return {
				label: lang,
				iconClasses: getIconClasses(this.modelService, this.modeService, this.getFakeResource(lang)),
				description
			};
		});

		if (hasLanguageSupport) {
			picks.unshift({ type: 'separator', label: nls.localize('languagesPicks', "languages (identifier)") });
		}

		// Offer action to configure via settings
		let configureModeAssociations: IQuickPickItem | undefined;
		let configureModeSettings: IQuickPickItem | undefined;
		let galleryAction: Action | undefined;
		if (hasLanguageSupport && resource) {
			const ext = extname(resource) || basename(resource);

			galleryAction = this.instantiationService.createInstance(ShowLanguageExtensionsAction, ext);
			if (galleryAction.enabled) {
				picks.unshift(galleryAction);
			}

			configureModeSettings = { label: nls.localize('configureModeSettings', "Configure '{0}' language based settings...", currentModeId) };
			picks.unshift(configureModeSettings);
			configureModeAssociations = { label: nls.localize('configureAssociationsExt', "Configure File Association for '{0}'...", ext) };
			picks.unshift(configureModeAssociations);
		}

		// Offer to "Auto Detect"
		const autoDetectMode: IQuickPickItem = {
			label: nls.localize('autoDetect', "Auto Detect")
		};

		if (hasLanguageSupport) {
			picks.unshift(autoDetectMode);
		}

		const pick = await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language Mode"), matchOnDescription: true });
		if (!pick) {
			return;
		}

		if (pick === galleryAction) {
			galleryAction.run();
			return;
		}

		// User decided to permanently configure associations, return right after
		if (pick === configureModeAssociations) {
			if (resource) {
				this.configureFileAssociation(resource);
			}
			return;
		}

		// User decided to configure settings for current language
		if (pick === configureModeSettings) {
			this.preferencesService.configureSettingsForLanguage(withUndefinedAsNull(modeId));
			return;
		}

		// Change mode for active editor
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor) {
			const modeSupport = toEditorWithModeSupport(activeEditor);
			if (modeSupport) {

				// Find mode
				let languageSelection: ILanguageSelection | undefined;
				if (pick === autoDetectMode) {
					if (textModel) {
						const resource = toResource(activeEditor, { supportSideBySide: SideBySideEditor.MASTER });
						if (resource) {
							languageSelection = this.modeService.createByFilepathOrFirstLine(resource, textModel.getLineContent(1));
						}
					}
				} else {
					languageSelection = this.modeService.createByLanguageName(pick.label);
				}

				// Change mode
				if (typeof languageSelection !== 'undefined') {
					modeSupport.setMode(languageSelection.languageIdentifier.language);
				}
			}
		}
	}

	private configureFileAssociation(resource: URI): void {
		const extension = extname(resource);
		const base = basename(resource);
		const currentAssociation = this.modeService.getModeIdByFilepathOrFirstLine(resource.with({ path: base }));

		const languages = this.modeService.getRegisteredLanguageNames();
		const picks: IQuickPickItem[] = languages.sort().map((lang, index) => {
			const id = withNullAsUndefined(this.modeService.getModeIdForLanguageName(lang.toLowerCase()));

			return {
				id,
				label: lang,
				iconClasses: getIconClasses(this.modelService, this.modeService, this.getFakeResource(lang)),
				description: (id === currentAssociation) ? nls.localize('currentAssociation', "Current Association") : undefined
			};
		});

		setTimeout(async () => {
			const language = await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguageToConfigure', "Select Language Mode to Associate with '{0}'", extension || base) });
			if (language) {
				const fileAssociationsConfig = this.configurationService.inspect<{}>(FILES_ASSOCIATIONS_CONFIG);

				let associationKey: string;
				if (extension && base[0] !== '.') {
					associationKey = `*${extension}`; // only use "*.ext" if the file path is in the form of <name>.<ext>
				} else {
					associationKey = base; // otherwise use the basename (e.g. .gitignore, Dockerfile)
				}

				// If the association is already being made in the workspace, make sure to target workspace settings
				let target = ConfigurationTarget.USER;
				if (fileAssociationsConfig.workspace && !!(fileAssociationsConfig.workspace as any)[associationKey]) {
					target = ConfigurationTarget.WORKSPACE;
				}

				// Make sure to write into the value of the target and not the merged value from USER and WORKSPACE config
				const currentAssociations = deepClone((target === ConfigurationTarget.WORKSPACE) ? fileAssociationsConfig.workspace : fileAssociationsConfig.user) || Object.create(null);
				currentAssociations[associationKey] = language.id;

				this.configurationService.updateValue(FILES_ASSOCIATIONS_CONFIG, currentAssociations, target);
			}
		}, 50 /* quick open is sensitive to being opened so soon after another */);
	}

	private getFakeResource(lang: string): URI | undefined {
		let fakeResource: URI | undefined;

		const extensions = this.modeService.getExtensions(lang);
		if (extensions && extensions.length) {
			fakeResource = URI.file(extensions[0]);
		} else {
			const filenames = this.modeService.getFilenames(lang);
			if (filenames && filenames.length) {
				fakeResource = URI.file(filenames[0]);
			}
		}

		return fakeResource;
	}
}

export interface IChangeEOLEntry extends IQuickPickItem {
	eol: EndOfLineSequence;
}

export class ChangeEOLAction extends Action {

	static readonly ID = 'workbench.action.editor.changeEOL';
	static readonly LABEL = nls.localize('changeEndOfLine', "Change End of Line Sequence");

	constructor(
		actionId: string,
		actionLabel: string,
		@IEditorService private readonly editorService: IEditorService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super(actionId, actionLabel);
	}

	async run(): Promise<any> {
		const activeTextEditorWidget = getCodeEditor(this.editorService.activeTextEditorWidget);
		if (!activeTextEditorWidget) {
			return this.quickInputService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		if (!isWritableCodeEditor(activeTextEditorWidget)) {
			return this.quickInputService.pick([{ label: nls.localize('noWritableCodeEditor', "The active code editor is read-only.") }]);
		}

		let textModel = activeTextEditorWidget.getModel();

		const EOLOptions: IChangeEOLEntry[] = [
			{ label: nlsEOLLF, eol: EndOfLineSequence.LF },
			{ label: nlsEOLCRLF, eol: EndOfLineSequence.CRLF },
		];

		const selectedIndex = (textModel && textModel.getEOL() === '\n') ? 0 : 1;

		const eol = await this.quickInputService.pick(EOLOptions, { placeHolder: nls.localize('pickEndOfLine', "Select End of Line Sequence"), activeItem: EOLOptions[selectedIndex] });
		if (eol) {
			const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorWidget);
			if (activeCodeEditor && activeCodeEditor.hasModel() && isWritableCodeEditor(activeCodeEditor)) {
				textModel = activeCodeEditor.getModel();
				textModel.pushEOL(eol.eol);
			}
		}
	}
}

export class ChangeEncodingAction extends Action {

	static readonly ID = 'workbench.action.editor.changeEncoding';
	static readonly LABEL = nls.localize('changeEncoding', "Change File Encoding");

	constructor(
		actionId: string,
		actionLabel: string,
		@IEditorService private readonly editorService: IEditorService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService
	) {
		super(actionId, actionLabel);
	}

	async run(): Promise<any> {
		if (!getCodeEditor(this.editorService.activeTextEditorWidget)) {
			return this.quickInputService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		const activeControl = this.editorService.activeControl;
		if (!activeControl) {
			return this.quickInputService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		const encodingSupport: IEncodingSupport | null = toEditorWithEncodingSupport(activeControl.input);
		if (!encodingSupport) {
			return this.quickInputService.pick([{ label: nls.localize('noFileEditor', "No file active at this time") }]);
		}

		let saveWithEncodingPick: IQuickPickItem;
		let reopenWithEncodingPick: IQuickPickItem;
		if (Language.isDefaultVariant()) {
			saveWithEncodingPick = { label: nls.localize('saveWithEncoding', "Save with Encoding") };
			reopenWithEncodingPick = { label: nls.localize('reopenWithEncoding', "Reopen with Encoding") };
		} else {
			saveWithEncodingPick = { label: nls.localize('saveWithEncoding', "Save with Encoding"), detail: 'Save with Encoding', };
			reopenWithEncodingPick = { label: nls.localize('reopenWithEncoding', "Reopen with Encoding"), detail: 'Reopen with Encoding' };
		}

		let action: IQuickPickItem;
		if (encodingSupport instanceof UntitledEditorInput) {
			action = saveWithEncodingPick;
		} else if (!isWritableBaseEditor(activeControl)) {
			action = reopenWithEncodingPick;
		} else {
			action = await this.quickInputService.pick([reopenWithEncodingPick, saveWithEncodingPick], { placeHolder: nls.localize('pickAction', "Select Action"), matchOnDetail: true });
		}

		if (!action) {
			return;
		}

		await timeout(50); // quick open is sensitive to being opened so soon after another

		const resource = toResource(activeControl.input, { supportSideBySide: SideBySideEditor.MASTER });
		if (!resource || (!this.fileService.canHandleResource(resource) && resource.scheme !== Schemas.untitled)) {
			return null; // encoding detection only possible for resources the file service can handle or that are untitled
		}

		let guessedEncoding: string | undefined = undefined;
		if (this.fileService.canHandleResource(resource)) {
			const content = await this.textFileService.read(resource, { autoGuessEncoding: true, acceptTextOnly: true });
			guessedEncoding = content.encoding;
		}

		const isReopenWithEncoding = (action === reopenWithEncodingPick);

		const configuredEncoding = this.textResourceConfigurationService.getValue(withNullAsUndefined(resource), 'files.encoding');

		let directMatchIndex: number | undefined;
		let aliasMatchIndex: number | undefined;

		// All encodings are valid picks
		const picks: QuickPickInput[] = Object.keys(SUPPORTED_ENCODINGS)
			.sort((k1, k2) => {
				if (k1 === configuredEncoding) {
					return -1;
				} else if (k2 === configuredEncoding) {
					return 1;
				}

				return SUPPORTED_ENCODINGS[k1].order - SUPPORTED_ENCODINGS[k2].order;
			})
			.filter(k => {
				if (k === guessedEncoding && guessedEncoding !== configuredEncoding) {
					return false; // do not show encoding if it is the guessed encoding that does not match the configured
				}

				return !isReopenWithEncoding || !SUPPORTED_ENCODINGS[k].encodeOnly; // hide those that can only be used for encoding if we are about to decode
			})
			.map((key, index) => {
				if (key === encodingSupport.getEncoding()) {
					directMatchIndex = index;
				} else if (SUPPORTED_ENCODINGS[key].alias === encodingSupport.getEncoding()) {
					aliasMatchIndex = index;
				}

				return { id: key, label: SUPPORTED_ENCODINGS[key].labelLong, description: key };
			});

		const items = picks.slice() as IQuickPickItem[];

		// If we have a guessed encoding, show it first unless it matches the configured encoding
		if (guessedEncoding && configuredEncoding !== guessedEncoding && SUPPORTED_ENCODINGS[guessedEncoding]) {
			picks.unshift({ type: 'separator' });
			picks.unshift({ id: guessedEncoding, label: SUPPORTED_ENCODINGS[guessedEncoding].labelLong, description: nls.localize('guessedEncoding', "Guessed from content") });
		}

		const encoding = await this.quickInputService.pick(picks, {
			placeHolder: isReopenWithEncoding ? nls.localize('pickEncodingForReopen', "Select File Encoding to Reopen File") : nls.localize('pickEncodingForSave', "Select File Encoding to Save with"),
			activeItem: items[typeof directMatchIndex === 'number' ? directMatchIndex : typeof aliasMatchIndex === 'number' ? aliasMatchIndex : -1]
		});

		if (!encoding) {
			return;
		}

		if (!this.editorService.activeControl) {
			return;
		}

		const activeEncodingSupport = toEditorWithEncodingSupport(this.editorService.activeControl.input);
		if (typeof encoding.id !== 'undefined' && activeEncodingSupport && activeEncodingSupport.getEncoding() !== encoding.id) {
			activeEncodingSupport.setEncoding(encoding.id, isReopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode); // Set new encoding
		}
	}
}
