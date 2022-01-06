/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { InlayHint } from 'vs/editor/common/languages';
import { IModelDecoration } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { HoverAnchor, HoverForeignElementAnchor } from 'vs/editor/contrib/hover/hoverTypes';
import { MarkdownHover, MarkdownHoverParticipant } from 'vs/editor/contrib/hover/markdownHoverParticipant';
import { InlayHintData, InlayHintsController } from 'vs/editor/contrib/inlayHints/inlayHintsController';

class InlayHintsHoverAnchor extends HoverForeignElementAnchor {

	constructor(readonly hint: InlayHint, owner: InlayHintsHover) {
		super(10, owner, Range.fromPositions(hint.position));
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
		if (!(options instanceof ModelDecorationInjectedTextOptions && options.attachedData instanceof InlayHintData)) {
			return null;
		}
		return new InlayHintsHoverAnchor(options.attachedData.hint, this);
	}

	override computeSync(): MarkdownHover[] {
		return [];
	}

	override computeAsync(anchor: HoverAnchor, _lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<MarkdownHover> {
		if (!(anchor instanceof InlayHintsHoverAnchor)) {
			return AsyncIterableObject.EMPTY;
		}
		if (!anchor.hint.tooltip) {
			return AsyncIterableObject.EMPTY;
		}
		let md: IMarkdownString;
		if (typeof anchor.hint.tooltip === 'string') {
			md = new MarkdownString().appendText(anchor.hint.tooltip);
		} else {
			md = anchor.hint.tooltip;
		}
		return new AsyncIterableObject(emitter => emitter.emitOne(new MarkdownHover(this, anchor.range, [md], 0)));
	}
}
