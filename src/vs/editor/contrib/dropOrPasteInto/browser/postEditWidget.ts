/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { toAction } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./postEditWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IBulkEditResult, IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { Range } from 'vs/editor/common/core/range';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { TrackedRangeStickiness } from 'vs/editor/common/model';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';


interface EditSet {
	readonly activeEditIndex: number;
	readonly allEdits: ReadonlyArray<{
		readonly label: string;
		readonly insertText: string | { readonly snippet: string };
		readonly additionalEdit?: WorkspaceEdit;
	}>;
}

interface ShowCommand {
	readonly id: string;
	readonly label: string;
}

class PostEditWidget extends Disposable implements IContentWidget {
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
		private readonly edits: EditSet,
		private readonly onSelectNewEdit: (editIndex: number) => void,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
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
			if (!range.containsPosition(e.position)) {
				this.dispose();
			}
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
		this._contextMenuService.showContextMenu({
			getAnchor: () => {
				const pos = dom.getDomNodePagePosition(this.button.element);
				return { x: pos.left + pos.width, y: pos.top + pos.height };
			},
			getActions: () => {
				return this.edits.allEdits.map((edit, i) => toAction({
					id: '',
					label: edit.label,
					checked: i === this.edits.activeEditIndex,
					run: () => {
						if (i !== this.edits.activeEditIndex) {
							return this.onSelectNewEdit(i);
						}
					},
				}));
			}
		});
	}
}

export class PostEditWidgetManager extends Disposable {

	private readonly _currentWidget = this._register(new MutableDisposable<PostEditWidget>());

	constructor(
		private readonly _id: string,
		private readonly _editor: ICodeEditor,
		private readonly _visibleContext: RawContextKey<boolean>,
		private readonly _showCommand: ShowCommand,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) {
		super();

		this._register(Event.any(
			_editor.onDidChangeModel,
			_editor.onDidChangeModelContent,
		)(() => this.clear()));
	}

	public async applyEditAndShowIfNeeded(ranges: readonly Range[], edits: EditSet, canShowWidget: boolean, token: CancellationToken) {
		const model = this._editor.getModel();
		if (!model || !ranges.length) {
			return;
		}

		const edit = edits.allEdits[edits.activeEditIndex];
		if (!edit) {
			return;
		}

		const combinedWorkspaceEdit: WorkspaceEdit = {
			edits: [
				...ranges.map(range =>
					new ResourceTextEdit(model.uri,
						typeof edit.insertText === 'string'
							? { range, text: edit.insertText, insertAsSnippet: false }
							: { range, text: edit.insertText.snippet, insertAsSnippet: true }
					)),
				...(edit.additionalEdit?.edits ?? [])
			]
		};

		// Use a decoration to track edits around the trigger range
		const primaryRange = ranges[0];
		const editTrackingDecoration = model.deltaDecorations([], [{
			range: primaryRange,
			options: { description: 'paste-line-suffix', stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }
		}]);

		let editResult: IBulkEditResult;
		let editRange: Range | null;
		try {
			editResult = await this._bulkEditService.apply(combinedWorkspaceEdit, { editor: this._editor, token });
			editRange = model.getDecorationRange(editTrackingDecoration[0]);
		} finally {
			model.deltaDecorations(editTrackingDecoration, []);
		}

		if (canShowWidget && editResult.isApplied && edits.allEdits.length > 1) {
			this.show(editRange ?? primaryRange, edits, async (newEditIndex) => {
				const model = this._editor.getModel();
				if (!model) {
					return;
				}

				await model.undo();
				this.applyEditAndShowIfNeeded(ranges, { activeEditIndex: newEditIndex, allEdits: edits.allEdits }, canShowWidget, token);
			});
		}
	}

	public show(range: Range, edits: EditSet, onDidSelectEdit: (newIndex: number) => void) {
		this.clear();

		if (this._editor.hasModel()) {
			this._currentWidget.value = this._instantiationService.createInstance(PostEditWidget, this._id, this._editor, this._visibleContext, this._showCommand, range, edits, onDidSelectEdit);
		}
	}

	public clear() {
		this._currentWidget.clear();
	}

	public tryShowSelector() {
		this._currentWidget.value?.showSelector();
	}
}
