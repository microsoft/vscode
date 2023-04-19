/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { Button } from 'vs/base/browser/ui/button/button';
import { toAction } from 'vs/base/common/actions';
import { Disposable, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./postDropWidget';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { DocumentOnDropEdit } from 'vs/editor/common/languages';
import { localize } from 'vs/nls';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';


interface DropEditSet {
	readonly activeEditIndex: number;
	readonly allEdits: readonly DocumentOnDropEdit[];
}

class PostDropWidget extends Disposable implements IContentWidget {
	private static readonly ID = 'editor.widget.postDropWidget';

	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = true;

	private domNode!: HTMLElement;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly range: Range,
		private readonly edits: DropEditSet,
		private readonly onSelectNewEdit: (editIndex: number) => void,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super();

		this.create();

		this.editor.addContentWidget(this);
		this.editor.layoutContentWidget(this);

		this._register(toDisposable((() => this.editor.removeContentWidget(this))));

		this._register(this.editor.onDidChangeCursorPosition(e => {
			if (!range.containsPosition(e.position)) {
				this.dispose();
			}
		}));
	}

	private create(): void {
		this.domNode = dom.$('.post-drop-widget');

		const button = this._register(new Button(this.domNode, {
			title: localize('postDropWidgetTile', "Drop options..."),
			supportIcons: true,
			...defaultButtonStyles,
		}));
		button.label = '$(clippy)';

		this._register(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, e => {
			this._contextMenuService.showContextMenu({
				getAnchor: () => {
					const pos = dom.getDomNodePagePosition(button.element);
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
		}));
	}

	getId(): string {
		return PostDropWidget.ID;
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
}

export class PostDropWidgetManager extends Disposable {

	private readonly _currentWidget = this._register(new MutableDisposable<PostDropWidget>());

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(Event.any(
			_editor.onDidChangeModel,
			_editor.onDidChangeModelContent,
		)(() => this.clear()));
	}

	public show(range: Range, edits: DropEditSet, onDidSelectEdit: (newIndex: number) => void) {
		this.clear();

		if (this._editor.hasModel()) {
			this._currentWidget.value = this._instantiationService.createInstance(PostDropWidget, this._editor, range, edits, onDidSelectEdit);
		}
	}

	public clear() {
		this._currentWidget.clear();
	}
}
