/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { HoverAnchor, HoverForeignElementAnchor } from 'vs/editor/contrib/hover/hoverTypes';
import { MarkdownHover, MarkdownHoverParticipant } from 'vs/editor/contrib/hover/markdownHoverParticipant';
import { InlayHintItem } from 'vs/editor/contrib/inlayHints/inlayHints';
import { InlayHintLabelPart, InlayHintsController } from 'vs/editor/contrib/inlayHints/inlayHintsController';

class InlayHintsHoverAnchor extends HoverForeignElementAnchor {

	constructor(readonly item: InlayHintItem, owner: InlayHintsHover) {
		super(10, owner, Range.fromPositions(item.hint.position));
	}
}

export class InlayHintsHover extends MarkdownHoverParticipant {

	suggestHoverAnchor(mouseEvent: IEditorMouseEvent): HoverAnchor | null {
		const controller = InlayHintsController.get(this._editor);
		if (!controller) {
			return null;
		}
		if (mouseEvent.target.type !== MouseTargetType.CONTENT_TEXT || typeof mouseEvent.target.detail !== 'object') {
			return null;
		}
		const options = mouseEvent.target.detail?.injectedText?.options;
		if (!(options instanceof ModelDecorationInjectedTextOptions && options.attachedData instanceof InlayHintLabelPart)) {
			return null;
		}
		return new InlayHintsHoverAnchor(options.attachedData.item, this);
	}

	override computeSync(): MarkdownHover[] {
		return [];
	}

	override computeAsync(anchor: HoverAnchor, _lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<MarkdownHover> {
		if (!(anchor instanceof InlayHintsHoverAnchor)) {
			return AsyncIterableObject.EMPTY;
		}

		const { item } = anchor;
		return AsyncIterableObject.fromPromise<MarkdownHover>(item.resolve(token).then(() => {
			if (!item.hint.tooltip) {
				return [];
			}
			let contents: IMarkdownString;
			if (typeof item.hint.tooltip === 'string') {
				contents = new MarkdownString().appendText(item.hint.tooltip);
			} else {
				contents = item.hint.tooltip;
			}
			return [new MarkdownHover(this, anchor.range, [contents], 0)];
		}));
	}
}
