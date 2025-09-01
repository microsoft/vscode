/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { MarkdownRenderOptions, MarkedOptions } from '../../../../base/browser/markdownRenderer.js';
import { IMarkdownRenderResult } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ErdosAiMarkdownRenderer as ErdosAiMarkdownRendererImpl } from '../../../contrib/erdosAi/browser/markdown/erdosAiMarkdownRenderer.js';
import { IErdosAiMarkdownRenderer } from '../common/erdosAiMarkdownRenderer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class ErdosAiMarkdownRendererService extends Disposable implements IErdosAiMarkdownRenderer {
	readonly _serviceBrand: undefined;
	
	private readonly renderer: ErdosAiMarkdownRendererImpl;

	constructor(
		@ILanguageService languageService: ILanguageService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService hoverService: IHoverService,
		@IFileService fileService: IFileService,
	) {
		super();
		this.renderer = new ErdosAiMarkdownRendererImpl(
			undefined, // options
			languageService,
			openerService,
			hoverService,
		);
	}

	render(markdown: IMarkdownString | undefined, options?: MarkdownRenderOptions, markedOptions?: MarkedOptions): IMarkdownRenderResult {
		return this.renderer.render(markdown, options, markedOptions);
	}
}
