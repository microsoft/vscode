/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ReferencesModel } from './referencesModel';
import { ReferenceWidget, LayoutData } from './referencesWidget';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { Location } from 'vs/editor/common/modes';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CancelablePromise } from 'vs/base/common/async';

export const ctxReferenceSearchVisible = new RawContextKey<boolean>('referenceSearchVisible', false);

export interface RequestOptions {
	getMetaTitle(model: ReferencesModel): string;
	onGoto?: (reference: Location) => Promise<any>;
}

export abstract class ReferencesController implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.referencesController';

	private readonly _disposables = new DisposableStore();
	private readonly _editor: ICodeEditor;
	private _widget?: ReferenceWidget;
	private _model?: ReferencesModel;
	private _requestIdPool = 0;
	private _ignoreModelChangeEvent = false;

	private readonly _referenceSearchVisible: IContextKey<boolean>;

	public static get(editor: ICodeEditor): ReferencesController {
		return editor.getContribution<ReferencesController>(ReferencesController.ID);
	}

	public constructor(
		private readonly _defaultTreeKeyboardSupport: boolean,
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		this._editor = editor;
		this._referenceSearchVisible = ctxReferenceSearchVisible.bindTo(contextKeyService);
	}

	public getId(): string {
		return ReferencesController.ID;
	}

	public dispose(): void {
		this._referenceSearchVisible.reset();
		dispose(this._disposables);
		if (this._widget) {
			dispose(this._widget);
			this._widget = undefined;
		}
		if (this._model) {
			dispose(this._model);
			this._model = undefined;
		}
	}

	public toggleWidget(range: Range, modelPromise: CancelablePromise<ReferencesModel>, options: RequestOptions): void {

		// close current widget and return early is position didn't change
		let widgetPosition: Position | undefined;
		if (this._widget) {
			widgetPosition = this._widget.position;
		}
		this.closeWidget();
		if (!!widgetPosition && range.containsPosition(widgetPosition)) {
			return;
		}

		this._referenceSearchVisible.set(true);

		// close the widget on model/mode changes
		this._disposables.add(this._editor.onDidChangeModelLanguage(() => { this.closeWidget(); }));
		this._disposables.add(this._editor.onDidChangeModel(() => {
			if (!this._ignoreModelChangeEvent) {
				this.closeWidget();
			}
		}));
		const storageKey = 'peekViewLayout';
		const data = LayoutData.fromJSON(this._storageService.get(storageKey, StorageScope.GLOBAL, '{}'));
		this._widget = this._instantiationService.createInstance(ReferenceWidget, this._editor, this._defaultTreeKeyboardSupport, data);
		this._widget.setTitle(nls.localize('labelLoading', "Loading..."));
		this._widget.show(range);

		this._disposables.add(this._widget.onDidClose(() => {
			modelPromise.cancel();
			if (this._widget) {
				this._storageService.store(storageKey, JSON.stringify(this._widget.layoutData), StorageScope.GLOBAL);
				this._widget = undefined;
			}
			this.closeWidget();
		}));

		this._disposables.add(this._widget.onDidSelectReference(event => {
			let { element, kind } = event;
			switch (kind) {
				case 'open':
					if (event.source === 'editor'
						&& this._configurationService.getValue('editor.stablePeek')) {

						// when stable peek is configured we don't close
						// the peek window on selecting the editor
						break;
					}
				case 'side':
					if (element) {
						this.openReference(element, kind === 'side');
					}
					break;
				case 'goto':
					if (element) {
						if (options.onGoto) {
							options.onGoto(element);
						} else {
							this._gotoReference(element);
						}
					}
					break;
			}
		}));

		const requestId = ++this._requestIdPool;

		modelPromise.then(model => {

			// still current request? widget still open?
			if (requestId !== this._requestIdPool || !this._widget) {
				return undefined;
			}

			if (this._model) {
				this._model.dispose();
			}

			this._model = model;

			// show widget
			return this._widget.setModel(this._model).then(() => {
				if (this._widget && this._model && this._editor.hasModel()) { // might have been closed
					// set title
					this._widget.setMetaTitle(options.getMetaTitle(this._model));

					// set 'best' selection
					let uri = this._editor.getModel().uri;
					let pos = new Position(range.startLineNumber, range.startColumn);
					let selection = this._model.nearestReference(uri, pos);
					if (selection) {
						return this._widget.setSelection(selection);
					}
				}
				return undefined;
			});

		}, error => {
			this._notificationService.error(error);
		});
	}

	public async goToNextOrPreviousReference(fwd: boolean) {
		if (!this._editor.hasModel() || !this._model || !this._widget) {
			// can be called while still resolving...
			return;
		}
		const currentPosition = this._widget.position;
		if (!currentPosition) {
			return;
		}
		const source = this._model.nearestReference(this._editor.getModel().uri, currentPosition);
		if (!source) {
			return;
		}
		const target = this._model.nextOrPreviousReference(source, fwd);
		const editorFocus = this._editor.hasTextFocus();
		await this._widget.setSelection(target);
		await this._gotoReference(target);
		if (editorFocus) {
			this._editor.focus();
		}
	}

	public closeWidget(): void {
		if (this._widget) {
			dispose(this._widget);
			this._widget = undefined;
		}
		this._referenceSearchVisible.reset();
		this._disposables.clear();
		if (this._model) {
			dispose(this._model);
			this._model = undefined;
		}
		this._editor.focus();
		this._requestIdPool += 1; // Cancel pending requests
	}

	private _gotoReference(ref: Location): Promise<any> {
		if (this._widget) {
			this._widget.hide();
		}

		this._ignoreModelChangeEvent = true;
		const range = Range.lift(ref.range).collapseToStart();

		return this._editorService.openCodeEditor({
			resource: ref.uri,
			options: { selection: range }
		}, this._editor).then(openedEditor => {
			this._ignoreModelChangeEvent = false;

			if (!openedEditor || openedEditor !== this._editor) {
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

			if (this._widget) {
				this._widget.show(range);
				this._widget.focus();
			}

		}, (err) => {
			this._ignoreModelChangeEvent = false;
			onUnexpectedError(err);
		});
	}

	public openReference(ref: Location, sideBySide: boolean): void {
		// clear stage
		if (!sideBySide) {
			this.closeWidget();
		}

		const { uri, range } = ref;
		this._editorService.openCodeEditor({
			resource: uri,
			options: { selection: range }
		}, this._editor, sideBySide);
	}
}
