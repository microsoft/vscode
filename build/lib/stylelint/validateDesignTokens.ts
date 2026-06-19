/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Design-token validators that need block (selector + declaration) awareness,
// which the line-based variable-name validator cannot provide.

const RE_FONT_SIZE_PX = /font-size\s*:\s*([\d.]+)px/i;
const RE_CODICON_SELECTOR = /codicon/i;

/** The two standard codicon sizes: 16px base, 12px compact. */
const ALLOWED_CODICON_PX = new Set([16, 12]);

export interface IDesignTokenViolation {
	readonly line: number;
	readonly message: string;
}

/** Near-miss band: a codicon at 13/14/15px is always a mistake for 12 or 16. */
function isNearMiss(px: number): boolean {
	return px > 12 && px < 16;
}

/** The two standard codicon sizes, formatted for the suggestion. */
const STANDARD_CODICON_SIZES = 'var(--vscode-codiconFontSize) [16] or var(--vscode-codiconFontSize-compact) [12]';

/** Builds a compact, single-line warning for an off-scale codicon font-size. */
function formatCodiconMessage(px: string, nearMiss: boolean): string {
	const note = nearMiss ? '' : ' (large/small glyph - may be intentional)';
	return `${px}px -> ${STANDARD_CODICON_SIZES}${note}`;
}

/**
 * Replace the body of every `/* ... *\/` comment with spaces while preserving
 * newlines, so brace/semicolon scanning is not confused by comment content and
 * line numbers stay accurate.
 */
function blankComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
}

/**
 * Scans CSS character-by-character, tracking the nesting stack of rule selectors,
 * and invokes `callback` for every declaration (text terminated by `;`) with the
 * 1-based line it ends on and the innermost selector that contains it. This gives
 * block (selector + declaration) awareness that a line-based linter lacks and
 * correctly handles native CSS nesting. Comment bodies are blanked first so their
 * contents cannot disturb the scan.
 */
function forEachDeclaration(text: string, callback: (line: number, selector: string, declaration: string) => void): void {
	const source = blankComments(text);
	const selectorStack: string[] = [];
	let pending = '';
	let line = 1;

	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		if (ch === '\n') {
			line++;
		}
		switch (ch) {
			case '{':
				selectorStack.push(pending.trim());
				pending = '';
				break;
			case '}':
				selectorStack.pop();
				pending = '';
				break;
			case ';':
				callback(line, selectorStack[selectorStack.length - 1] ?? '', pending);
				pending = '';
				break;
			default:
				pending += ch;
		}
	}
}

/**
 * Validates that any `font-size` applied to a codicon resolves to one of the two
 * allowed codicon sizes (16px base, 12px compact). Off-scale values are reported
 * as warnings: the 13-15px near-miss band is always a mistake for 12 or 16, while
 * other off sizes (large hero icons / small chevrons) may be intentional and are
 * worded accordingly. Values expressed via `var(--vscode-codiconFontSize...)` are
 * not matched by the px regex and are therefore always accepted.
 */
export function validateCodiconFontSizes(text: string): IDesignTokenViolation[] {
	const violations: IDesignTokenViolation[] = [];

	forEachDeclaration(text, (line, selector, declaration) => {
		if (!RE_CODICON_SELECTOR.test(selector)) {
			return;
		}
		const match = RE_FONT_SIZE_PX.exec(declaration);
		if (!match) {
			return;
		}
		const px = parseFloat(match[1]);
		if (ALLOWED_CODICON_PX.has(px)) {
			return;
		}
		const nearMiss = isNearMiss(px);
		violations.push({ line, message: formatCodiconMessage(match[1], nearMiss) });
	});

	return violations;
}

// ---------------------------------------------------------------------------
// Font-size ramp token suggestions (sessions design-system area only)
// ---------------------------------------------------------------------------
//
// Unlike codicons (which have a clean 12/16 off-ramp), text font-sizes such as
// 14px and 16px are common and often intentional, so flagging "off-ramp" values
// would be noise. Instead this only suggests adopting a token when a hardcoded px
// value EXACTLY matches a design-ramp token value, where the var is a drop-in
// replacement. Findings are advisory (warning-only), one clickable link per
// occurrence.

/** Exact px value -> suggested token var(s). Ambiguous values list alternatives. */
const FONT_SIZE_RAMP: ReadonlyMap<number, string> = new Map([
	[26, 'var(--vscode-agents-fontSize-heading1)'],
	[18, 'var(--vscode-agents-fontSize-heading2)'],
	[13, 'var(--vscode-bodyFontSize) or var(--vscode-agents-fontSize-heading3) or var(--vscode-agents-fontSize-body1)'],
	[12, 'var(--vscode-bodyFontSize-small) or var(--vscode-agents-fontSize-label1)'],
	[11, 'var(--vscode-bodyFontSize-xSmall) or var(--vscode-agents-fontSize-body2) or var(--vscode-agents-fontSize-label2)'],
	[10, 'var(--vscode-agents-fontSize-label3)'],
]);

/**
 * Finds hardcoded `font-size` px values that exactly match a design-ramp token
 * value and could be replaced by the token var. Codicon selectors are skipped
 * (covered by {@link validateCodiconFontSizes}). Returns one finding per
 * occurrence with the line it appears on, so callers can emit a clickable
 * `file(line,col)` link per match (the terminal linkifies that prefix).
 */
export function validateFontSizeTokens(text: string): IDesignTokenViolation[] {
	const violations: IDesignTokenViolation[] = [];

	forEachDeclaration(text, (line, selector, declaration) => {
		if (RE_CODICON_SELECTOR.test(selector)) {
			return;
		}
		const match = RE_FONT_SIZE_PX.exec(declaration);
		if (!match) {
			return;
		}
		const px = parseFloat(match[1]);
		const suggestion = FONT_SIZE_RAMP.get(px);
		if (suggestion === undefined) {
			return;
		}
		violations.push({
			line,
			message: `${match[1]}px -> ${suggestion}`
		});
	});

	return violations;
}

// ---------------------------------------------------------------------------
// Corner-radius token suggestions (sessions design-system area only)
// ---------------------------------------------------------------------------
//
// The corner-radius ramp has six tokens; off-scale literals snap to the nearest
// (ties round up), so every hardcoded px value can be mapped to a token. Values
// that are not a radius - 0, 50%, inherit, and var()/calc() expressions - are
// left untouched. Pills (radius ~= half the element height) are meant to be
// `circle`, but the linter cannot read element height, so very large values
// (>= 100px) map to circle while everything else snaps among the finite tokens.

const RE_BORDER_RADIUS = /border-radius\s*:\s*([^;{}]+)/i;
/** First px length inside a border-radius value (handles shorthand like `4px 4px 0 0`). */
const RE_FIRST_PX = /(\d+(?:\.\d+)?)px/;

interface ICornerRadiusToken {
	readonly px: number;
	readonly name: string;
}

/** Finite corner-radius tokens, ascending. `circle` (9999) is handled separately. */
const CORNER_RADIUS_TOKENS: readonly ICornerRadiusToken[] = [
	{ px: 2, name: 'xSmall' },
	{ px: 4, name: 'small' },
	{ px: 6, name: 'medium' },
	{ px: 8, name: 'large' },
	{ px: 12, name: 'xLarge' },
];

/** At/above this px a radius reads as fully rounded -> `circle`. */
const CIRCLE_THRESHOLD_PX = 100;

/** Maps a px radius to its token, snapping off-scale values (ties round up). */
function snapCornerRadius(px: number): ICornerRadiusToken {
	if (px >= CIRCLE_THRESHOLD_PX) {
		return { px: 9999, name: 'circle' };
	}
	let best = CORNER_RADIUS_TOKENS[0];
	let bestDistance = Math.abs(best.px - px);
	for (const token of CORNER_RADIUS_TOKENS) {
		const distance = Math.abs(token.px - px);
		// `<=` makes ties prefer the later (larger) token, i.e. round up.
		if (distance <= bestDistance) {
			best = token;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * Finds hardcoded `border-radius` px values and suggests the corner-radius token
 * var. Exact token-value matches are flagged as drop-in replacements; off-scale
 * values are snapped to the nearest token (with the token's px shown so the
 * size change is explicit). `0`, `50%`, `inherit` and var()/calc() expressions
 * are ignored. Returns one finding per occurrence so the terminal can linkify
 * each `file(line,col)` prefix.
 */
export function validateCornerRadiusTokens(text: string): IDesignTokenViolation[] {
	const violations: IDesignTokenViolation[] = [];

	forEachDeclaration(text, (line, _selector, declaration) => {
		const decl = RE_BORDER_RADIUS.exec(declaration);
		if (!decl) {
			return;
		}
		const value = decl[1];
		if (/var\(|calc\(/i.test(value)) {
			return;
		}
		const pxMatch = RE_FIRST_PX.exec(value);
		if (!pxMatch) {
			return;
		}
		const px = parseFloat(pxMatch[1]);
		if (px === 0) {
			return;
		}
		const token = snapCornerRadius(px);
		const exact = token.px === px;
		const note = exact ? '' : ` (off-scale, ${token.px}px)`;
		violations.push({
			line,
			message: `${pxMatch[1]}px -> var(--vscode-cornerRadius-${token.name})${note}`
		});
	});

	return violations;
}

// ---------------------------------------------------------------------------
// Font-weight token suggestions (sessions design-system area only)
// ---------------------------------------------------------------------------
//
// The agents font ramp defines exactly two weights: regular (400) and
// semiBold (600). Any other numeric weight (e.g. 500, 700) is off the ramp and
// snaps to the nearer of the two. The CSS keywords `normal` (400) and `bold`
// (700) are normalised before snapping. `inherit`, `lighter`, `bolder` and
// var()/calc() expressions are left untouched.

const RE_FONT_WEIGHT = /font-weight\s*:\s*([^;{}]+)/i;

interface IFontWeightToken {
	readonly weight: number;
	readonly name: string;
}

/** The only two weights in the agents ramp. */
const FONT_WEIGHT_TOKENS: readonly IFontWeightToken[] = [
	{ weight: 400, name: 'regular' },
	{ weight: 600, name: 'semiBold' },
];

/** Resolves a font-weight value to a number, or undefined if not numeric. */
function parseFontWeight(value: string): number | undefined {
	const trimmed = value.trim().toLowerCase();
	if (trimmed === 'normal') {
		return 400;
	}
	if (trimmed === 'bold') {
		return 700;
	}
	const numeric = /^(\d{3})$/.exec(trimmed);
	return numeric ? parseInt(numeric[1], 10) : undefined;
}

/** Maps a numeric weight to its token, snapping off-ramp values to the nearer. */
function snapFontWeight(weight: number): IFontWeightToken {
	let best = FONT_WEIGHT_TOKENS[0];
	let bestDistance = Math.abs(best.weight - weight);
	for (const token of FONT_WEIGHT_TOKENS) {
		const distance = Math.abs(token.weight - weight);
		// `<=` makes the 500 tie prefer the heavier (600) token.
		if (distance <= bestDistance) {
			best = token;
			bestDistance = distance;
		}
	}
	return best;
}

/**
 * Finds hardcoded `font-weight` values and suggests the agents weight-ramp var.
 * Exact ramp values (400 / 600, plus `normal` = 400) are flagged as drop-in
 * replacements; off-ramp values (e.g. 500, 700, `bold`) snap to the nearer
 * token and call out that the value is off the two-weight ramp. `inherit`,
 * `lighter`, `bolder` and var()/calc() expressions are ignored. Returns one
 * finding per occurrence so the terminal can linkify each `file(line,col)`.
 */
export function validateFontWeightTokens(text: string): IDesignTokenViolation[] {
	const violations: IDesignTokenViolation[] = [];

	forEachDeclaration(text, (line, _selector, declaration) => {
		const decl = RE_FONT_WEIGHT.exec(declaration);
		if (!decl) {
			return;
		}
		const value = decl[1];
		if (/var\(|calc\(/i.test(value)) {
			return;
		}
		const weight = parseFontWeight(value);
		if (weight === undefined) {
			return;
		}
		const token = snapFontWeight(weight);
		const exact = token.weight === weight;
		const shown = value.trim();
		const note = exact ? '' : ' (off-ramp, 400/600 only)';
		violations.push({
			line,
			message: `${shown} -> var(--vscode-agents-fontWeight-${token.name})${note}`
		});
	});

	return violations;
}

// ---------------------------------------------------------------------------
// Spacing scale adherence (sessions design-system area only)
// ---------------------------------------------------------------------------
//
// `padding`, `margin` and `gap` use a fixed scale. Adopting the `var()` token is
// NOT required - a raw px value is fine as long as it lands ON the scale. What
// breaks visual rhythm is an OFF-scale value (3/5/7/14px etc.), so this only
// flags lengths that are neither `0` nor an exact ramp value, and suggests the
// nearest ramp px. Values are often shorthands (`padding: 5px 8px`); each length
// is checked independently. `0`/`0px`, `auto`, `%`, `em`/`rem`, and any
// var()/calc() expression are left untouched.

const RE_SPACING_PROP = /(?:^|[\s;])(padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left))?\s*:\s*([^;{}]+)/i;

/** Spacing scale in px, ascending. */
const SPACING_SCALE: readonly number[] = [2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40];

/** Snaps an off-scale spacing px to the nearest ramp value (ties round up). */
function snapSpacing(px: number): number {
	let best = SPACING_SCALE[0];
	let bestDistance = Math.abs(best - px);
	for (const value of SPACING_SCALE) {
		const distance = Math.abs(value - px);
		if (distance <= bestDistance) {
			best = value;
			bestDistance = distance;
		}
	}
	return best;
}

/** Maps an on-scale spacing px to its CSS variable (0 -> sizeNone). */
function spacingVar(px: number): string {
	return px === 0 ? 'var(--vscode-spacing-sizeNone)' : `var(--vscode-spacing-size${px * 10})`;
}

/**
 * Finds `padding`/`margin`/`gap` lengths that are off the spacing scale and
 * suggests the nearest on-scale px value. On-scale literals are accepted as-is
 * (token adoption is optional). `0`, `auto`, `%`, `em`/`rem`, var()/calc() are
 * ignored. Returns one finding per declaration that contains an off-scale value.
 */
export function validateSpacingTokens(text: string): IDesignTokenViolation[] {
	const violations: IDesignTokenViolation[] = [];
	const scale = new Set(SPACING_SCALE);

	forEachDeclaration(text, (line, _selector, declaration) => {
		const decl = RE_SPACING_PROP.exec(declaration);
		if (!decl) {
			return;
		}
		const value = decl[2].trim();
		if (/var\(|calc\(|auto|%|\b\d+(?:\.\d+)?(?:r?em|vh|vw|ch|fr)\b/i.test(value)) {
			return;
		}
		const parts = value.split(/\s+/);
		const snapped: string[] = [];
		const vars: string[] = [];
		let hasOffScale = false;
		let ok = true;
		for (const part of parts) {
			if (part === '0' || part === '0px') {
				snapped.push(part);
				vars.push(spacingVar(0));
				continue;
			}
			const pxMatch = /^(\d+(?:\.\d+)?)px$/i.exec(part);
			if (!pxMatch) {
				ok = false;
				break;
			}
			const px = parseFloat(pxMatch[1]);
			if (scale.has(px)) {
				snapped.push(part);
				vars.push(spacingVar(px));
				continue;
			}
			hasOffScale = true;
			const nearest = snapSpacing(px);
			snapped.push(`${nearest}px`);
			vars.push(spacingVar(nearest));
		}
		if (!ok || !hasOffScale) {
			return;
		}
		violations.push({
			line,
			message: `${value} is off the spacing scale -> nearest: ${snapped.join(' ')} (${vars.join(' ')})`
		});
	});

	return violations;
}

// ---------------------------------------------------------------------------
// Stroke (border / outline width) token suggestions (sessions area only)
// ---------------------------------------------------------------------------
//
// The design system has a single stroke thickness: 1px. Any border/outline
// width of exactly 1px should use `var(--vscode-strokeThickness)`. The width is
// the first px length in the value (handles the `border: 1px solid <color>`
// shorthand as well as `border-width: 1px`). Other widths have no token and are
// left alone. `border-radius` is intentionally not matched. Declarations whose
// width already uses a var()/calc() expression are skipped.

const RE_STROKE_PROP = /(?:^|[\s;])(border(?:-(?:top|right|bottom|left))?(?:-width)?|outline(?:-width)?)\s*:\s*([^;{}]+)/i;

/**
 * Finds `border`/`outline` declarations whose width is exactly `1px` and
 * suggests `var(--vscode-strokeThickness)`. Returns one finding per occurrence.
 */
export function validateStrokeTokens(text: string): IDesignTokenViolation[] {
	const violations: IDesignTokenViolation[] = [];

	forEachDeclaration(text, (line, _selector, declaration) => {
		const decl = RE_STROKE_PROP.exec(declaration);
		if (!decl) {
			return;
		}
		const value = decl[2];
		// Skip when the width is already tokenised or computed.
		if (/var\(|calc\(/i.test(value)) {
			return;
		}
		const pxMatch = RE_FIRST_PX.exec(value);
		if (!pxMatch || parseFloat(pxMatch[1]) !== 1) {
			return;
		}
		violations.push({
			line,
			message: `${decl[1].trim()}: ${value.trim()} -> use var(--vscode-strokeThickness) for the 1px width`
		});
	});

	return violations;
}
