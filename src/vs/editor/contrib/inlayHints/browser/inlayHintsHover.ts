/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { IModelDecoration } from 'vs/editor/common/model';
import { ModelDecorationInjectedTextOptions } from 'vs/editor/common/model/textModel';
import { HoverAnchor, HoverForeignElementAnchor, IEditorHoverParticipant } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { getHoverProviderResultsAsAsyncIterable } from 'vs/editor/contrib/hover/browser/getHover';
import { MarkdownHover, MarkdownHoverParticipant } from 'vs/editor/contrib/hover/browser/markdownHoverParticipant';
import { RenderedInlayHintLabelPart, InlayHintsController } from 'vs/editor/contrib/inlayHints/browser/inlayHintsController';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { localize } from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { asCommandLink } from 'vs/editor/contrib/inlayHints/browser/inlayHints';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { ICommandService } from 'vs/platform/commands/common/commands';

class InlayHintsHoverAnchor extends HoverForeignElementAnchor {
	constructor(
		readonly part: RenderedInlayHintLabelPart,
		owner: InlayHintsHover,
		initialMousePosX: number | undefined,
		initialMousePosY: number | undefined
	) {
		super(10, owner, part.item.anchor.range, initialMousePosX, initialMousePosY, true);
	}
}

export class InlayHintsHover extends MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	public override readonly hoverOrdinal: number = 6;

	constructor(
		editor: ICodeEditor,
		@ILanguageService languageService: ILanguageService,
		@IOpenerService openerService: IOpenerService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITextModelService private readonly _resolverService: ITextModelService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@ICommandService commandService: ICommandService
	) {
		super(editor, languageService, openerService, configurationService, languageFeaturesService, keybindingService, hoverService, commandService);
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
		return new InlayHintsHoverAnchor(options.attachedData, this, mouseEvent.event.posx, mouseEvent.event.posy);
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
				executor.emitOne(new MarkdownHover(this, anchor.range, [itemTooltip], false, 0));
			}
			// (1.2) Inlay dbl-click gesture
			if (isNonEmptyArray(part.item.hint.textEdits)) {
				executor.emitOne(new MarkdownHover(this, anchor.range, [new MarkdownString().appendText(localize('hint.dbl', "Double-click to insert"))], false, 10001));
			}

			// (2) Inlay Label Part Tooltip
			let partTooltip: IMarkdownString | undefined;
			if (typeof part.part.tooltip === 'string') {
				partTooltip = new MarkdownString().appendText(part.part.tooltip);
			} else if (part.part.tooltip) {
				partTooltip = part.part.tooltip;
			}
			if (partTooltip) {
				executor.emitOne(new MarkdownHover(this, anchor.range, [partTooltip], false, 1));
			}

			// (2.2) Inlay Label Part Help Hover
			if (part.part.location || part.part.command) {
				let linkHint: MarkdownString | undefined;
				const useMetaKey = this._editor.getOption(EditorOption.multiCursorModifier) === 'altKey';
				const kb = useMetaKey
					? platform.isMacintosh
						? localize('links.navigate.kb.meta.mac', "cmd + click")
						: localize('links.navigate.kb.meta', "ctrl + click")
					: platform.isMacintosh
						? localize('links.navigate.kb.alt.mac', "option + click")
						: localize('links.navigate.kb.alt', "alt + click");

				if (part.part.location && part.part.command) {
					linkHint = new MarkdownString().appendText(localize('hint.defAndCommand', 'Go to Definition ({0}), right click for more', kb));
				} else if (part.part.location) {
					linkHint = new MarkdownString().appendText(localize('hint.def', 'Go to Definition ({0})', kb));
				} else if (part.part.command) {
					linkHint = new MarkdownString(`[${localize('hint.cmd', "Execute Command")}](${asCommandLink(part.part.command)} "${part.part.command.title}") (${kb})`, { isTrusted: true });
				}
				if (linkHint) {
					executor.emitOne(new MarkdownHover(this, anchor.range, [linkHint], false, 10000));
				}
			}


			// (3) Inlay Label Part Location tooltip
			const iterable = await this._resolveInlayHintLabelPartHover(part, token);
			for await (const item of iterable) {
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
			if (!this._languageFeaturesService.hoverProvider.has(model)) {
				return AsyncIterableObject.EMPTY;
			}
			return getHoverProviderResultsAsAsyncIterable(this._languageFeaturesService.hoverProvider, model, new Position(range.startLineNumber, range.startColumn), token)
				.filter(item => !isEmptyMarkdownString(item.hover.contents))
				.map(item => new MarkdownHover(this, part.item.anchor.range, item.hover.contents, false, 2 + item.ordinal));
		} finally {
			ref.dispose();
		}
	}
}
