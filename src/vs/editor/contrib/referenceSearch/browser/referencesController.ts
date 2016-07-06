/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IInstantiationService, optional} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IConfigurationService, getConfigurationValue} from 'vs/platform/configuration/common/configuration';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService} from 'vs/platform/storage/common/storage';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IPeekViewService} from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import {ReferencesModel, OneReference} from './referencesModel';
import {ReferenceWidget, LayoutData} from './referencesWidget';
import {Range} from 'vs/editor/common/core/range';

export const ctxReferenceSearchVisible = 'referenceSearchVisible';

export interface RequestOptions {
	getMetaTitle(model: ReferencesModel): string;
	onGoto?: (reference: OneReference) => TPromise<any>;
}

export class ReferencesController implements editorCommon.IEditorContribution {

	public static ID = 'editor.contrib.referencesController';

	private _editor: ICodeEditor;
	private _widget: ReferenceWidget;
	private _model: ReferencesModel;
	private _requestIdPool = 0;
	private _disposables: IDisposable[] = [];
	private _ignoreModelChangeEvent = false;

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
		@IConfigurationService private _configurationService: IConfigurationService,
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

	public toggleWidget(range: Range, modelPromise: TPromise<ReferencesModel>, options: RequestOptions) : void {

		// close current widget and return early is position didn't change
		let widgetPosition: editorCommon.IPosition;
		if (this._widget) {
			widgetPosition = this._widget.position;
		}
		this.closeWidget();
		if(!!widgetPosition && range.containsPosition(widgetPosition)) {
			return null;
		}

		this._referenceSearchVisible.set(true);

		// close the widget on model/mode changes
		this._disposables.push(this._editor.onDidChangeModelMode(() => { this.closeWidget(); }));
		this._disposables.push(this._editor.onDidChangeModel(() => {
			if(!this._ignoreModelChangeEvent) {
				this.closeWidget();
			}
		}));
		const storageKey = 'peekViewLayout';
		const data = <LayoutData> JSON.parse(this._storageService.get(storageKey, undefined, '{}'));
		this._widget = new ReferenceWidget(this._editor, data, this._editorService, this._contextService, this._instantiationService);
		this._widget.setTitle(nls.localize('labelLoading', "Loading..."));
		this._widget.show(range);
		this._disposables.push(this._widget.onDidClose(() => {
			modelPromise.cancel();

			this._storageService.store(storageKey, JSON.stringify(this._widget.layoutData));
			this._widget = null;
			this.closeWidget();
		}));

		this._disposables.push(this._widget.onDidSelectReference(event => {
			let {element, kind} = event;
			switch (kind) {
				case 'open':
					if (event.source === 'editor'
						&& getConfigurationValue(this._configurationService.getConfiguration(), 'editor.stablePeek', false)) {

						// when stable peek is configured we don't close
						// the peek window on selecting the editor
						break;
					}
				case 'side':
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
		}));

		const requestId = ++this._requestIdPool;
		const timer = this._telemetryService.timedPublicLog('findReferences', {
			mode: this._editor.getModel().getMode().getId()
		});

		modelPromise.then(model => {

			// still current request? widget still open?
			if (requestId !== this._requestIdPool || !this._widget) {
				return;
			}
			this._model = model;

			// measure time it stays open
			const startTime = Date.now();
			this._disposables.push({
				dispose: () => {
					this._telemetryService.publicLog('zoneWidgetShown', {
						mode: 'reference search',
						elapsedTime: Date.now() - startTime
					});
				}
			});

			// show widget
			return this._widget.setModel(this._model).then(() => {

				// set title
				this._widget.setMetaTitle(options.getMetaTitle(this._model));

				// set 'best' selection
				let uri = this._editor.getModel().uri;
				let pos = { lineNumber: range.startLineNumber, column: range.startColumn };
				let selection = this._model.nearestReference(uri, pos);
				if (selection) {
					return this._widget.setSelection(selection);
				}
			});

		}, error => {
			this._messageService.show(Severity.Error, error);

		}).done(() => {
			timer.stop();
		});
	}

	public closeWidget(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
		}
		this._referenceSearchVisible.reset();
		this._disposables = dispose(this._disposables);
		this._model = null;
		this._editor.focus();
		this._requestIdPool += 1; // Cancel pending requests
	}

	private _gotoReference(ref: OneReference): void {
		this._ignoreModelChangeEvent = true;
		const {uri, range} = ref;

		this._editorService.openEditor({
			resource: uri,
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
				this.closeWidget();
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
		const {uri, range} = ref;
		this._editorService.openEditor({
			resource: uri,
			options: { selection: range }
		}, sideBySide);

		// clear stage
		if (!sideBySide) {
			this.closeWidget();
		}
	}
}


EditorBrowserRegistry.registerEditorContribution(ReferencesController);