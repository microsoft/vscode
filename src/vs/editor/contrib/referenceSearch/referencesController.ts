/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ReferencesModel } from './referencesModel';
import { ReferenceWidget, LayoutData } from './referencesWidget';
import { Range } from 'vs/editor/common/core/range';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Position } from 'vs/editor/common/core/position';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Location } from 'vs/editor/common/modes';
import { INotificationService } from 'vs/platform/notification/common/notification';

export const ctxReferenceSearchVisible = new RawContextKey<boolean>('referenceSearchVisible', false);

export interface RequestOptions {
	getMetaTitle(model: ReferencesModel): string;
	onGoto?: (reference: Location) => TPromise<any>;
}

export abstract class ReferencesController implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.contrib.referencesController';

	private _editor: ICodeEditor;
	private _widget: ReferenceWidget;
	private _model: ReferencesModel;
	private _requestIdPool = 0;
	private _disposables: IDisposable[] = [];
	private _ignoreModelChangeEvent = false;

	private _referenceSearchVisible: IContextKey<boolean>;

	public static get(editor: ICodeEditor): ReferencesController {
		return editor.getContribution<ReferencesController>(ReferencesController.ID);
	}

	public constructor(
		private _defaultTreeKeyboardSupport: boolean,
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IStorageService private readonly _storageService: IStorageService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@optional(IEnvironmentService) private _environmentService: IEnvironmentService
	) {
		this._editor = editor;
		this._referenceSearchVisible = ctxReferenceSearchVisible.bindTo(contextKeyService);
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

	public toggleWidget(range: Range, modelPromise: TPromise<ReferencesModel>, options: RequestOptions): void {

		// close current widget and return early is position didn't change
		let widgetPosition: Position;
		if (this._widget) {
			widgetPosition = this._widget.position;
		}
		this.closeWidget();
		if (!!widgetPosition && range.containsPosition(widgetPosition)) {
			return null;
		}

		this._referenceSearchVisible.set(true);

		// close the widget on model/mode changes
		this._disposables.push(this._editor.onDidChangeModelLanguage(() => { this.closeWidget(); }));
		this._disposables.push(this._editor.onDidChangeModel(() => {
			if (!this._ignoreModelChangeEvent) {
				this.closeWidget();
			}
		}));
		const storageKey = 'peekViewLayout';
		const data = <LayoutData>JSON.parse(this._storageService.get(storageKey, undefined, '{}'));
		this._widget = new ReferenceWidget(this._editor, this._defaultTreeKeyboardSupport, data, this._textModelResolverService, this._contextService, this._themeService, this._instantiationService, this._environmentService);
		this._widget.setTitle(nls.localize('labelLoading', "Loading..."));
		this._widget.show(range);
		this._disposables.push(this._widget.onDidClose(() => {
			modelPromise.cancel();

			this._storageService.store(storageKey, JSON.stringify(this._widget.layoutData));
			this._widget = null;
			this.closeWidget();
		}));

		this._disposables.push(this._widget.onDidSelectReference(event => {
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
					this.openReference(element, kind === 'side');
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
				if (this._widget) { // might have been closed
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
		if (this._model) { // can be called while still resolving...
			let source = this._model.nearestReference(this._editor.getModel().uri, this._widget.position);
			let target = this._model.nextOrPreviousReference(source, fwd);
			let editorFocus = this._editor.isFocused();
			await this._widget.setSelection(target);
			await this._gotoReference(target);
			if (editorFocus) {
				this._editor.focus();
			}
		}
	}

	public closeWidget(): void {
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
		}
		this._referenceSearchVisible.reset();
		this._disposables = dispose(this._disposables);
		if (this._model) {
			this._model.dispose();
			this._model = null;
		}
		this._editor.focus();
		this._requestIdPool += 1; // Cancel pending requests
	}

	private _gotoReference(ref: Location): TPromise<any> {
		this._widget.hide();

		this._ignoreModelChangeEvent = true;
		const range = Range.lift(ref.range).collapseToStart();

		return this._editorService.openEditor({
			resource: ref.uri,
			options: { selection: range }
		}).then(openedEditor => {
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

	public openReference(ref: Location, sideBySide: boolean): void {
		const { uri, range } = ref;
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
