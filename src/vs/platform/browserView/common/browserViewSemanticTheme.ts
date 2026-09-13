/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A fixed, bounded set of GitHub-compatible semantic color tokens, mapped from
 * the active VS Code color theme (light, dark, high-contrast light, or
 * high-contrast dark). Field names mirror the public semantic token names
 * published by GitHub's `@primer/primitives` design system (e.g. `fgDefault`
 * corresponds to `--fgColor-default`), so a native custom-app page written
 * against those tokens renders consistently with the host's current theme.
 *
 * This is intentionally a small, explicitly named surface — not an arbitrary
 * key/value bag — so the set of CSS custom properties a confined page can
 * observe is fixed at compile time and cannot be widened by data flowing
 * through the theme pipeline.
 */
export interface IBrowserViewSemanticTheme {
	readonly fgDefault?: string;
	readonly fgMuted?: string;
	readonly fgOnEmphasis?: string;
	readonly fgDisabled?: string;
	readonly fgLink?: string;
	readonly fgAccent?: string;
	readonly fgDanger?: string;
	readonly fgSuccess?: string;
	readonly fgAttention?: string;
	readonly fgDone?: string;
	readonly fgSevere?: string;
	readonly fgNeutral?: string;
	readonly fgSponsors?: string;

	readonly bgDefault?: string;
	readonly bgMuted?: string;
	readonly bgInset?: string;
	readonly bgDisabled?: string;
	readonly bgAccentEmphasis?: string;
	readonly bgAccentMuted?: string;
	readonly bgDangerEmphasis?: string;
	readonly bgDangerMuted?: string;
	readonly bgSuccessEmphasis?: string;
	readonly bgSuccessMuted?: string;
	readonly bgAttentionEmphasis?: string;
	readonly bgAttentionMuted?: string;

	readonly borderDefault?: string;
	readonly borderMuted?: string;
	readonly borderDisabled?: string;
	readonly borderAccentEmphasis?: string;
	readonly borderDangerEmphasis?: string;
	readonly borderSuccessEmphasis?: string;
	readonly borderAttentionEmphasis?: string;

	readonly focusOutlineColor?: string;
}

/**
 * Fixed mapping from {@link IBrowserViewSemanticTheme} field to the CSS custom
 * property name a confined native custom-app page may read (matching
 * GitHub's `@primer/primitives` functional theme naming). This is the only
 * set of CSS custom properties {@link serializeBrowserViewSemanticThemeCss}
 * will ever emit.
 */
export const browserViewSemanticThemeCssProperties: { readonly [K in keyof IBrowserViewSemanticTheme]-?: string } = {
	fgDefault: '--fgColor-default',
	fgMuted: '--fgColor-muted',
	fgOnEmphasis: '--fgColor-onEmphasis',
	fgDisabled: '--fgColor-disabled',
	fgLink: '--fgColor-link',
	fgAccent: '--fgColor-accent',
	fgDanger: '--fgColor-danger',
	fgSuccess: '--fgColor-success',
	fgAttention: '--fgColor-attention',
	fgDone: '--fgColor-done',
	fgSevere: '--fgColor-severe',
	fgNeutral: '--fgColor-neutral',
	fgSponsors: '--fgColor-sponsors',

	bgDefault: '--bgColor-default',
	bgMuted: '--bgColor-muted',
	bgInset: '--bgColor-inset',
	bgDisabled: '--bgColor-disabled',
	bgAccentEmphasis: '--bgColor-accent-emphasis',
	bgAccentMuted: '--bgColor-accent-muted',
	bgDangerEmphasis: '--bgColor-danger-emphasis',
	bgDangerMuted: '--bgColor-danger-muted',
	bgSuccessEmphasis: '--bgColor-success-emphasis',
	bgSuccessMuted: '--bgColor-success-muted',
	bgAttentionEmphasis: '--bgColor-attention-emphasis',
	bgAttentionMuted: '--bgColor-attention-muted',

	borderDefault: '--borderColor-default',
	borderMuted: '--borderColor-muted',
	borderDisabled: '--borderColor-disabled',
	borderAccentEmphasis: '--borderColor-accent-emphasis',
	borderDangerEmphasis: '--borderColor-danger-emphasis',
	borderSuccessEmphasis: '--borderColor-success-emphasis',
	borderAttentionEmphasis: '--borderColor-attention-emphasis',

	focusOutlineColor: '--focus-outline-color',
};

/**
 * Conservative validator for the color values this module will interpolate
 * into a CSS string. Values normally come from VS Code's {@link Color}
 * class (`Color.toString()`, e.g. `rgba(1, 2, 3, 0.5)` or `#rrggbb[aa]`), but
 * this is re-checked here (rather than trusted) so a malformed or unexpected
 * value can never break out of its declaration and inject arbitrary CSS.
 */
const cssColorValuePattern = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+%?\s*)?\)|transparent)$/;

/**
 * Serializes a {@link IBrowserViewSemanticTheme} into a `:root { ... }` CSS
 * rule that sets exactly the fixed set of custom properties named in
 * {@link browserViewSemanticThemeCssProperties}, and nothing else. Values
 * that don't look like a plain color are silently dropped rather than
 * interpolated, so this can never be used to smuggle arbitrary CSS or
 * selectors into the page.
 */
export function serializeBrowserViewSemanticThemeCss(theme: IBrowserViewSemanticTheme | undefined): string {
	if (!theme) {
		return '';
	}
	const declarations: string[] = [];
	for (const key of Object.keys(browserViewSemanticThemeCssProperties) as (keyof IBrowserViewSemanticTheme)[]) {
		const value = theme[key];
		if (typeof value === 'string' && cssColorValuePattern.test(value)) {
			declarations.push(`${browserViewSemanticThemeCssProperties[key]}: ${value};`);
		}
	}
	if (declarations.length === 0) {
		return '';
	}
	return `:root {\n\t${declarations.join('\n\t')}\n}`;
}
