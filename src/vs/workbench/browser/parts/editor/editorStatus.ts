/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/editorstatus';
import nls = require('vs/nls');
import {Promise, TPromise} from 'vs/base/common/winjs.base';
import react = require('lib/react');
import objects = require('vs/base/common/objects');
import encoding = require('vs/base/common/bits/encoding');
import strings = require('vs/base/common/strings');
import types = require('vs/base/common/types');
import uri from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import Severity from 'vs/base/common/severity';
import {IStatusbarItem} from 'vs/workbench/browser/parts/statusbar/statusbar';
import {Action} from 'vs/base/common/actions';
import {IEditorModesRegistry, Extensions} from 'vs/editor/common/modes/modesRegistry';
import {Registry} from 'vs/platform/platform';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {UntitledEditorInput} from 'vs/workbench/browser/parts/editor/untitledEditorInput';
import {EncodingMode, IEncodingSupport, asFileEditorInput, getUntitledOrFileResource} from 'vs/workbench/common/editor';
import {toDisposable, IDisposable} from 'vs/base/common/lifecycle';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {EndOfLineSequence, ITokenizedModel, EditorType, IEditorSelection, ITextModel, IDiffEditorModel, IEditor} from 'vs/editor/common/editorCommon';
import {EventType, EditorEvent, TextEditorSelectionEvent, ResourceEvent} from 'vs/workbench/browser/events';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {IWorkbenchEditorService}  from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/browser/quickOpenService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModeService} from 'vs/editor/common/services/modeService';

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

interface IEditorSelectionStatus {
	selections?: IEditorSelection[];
	charactersSelected?: number;
}

interface IProps {
	eventService: IEventService;
	editorService: IWorkbenchEditorService;
	quickOpenService: IQuickOpenService;
	onModeClick: () => void;
	onSelectionClick: () => void;
	onEOLClick: () => void;
	onEncodingClick: () => void;
	onTabFocusModeClick: () => void;
}

interface IState {
	selectionStatus: IEditorSelectionStatus;
	mode: string;
	encoding: string;
	EOL: string;
	tabFocusMode: boolean;
}

class WidgetSpec extends react.BaseComponent<IProps, IState> {

	private static nlsSingleSelectionRange = nls.localize('singleSelectionRange', "Ln {0}, Col {1} ({2} selected)");
	private static nlsSingleSelection = nls.localize('singleSelection', "Ln {0}, Col {1}");
	private static nlsMultiSelectionRange = nls.localize('multiSelectionRange', "{0} selections ({1} characters selected)");
	private static nlsMultiSelection = nls.localize('multiSelection', "{0} selections");

	public static nlsEOLLF = nls.localize('endOfLineLineFeed', "LF");
	public static nlsEOLCRLF = nls.localize('endOfLineCarriageReturnLineFeed', "CRLF");

	private static nlsTabFocusMode = nls.localize('tabFocusModeEnabled', "Accessibility Mode On");

	private toDispose: IDisposable[];

	public componentDidMount(): void {
		this.toDispose = [
			this.props.eventService.addListener2(EventType.EDITOR_INPUT_CHANGED, (e: EditorEvent) => this.onEditorInputChange(e.editor)),
			this.props.eventService.addListener2(EventType.RESOURCE_ENCODING_CHANGED, (e: ResourceEvent) => this.onResourceEncodingChange(e.resource)),
			this.props.eventService.addListener2(EventType.TEXT_EDITOR_SELECTION_CHANGED, (e: TextEditorSelectionEvent) => this.onSelectionChange(e.editor)),
			this.props.eventService.addListener2(EventType.TEXT_EDITOR_MODE_CHANGED, (e: EditorEvent) => this.onModeChange(e.editor)),
			this.props.eventService.addListener2(EventType.TEXT_EDITOR_CONTENT_CHANGED, (e: EditorEvent) => this.onEOLChange(e.editor)),
			this.props.eventService.addListener2(EventType.TEXT_EDITOR_CONFIGURATION_CHANGED, (e: EditorEvent) => this.onTabFocusModeChange(e.editor)),
		];
	}

	public getInitialState(): IState {
		return {
			selectionStatus: null,
			mode: null,
			encoding: null,
			EOL: null,
			tabFocusMode: false,
		};
	}

	public render(): react.ReactHTMLElement {
		let children: react.ReactHTMLElement[] = [];

		if (this.state.tabFocusMode && this.state.tabFocusMode === true) {
			children.push(react.createElement('a', {
				className: 'editor-status-tabfocusmode',
				title: nls.localize('disableTabMode', "Disable Accessibility Mode"),
				onClick: this.onTabFocusModeClick
			}, WidgetSpec.nlsTabFocusMode));
		}

		let selectionLabel = this.getSelectionLabel();
		if (selectionLabel) {
			children.push(react.createElement('a', {
				className: 'editor-status-selection',
				title: nls.localize('gotoLine', "Go to Line"),
				onClick: this.onSelectionClick
			}, selectionLabel));
		}

		if (this.state.encoding) {
			children.push(react.createElement('a', {
				className: 'editor-status-encoding',
				title: nls.localize('selectEncoding', "Select Encoding"),
				onClick: this.onEncodingClick
			}, this.state.encoding));
		}

		if (this.state.EOL) {
			children.push(react.createElement('a', {
				className: 'editor-status-eol',
				title: nls.localize('selectEOL', "Select End of Line Sequence"),
				onClick: this.onEOLClick
			}, (this.state.EOL === '\r\n' ? WidgetSpec.nlsEOLCRLF : WidgetSpec.nlsEOLLF)));
		}

		if (this.state.mode) {
			children.push(react.createElement('a', {
				className: 'editor-status-mode',
				title: nls.localize('selectLanguageMode', "Select Language Mode"),
				onClick: this.onModeClick
			}, this.state.mode));
		}

		return react.createElement('div', {
			className: 'editor-statusbar-item',
			children: children
		});
	}

	private onModeClick(): void {
		this.props.onModeClick();
	}

	private onSelectionClick(): void {
		this.props.onSelectionClick();
	}

	private onEOLClick(): void {
		this.props.onEOLClick();
	}

	private onEncodingClick(): void {
		this.props.onEncodingClick();
	}

	private onTabFocusModeClick(): void {
		this.props.onTabFocusModeClick();
	}

	private getSelectionLabel(): string {
		let info = this.state.selectionStatus;

		if (!info || !info.selections) {
			return null;
		}

		if (info.selections.length === 1) {
			if (info.charactersSelected) {
				return strings.format(WidgetSpec.nlsSingleSelectionRange, info.selections[0].positionLineNumber, info.selections[0].positionColumn, info.charactersSelected);
			} else {
				return strings.format(WidgetSpec.nlsSingleSelection, info.selections[0].positionLineNumber, info.selections[0].positionColumn);
			}
		} else {
			if (info.charactersSelected) {
				return strings.format(WidgetSpec.nlsMultiSelectionRange, info.selections.length, info.charactersSelected);
			} else {
				return strings.format(WidgetSpec.nlsMultiSelection, info.selections.length);
			}
		}
	}

	private onEditorInputChange(e: BaseEditor): void {
		this.onSelectionChange(e);
		this.onModeChange(e);
		this.onEOLChange(e);
		this.onEncodingChange(e);
		this.onTabFocusModeChange(e);
	}

	private onModeChange(e: BaseEditor): void {
		if (e && !this.isActiveEditor(e)) {
			return;
		}

		let info: { mode: string; } = { mode: null };

		// We only support text based editors
		if (e instanceof BaseTextEditor) {
			let editorWidget = e.getControl();
			let textModel = getTextModel(editorWidget);
			if (textModel) {
				let modesRegistry = <IEditorModesRegistry>Registry.as(Extensions.EditorModes);

				// Compute mode
				if (!!(<ITokenizedModel>textModel).getMode) {
					let mode = (<ITokenizedModel>textModel).getMode();
					if (mode) {
						info = { mode: modesRegistry.getLanguageName(mode.getId()) };
					}
				}
			}
		}

		this.updateState(info);
	}

	private onSelectionChange(e: BaseEditor): void {
		if (e && !this.isActiveEditor(e)) {
			return;
		}

		let info: IEditorSelectionStatus = {};

		// We only support text based editors
		if (e instanceof BaseTextEditor) {
			let editorWidget = e.getControl();

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

		this.updateState({ selectionStatus: info });
	}

	private onEOLChange(e: BaseEditor): void {
		if (e && !this.isActiveEditor(e)) {
			return;
		}

		let info: { EOL: string; } = { EOL: null };

		// We only support writable text based code editors
		if (e instanceof BaseTextEditor && isWritableCodeEditor(e)) {
			let editorWidget = e.getControl();
			let textModel = getTextModel(editorWidget);
			if (textModel) {
				info = { EOL: textModel.getEOL() };
			}
		}

		this.updateState(info);
	}

	private onEncodingChange(e: BaseEditor): void {
		if (e && !this.isActiveEditor(e)) {
			return;
		}

		let info: { encoding: string; } = { encoding: null };

		// We only support text based editors
		if (e instanceof BaseTextEditor) {
			let encodingSupport: IEncodingSupport = <any>e.input;
			if (encodingSupport && types.isFunction(encodingSupport.getEncoding)) {
				let rawEncoding = encodingSupport.getEncoding();
				let encodingInfo = encoding.SUPPORTED_ENCODINGS[rawEncoding];
				if (encodingInfo) {
					info.encoding = encodingInfo.labelShort; // if we have a label, take it from there
				} else {
					info.encoding = rawEncoding; // otherwise use it raw
				}
			}
		}

		this.updateState(info);
	}

	private onResourceEncodingChange(r: uri): void {
		this.onEncodingChange(this.getActiveEditor(r));
	}

	private onTabFocusModeChange(e: BaseEditor): void {
		if (e && !this.isActiveEditor(e)) {
			return;
		}

		let info: { tabFocusMode: boolean; } = { tabFocusMode: false };

		// We only support text based editors
		if (e instanceof BaseTextEditor && isCodeEditorWithTabFocusMode(e)) {
			info = { tabFocusMode: true };
		}

		this.updateState(info);
	}

	private isActiveEditor(e: BaseEditor): boolean {
		let activeEditor = this.props.editorService.getActiveEditor();

		return activeEditor && e && activeEditor === e;
	}

	private getActiveEditor(resource: uri): BaseEditor {
		let activeEditor = this.props.editorService.getActiveEditor();
		if (activeEditor) {
			let r = getUntitledOrFileResource(activeEditor.input);
			if (r && r.toString() === resource.toString()) {
				return <BaseEditor>activeEditor;
			}
		}

		return null;
	}

	private updateState(update: any, callback?: () => void): void {
		this.setState(objects.mixin(update, this.state, false), callback);
	}
}

let EditorStatusWidget = react.createFactoryForTS<IProps>(WidgetSpec.prototype);

export class EditorStatus implements IStatusbarItem {

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEventService private eventService: IEventService
	) {
	}

	public render(container: HTMLElement): IDisposable {
		react.render(
			EditorStatusWidget({
				editorService: this.editorService,
				eventService: this.eventService,
				quickOpenService: this.quickOpenService,
				onModeClick: () => this.onModeClick(),
				onSelectionClick: () => this.onSelectionClick(),
				onEOLClick: () => this.onEOLClick(),
				onTabFocusModeClick: () => this.onTabFocusModeClick(),
				onEncodingClick: () => this.onEncodingClick()
			}),
			container
		);

		return toDisposable(() => react.unmountComponentAtNode(container));
	}

	private onModeClick(): void {
		let action = this.instantiationService.createInstance(ChangeModeAction, ChangeModeAction.ID, ChangeModeAction.LABEL);

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
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor instanceof BaseTextEditor && isCodeEditorWithTabFocusMode(activeEditor)) {
			(<ICodeEditor>activeEditor.getControl()).updateOptions({ tabFocusMode: false });
		}
	}
}

function isCodeEditorWithTabFocusMode(e: BaseTextEditor): boolean {
	let editorWidget = e.getControl();
	return (editorWidget.getEditorType() === EditorType.ICodeEditor &&
		(<ICodeEditor>editorWidget).getConfiguration().tabFocusMode);
}

function isWritableCodeEditor(e: BaseTextEditor): boolean {
	let editorWidget = e.getControl();
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
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(actionId, actionLabel);
	}

	public run(): Promise {
		let modesRegistry = <IEditorModesRegistry>Registry.as(Extensions.EditorModes);
		let languages = modesRegistry.getRegisteredLanguageNames();
		let activeEditor = this.editorService.getActiveEditor();
		if (!(activeEditor instanceof BaseTextEditor)) {
			return this.quickOpenService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		let editorWidget = (<BaseTextEditor>activeEditor).getControl();
		let textModel = getTextModel(editorWidget);

		// Compute mode
		let currentModeId: string;
		if (!!(<ITokenizedModel>textModel).getMode) {
			let mode = (<ITokenizedModel>textModel).getMode();
			if (mode) {
				currentModeId = modesRegistry.getLanguageName(mode.getId());
			}
		}

		// All languages are valid picks
		let selectedIndex: number;
		let picks: IPickOpenEntry[] = languages.sort().map((lang, index) => {
			if (currentModeId === lang) {
				selectedIndex = index;
			}

			return {
				label: lang
			};
		});

		// Offer to "Auto Detect" if we have a file open
		let autoDetectMode: IPickOpenEntry = {
			label: nls.localize('autoDetect', "Auto Detect")
		};

		if (asFileEditorInput(activeEditor.input, true)) {
			picks.unshift(autoDetectMode); // first entry
			selectedIndex++; // pushes selected index down
		}

		return this.quickOpenService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language Mode"), autoFocus: { autoFocusIndex: selectedIndex } }).then((language) => {
			if (language) {
				activeEditor = this.editorService.getActiveEditor();
				if (activeEditor instanceof BaseTextEditor) {
					let editorWidget = activeEditor.getControl();
					let textModel = getTextModel(editorWidget);

					// Change mode
					if (!!(<ITokenizedModel>textModel).getMode) {
						if (language === autoDetectMode) {
							let fileResource = asFileEditorInput(activeEditor.input, true).getResource();
							(<ITokenizedModel>textModel).setMode(this.modeService.getOrCreateModeByFilenameOrFirstLine(fileResource.fsPath, textModel.getLineContent(1)));
						} else {
							(<ITokenizedModel>textModel).setMode(this.modeService.getOrCreateModeByLanguageName(language.label));
						}
					}
				}
			}
		});
	}
}

export interface IChangeEOLEntry extends IPickOpenEntry {
	eol: EndOfLineSequence;
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

	public run(): Promise {

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
			{ label: WidgetSpec.nlsEOLLF, eol: EndOfLineSequence.LF },
			{ label: WidgetSpec.nlsEOLCRLF, eol: EndOfLineSequence.CRLF },
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

	public run(): Promise {
		let activeEditor = this.editorService.getActiveEditor();
		if (!(activeEditor instanceof BaseTextEditor) || !activeEditor.input) {
			return this.quickOpenService.pick([{ label: nls.localize('noEditor', "No text editor active at this time") }]);
		}

		let encodingSupport: IEncodingSupport = <any>activeEditor.input;
		if (!types.areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding)) {
			return this.quickOpenService.pick([{ label: nls.localize('noFileEditor', "No file active at this time") }]);
		}

		let pickActionPromise: TPromise<IPickOpenEntry>;
		let saveWithEncodingPick: IPickOpenEntry = { label: nls.localize('saveWithEncoding', "Save with Encoding") };
		let reopenWithEncodingPick: IPickOpenEntry = { label: nls.localize('reopenWithEncoding', "Reopen with Encoding") };

		if (activeEditor.input instanceof UntitledEditorInput) {
			pickActionPromise = Promise.as(saveWithEncodingPick);
		} else if (!isWritableCodeEditor(<BaseTextEditor>activeEditor)) {
			pickActionPromise = Promise.as(reopenWithEncodingPick);
		} else {
			pickActionPromise = this.quickOpenService.pick([reopenWithEncodingPick, saveWithEncodingPick], { placeHolder: nls.localize('pickAction', "Select Action") });
		}

		return pickActionPromise.then((action) => {
			if (!action) {
				return;
			}

			return Promise.timeout(50 /* quick open is sensitive to being opened so soon after another */).then(() => {
				let isReopenWithEncoding = (action === reopenWithEncodingPick);

				return this.configurationService.loadConfiguration().then((configuration: IFilesConfiguration) => {
					let defaultEncoding = configuration && configuration.files && configuration.files.encoding;
					let selectedIndex: number;

					// All encodings are valid picks
					let picks: IPickOpenEntry[] = Object.keys(encoding.SUPPORTED_ENCODINGS)
						.sort((k1, k2) => {
							if (k1 === defaultEncoding) {
								return -1;
							} else if (k2 === defaultEncoding) {
								return 1;
							}

							return encoding.SUPPORTED_ENCODINGS[k1].order - encoding.SUPPORTED_ENCODINGS[k2].order;
						})
						.map((key, index) => {
							if (key === encodingSupport.getEncoding()) {
								selectedIndex = index;
							}

							return { id: key, label: encoding.SUPPORTED_ENCODINGS[key].labelLong, description: key === defaultEncoding ? nls.localize('defaultEncoding', "Default Encoding") : void 0 };
						});

					return this.quickOpenService.pick(picks, {
						placeHolder: isReopenWithEncoding ? nls.localize('pickEncodingForReopen', "Select File Encoding to Reopen File") : nls.localize('pickEncodingForSave', "Select File Encoding to Save with"),
						autoFocus: { autoFocusIndex: selectedIndex }
					}).then((encoding) => {
						if (encoding) {
							activeEditor = this.editorService.getActiveEditor();
							encodingSupport = <any>activeEditor.input;
							if (encodingSupport && types.areFunctions(encodingSupport.setEncoding, encodingSupport.getEncoding) && encodingSupport.getEncoding() !== encoding.id) {

								// Set new encoding
								encodingSupport.setEncoding(encoding.id, isReopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode);
							}
						}
					});
				});
			});
		});
	}
}