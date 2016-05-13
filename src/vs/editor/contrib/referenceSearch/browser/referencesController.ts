/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {isFalsyOrEmpty} from 'vs/base/common/arrays';
import {onUnexpectedError} from 'vs/base/common/errors';
import {cAll} from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService, optional} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService} from 'vs/platform/storage/common/storage';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IReference} from 'vs/editor/common/modes';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IPeekViewService} from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import {ReferencesModel, OneReference} from './referencesModel';
import {ReferenceWidget, LayoutData} from './referencesWidget';

export var ctxReferenceSearchVisible = 'referenceSearchVisible';

export interface RequestOptions {
	getMetaTitle(references: IReference[]): string;
	onGoto(reference: IReference): TPromise<any>;
}

export class ReferencesController implements editorCommon.IEditorContribution {

	public static ID = 'editor.contrib.referencesController';

	private _editor: ICodeEditor;
	private _widget: ReferenceWidget;
	private _model: ReferencesModel;
	private _requestIdPool = 0;
	private _callOnClear: Function[] = [];
	private _ignoreModelChangeEvent = false;

	private _startTime: number = -1;
	private _referenceSearchVisible: IKeybindingContextKey<boolean>;

	static getController(editor:editorCommon.ICommonCodeEditor): ReferencesController {
		return <ReferencesController> editor.getContribution(ReferencesController.ID);
	}

	public constructor(
		editor: ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService,
		@IEditorService private _editorService: IEditorService,
		@ITelemetryService private _telemetryService: ITelemetryService,
		@IMessageService private _messageService: IMessageService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IWorkspaceContextService private _contextService: IWorkspaceContextService,
		@IStorageService private _storageService: IStorageService,
		@optional(IPeekViewService) private _peekViewService: IPeekViewService
	) {
		this._editor = editor;
		this._referenceSearchVisible = keybindingService.createKey(ctxReferenceSearchVisible, false);
	}

	public getId(): string {
		return ReferencesController.ID;
	}

	public dispose(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
		}
		this._editor = null;
	}

	public isInPeekView() : boolean {
		return this._peekViewService && this._peekViewService.isActive;
	}

	public closeReferenceSearch(): void {
		this.clear();
	}

	public processRequest(range: editorCommon.IEditorRange, referencesPromise: TPromise<IReference[]>, options: RequestOptions) : void {
		var widgetPosition = !this._widget ? null : this._widget.position;

		// clean up from previous invocation
		var widgetClosed = this.clear();

		// Close if the position is still the same
		if(widgetClosed && !!widgetPosition && range.containsPosition(widgetPosition)) {
			return null;
		}

		this._referenceSearchVisible.set(true);

		// close the widget on model/mode changes
		this._callOnClear.push(this._editor.addListener(editorCommon.EventType.ModelModeChanged, () => { this.clear(); }));
		this._callOnClear.push(this._editor.addListener(editorCommon.EventType.ModelChanged, () => {
			if(!this._ignoreModelChangeEvent) {
				this.clear();
			}
		}));
		const storageKey = 'peekViewLayout';
		const data = <LayoutData> JSON.parse(this._storageService.get(storageKey, undefined, '{}'));
		this._widget = new ReferenceWidget(this._editor, data, this._editorService, this._contextService, this._instantiationService);
		this._widget.setTitle(nls.localize('labelLoading', "Loading..."));
		this._widget.show(range);
		this._callOnClear.push(this._widget.onDidClose(() => {
			referencesPromise.cancel();

			this._storageService.store(storageKey, JSON.stringify(this._widget.layoutData));
			this._widget = null;
			this.clear();
		}).dispose);

		this._callOnClear.push(this._widget.onDidSelectReference(event => {
			let {element, kind} = event;
			switch (kind) {
				case 'side':
				case 'open':
					this._openReference(element, kind === 'side');
					break;
				case 'goto':
					if (options.onGoto) {
						options.onGoto(element);
					} else {
						this._gotoReference(element);
					}
					break;
			}
		}).dispose);

		var requestId = ++this._requestIdPool,
			editorModel = this._editor.getModel();

		var timer = this._telemetryService.timedPublicLog('findReferences', {
			mode: editorModel.getMode().getId()
		});

		referencesPromise.then(references => {

			// still current request? widget still open?
			if(requestId !== this._requestIdPool || !this._widget) {
				timer.stop();
				return;
			}

			// has a result
			if (isFalsyOrEmpty(references)) {
				this._widget.showMessage(nls.localize('noResults', "No results"));
				timer.stop();
				return;
			}

			// create result model
			this._model = new ReferencesModel(references);

			// show widget
			this._startTime = Date.now();
			if (this._widget) {
				this._widget.setMetaTitle(options.getMetaTitle(references));
				this._widget.setModel(this._model);
			}
			timer.stop();

		}, (error:any) => {
			this._messageService.show(Severity.Error, error);
			timer.stop();
		});
	}

	private clear(): boolean {

		if (this._startTime !== -1) {
			this._telemetryService.publicLog('zoneWidgetShown', {
				mode: 'reference search',
				elapsedTime: Date.now() - this._startTime
			});
			this._startTime = -1;
		}

		var result = false;
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
			result = true;
		}

		this._referenceSearchVisible.reset();

		cAll(this._callOnClear);

		this._model = null;

		this._editor.focus();
		this._requestIdPool += 1; // Cancel pending requests
		return result;
	}

	private _gotoReference(ref: OneReference): void {
		this._ignoreModelChangeEvent = true;
		const {resource, range} = ref;

		this._editorService.openEditor({
			resource,
			options: { selection: range }
		}).done(openedEditor => {
			this._ignoreModelChangeEvent = false;

			if (!openedEditor || openedEditor.getControl() !== this._editor) {
				// TODO@Alex TODO@Joh
				// when opening the current reference we might end up
				// in a different editor instance. that means we also have
				// a different instance of this reference search controller
				// and cannot hold onto the widget (which likely doesn't
				// exist). Instead of bailing out we should find the
				// 'sister' action and pass our current model on to it.
				this.clear();
				return;
			}

			this._widget.show(range);
			this._widget.focus();

		}, (err) => {
			this._ignoreModelChangeEvent = false;
			onUnexpectedError(err);
		});
	}

	private _openReference(ref: OneReference, sideBySide: boolean): void {
		const {resource, range} = ref;
		this._editorService.openEditor({
			resource,
			options: { selection: range }
		}, sideBySide);

		// clear stage
		if (!sideBySide) {
			this.clear();
		}
	}
}


EditorBrowserRegistry.registerEditorContribution(ReferencesController);