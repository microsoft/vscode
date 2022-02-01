/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { HoverProviderRegistry } from 'vs/editor/common/languages';
import { IModelDecoration } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { HoverAnchor, HoverForeignElementAnchor, IEditorHoverParticipant } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { getHover } from 'vs/editor/contrib/hover/browser/getHover';
import { MarkdownHover, MarkdownHoverParticipant } from 'vs/editor/contrib/hover/browser/markdownHoverParticipant';
import { RenderedInlayHintLabelPart, InlayHintsController } from 'vs/editor/contrib/inlayHints/browser/inlayHintsController';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';

class InlayHintsHoverAnchor extends HoverForeignElementAnchor {
	constructor(readonly part: RenderedInlayHintLabelPart, owner: InlayHintsHover) {
		super(10, owner, part.item.anchor.range);
	}
}

export class InlayHintsHover extends MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	public override readonly hoverOrdinal: number = 6;

	constructor(
		editor: ICodeEditor,
		@ILanguageService languageService: ILanguageService,
		@IOpenerService openerService: IOpenerService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextModelService private readonly _resolverService: ITextModelService
	) {
		super(editor, languageService, openerService, configurationService);
	}

	suggestHoverAnchor(mouseEvent: IEditorMouseEvent): HoverAnchor | null {
		const controller = InlayHintsController.get(this._editor);
		if (!controller) {
			return null;
		}
		if (mouseEvent.target.type !== MouseTargetType.CONTENT_TEXT) {
			return null;
		}
		const options = mouseEvent.target.detail.injectedText?.options;
		if (!(options instanceof ModelDecorationInjectedTextOptions && options.attachedData instanceof RenderedInlayHintLabelPart)) {
			return null;
		}
		return new InlayHintsHoverAnchor(options.attachedData, this);
	}

	override computeSync(): MarkdownHover[] {
		return [];
	}

	override computeAsync(anchor: HoverAnchor, _lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<MarkdownHover> {
		if (!(anchor instanceof InlayHintsHoverAnchor)) {
			return AsyncIterableObject.EMPTY;
		}

		return new AsyncIterableObject<MarkdownHover>(async executor => {

			const { part } = anchor;
			await part.item.resolve(token);

			if (token.isCancellationRequested) {
				return;
			}

			// (1) Inlay Tooltip
			let itemTooltip: IMarkdownString | undefined;
			if (typeof part.item.hint.tooltip === 'string') {
				itemTooltip = new MarkdownString().appendText(part.item.hint.tooltip);
			} else if (part.item.hint.tooltip) {
				itemTooltip = part.item.hint.tooltip;
			}
			if (itemTooltip) {
				executor.emitOne(new MarkdownHover(this, anchor.range, [itemTooltip], 0));
			}

			// (2) Inlay Label Part Tooltip
			let partTooltip: IMarkdownString | undefined;
			if (typeof part.part.tooltip === 'string') {
				partTooltip = new MarkdownString().appendText(part.part.tooltip);
			} else if (part.part.tooltip) {
				partTooltip = part.part.tooltip;
			}
			if (partTooltip) {
				executor.emitOne(new MarkdownHover(this, anchor.range, [partTooltip], 1));
			}

			// (3) Inlay Label Part Location tooltip
			const iterable = await this._resolveInlayHintLabelPartHover(part, token);
			for await (let item of iterable) {
				executor.emitOne(item);
			}
		});
	}

	private async _resolveInlayHintLabelPartHover(part: RenderedInlayHintLabelPart, token: CancellationToken): Promise<AsyncIterableObject<MarkdownHover>> {
		if (!part.part.location) {
			return AsyncIterableObject.EMPTY;
		}
		const { uri, range } = part.part.location;
		const ref = await this._resolverService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;
			if (!HoverProviderRegistry.has(model)) {
				return AsyncIterableObject.EMPTY;
			}
			return getHover(model, new Position(range.startLineNumber, range.startColumn), token)
				.filter(item => !isEmptyMarkdownString(item.hover.contents))
				.map(item => new MarkdownHover(this, part.item.anchor.range, item.hover.contents, 2 + item.ordinal));
		} finally {
			ref.dispose();
		}
	}
}
