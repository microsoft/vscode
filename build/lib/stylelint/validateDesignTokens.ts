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
	/**
	 * `true` when the codicon is sized in the 13-15px near-miss band, which is
	 * always meant to be 12 or 16. Off-ramp sizes outside that band (large
	 * hero/empty-state icons, small <=11px chevrons) set this `false` as they may
	 * be intentional. Used only to tailor the warning wording - all codicon
	 * size findings are reported as warnings and never fail the build.
	 */
	readonly isNearMiss: boolean;
}

/** Near-miss band: a codicon at 13/14/15px is always a mistake for 12 or 16. */
function isNearMiss(px: number): boolean {
	return px > 12 && px < 16;
}

/** The two standard codicon sizes, formatted for the warning detail line. */
const STANDARD_CODICON_SIZES = 'var(--vscode-codiconFontSize) for 16px, var(--vscode-codiconFontSize-compact) for 12px';

/** Builds a readable, multi-line warning for an off-scale codicon font-size. */
function formatCodiconMessage(px: string, nearMiss: boolean): string {
	const headline = nearMiss
		? `Codicon font-size ${px}px is off-scale - codicons are only 12px or 16px.`
		: `Codicon font-size ${px}px is off-scale (large hero or <=11px glyph - may be intentional).`;
	return `${headline}\n           -> use ${STANDARD_CODICON_SIZES}`;
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
		violations.push({ line, isNearMiss: nearMiss, message: formatCodiconMessage(match[1], nearMiss) });
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
	[13, 'var(--vscode-bodyFontSize) or var(--vscode-agents-fontSize-body1)'],
	[12, 'var(--vscode-bodyFontSize-small) or var(--vscode-agents-fontSize-label1)'],
	[11, 'var(--vscode-bodyFontSize-xSmall) or var(--vscode-agents-fontSize-body2)'],
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
			isNearMiss: false,
			message: `font-size ${match[1]}px matches a design ramp token - prefer the var:\n           -> use ${suggestion}`
		});
	});

	return violations;
}
