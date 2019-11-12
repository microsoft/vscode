/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IContextKey, IContextKeyService, RawContextKey, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ReferencesModel, OneReference } from '../referencesModel';
import { ReferenceWidget, LayoutData } from './referencesWidget';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { Location } from 'vs/editor/common/modes';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { getOuterEditor, PeekContext } from 'vs/editor/contrib/peekView/peekView';
import { IListService, WorkbenchListFocusContextKey } from 'vs/platform/list/browser/listService';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';

export const ctxReferenceSearchVisible = new RawContextKey<boolean>('referenceSearchVisible', false);

export abstract class ReferencesController implements editorCommon.IEditorContribution {

	static readonly ID = 'editor.contrib.referencesController';

	private readonly _disposables = new DisposableStore();

	private _widget?: ReferenceWidget;
	private _model?: ReferencesModel;
	private _peekMode?: boolean;
	private _requestIdPool = 0;
	private _ignoreModelChangeEvent = false;

	private readonly _referenceSearchVisible: IContextKey<boolean>;

	static get(editor: ICodeEditor): ReferencesController {
		return editor.getContribution<ReferencesController>(ReferencesController.ID);
	}

	constructor(
		private readonly _defaultTreeKeyboardSupport: boolean,
		private readonly _editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {

		this._referenceSearchVisible = ctxReferenceSearchVisible.bindTo(contextKeyService);
	}

	dispose(): void {
		this._referenceSearchVisible.reset();
		this._disposables.dispose();
		dispose(this._widget);
		dispose(this._model);
		this._widget = undefined;
		this._model = undefined;
	}

	toggleWidget(range: Range, modelPromise: CancelablePromise<ReferencesModel>, peekMode: boolean): void {

		// close current widget and return early is position didn't change
		let widgetPosition: Position | undefined;
		if (this._widget) {
			widgetPosition = this._widget.position;
		}
		this.closeWidget();
		if (!!widgetPosition && range.containsPosition(widgetPosition)) {
			return;
		}

		this._peekMode = peekMode;
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
			if (!element) {
				return;
			}
			switch (kind) {
				case 'open':
					if (event.source !== 'editor' || !this._configurationService.getValue('editor.stablePeek')) {
						// when stable peek is configured we don't close
						// the peek window on selecting the editor
						this.openReference(element, false);
					}
					break;
				case 'side':
					this.openReference(element, true);
					break;
				case 'goto':
					if (peekMode) {
						this._gotoReference(element);
					} else {
						this.openReference(element, false);
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
					if (!this._model.isEmpty) {
						this._widget.setMetaTitle(nls.localize('metaTitle.N', "{0} ({1})", this._model.title, this._model.references.length));
					} else {
						this._widget.setMetaTitle('');
					}

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

	async goToNextOrPreviousReference(fwd: boolean) {
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

	closeWidget(): void {
		this._referenceSearchVisible.reset();
		this._disposables.clear();
		dispose(this._widget);
		dispose(this._model);
		this._widget = undefined;
		this._model = undefined;
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

			if (!openedEditor || !this._widget) {
				// something went wrong...
				this.closeWidget();
				return;
			}

			if (this._editor === openedEditor) {
				//
				this._widget.show(range);
				this._widget.focus();

			} else {
				// we opened a different editor instance which means a different controller instance.
				// therefore we stop with this controller and continue with the other
				const other = ReferencesController.get(openedEditor);
				const model = this._model!.clone();

				this.closeWidget();
				openedEditor.focus();

				other.toggleWidget(
					range,
					createCancelablePromise(_ => Promise.resolve(model)),
					this._peekMode ?? false
				);
			}

		}, (err) => {
			this._ignoreModelChangeEvent = false;
			onUnexpectedError(err);
		});
	}

	openReference(ref: Location, sideBySide: boolean): void {
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

function withController(accessor: ServicesAccessor, fn: (controller: ReferencesController) => void): void {
	const outerEditor = getOuterEditor(accessor);
	if (!outerEditor) {
		return;
	}
	let controller = ReferencesController.get(outerEditor);
	if (controller) {
		fn(controller);
	}
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToNextReference',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	primary: KeyCode.F4,
	secondary: [KeyCode.F12],
	when: ctxReferenceSearchVisible,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(true);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToNextReferenceFromEmbeddedEditor',
	weight: KeybindingWeight.EditorContrib + 50,
	primary: KeyCode.F4,
	secondary: [KeyCode.F12],
	when: PeekContext.inPeekEditor,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(true);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToPreviousReference',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	primary: KeyMod.Shift | KeyCode.F4,
	secondary: [KeyMod.Shift | KeyCode.F12],
	when: ctxReferenceSearchVisible,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(false);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'goToPreviousReferenceFromEmbeddedEditor',
	weight: KeybindingWeight.EditorContrib + 50,
	primary: KeyMod.Shift | KeyCode.F4,
	secondary: [KeyMod.Shift | KeyCode.F12],
	when: PeekContext.inPeekEditor,
	handler(accessor) {
		withController(accessor, controller => {
			controller.goToNextOrPreviousReference(false);
		});
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReferenceSearch',
	weight: KeybindingWeight.WorkbenchContrib + 50,
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(ctxReferenceSearchVisible, ContextKeyExpr.not('config.editor.stablePeek')),
	handler(accessor: ServicesAccessor) {
		withController(accessor, controller => controller.closeWidget());
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReferenceSearchEditor',
	weight: KeybindingWeight.EditorContrib - 101,
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(PeekContext.inPeekEditor, ContextKeyExpr.not('config.editor.stablePeek')),
	handler(accessor: ServicesAccessor) {
		withController(accessor, controller => controller.closeWidget());
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'openReferenceToSide',
	weight: KeybindingWeight.EditorContrib,
	primary: KeyMod.CtrlCmd | KeyCode.Enter,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Enter
	},
	when: ContextKeyExpr.and(ctxReferenceSearchVisible, WorkbenchListFocusContextKey),
	handler(accessor: ServicesAccessor) {
		const listService = accessor.get(IListService);
		const focus = <any[]>listService.lastFocusedList?.getFocus();
		if (Array.isArray(focus) && focus[0] instanceof OneReference) {
			withController(accessor, controller => controller.openReference(focus[0], true));
		}
	}
});
