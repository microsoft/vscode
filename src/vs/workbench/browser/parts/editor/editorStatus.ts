/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editorstatus';
import * as nls from 'vs/nls';
import { $, append, runAtThisOrScheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import * as strings from 'vs/base/common/strings';
import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import { URI as uri } from 'vs/base/common/uri';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { Action } from 'vs/base/common/actions';
import { language, LANGUAGE_DEFAULT, AccessibilitySupport } from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { IFileEditorInput, EncodingMode, IEncodingSupport, toResource, SideBySideEditorInput, IEditor as IBaseEditor, IEditorInput } from 'vs/workbench/common/editor';
import { IDisposable, combinedDisposable, dispose } from 'vs/base/common/lifecycle';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorAction } from 'vs/editor/common/editorCommon';
import { EndOfLineSequence, ITextModel } from 'vs/editor/common/model';
import { IModelLanguageChangedEvent, IModelOptionsChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { TrimTrailingWhitespaceAction } from 'vs/editor/contrib/linesOperations/linesOperations';
import { IndentUsingSpaces, IndentUsingTabs, DetectIndentation, IndentationToSpacesAction, IndentationToTabsAction } from 'vs/editor/contrib/indentation/indentation';
import { BaseBinaryResourceEditor } from 'vs/workbench/browser/parts/editor/binaryEditor';
import { BinaryResourceDiffEditor } from 'vs/workbench/browser/parts/editor/binaryDiffEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { SUPPORTED_ENCODINGS, IFileService, FILES_ASSOCIATIONS_CONFIG } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModeService, ILanguageSelection } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { TabFocus } from 'vs/editor/common/config/commonEditorConfig';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { IConfigurationChangedEvent, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { deepClone } from 'vs/base/common/objects';
import { ICodeEditor, isCodeEditor, isDiffEditor, getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { Schemas } from 'vs/base/common/network';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { timeout } from 'vs/base/common/async';
import { INotificationHandle, INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { Event } from 'vs/base/common/event';

class SideBySideEditorEncodingSupport implements IEncodingSupport {
	constructor(private master: IEncodingSupport, private details: IEncodingSupport) { }

	getEncoding(): string {
		return this.master.getEncoding(); // always report from modified (right hand) side
	}

	setEncoding(encoding: string, mode: EncodingMode): void {
		[this.master, this.details].forEach(s => s.setEncoding(encoding, mode));
	}
}

function toEditorWithEncodingSupport(input: IEditorInput): IEncodingSupport {

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
	let encodingSupport = input as IFileEditorInput;
	if (types.areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding)) {
		return encodingSupport;
	}

	// Unsupported for any other editor
	return null;
}

interface IEditorSelectionStatus {
	selections?: Selection[];
	charactersSelected?: number;
}

class StateChange {
	_stateChangeBrand: void;

	indentation: boolean;
	selectionStatus: boolean;
	mode: boolean;
	encoding: boolean;
	EOL: boolean;
	tabFocusMode: boolean;
	screenReaderMode: boolean;
	metadata: boolean;

	constructor() {
		this.indentation = false;
		this.selectionStatus = false;
		this.mode = false;
		this.encoding = false;
		this.EOL = false;
		this.tabFocusMode = false;
		this.screenReaderMode = false;
		this.metadata = false;
	}

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
}

interface StateDelta {
	selectionStatus?: string;
	mode?: string;
	encoding?: string;
	EOL?: string;
	indentation?: string;
	tabFocusMode?: boolean;
	screenReaderMode?: boolean;
	metadata?: string;
}

class State {
	private _selectionStatus: string;
	get selectionStatus(): string { return this._selectionStatus; }

	private _mode: string;
	get mode(): string { return this._mode; }

	private _encoding: string;
	get encoding(): string { return this._encoding; }

	private _EOL: string;
	get EOL(): string { return this._EOL; }

	private _indentation: string;
	get indentation(): string { return this._indentation; }

	private _tabFocusMode: boolean;
	get tabFocusMode(): boolean { return this._tabFocusMode; }

	private _screenReaderMode: boolean;
	get screenReaderMode(): boolean { return this._screenReaderMode; }

	private _metadata: string;
	get metadata(): string { return this._metadata; }

	constructor() {
		this._selectionStatus = null;
		this._mode = null;
		this._encoding = null;
		this._EOL = null;
		this._tabFocusMode = false;
		this._screenReaderMode = false;
		this._metadata = null;
	}

	update(update: StateDelta): StateChange {
		const e = new StateChange();
		let somethingChanged = false;

		if (typeof update.selectionStatus !== 'undefined') {
			if (this._selectionStatus !== update.selectionStatus) {
				this._selectionStatus = update.selectionStatus;
				somethingChanged = true;
				e.selectionStatus = true;
			}
		}
		if (typeof update.indentation !== 'undefined') {
			if (this._indentation !== update.indentation) {
				this._indentation = update.indentation;
				somethingChanged = true;
				e.indentation = true;
			}
		}
		if (typeof update.mode !== 'undefined') {
			if (this._mode !== update.mode) {
				this._mode = update.mode;
				somethingChanged = true;
				e.mode = true;
			}
		}
		if (typeof update.encoding !== 'undefined') {
			if (this._encoding !== update.encoding) {
				this._encoding = update.encoding;
				somethingChanged = true;
				e.encoding = true;
			}
		}
		if (typeof update.EOL !== 'undefined') {
			if (this._EOL !== update.EOL) {
				this._EOL = update.EOL;
				somethingChanged = true;
				e.EOL = true;
			}
		}
		if (typeof update.tabFocusMode !== 'undefined') {
			if (this._tabFocusMode !== update.tabFocusMode) {
				this._tabFocusMode = update.tabFocusMode;
				somethingChanged = true;
				e.tabFocusMode = true;
			}
		}
		if (typeof update.screenReaderMode !== 'undefined') {
			if (this._screenReaderMode !== update.screenReaderMode) {
				this._screenReaderMode = update.screenReaderMode;
				somethingChanged = true;
				e.screenReaderMode = true;
			}
		}
		if (typeof update.metadata !== 'undefined') {
			if (this._metadata !== update.metadata) {
				this._metadata = update.metadata;
				somethingChanged = true;
				e.metadata = true;
			}
		}

		if (somethingChanged) {
			return e;
		}
		return null;
	}
}

const nlsSingleSelectionRange = nls.localize('singleSelectionRange', "Ln {0}, Col {1} ({2} selected)");
const nlsSingleSelection = nls.localize('singleSelection', "Ln {0}, Col {1}");
const nlsMultiSelectionRange = nls.localize('multiSelectionRange', "{0} selections ({1} characters selected)");
const nlsMultiSelection = nls.localize('multiSelection', "{0} selections");
const nlsEOLLF = nls.localize('endOfLineLineFeed', "LF");
const nlsEOLCRLF = nls.localize('endOfLineCarriageReturnLineFeed', "CRLF");
const nlsTabFocusMode = nls.localize('tabFocusModeEnabled', "Tab Moves Focus");
const nlsScreenReaderDetected = nls.localize('screenReaderDetected', "Screen Reader Optimized");
const nlsScreenReaderDetectedTitle = nls.localize('screenReaderDetectedExtra', "If you are not using a Screen Reader, please change the setting `editor.accessibilitySupport` to \"off\".");

function setDisplay(el: HTMLElement, desiredValue: string): void {
	if (el.style.display !== desiredValue) {
		el.style.display = desiredValue;
	}
}
function show(el: HTMLElement): void {
	setDisplay(el, '');
}
function hide(el: HTMLElement): void {
	setDisplay(el, 'none');
}

export class EditorStatus implements IStatusbarItem {
	private state: State;
	private element: HTMLElement;
	private tabFocusModeElement: HTMLElement;
	private screenRedearModeElement: HTMLElement;
	private indentationElement: HTMLElement;
	private selectionElement: HTMLElement;
	private encodingElement: HTMLElement;
	private eolElement: HTMLElement;
	private modeElement: HTMLElement;
	private metadataElement: HTMLElement;
	private toDispose: IDisposable[];
	private activeEditorListeners: IDisposable[];
	private delayedRender: IDisposable;
	private toRender: StateChange;
	private screenReaderNotification: INotificationHandle;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IModeService private readonly modeService: IModeService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkspaceConfigurationService private readonly configurationService: IWorkspaceConfigurationService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		this.toDispose = [];
		this.activeEditorListeners = [];
		this.state = new State();
	}

	render(container: HTMLElement): IDisposable {
		this.element = append(container, $('.editor-statusbar-item'));

		this.tabFocusModeElement = append(this.element, $('a.editor-status-tabfocusmode.status-bar-info'));
		this.tabFocusModeElement.title = nls.localize('disableTabMode', "Disable Accessibility Mode");
		this.tabFocusModeElement.onclick = () => this.onTabFocusModeClick();
		this.tabFocusModeElement.textContent = nlsTabFocusMode;
		hide(this.tabFocusModeElement);

		this.screenRedearModeElement = append(this.element, $('a.editor-status-screenreadermode.status-bar-info'));
		this.screenRedearModeElement.textContent = nlsScreenReaderDetected;
		this.screenRedearModeElement.title = nlsScreenReaderDetectedTitle;
		this.screenRedearModeElement.onclick = () => this.onScreenReaderModeClick();
		hide(this.screenRedearModeElement);

		this.selectionElement = append(this.element, $('a.editor-status-selection'));
		this.selectionElement.title = nls.localize('gotoLine', "Go to Line");
		this.selectionElement.onclick = () => this.onSelectionClick();
		hide(this.selectionElement);

		this.indentationElement = append(this.element, $('a.editor-status-indentation'));
		this.indentationElement.title = nls.localize('selectIndentation', "Select Indentation");
		this.indentationElement.onclick = () => this.onIndentationClick();
		hide(this.indentationElement);

		this.encodingElement = append(this.element, $('a.editor-status-encoding'));
		this.encodingElement.title = nls.localize('selectEncoding', "Select Encoding");
		this.encodingElement.onclick = () => this.onEncodingClick();
		hide(this.encodingElement);

		this.eolElement = append(this.element, $('a.editor-status-eol'));
		this.eolElement.title = nls.localize('selectEOL', "Select End of Line Sequence");
		this.eolElement.onclick = () => this.onEOLClick();
		hide(this.eolElement);

		this.modeElement = append(this.element, $('a.editor-status-mode'));
		this.modeElement.title = nls.localize('selectLanguageMode', "Select Language Mode");
		this.modeElement.onclick = () => this.onModeClick();
		hide(this.modeElement);

		this.metadataElement = append(this.element, $('span.editor-status-metadata'));
		this.metadataElement.title = nls.localize('fileInfo', "File Information");
		hide(this.metadataElement);

		this.delayedRender = null;
		this.toRender = null;

		this.toDispose.push(
			{
				dispose: () => {
					if (this.delayedRender) {
						this.delayedRender.dispose();
						this.delayedRender = null;
					}
				}
			},
			this.editorService.onDidActiveEditorChange(() => this.updateStatusBar()),
			this.untitledEditorService.onDidChangeEncoding(r => this.onResourceEncodingChange(r)),
			this.textFileService.models.onModelEncodingChanged(e => this.onResourceEncodingChange(e.resource)),
			TabFocus.onDidChangeTabFocus(e => this.onTabFocusModeChange()),
		);

		return combinedDisposable(this.toDispose);
	}

	private updateState(update: StateDelta): void {
		const changed = this.state.update(update);
		if (!changed) {
			// Nothing really changed
			return;
		}

		if (!this.toRender) {
			this.toRender = changed;
			this.delayedRender = runAtThisOrScheduleAtNextAnimationFrame(() => {
				this.delayedRender = null;
				const toRender = this.toRender;
				this.toRender = null;
				this._renderNow(toRender);
			});
		} else {
			this.toRender.combine(changed);
		}
	}

	private _renderNow(changed: StateChange): void {
		if (changed.tabFocusMode) {
			if (this.state.tabFocusMode && this.state.tabFocusMode === true) {
				show(this.tabFocusModeElement);
			} else {
				hide(this.tabFocusModeElement);
			}
		}

		if (changed.screenReaderMode) {
			if (this.state.screenReaderMode && this.state.screenReaderMode === true) {
				show(this.screenRedearModeElement);
			} else {
				hide(this.screenRedearModeElement);
			}
		}

		if (changed.indentation) {
			if (this.state.indentation) {
				this.indentationElement.textContent = this.state.indentation;
				show(this.indentationElement);
			} else {
				hide(this.indentationElement);
			}
		}

		if (changed.selectionStatus) {
			if (this.state.selectionStatus && !this.state.screenReaderMode) {
				this.selectionElement.textContent = this.state.selectionStatus;
				show(this.selectionElement);
			} else {
				hide(this.selectionElement);
			}
		}

		if (changed.encoding) {
			if (this.state.encoding) {
				this.encodingElement.textContent = this.state.encoding;
				show(this.encodingElement);
			} else {
				hide(this.encodingElement);
			}
		}

		if (changed.EOL) {
			if (this.state.EOL) {
				this.eolElement.textContent = this.state.EOL === '\r\n' ? nlsEOLCRLF : nlsEOLLF;
				show(this.eolElement);
			} else {
				hide(this.eolElement);
			}
		}

		if (changed.mode) {
			if (this.state.mode) {
				this.modeElement.textContent = this.state.mode;
				show(this.modeElement);
			} else {
				hide(this.modeElement);
			}
		}

		if (changed.metadata) {
			if (this.state.metadata) {
				this.metadataElement.textContent = this.state.metadata;
				show(this.metadataElement);
			} else {
				hide(this.metadataElement);
			}
		}
	}

	private getSelectionLabel(info: IEditorSelectionStatus): string {
		if (!info || !info.selections) {
			return null;
		}

		if (info.selections.length === 1) {
			if (info.charactersSelected) {
				return strings.format(nlsSingleSelectionRange, info.selections[0].positionLineNumber, info.selections[0].positionColumn, info.charactersSelected);
			}

			return strings.format(nlsSingleSelection, info.selections[0].positionLineNumber, info.selections[0].positionColumn);
		}

		if (info.charactersSelected) {
			return strings.format(nlsMultiSelectionRange, info.selections.length, info.charactersSelected);
		}

		if (info.selections.length > 0) {
			return strings.format(nlsMultiSelection, info.selections.length);
		}

		return null;
	}

	private onModeClick(): void {
		const action = this.instantiationService.createInstance(ChangeModeAction, ChangeModeAction.ID, ChangeModeAction.LABEL);

		action.run();
		action.dispose();
	}

	private onIndentationClick(): void {
		const action = this.instantiationService.createInstance(ChangeIndentationAction, ChangeIndentationAction.ID, ChangeIndentationAction.LABEL);
		action.run();
		action.dispose();
	}

	private onScreenReaderModeClick(): void {
		if (!this.screenReaderNotification) {
			this.screenReaderNotification = this.notificationService.prompt(
				Severity.Info,
				nls.localize('screenReaderDetectedExplanation.question', "Are you using a screen reader to operate VS Code?"),
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

			Event.once(this.screenReaderNotification.onDidClose)(() => {
				this.screenReaderNotification = null;
			});
		}
	}

	private onSelectionClick(): void {
		this.quickOpenService.show(':'); // "Go to line"
	}

	private onEOLClick(): void {
		const action = this.instantiationService.createInstance(ChangeEOLAction, ChangeEOLAction.ID, ChangeEOLAction.LABEL);

		action.run();
		action.dispose();
	}

	private onEncodingClick(): void {
		const action = this.instantiationService.createInstance(ChangeEncodingAction, ChangeEncodingAction.ID, ChangeEncodingAction.LABEL);

		action.run();
		action.dispose();
	}

	private onTabFocusModeClick(): void {
		TabFocus.setTabFocusMode(false);
	}

	private updateStatusBar(): void {
		const activeControl = this.editorService.activeControl;
		const activeCodeEditor = activeControl ? getCodeEditor(activeControl.getControl()) : undefined;

		// Update all states
		this.onScreenReaderModeChange(activeCodeEditor);
		this.onSelectionChange(activeCodeEditor);
		this.onModeChange(activeCodeEditor);
		this.onEOLChange(activeCodeEditor);
		this.onEncodingChange(activeControl);
		this.onIndentationChange(activeCodeEditor);
		this.onMetadataChange(activeControl);

		// Dispose old active editor listeners
		dispose(this.activeEditorListeners);

		// Attach new listeners to active editor
		if (activeCodeEditor) {

			// Hook Listener for Configuration changes
			this.activeEditorListeners.push(activeCodeEditor.onDidChangeConfiguration((event: IConfigurationChangedEvent) => {
				if (event.accessibilitySupport) {
					this.onScreenReaderModeChange(activeCodeEditor);
				}
			}));

			// Hook Listener for Selection changes
			this.activeEditorListeners.push(activeCodeEditor.onDidChangeCursorPosition((event: ICursorPositionChangedEvent) => {
				this.onSelectionChange(activeCodeEditor);
			}));

			// Hook Listener for mode changes
			this.activeEditorListeners.push(activeCodeEditor.onDidChangeModelLanguage((event: IModelLanguageChangedEvent) => {
				this.onModeChange(activeCodeEditor);
			}));

			// Hook Listener for content changes
			this.activeEditorListeners.push(activeCodeEditor.onDidChangeModelContent((e) => {
				this.onEOLChange(activeCodeEditor);

				let selections = activeCodeEditor.getSelections();
				for (const change of e.changes) {
					if (selections.some(selection => Range.areIntersecting(selection, change.range))) {
						this.onSelectionChange(activeCodeEditor);
						break;
					}
				}
			}));

			// Hook Listener for content options changes
			this.activeEditorListeners.push(activeCodeEditor.onDidChangeModelOptions((event: IModelOptionsChangedEvent) => {
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
				this.activeEditorListeners.push(editor.onMetadataChanged(metadata => {
					this.onMetadataChange(activeControl);
				}));

				this.activeEditorListeners.push(editor.onDidOpenInPlace(() => {
					this.updateStatusBar();
				}));
			});
		}
	}

	private onModeChange(editorWidget: ICodeEditor): void {
		let info: StateDelta = { mode: null };

		// We only support text based editors
		if (editorWidget) {
			const textModel = editorWidget.getModel();
			if (textModel) {
				// Compute mode
				const modeId = textModel.getLanguageIdentifier().language;
				info = { mode: this.modeService.getLanguageName(modeId) };
			}
		}

		this.updateState(info);
	}

	private onIndentationChange(editorWidget: ICodeEditor): void {
		const update: StateDelta = { indentation: null };

		if (editorWidget) {
			const model = editorWidget.getModel();
			if (model) {
				const modelOpts = model.getOptions();
				update.indentation = (
					modelOpts.insertSpaces
						? nls.localize('spacesSize', "Spaces: {0}", modelOpts.tabSize)
						: nls.localize({ key: 'tabSize', comment: ['Tab corresponds to the tab key'] }, "Tab Size: {0}", modelOpts.tabSize)
				);
			}
		}

		this.updateState(update);
	}

	private onMetadataChange(editor: IBaseEditor): void {
		const update: StateDelta = { metadata: null };

		if (editor instanceof BaseBinaryResourceEditor || editor instanceof BinaryResourceDiffEditor) {
			update.metadata = editor.getMetadata();
		}

		this.updateState(update);
	}

	private _promptedScreenReader: boolean = false;

	private onScreenReaderModeChange(editorWidget: ICodeEditor): void {
		let screenReaderMode = false;

		// We only support text based editors
		if (editorWidget) {
			const screenReaderDetected = (browser.getAccessibilitySupport() === AccessibilitySupport.Enabled);
			if (screenReaderDetected) {
				const screenReaderConfiguration = this.configurationService.getValue<IEditorOptions>('editor').accessibilitySupport;
				if (screenReaderConfiguration === 'auto') {
					// show explanation
					if (!this._promptedScreenReader) {
						this._promptedScreenReader = true;
						setTimeout(() => {
							this.onScreenReaderModeClick();
						}, 100);
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

	private onSelectionChange(editorWidget: ICodeEditor): void {
		const info: IEditorSelectionStatus = {};

		// We only support text based editors
		if (editorWidget) {

			// Compute selection(s)
			info.selections = editorWidget.getSelections() || [];

			// Compute selection length
			info.charactersSelected = 0;
			const textModel = editorWidget.getModel();
			if (textModel) {
				info.selections.forEach(selection => {
					info.charactersSelected += textModel.getValueLengthInRange(selection);
				});
			}

			// Compute the visible column for one selection. This will properly handle tabs and their configured widths
			if (info.selections.length === 1) {
				const visibleColumn = editorWidget.getVisibleColumnFromPosition(editorWidget.getPosition());

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

	private onEOLChange(editorWidget: ICodeEditor): void {
		const info: StateDelta = { EOL: null };

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

		const info: StateDelta = { encoding: null };

		// We only support text based editors
		if (e && (isCodeEditor(e.getControl()) || isDiffEditor(e.getControl()))) {
			const encodingSupport: IEncodingSupport = toEditorWithEncodingSupport(e.input);
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

	private onResourceEncodingChange(resource: uri): void {
		const activeControl = this.editorService.activeControl;
		if (activeControl) {
			const activeResource = toResource(activeControl.input, { supportSideBySide: true });
			if (activeResource && activeResource.toString() === resource.toString()) {
				return this.onEncodingChange(<IBaseEditor>activeControl); // only update if the encoding changed for the active resource
			}
		}
	}

	private onTabFocusModeChange(): void {
		const info: StateDelta = { tabFocusMode: TabFocus.getTabFocusMode() };

		this.updateState(info);
	}

	private isActiveEditor(control: IBaseEditor): boolean {
		const activeControl = this.editorService.activeControl;

		return activeControl && activeControl === control;
	}
}

function isWritableCodeEditor(codeEditor: ICodeEditor): boolean {
	if (!codeEditor) {
		return false;
	}
	const config = codeEditor.getConfiguration();
	return (!config.readOnly);
}

function isWritableBaseEditor(e: IBaseEditor): boolean {
	return e && isWritableCodeEditor(getCodeEditor(e.getControl()));
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

	run(): Promise<void> {
		return this.commandService.executeCommand('workbench.extensions.action.showExtensionsForLanguage', this.fileExtension).then(() => undefined);
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
		@IWorkspaceConfigurationService private readonly configurationService: IWorkspaceConfigurationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService
	) {
		super(actionId, actionLabel);
	}

	run(): Promise<any> {
		const activeTextEditorWidget = getCodeEditor(this.editorService.activeTextEditorWidget);
		if (!activeTextEditorWidget) {
			return this.quickInputService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		const textModel = activeTextEditorWidget.getModel();
		const resource = toResource(this.editorService.activeEditor, { supportSideBySide: true });

		let hasLanguageSupport = !!resource;
		if (resource.scheme === Schemas.untitled && !this.untitledEditorService.hasAssociatedFilePath(resource)) {
			hasLanguageSupport = false; // no configuration for untitled resources (e.g. "Untitled-1")
		}

		// Compute mode
		let currentModeId: string;
		let modeId: string;
		if (textModel) {
			modeId = textModel.getLanguageIdentifier().language;
			currentModeId = this.modeService.getLanguageName(modeId);
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

			// construct a fake resource to be able to show nice icons if any
			let fakeResource: uri;
			const extensions = this.modeService.getExtensions(lang);
			if (extensions && extensions.length) {
				fakeResource = uri.file(extensions[0]);
			} else {
				const filenames = this.modeService.getFilenames(lang);
				if (filenames && filenames.length) {
					fakeResource = uri.file(filenames[0]);
				}
			}

			return <IQuickPickItem>{
				label: lang,
				iconClasses: getIconClasses(this.modelService, this.modeService, fakeResource),
				description
			};
		});

		if (hasLanguageSupport) {
			picks.unshift({ type: 'separator', label: nls.localize('languagesPicks', "languages (identifier)") });
		}

		// Offer action to configure via settings
		let configureModeAssociations: IQuickPickItem;
		let configureModeSettings: IQuickPickItem;
		let galleryAction: Action;
		if (hasLanguageSupport) {
			const ext = paths.extname(resource.fsPath) || paths.basename(resource.fsPath);

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

		return this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language Mode"), matchOnDescription: true }).then(pick => {
			if (!pick) {
				return;
			}

			if (pick === galleryAction) {
				galleryAction.run();
				return;
			}

			// User decided to permanently configure associations, return right after
			if (pick === configureModeAssociations) {
				this.configureFileAssociation(resource);
				return;
			}

			// User decided to configure settings for current language
			if (pick === configureModeSettings) {
				this.preferencesService.configureSettingsForLanguage(modeId);
				return;
			}

			// Change mode for active editor
			const activeEditor = this.editorService.activeEditor;
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			const models: ITextModel[] = [];
			if (isCodeEditor(activeTextEditorWidget)) {
				const codeEditorModel = activeTextEditorWidget.getModel();
				if (codeEditorModel) {
					models.push(codeEditorModel);
				}
			} else if (isDiffEditor(activeTextEditorWidget)) {
				const diffEditorModel = activeTextEditorWidget.getModel();
				if (diffEditorModel) {
					if (diffEditorModel.original) {
						models.push(diffEditorModel.original);
					}
					if (diffEditorModel.modified) {
						models.push(diffEditorModel.modified);
					}
				}
			}

			// Find mode
			let languageSelection: ILanguageSelection;
			if (pick === autoDetectMode) {
				languageSelection = this.modeService.createByFilepathOrFirstLine(toResource(activeEditor, { supportSideBySide: true }).fsPath, textModel.getLineContent(1));
			} else {
				languageSelection = this.modeService.createByLanguageName(pick.label);
			}

			// Change mode
			models.forEach(textModel => {
				this.modelService.setMode(textModel, languageSelection);
			});
		});
	}

	private configureFileAssociation(resource: uri): void {
		const extension = paths.extname(resource.fsPath);
		const basename = paths.basename(resource.fsPath);
		const currentAssociation = this.modeService.getModeIdByFilepathOrFirstLine(basename);

		const languages = this.modeService.getRegisteredLanguageNames();
		const picks: IQuickPickItem[] = languages.sort().map((lang, index) => {
			const id = this.modeService.getModeIdForLanguageName(lang.toLowerCase());

			return <IQuickPickItem>{
				id,
				label: lang,
				description: (id === currentAssociation) ? nls.localize('currentAssociation', "Current Association") : undefined
			};
		});

		setTimeout(() => {
			this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguageToConfigure', "Select Language Mode to Associate with '{0}'", extension || basename) }).then(language => {
				if (language) {
					const fileAssociationsConfig = this.configurationService.inspect(FILES_ASSOCIATIONS_CONFIG);

					let associationKey: string;
					if (extension && basename[0] !== '.') {
						associationKey = `*${extension}`; // only use "*.ext" if the file path is in the form of <name>.<ext>
					} else {
						associationKey = basename; // otherwise use the basename (e.g. .gitignore, Dockerfile)
					}

					// If the association is already being made in the workspace, make sure to target workspace settings
					let target = ConfigurationTarget.USER;
					if (fileAssociationsConfig.workspace && !!fileAssociationsConfig.workspace[associationKey]) {
						target = ConfigurationTarget.WORKSPACE;
					}

					// Make sure to write into the value of the target and not the merged value from USER and WORKSPACE config
					let currentAssociations = deepClone((target === ConfigurationTarget.WORKSPACE) ? fileAssociationsConfig.workspace : fileAssociationsConfig.user);
					if (!currentAssociations) {
						currentAssociations = Object.create(null);
					}

					currentAssociations[associationKey] = language.id;

					this.configurationService.updateValue(FILES_ASSOCIATIONS_CONFIG, currentAssociations, target);
				}
			});
		}, 50 /* quick open is sensitive to being opened so soon after another */);
	}
}

export interface IChangeEOLEntry extends IQuickPickItem {
	eol: EndOfLineSequence;
}

class ChangeIndentationAction extends Action {

	static readonly ID = 'workbench.action.editor.changeIndentation';
	static readonly LABEL = nls.localize('changeIndentation', "Change Indentation");

	constructor(
		actionId: string,
		actionLabel: string,
		@IEditorService private readonly editorService: IEditorService,
		@IQuickInputService private readonly quickInputService: IQuickInputService
	) {
		super(actionId, actionLabel);
	}

	run(): Promise<any> {
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
				detail: (language === LANGUAGE_DEFAULT) ? null : a.alias,
				run: () => {
					activeTextEditorWidget.focus();
					a.run();
				}
			};
		});

		picks.splice(3, 0, { type: 'separator', label: nls.localize('indentConvert', "convert file") });
		picks.unshift({ type: 'separator', label: nls.localize('indentView', "change view") });

		return this.quickInputService.pick(picks, { placeHolder: nls.localize('pickAction', "Select Action"), matchOnDetail: true }).then(action => action && action.run());
	}
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

	run(): Promise<any> {
		const activeTextEditorWidget = getCodeEditor(this.editorService.activeTextEditorWidget);
		if (!activeTextEditorWidget) {
			return this.quickInputService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		if (!isWritableCodeEditor(activeTextEditorWidget)) {
			return this.quickInputService.pick([{ label: nls.localize('noWritableCodeEditor', "The active code editor is read-only.") }]);
		}

		const textModel = activeTextEditorWidget.getModel();

		const EOLOptions: IChangeEOLEntry[] = [
			{ label: nlsEOLLF, eol: EndOfLineSequence.LF },
			{ label: nlsEOLCRLF, eol: EndOfLineSequence.CRLF },
		];

		const selectedIndex = (textModel && textModel.getEOL() === '\n') ? 0 : 1;

		return this.quickInputService.pick(EOLOptions, { placeHolder: nls.localize('pickEndOfLine', "Select End of Line Sequence"), activeItem: EOLOptions[selectedIndex] }).then(eol => {
			if (eol) {
				const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorWidget);
				if (activeCodeEditor && isWritableCodeEditor(activeCodeEditor)) {
					const textModel = activeCodeEditor.getModel();
					textModel.pushEOL(eol.eol);
				}
			}
		});
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
		@IFileService private readonly fileService: IFileService
	) {
		super(actionId, actionLabel);
	}

	run(): Promise<any> {
		if (!getCodeEditor(this.editorService.activeTextEditorWidget)) {
			return this.quickInputService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		let activeControl = this.editorService.activeControl;
		let encodingSupport: IEncodingSupport = toEditorWithEncodingSupport(activeControl.input);
		if (!encodingSupport) {
			return this.quickInputService.pick([{ label: nls.localize('noFileEditor', "No file active at this time") }]);
		}

		let saveWithEncodingPick: IQuickPickItem;
		let reopenWithEncodingPick: IQuickPickItem;
		if (language === LANGUAGE_DEFAULT) {
			saveWithEncodingPick = { label: nls.localize('saveWithEncoding', "Save with Encoding") };
			reopenWithEncodingPick = { label: nls.localize('reopenWithEncoding', "Reopen with Encoding") };
		} else {
			saveWithEncodingPick = { label: nls.localize('saveWithEncoding', "Save with Encoding"), detail: 'Save with Encoding', };
			reopenWithEncodingPick = { label: nls.localize('reopenWithEncoding', "Reopen with Encoding"), detail: 'Reopen with Encoding' };
		}

		let pickActionPromise: Promise<IQuickPickItem>;
		if (encodingSupport instanceof UntitledEditorInput) {
			pickActionPromise = Promise.resolve(saveWithEncodingPick);
		} else if (!isWritableBaseEditor(activeControl)) {
			pickActionPromise = Promise.resolve(reopenWithEncodingPick);
		} else {
			pickActionPromise = this.quickInputService.pick([reopenWithEncodingPick, saveWithEncodingPick], { placeHolder: nls.localize('pickAction', "Select Action"), matchOnDetail: true });
		}

		return pickActionPromise.then(action => {
			if (!action) {
				return undefined;
			}

			const resource = toResource(activeControl.input, { supportSideBySide: true });

			return timeout(50 /* quick open is sensitive to being opened so soon after another */)
				.then(() => {
					if (!resource || !this.fileService.canHandleResource(resource)) {
						return Promise.resolve(null); // encoding detection only possible for resources the file service can handle
					}

					return this.fileService.resolveContent(resource, { autoGuessEncoding: true, acceptTextOnly: true }).then(content => content.encoding, err => null);
				})
				.then((guessedEncoding: string) => {
					const isReopenWithEncoding = (action === reopenWithEncodingPick);

					const configuredEncoding = this.textResourceConfigurationService.getValue(resource, 'files.encoding');

					let directMatchIndex: number;
					let aliasMatchIndex: number;

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

					return this.quickInputService.pick(picks, {
						placeHolder: isReopenWithEncoding ? nls.localize('pickEncodingForReopen', "Select File Encoding to Reopen File") : nls.localize('pickEncodingForSave', "Select File Encoding to Save with"),
						activeItem: items[typeof directMatchIndex === 'number' ? directMatchIndex : typeof aliasMatchIndex === 'number' ? aliasMatchIndex : -1]
					}).then(encoding => {
						if (encoding) {
							activeControl = this.editorService.activeControl;
							encodingSupport = toEditorWithEncodingSupport(activeControl.input);
							if (encodingSupport && encodingSupport.getEncoding() !== encoding.id) {
								encodingSupport.setEncoding(encoding.id, isReopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode); // Set new encoding
							}
						}
					});
				});
		});
	}
}
