/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Command, HoverProviderRegistry } from 'vs/editor/common/languages';
import { IModelDecoration } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { HoverAnchor, HoverForeignElementAnchor, IEditorHoverParticipant } from 'vs/editor/contrib/hover/hoverTypes';
import { ILanguageService } from 'vs/editor/common/services/language';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { getHover } from 'vs/editor/contrib/hover/getHover';
import { MarkdownHover, MarkdownHoverParticipant } from 'vs/editor/contrib/hover/markdownHoverParticipant';
import { RenderedInlayHintLabelPart, InlayHintsController } from 'vs/editor/contrib/inlayHints/inlayHintsController';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';

class InlayHintsHoverAnchor extends HoverForeignElementAnchor {
	constructor(readonly part: RenderedInlayHintLabelPart, owner: InlayHintsHover) {
		super(10, owner, part.item.anchor.range);
	}
}

export class InlayHintsHover extends MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

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
			let contents: IMarkdownString | undefined;
			if (typeof part.item.hint.tooltip === 'string') {
				contents = new MarkdownString().appendText(part.item.hint.tooltip);
			} else if (part.item.hint.tooltip) {
				contents = part.item.hint.tooltip;
			}
			if (contents) {
				executor.emitOne(new MarkdownHover(this, anchor.range, [contents], 0));
			}

			// (2) Inlay Label Part Tooltip
			const iterable = await this._resolveInlayHintLabelPartHover(part, token);
			for await (let item of iterable) {
				executor.emitOne(item);
			}
		});
	}

	private async _resolveInlayHintLabelPartHover(part: RenderedInlayHintLabelPart, token: CancellationToken): Promise<AsyncIterableObject<MarkdownHover>> {
		if (typeof part.item.hint.label === 'string') {
			return AsyncIterableObject.EMPTY;
		}

		const candidate = part.part.action;

		if (!candidate || Command.is(candidate)) {
			// LOCATION
			return AsyncIterableObject.EMPTY;
		}
		const { uri, range } = candidate;
		const ref = await this._resolverService.createModelReference(uri);
		try {
			const model = ref.object.textEditorModel;
			if (!HoverProviderRegistry.has(model)) {
				return AsyncIterableObject.EMPTY;
			}
			return getHover(model, new Position(range.startLineNumber, range.startColumn), token)
				.filter(item => !isEmptyMarkdownString(item.hover.contents))
				.map(item => new MarkdownHover(this, part.item.anchor.range, item.hover.contents, item.ordinal));
		} finally {
			ref.dispose();
		}
	}
}
