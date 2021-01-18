/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/editor/contrib/inlineHints/inlineHintsController';

import { Disposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { MenuId, IMenuService, IMenu } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IAction } from 'vs/base/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Range } from 'vs/editor/common/core/range';
import { ModesHoverController } from 'vs/editor/contrib/hover/hover';
import { HoverStartMode } from 'vs/editor/contrib/hover/hoverOperation';

interface InlineHintsMenuCommandArgs {
	range: Range;
}

export class InlineHintsContribution extends Disposable implements IEditorContribution {

	public static readonly ID: string = 'editor.contrib.inlineHintsContribution';

	private menu: IMenu;

	constructor(private readonly _editor: ICodeEditor,
		@IMenuService private readonly _menuService: IMenuService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this.menu = this._menuService.createMenu(MenuId.InlineHintContext, this._contextKeyService);
		this._register(this.menu);
		this._register(this._editor.onContextMenu(e => this.onContextMenu(e)));
		this._register(this._editor.onMouseMove(e => this.onMouseMove(e)));
	}

	dispose(): void {
		super.dispose();
	}

	private getTriggerDecorationFromEvent(mouseEvent: IEditorMouseEvent) {
		const targetType = mouseEvent.target.type;

		if (targetType !== MouseTargetType.CONTENT_TEXT) {
			return;
		}

		const isInlineHintsClassName = (className: string | null | undefined) => !!className?.startsWith('ced-inlineHints');
		const hoverOnInlineHints = [...mouseEvent.target.element?.classList.values() || []].find(isInlineHintsClassName);
		if (!hoverOnInlineHints) {
			return;
		}

		const mouseRange = mouseEvent.target.range;
		if (!mouseRange) {
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		const decorations = model.getDecorationsInRange(mouseRange);
		if (!decorations?.length) {
			return;
		}

		return decorations.find(decoration => isInlineHintsClassName(decoration.options.beforeContentClassName));
	}

	private onMouseMove(mouseEvent: IEditorMouseEvent) {
		const decorationAndMetadata = this.getTriggerDecorationFromEvent(mouseEvent);
		if (!decorationAndMetadata) {
			return;
		}

		const currentDecoration = decorationAndMetadata;
		const hoverController = this._editor.getContribution<ModesHoverController>(ModesHoverController.ID);
		hoverController.showContentHover(currentDecoration.range, HoverStartMode.Immediate, false);
	}

	private onContextMenu(mouseEvent: IEditorMouseEvent) {
		const decorationAndMetadata = this.getTriggerDecorationFromEvent(mouseEvent);
		if (!decorationAndMetadata) {
			return;
		}

		const actions: IAction[] = [];
		const arg: InlineHintsMenuCommandArgs = {
			range: decorationAndMetadata.range
		};

		const actionsDisposable = createAndFillInContextMenuActions(this.menu, { arg, shouldForwardArgs: false }, actions);
		const anchor = { x: mouseEvent.event.posx, width: 0, y: mouseEvent.event.posy, height: 0 };
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => dispose(actionsDisposable)
		});
	}
}

registerEditorContribution(InlineHintsContribution.ID, InlineHintsContribution);
