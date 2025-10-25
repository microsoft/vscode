/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IAction } from '../../../../base/common/actions.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../browser/editorBrowser.js';
import { IBulkEditResult, IBulkEditService } from '../../../browser/services/bulkEditService.js';
import { Range } from '../../../common/core/range.js';
import { DocumentDropEdit, DocumentPasteEdit } from '../../../common/languages.js';
import { TrackedRangeStickiness } from '../../../common/model.js';
import { CodeEditorStateFlag, EditorStateCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { createCombinedWorkspaceEdit } from './edit.js';
import './postEditWidget.css';


interface EditSet<Edit extends DocumentPasteEdit | DocumentDropEdit> {
	readonly activeEditIndex: number;
	readonly allEdits: ReadonlyArray<Edit>;
}

interface ShowCommand {
	readonly id: string;
	readonly label: string;
}

class PostEditWidget<T extends DocumentPasteEdit | DocumentDropEdit> extends Disposable implements IContentWidget {
	private static readonly baseId = 'editor.widget.postEditWidget';

	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = true;

	private domNode!: HTMLElement;
	private button!: Button;

	private readonly visibleContext: IContextKey<boolean>;

	constructor(
		private readonly typeId: string,
		private readonly editor: ICodeEditor,
		visibleContext: RawContextKey<boolean>,
		private readonly showCommand: ShowCommand,
		private readonly range: Range,
		private readonly edits: EditSet<T>,
		private readonly onSelectNewEdit: (editIndex: number) => void,
		private readonly additionalActions: readonly IAction[],
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
	) {
		super();

		this.create();

		this.visibleContext = visibleContext.bindTo(contextKeyService);
		this.visibleContext.set(true);
		this._register(toDisposable(() => this.visibleContext.reset()));

		this.editor.addContentWidget(this);
		this.editor.layoutContentWidget(this);

		this._register(toDisposable((() => this.editor.removeContentWidget(this))));

		this._register(this.editor.onDidChangeCursorPosition(e => {
			this.dispose();
		}));

		this._register(Event.runAndSubscribe(_keybindingService.onDidUpdateKeybindings, () => {
			this._updateButtonTitle();
		}));
	}

	private _updateButtonTitle() {
		const binding = this._keybindingService.lookupKeybinding(this.showCommand.id)?.getLabel();
		this.button.element.title = this.showCommand.label + (binding ? ` (${binding})` : '');
	}

	private create(): void {
		this.domNode = dom.$('.post-edit-widget');

		this.button = this._register(new Button(this.domNode, {
			supportIcons: true,
		}));
		this.button.label = '$(insert)';

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, () => this.showSelector()));
	}

	getId(): string {
		return PostEditWidget.baseId + '.' + this.typeId;
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: this.range.getEndPosition(),
			preference: [ContentWidgetPositionPreference.BELOW]
		};
	}

	showSelector() {
		const pos = dom.getDomNodePagePosition(this.button.element);
		const anchor = { x: pos.left + pos.width, y: pos.top + pos.height };

		this._actionWidgetService.show('postEditWidget', false,
			this.edits.allEdits.map((edit, i): IActionListItem<T> => {
				return {
					kind: ActionListItemKind.Action,
					item: edit,
					label: edit.title,
					disabled: false,
					canPreview: false,
					group: { title: '', icon: ThemeIcon.fromId(i === this.edits.activeEditIndex ? Codicon.check.id : Codicon.blank.id) },
				};
			}), {
			onHide: () => {
				this.editor.focus();
			},
			onSelect: (item) => {
				this._actionWidgetService.hide(false);

				const i = this.edits.allEdits.findIndex(edit => edit === item);
				if (i !== this.edits.activeEditIndex) {
					return this.onSelectNewEdit(i);
				}
			},
		}, anchor, this.editor.getDomNode() ?? undefined, this.additionalActions);
	}
}

export class PostEditWidgetManager<T extends DocumentPasteEdit | DocumentDropEdit> extends Disposable {

	private readonly _currentWidget = this._register(new MutableDisposable<PostEditWidget<T>>());

	constructor(
		private readonly _id: string,
		private readonly _editor: ICodeEditor,
		private readonly _visibleContext: RawContextKey<boolean>,
		private readonly _showCommand: ShowCommand,
		private readonly _getAdditionalActions: () => readonly IAction[],
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();

		this._register(Event.any(
			_editor.onDidChangeModel,
			_editor.onDidChangeModelContent,
		)(() => this.clear()));
	}

	public async applyEditAndShowIfNeeded(ranges: readonly Range[], edits: EditSet<T>, canShowWidget: boolean, resolve: (edit: T, token: CancellationToken) => Promise<T>, token: CancellationToken) {
		if (!ranges.length || !this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		const edit = edits.allEdits.at(edits.activeEditIndex);
		if (!edit) {
			return;
		}

		const onDidSelectEdit = async (newEditIndex: number) => {
			const model = this._editor.getModel();
			if (!model) {
				return;
			}

			await model.undo();
			this.applyEditAndShowIfNeeded(ranges, { activeEditIndex: newEditIndex, allEdits: edits.allEdits }, canShowWidget, resolve, token);
		};

		const handleError = (e: Error, message: string) => {
			if (isCancellationError(e)) {
				return;
			}

			this._notificationService.error(message);
			if (canShowWidget) {
				this.show(ranges[0], edits, onDidSelectEdit);
			}
		};

		const editorStateCts = new EditorStateCancellationTokenSource(this._editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Selection, undefined, token);
		let resolvedEdit: T;
		try {
			resolvedEdit = await raceCancellationError(resolve(edit, editorStateCts.token), editorStateCts.token);
		} catch (e) {
			return handleError(e, localize('resolveError', "Error resolving edit '{0}':\n{1}", edit.title, toErrorMessage(e)));
		} finally {
			editorStateCts.dispose();
		}

		if (token.isCancellationRequested) {
			return;
		}

		const combinedWorkspaceEdit = createCombinedWorkspaceEdit(model.uri, ranges, resolvedEdit);

		// Use a decoration to track edits around the trigger range
		const primaryRange = ranges[0];
		const editTrackingDecoration = model.deltaDecorations([], [{
			range: primaryRange,
			options: { description: 'paste-line-suffix', stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }
		}]);

		this._editor.focus();
		let editResult: IBulkEditResult;
		let editRange: Range | null;
		try {
			editResult = await this._bulkEditService.apply(combinedWorkspaceEdit, { editor: this._editor, token });
			editRange = model.getDecorationRange(editTrackingDecoration[0]);
		} catch (e) {
			return handleError(e, localize('applyError', "Error applying edit '{0}':\n{1}", edit.title, toErrorMessage(e)));
		} finally {
			model.deltaDecorations(editTrackingDecoration, []);
		}

		if (token.isCancellationRequested) {
			return;
		}

		if (canShowWidget && editResult.isApplied && edits.allEdits.length > 1) {
			this.show(editRange ?? primaryRange, edits, onDidSelectEdit);
		}
	}

	public show(range: Range, edits: EditSet<T>, onDidSelectEdit: (newIndex: number) => void) {
		this.clear();

		if (this._editor.hasModel()) {
			this._currentWidget.value = this._instantiationService.createInstance(PostEditWidget<T>, this._id, this._editor, this._visibleContext, this._showCommand, range, edits, onDidSelectEdit, this._getAdditionalActions());
		}
	}

	public clear() {
		this._currentWidget.clear();
	}

	public tryShowSelector() {
		this._currentWidget.value?.showSelector();
	}
}
