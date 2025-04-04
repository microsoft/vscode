/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../../nls.js';
import { ReactiveDecorationBase } from './reactiveDecorationBase.js';
import { Color, RGBA } from '../../../../../../../../../base/common/color.js';
import { BaseToken } from '../../../../../../../../../editor/common/codecs/baseToken.js';
import { registerColor } from '../../../../../../../../../platform/theme/common/colorUtils.js';
import { contrastBorder } from '../../../../../../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, ICssStyleCollector } from '../../../../../../../../../platform/theme/common/themeService.js';
import { FrontMatterHeader } from '../../../../../../../../../editor/common/codecs/markdownExtensionsCodec/tokens/frontMatterHeader.js';

/**
 * Decoration CSS class names.
 */
export enum FrontMatterCssClassNames {
	/**
	 * TODO: @legomushroom
	 */
	frontMatterHeader = 'prompt-front-matter-header',
	frontMatterHeaderInlineInactive = 'prompt-front-matter-header-inline-inactive',
	frontMatterHeaderInlineActive = 'prompt-front-matter-header-inline-active',
}

/**
 * TODO: @legomushroom
 */
export class FrontMatterHeaderDecoration extends ReactiveDecorationBase<FrontMatterHeader, FrontMatterCssClassNames> {
	protected override get isWholeLine(): boolean {
		return true;
	}

	protected override get description(): string {
		return 'Front Matter header editor decoration.';
	}

	protected override get className(): FrontMatterCssClassNames.frontMatterHeader {
		return FrontMatterCssClassNames.frontMatterHeader;
	}

	protected override get inlineClassName(): FrontMatterCssClassNames.frontMatterHeaderInlineActive | FrontMatterCssClassNames.frontMatterHeaderInlineInactive {
		return (this.active)
			? FrontMatterCssClassNames.frontMatterHeaderInlineActive
			: FrontMatterCssClassNames.frontMatterHeaderInlineInactive;
	}

	/**
	 * Whether current decoration class can decorate provided token.
	 */
	public static handles(
		token: BaseToken,
	): token is FrontMatterHeader {
		return token instanceof FrontMatterHeader;
	}

	/**
	 * Register CSS styles of the decoration.
	 */
	public static registerStyles(
		theme: IColorTheme,
		collector: ICssStyleCollector,
	) {
		/**
		 * TODO: @legomushroom
		 */
		const frontMatterHeaderBackgroundColor = registerColor(
			'chat.prompt.frontMatterBackground',
			{ dark: new Color(new RGBA(0, 0, 0, 0.20)), light: new Color(new RGBA(0, 0, 0, 0.10)), hcDark: contrastBorder, hcLight: contrastBorder, },
			localize('chat.prompt.frontMatterBackground', "background color of a Front Matter header block."),
		);

		const styles = [];
		styles.push(
			`background-color: ${theme.getColor(frontMatterHeaderBackgroundColor)};`,
		);

		const frontMatterHeaderCssSelector = `.monaco-editor .${FrontMatterCssClassNames.frontMatterHeader}`;
		collector.addRule(
			`${frontMatterHeaderCssSelector} { ${styles.join(' ')} }`,
		);

		const inlineInactiveStyles = [];
		inlineInactiveStyles.push('color: var(--vscode-disabledForeground);');

		const inlineActiveStyles = [];
		inlineActiveStyles.push('color: var(--vscode-foreground);');

		const frontMatterHeaderInlineActiveCssSelector = `.monaco-editor .${FrontMatterCssClassNames.frontMatterHeaderInlineActive}`;
		collector.addRule(
			`${frontMatterHeaderInlineActiveCssSelector} { ${inlineActiveStyles.join(' ')} }`,
		);

		const frontMatterHeaderInlineInactiveCssSelector = `.monaco-editor .${FrontMatterCssClassNames.frontMatterHeaderInlineInactive}`;
		collector.addRule(
			`${frontMatterHeaderInlineInactiveCssSelector} { ${inlineInactiveStyles.join(' ')} }`,
		);
	}
}
