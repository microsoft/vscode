/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/editorstatus';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import { emmet as $, append, runAtThisOrScheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import strings = require('vs/base/common/strings');
import paths = require('vs/base/common/paths');
import types = require('vs/base/common/types');
import uri from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import {IStatusbarItem} from 'vs/workbench/browser/parts/statusbar/statusbar';
import {Action} from 'vs/base/common/actions';
import {EditorAction} from 'vs/editor/common/editorAction';
import {language, LANGUAGE_DEFAULT} from 'vs/base/common/platform';
import {IMode} from 'vs/editor/common/modes';
import {UntitledEditorInput} from 'vs/workbench/common/editor/untitledEditorInput';
import {IFileEditorInput, EncodingMode, IEncodingSupport, asFileEditorInput, getUntitledOrFileResource} from 'vs/workbench/common/editor';
import {IDisposable, combinedDisposable, dispose} from 'vs/base/common/lifecycle';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ICommonCodeEditor, IModelContentChangedEvent, IModelOptionsChangedEvent, IModelModeChangedEvent, ICursorPositionChangedEvent} from 'vs/editor/common/editorCommon';
import {OpenGlobalSettingsAction} from 'vs/workbench/browser/actions/openSettings';
import {ICodeEditor, IDiffEditor} from 'vs/editor/browser/editorBrowser';
import {TrimTrailingWhitespaceAction} from 'vs/editor/contrib/linesOperations/common/linesOperations';
import {EndOfLineSequence, ITokenizedModel, EditorType, ITextModel, IDiffEditorModel, IEditor} from 'vs/editor/common/editorCommon';
import {IndentUsingSpaces, IndentUsingTabs, DetectIndentation, IndentationToSpacesAction, IndentationToTabsAction} from 'vs/editor/contrib/indentation/common/indentation';
import {EventType, ResourceEvent} from 'vs/workbench/common/events';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {IEditor as IBaseEditor} from 'vs/platform/editor/common/editor';
import {IWorkbenchEditorService}  from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IFilesConfiguration, SUPPORTED_ENCODINGS} from 'vs/platform/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModeService} from 'vs/editor/common/services/modeService';
import {StyleMutator} from 'vs/base/browser/styleMutator';
import {Selection} from 'vs/editor/common/core/selection';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {TabFocus} from 'vs/editor/common/config/commonEditorConfig';

function getCodeEditor(editorWidget: IEditor): ICommonCodeEditor {
	if (editorWidget) {
		if (editorWidget.getEditorType() === EditorType.IDiffEditor) {
			return (<IDiffEditor>editorWidget).getModifiedEditor();
		}
		if (editorWidget.getEditorType() === EditorType.ICodeEditor) {
			return (<ICodeEditor>editorWidget);
		}
	}
	return null;
}

function getTextModel(editorWidget: IEditor): ITextModel {
	let textModel: ITextModel;

	// Support for diff
	let model = editorWidget.getModel();
	if (model && !!(<IDiffEditorModel>model).modified) {
		textModel = (<IDiffEditorModel>model).modified;
	}

	// Normal editor
	else {
		textModel = <ITextModel>model;
	}

	return textModel;
}

function asFileOrUntitledEditorInput(input: any): UntitledEditorInput | IFileEditorInput {
	if (input instanceof UntitledEditorInput) {
		return input;
	}

	return asFileEditorInput(input, true /* support diff editor */);
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

	constructor() {
		this.indentation = false;
		this.selectionStatus = false;
		this.mode = false;
		this.encoding = false;
		this.EOL = false;
		this.tabFocusMode = false;
	}

	public combine(other: StateChange) {
		this.indentation = this.indentation || other.indentation;
		this.selectionStatus = this.selectionStatus || other.selectionStatus;
		this.mode = this.mode || other.mode;
		this.encoding = this.encoding || other.encoding;
		this.EOL = this.EOL || other.EOL;
		this.tabFocusMode = this.tabFocusMode || other.tabFocusMode;
	}
}

interface StateDelta {
	selectionStatus?: string;
	mode?: string;
	encoding?: string;
	EOL?: string;
	indentation?: string;
	tabFocusMode?: boolean;
}

class State {
	private _selectionStatus: string;
	public get selectionStatus(): string { return this._selectionStatus; }

	private _mode: string;
	public get mode(): string { return this._mode; }

	private _encoding: string;
	public get encoding(): string { return this._encoding; }

	private _EOL: string;
	public get EOL(): string { return this._EOL; }

	private _indentation: string;
	public get indentation(): string { return this._indentation; }

	private _tabFocusMode: boolean;
	public get tabFocusMode(): boolean { return this._tabFocusMode; }

	constructor() {
		this._selectionStatus = null;
		this._mode = null;
		this._encoding = null;
		this._EOL = null;
		this._tabFocusMode = false;
	}

	public update(update: StateDelta): StateChange {
		let e = new StateChange();
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
const nlsTabFocusMode = nls.localize('tabFocusModeEnabled', "Tab moves focus");

function show(el: HTMLElement): void {
	StyleMutator.setDisplay(el, '');
}
function hide(el: HTMLElement): void {
	StyleMutator.setDisplay(el, 'none');
}

export class EditorStatus implements IStatusbarItem {

	private state: State;
	private element: HTMLElement;
	private tabFocusModeElement: HTMLElement;
	private indentationElement: HTMLElement;
	private selectionElement: HTMLElement;
	private encodingElement: HTMLElement;
	private eolElement: HTMLElement;
	private modeElement: HTMLElement;
	private toDispose: IDisposable[];
	private activeEditorListeners: IDisposable[];
	private delayedRender: IDisposable;
	private toRender: StateChange;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEventService private eventService: IEventService,
		@IModeService private modeService: IModeService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.toDispose = [];
		this.activeEditorListeners = [];
		this.state = new State();
	}

	public render(container: HTMLElement): IDisposable {
		this.element = append(container, $('.editor-statusbar-item'));

		this.tabFocusModeElement = append(this.element, $('a.editor-status-tabfocusmode'));
		this.tabFocusModeElement.title = nls.localize('disableTabMode', "Disable Accessibility Mode");
		this.tabFocusModeElement.onclick = () => this.onTabFocusModeClick();
		this.tabFocusModeElement.textContent = nlsTabFocusMode;
		hide(this.tabFocusModeElement);

		this.selectionElement = append(this.element, $('a.editor-status-selection'));
		this.selectionElement.title = nls.localize('gotoLine', "Go to Line");
		this.selectionElement.onclick = () => this.onSelectionClick();
		hide(this.selectionElement);

		this.indentationElement = append(this.element, $('a.editor-status-indentation'));
		this.indentationElement.title = nls.localize('indentation', "Indentation");
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
			this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()),
			this.eventService.addListener2(EventType.RESOURCE_ENCODING_CHANGED, (e: ResourceEvent) => this.onResourceEncodingChange(e.resource)),
			TabFocus.onDidChangeTabFocus((e) => this.onTabFocusModeChange())
		);

		return combinedDisposable(this.toDispose);
	}

	private updateState(update: StateDelta): void {
		let changed = this.state.update(update);
		if (!changed) {
			// Nothing really changed
			return;
		}

		if (!this.toRender) {
			this.toRender = changed;
			this.delayedRender = runAtThisOrScheduleAtNextAnimationFrame(() => {
				this.delayedRender = null;
				let toRender = this.toRender;
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

		if (changed.indentation) {
			if (this.state.indentation) {
				this.indentationElement.textContent = this.state.indentation;
				show(this.indentationElement);
			} else {
				hide(this.indentationElement);
			}
		}

		if (changed.selectionStatus) {
			if (this.state.selectionStatus) {
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
	}

	private getSelectionLabel(info: IEditorSelectionStatus): string {
		if (!info || !info.selections) {
			return null;
		}

		if (info.selections.length === 1) {
			if (info.charactersSelected) {
				return strings.format(nlsSingleSelectionRange, info.selections[0].positionLineNumber, info.selections[0].positionColumn, info.charactersSelected);
			} else {
				return strings.format(nlsSingleSelection, info.selections[0].positionLineNumber, info.selections[0].positionColumn);
			}
		} else {
			if (info.charactersSelected) {
				return strings.format(nlsMultiSelectionRange, info.selections.length, info.charactersSelected);
			} else {
				return strings.format(nlsMultiSelection, info.selections.length);
			}
		}
	}

	private onModeClick(): void {
		let action = this.instantiationService.createInstance(ChangeModeAction, ChangeModeAction.ID, ChangeModeAction.LABEL);

		action.run().done(null, errors.onUnexpectedError);
		action.dispose();
	}

	private onIndentationClick(): void {
		const action = this.instantiationService.createInstance(ChangeIndentationAction, ChangeIndentationAction.ID, ChangeIndentationAction.LABEL);
		action.run().done(null, errors.onUnexpectedError);
		action.dispose();
	}

	private onSelectionClick(): void {
		this.quickOpenService.show(':'); // "Go to line"
	}

	private onEOLClick(): void {
		let action = this.instantiationService.createInstance(ChangeEOLAction, ChangeEOLAction.ID, ChangeEOLAction.LABEL);

		action.run().done(null, errors.onUnexpectedError);
		action.dispose();
	}

	private onEncodingClick(): void {
		let action = this.instantiationService.createInstance(ChangeEncodingAction, ChangeEncodingAction.ID, ChangeEncodingAction.LABEL);

		action.run().done(null, errors.onUnexpectedError);
		action.dispose();
	}

	private onTabFocusModeClick(): void {
		TabFocus.setTabFocusMode(false);
	}

	private onEditorsChanged(): void {
		let control: IEditor;
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor instanceof BaseTextEditor) {
			control = activeEditor.getControl();
		}

		// Update all states
		this.onSelectionChange(control);
		this.onModeChange(control);
		this.onEOLChange(control);
		this.onEncodingChange(activeEditor);
		this.onIndentationChange(control);

		// Dispose old active editor listeners
		dispose(this.activeEditorListeners);

		// Attach new listeners to active editor
		if (activeEditor instanceof BaseTextEditor) {
			const control = activeEditor.getControl();

			// Hook Listener for Selection changes
			this.activeEditorListeners.push(control.onDidChangeCursorPosition((event: ICursorPositionChangedEvent) => {
				this.onSelectionChange(control);
			}));

			// Hook Listener for mode changes
			this.activeEditorListeners.push(control.onDidChangeModelMode((event: IModelModeChangedEvent) => {
				this.onModeChange(control);
			}));

			// Hook Listener for content changes
			this.activeEditorListeners.push(control.onDidChangeModelRawContent((event: IModelContentChangedEvent) => {
				this.onEOLChange(control);
			}));

			// Hook Listener for content options changes
			this.activeEditorListeners.push(control.onDidChangeModelOptions((event: IModelOptionsChangedEvent) => {
				this.onIndentationChange(control);
			}));
		}
	}

	private onModeChange(editorWidget?: IEditor): void {
		let info: StateDelta = { mode: null };

		// We only support text based editors
		if (editorWidget) {
			let textModel = getTextModel(editorWidget);
			if (textModel) {
				// Compute mode
				if (!!(<ITokenizedModel>textModel).getMode) {
					let mode = (<ITokenizedModel>textModel).getMode();
					if (mode) {
						info = { mode: this.modeService.getLanguageName(mode.getId()) };
					}
				}
			}
		}

		this.updateState(info);
	}

	private onIndentationChange(editorWidget?: IEditor): void {
		const update: StateDelta = { indentation: null };

		if (editorWidget) {
			if (editorWidget.getEditorType() === EditorType.IDiffEditor) {
				editorWidget = (<IDiffEditor>editorWidget).getModifiedEditor();
			}

			const model = (<ICommonCodeEditor>editorWidget).getModel();
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

	private onSelectionChange(editorWidget?: IEditor): void {
		let info: IEditorSelectionStatus = {};

		// We only support text based editors
		if (editorWidget) {

			// Compute selection(s)
			info.selections = editorWidget.getSelections() || [];

			// Compute selection length
			info.charactersSelected = 0;
			let textModel = getTextModel(editorWidget);
			if (textModel) {
				info.selections.forEach((selection) => {
					info.charactersSelected += textModel.getValueLengthInRange(selection);
				});
			}

			// Compute the visible column for one selection. This will properly handle tabs and their configured widths
			if (info.selections.length === 1) {
				let visibleColumn = editorWidget.getVisibleColumnFromPosition(editorWidget.getPosition());

				let selectionClone = info.selections[0].clone(); // do not modify the original position we got from the editor
				selectionClone.positionColumn = visibleColumn;

				info.selections[0] = selectionClone;
			}
		}

		this.updateState({ selectionStatus: this.getSelectionLabel(info) });
	}

	private onEOLChange(editorWidget?: IEditor): void {
		let info: StateDelta = { EOL: null };

		let codeEditor = getCodeEditor(editorWidget);
		if (codeEditor && !codeEditor.getConfiguration().readOnly) {
			let codeEditorModel = codeEditor.getModel();
			if (codeEditorModel) {
				info.EOL = codeEditorModel.getEOL();
			}
		}

		this.updateState(info);
	}

	private onEncodingChange(e: IBaseEditor): void {
		if (e && !this.isActiveEditor(e)) {
			return;
		}

		let info: StateDelta = { encoding: null };

		// We only support text based editors
		if (e instanceof BaseTextEditor) {
			let encodingSupport: IEncodingSupport = <any>asFileOrUntitledEditorInput(e.input);
			if (encodingSupport && types.isFunction(encodingSupport.getEncoding)) {
				let rawEncoding = encodingSupport.getEncoding();
				let encodingInfo = SUPPORTED_ENCODINGS[rawEncoding];
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
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			let activeResource = getUntitledOrFileResource(activeEditor.input, true);
			if (activeResource && activeResource.toString() === resource.toString()) {
				return this.onEncodingChange(<IBaseEditor>activeEditor); // only update if the encoding changed for the active resource
			}
		}
	}

	private onTabFocusModeChange(): void {
		let info: StateDelta = { tabFocusMode: TabFocus.getTabFocusMode() };

		this.updateState(info);
	}

	private isActiveEditor(e: IBaseEditor): boolean {
		let activeEditor = this.editorService.getActiveEditor();

		return activeEditor && e && activeEditor === e;
	}
}

function isWritableCodeEditor(e: BaseTextEditor): boolean {
	let editorWidget = e.getControl();
	if (editorWidget.getEditorType() === EditorType.IDiffEditor) {
		editorWidget = (<IDiffEditor>editorWidget).getModifiedEditor();
	}

	return (editorWidget.getEditorType() === EditorType.ICodeEditor &&
		!(<ICodeEditor>editorWidget).getConfiguration().readOnly);
}

export class ChangeModeAction extends Action {

	public static ID = 'workbench.action.editor.changeLanguageMode';
	public static LABEL = nls.localize('changeMode', "Change Language Mode");

	constructor(
		actionId: string,
		actionLabel: string,
		@IModeService private modeService: IModeService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel);
	}

	public run(): TPromise<any> {
		let languages = this.modeService.getRegisteredLanguageNames();
		let activeEditor = this.editorService.getActiveEditor();
		if (!(activeEditor instanceof BaseTextEditor)) {
			return this.quickOpenService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		let editorWidget = (<BaseTextEditor>activeEditor).getControl();
		let textModel = getTextModel(editorWidget);
		let fileinput = asFileEditorInput(activeEditor.input, true);

		// Compute mode
		let currentModeId: string;
		if (!!(<ITokenizedModel>textModel).getMode) {
			let mode = (<ITokenizedModel>textModel).getMode();
			if (mode) {
				currentModeId = this.modeService.getLanguageName(mode.getId());
			}
		}

		// All languages are valid picks
		let picks: IPickOpenEntry[] = languages.sort().map((lang, index) => {
			return {
				label: lang,
				description: currentModeId === lang ? nls.localize('configuredLanguage', "Configured Language") : void 0
			};
		});
		picks[0].separator = { border: true, label: nls.localize('languagesPicks', "languages") };

		// Offer action to configure via settings
		let configureLabel = nls.localize('configureAssociations', "Configure File Associations...");
		if (fileinput) {
			const resource = fileinput.getResource();
			const ext = paths.extname(resource.fsPath) || paths.basename(resource.fsPath);
			if (ext) {
				configureLabel = nls.localize('configureAssociationsExt', "Configure File Association for '{0}'...", ext);
			}
		}

		let configureModeAssociations: IPickOpenEntry = {
			label: configureLabel
		};
		picks.unshift(configureModeAssociations);

		// Offer to "Auto Detect"
		let autoDetectMode: IPickOpenEntry = {
			label: nls.localize('autoDetect', "Auto Detect")
		};
		if (fileinput) {
			picks.unshift(autoDetectMode);
		}

		return this.quickOpenService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language Mode") }).then((language) => {
			if (language) {
				activeEditor = this.editorService.getActiveEditor();
				if (activeEditor instanceof BaseTextEditor) {
					let editorWidget = activeEditor.getControl();
					let models: ITextModel[] = [];

					let textModel = getTextModel(editorWidget);
					models.push(textModel);

					// Support for original side of diff
					let model = editorWidget.getModel();
					if (model && !!(<IDiffEditorModel>model).original) {
						models.push((<IDiffEditorModel>model).original);
					}

					// Find mode
					let mode: TPromise<IMode>;
					if (language === autoDetectMode) {
						mode = this.modeService.getOrCreateModeByFilenameOrFirstLine(getUntitledOrFileResource(activeEditor.input, true).fsPath, textModel.getLineContent(1));
					} else if (language === configureModeAssociations) {
						const action = this.instantiationService.createInstance(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL);
						action.run().done(() => action.dispose(), errors.onUnexpectedError);

						this.messageService.show(Severity.Info, nls.localize('persistFileAssociations', "You can configure filename to language associations in the **files.associations** section. The changes may need a restart to take effect on already opened files."));
					} else {
						mode = this.modeService.getOrCreateModeByLanguageName(language.label);
					}

					// Change mode
					models.forEach((textModel) => {
						if (!!(<ITokenizedModel>textModel).getMode) {
							(<ITokenizedModel>textModel).setMode(mode);
						}
					});
				}
			}
		});
	}
}

export interface IChangeEOLEntry extends IPickOpenEntry {
	eol: EndOfLineSequence;
}

class ChangeIndentationAction extends Action {

	public static ID = 'workbench.action.editor.changeIndentation';
	public static LABEL = nls.localize('changeIndentation', "Change Indentation");

	constructor(
		actionId: string,
		actionLabel: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel);
	}

	public run(): TPromise<any> {
		const activeEditor = this.editorService.getActiveEditor();
		if (!(activeEditor instanceof BaseTextEditor)) {
			return this.quickOpenService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}
		if (!isWritableCodeEditor(<BaseTextEditor>activeEditor)) {
			return this.quickOpenService.pick([{ label: nls.localize('noWritableCodeEditor', "The active code editor is read-only.") }]);
		}

		const control = <ICommonCodeEditor>activeEditor.getControl();
		const picks = [
			control.getAction(IndentUsingSpaces.ID),
			control.getAction(IndentUsingTabs.ID),
			control.getAction(DetectIndentation.ID),
			control.getAction(IndentationToSpacesAction.ID),
			control.getAction(IndentationToTabsAction.ID),
			control.getAction(TrimTrailingWhitespaceAction.ID)
		].map((a: EditorAction) => {
			return {
				id: a.id,
				label: a.label,
				detail: (language === LANGUAGE_DEFAULT) ? null : a.getAlias(),
				run: () => a.run()
			};
		});

		(<IPickOpenEntry>picks[0]).separator = { label: nls.localize('indentView', "change view") };
		(<IPickOpenEntry>picks[3]).separator = { label: nls.localize('indentConvert', "convert file"), border: true };

		return this.quickOpenService.pick(picks, { placeHolder: nls.localize('pickAction', "Select Action"), matchOnDetail: true }).then(action => action && action.run());
	}
}

export class ChangeEOLAction extends Action {

	public static ID = 'workbench.action.editor.changeEOL';
	public static LABEL = nls.localize('changeEndOfLine', "Change End of Line Sequence");

	constructor(
		actionId: string,
		actionLabel: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel);
	}

	public run(): TPromise<any> {

		let activeEditor = this.editorService.getActiveEditor();
		if (!(activeEditor instanceof BaseTextEditor)) {
			return this.quickOpenService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		if (!isWritableCodeEditor(<BaseTextEditor>activeEditor)) {
			return this.quickOpenService.pick([{ label: nls.localize('noWritableCodeEditor', "The active code editor is read-only.") }]);
		}

		let editorWidget = (<BaseTextEditor>activeEditor).getControl();
		let textModel = getTextModel(editorWidget);

		let EOLOptions: IChangeEOLEntry[] = [
			{ label: nlsEOLLF, eol: EndOfLineSequence.LF },
			{ label: nlsEOLCRLF, eol: EndOfLineSequence.CRLF },
		];

		let selectedIndex = (textModel.getEOL() === '\n') ? 0 : 1;

		return this.quickOpenService.pick(EOLOptions, { placeHolder: nls.localize('pickEndOfLine', "Select End of Line Sequence"), autoFocus: { autoFocusIndex: selectedIndex } }).then((eol) => {
			if (eol) {
				activeEditor = this.editorService.getActiveEditor();
				if (activeEditor instanceof BaseTextEditor && isWritableCodeEditor(activeEditor)) {
					let editorWidget = activeEditor.getControl();
					let textModel = getTextModel(editorWidget);
					textModel.setEOL(eol.eol);
				}
			}
		});
	}
}

export class ChangeEncodingAction extends Action {

	public static ID = 'workbench.action.editor.changeEncoding';
	public static LABEL = nls.localize('changeEncoding', "Change File Encoding");

	constructor(
		actionId: string,
		actionLabel: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(actionId, actionLabel);
	}

	public run(): TPromise<any> {
		let activeEditor = this.editorService.getActiveEditor();
		if (!(activeEditor instanceof BaseTextEditor) || !activeEditor.input) {
			return this.quickOpenService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		let encodingSupport: IEncodingSupport = <any>asFileOrUntitledEditorInput(activeEditor.input);
		if (!types.areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding)) {
			return this.quickOpenService.pick([{ label: nls.localize('noFileEditor', "No file active at this time") }]);
		}

		let pickActionPromise: TPromise<IPickOpenEntry>;

		let saveWithEncodingPick: IPickOpenEntry;
		let reopenWithEncodingPick: IPickOpenEntry;
		if (language === LANGUAGE_DEFAULT) {
			saveWithEncodingPick = { label: nls.localize('saveWithEncoding', "Save with Encoding") };
			reopenWithEncodingPick = { label: nls.localize('reopenWithEncoding', "Reopen with Encoding") };
		} else {
			saveWithEncodingPick = { label: nls.localize('saveWithEncoding', "Save with Encoding"), detail: 'Save with Encoding', };
			reopenWithEncodingPick = { label: nls.localize('reopenWithEncoding', "Reopen with Encoding"), detail: 'Reopen with Encoding' };
		}

		if (encodingSupport instanceof UntitledEditorInput) {
			pickActionPromise = TPromise.as(saveWithEncodingPick);
		} else if (!isWritableCodeEditor(<BaseTextEditor>activeEditor)) {
			pickActionPromise = TPromise.as(reopenWithEncodingPick);
		} else {
			pickActionPromise = this.quickOpenService.pick([reopenWithEncodingPick, saveWithEncodingPick], { placeHolder: nls.localize('pickAction', "Select Action"), matchOnDetail: true });
		}

		return pickActionPromise.then((action) => {
			if (!action) {
				return;
			}

			return TPromise.timeout(50 /* quick open is sensitive to being opened so soon after another */).then(() => {
				const configuration = this.configurationService.getConfiguration<IFilesConfiguration>();

				let isReopenWithEncoding = (action === reopenWithEncodingPick);
				let configuredEncoding = configuration && configuration.files && configuration.files.encoding;
				let directMatchIndex: number;
				let aliasMatchIndex: number;

				// All encodings are valid picks
				let picks: IPickOpenEntry[] = Object.keys(SUPPORTED_ENCODINGS)
					.sort((k1, k2) => {
						if (k1 === configuredEncoding) {
							return -1;
						} else if (k2 === configuredEncoding) {
							return 1;
						}

						return SUPPORTED_ENCODINGS[k1].order - SUPPORTED_ENCODINGS[k2].order;
					})
					.filter(k => {
						return !isReopenWithEncoding || !SUPPORTED_ENCODINGS[k].encodeOnly; // hide those that can only be used for encoding if we are about to decode
					})
					.map((key, index) => {
						if (key === encodingSupport.getEncoding()) {
							directMatchIndex = index;
						} else if (SUPPORTED_ENCODINGS[key].alias === encodingSupport.getEncoding()) {
							aliasMatchIndex = index;
						}

						return { id: key, label: SUPPORTED_ENCODINGS[key].labelLong };
					});

				return this.quickOpenService.pick(picks, {
					placeHolder: isReopenWithEncoding ? nls.localize('pickEncodingForReopen', "Select File Encoding to Reopen File") : nls.localize('pickEncodingForSave', "Select File Encoding to Save with"),
					autoFocus: { autoFocusIndex: typeof directMatchIndex === 'number' ? directMatchIndex : typeof aliasMatchIndex === 'number' ? aliasMatchIndex : void 0 }
				}).then((encoding) => {
					if (encoding) {
						activeEditor = this.editorService.getActiveEditor();
						encodingSupport = <any>asFileOrUntitledEditorInput(activeEditor.input);
						if (encodingSupport && types.areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding) && encodingSupport.getEncoding() !== encoding.id) {
							encodingSupport.setEncoding(encoding.id, isReopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode); // Set new encoding
						}
					}
				});
			});
		});
	}
}