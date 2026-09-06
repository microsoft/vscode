/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// -- CDP matched-styles types (subset used by formatAuthorStyles) --

export interface ICSSStyle {
	cssText?: string;
	cssProperties: Array<{ name: string; value: string; disabled?: boolean }>;
}

interface ISelectorList {
	selectors: Array<{ text: string }>;
}

interface ICSSRule {
	selectorList: ISelectorList;
	origin: string;
	style: ICSSStyle;
}

interface IRuleMatch {
	rule: ICSSRule;
}

interface IInheritedStyleEntry {
	inlineStyle?: ICSSStyle;
	matchedCSSRules: IRuleMatch[];
}

interface IPseudoElementMatches {
	pseudoType: string;
	matches: IRuleMatch[];
}

export interface IMatchedStyles {
	inlineStyle?: ICSSStyle;
	matchedCSSRules?: IRuleMatch[];
	inherited?: IInheritedStyleEntry[];
	pseudoElements?: IPseudoElementMatches[];
}

export interface IFormattedStyles {
	/** Compact CSS text for the agent prompt (rules only, without resolved values). */
	rulesText: string;
	/** Set of CSS variable names referenced by the element's rules. */
	referencedVars: Set<string>;
	/** Set of CSS property names that were explicitly set by author rules. */
	authorPropertyNames: Set<string>;
	/** Set of CSS property names that were set by user-agent rules. */
	userAgentPropertyNames: Set<string>;
}

// -- Constants --

/**
 * CSS properties that are inherited by child elements.
 */
const inheritableCSSProperties = new Set([
	'color', 'cursor', 'direction', 'font', 'font-family', 'font-feature-settings',
	'font-kerning', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style',
	'font-variant', 'font-weight', 'letter-spacing', 'line-height', 'list-style',
	'list-style-image', 'list-style-position', 'list-style-type', 'orphans',
	'overflow-wrap', 'quotes', 'tab-size', 'text-align', 'text-align-last',
	'text-indent', 'text-transform', 'visibility', 'white-space', 'widows',
	'word-break', 'word-spacing', 'writing-mode',
]);

const varReferenceRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/g;

/**
 * Key computed properties included for hover display in the UI.
 */
export const keyComputedProperties = new Set([
	'display', 'position', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
	'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
	'font-size', 'font-family', 'color', 'background-color',
]);

/**
 * Properties always included in resolved values even if only set by user-agent rules,
 * matching Chrome DevTools' `alwaysShownComputedProperties`.
 */
const alwaysResolvedProperties = new Set(['display', 'height', 'width']);

// -- Helper functions --

/**
 * Collects var(--name) references from a CSS value string.
 */
function collectVarReferences(value: string, into: Set<string>): void {
	for (const m of value.matchAll(varReferenceRegex)) {
		into.add(m[1]);
	}
}

/**
 * Collects longhand property names from the `cssProperties` array of a matched rule.
 * Skips variable definitions and disabled properties.
 */
function collectPropertyNames(cssProperties: Array<{ name: string; value: string; disabled?: boolean }>, into: Set<string>, inheritableOnly?: boolean): void {
	for (const prop of cssProperties) {
		if (!prop.name || !prop.value || prop.disabled || prop.name.startsWith('--')) {
			continue;
		}
		if (inheritableOnly && !inheritableCSSProperties.has(prop.name)) {
			continue;
		}
		into.add(prop.name);
	}
}

/**
 * Filters CSS declarations to only inheritable properties (not variable definitions).
 */
export function filterInheritableDeclarations(cssText: string): string | undefined {
	const declarations = cssText.split(';').map(d => d.trim()).filter(Boolean);
	const filtered = declarations.filter(decl => {
		const colonIdx = decl.indexOf(':');
		if (colonIdx === -1) {
			return false;
		}
		const propName = decl.substring(0, colonIdx).trim();
		return inheritableCSSProperties.has(propName);
	});
	return filtered.length > 0 ? filtered.join('; ') : undefined;
}

/**
 * Formats matched styles into a compact representation for agent prompts.
 *
 * Only includes author-origin rules (not browser defaults), uses the raw
 * `cssText` instead of expanded longhand properties, and for inherited
 * rules only keeps inheritable CSS properties.
 *
 * Also includes pseudo-element styles (::before, ::after, etc.) when present.
 *
 * Uses `cssProperties` (the longhand array) from matched rules to determine
 * which computed properties are author-affected, matching Chrome DevTools'
 * `computePropertyTraces` approach.
 */
export function formatMatchedStyles(matched: IMatchedStyles): IFormattedStyles {
	const referencedVars = new Set<string>();
	const authorPropertyNames = new Set<string>();
	const userAgentPropertyNames = new Set<string>();
	const seenCssTexts = new Set<string>();
	const lines: string[] = [];

	// Inline styles on the element itself
	if (matched.inlineStyle?.cssText?.trim()) {
		const cssText = matched.inlineStyle.cssText.trim();
		collectVarReferences(cssText, referencedVars);
		collectPropertyNames(matched.inlineStyle.cssProperties, authorPropertyNames);
		lines.push(`element { ${cssText} }`);
	}

	// Direct author rules: use cssText for display, cssProperties for property tracking
	for (const ruleEntry of matched.matchedCSSRules ?? []) {
		if (ruleEntry.rule.origin === 'user-agent') {
			collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames);
			continue;
		}
		const cssText = ruleEntry.rule.style.cssText?.trim();
		if (!cssText || seenCssTexts.has(cssText)) {
			continue;
		}
		seenCssTexts.add(cssText);
		collectVarReferences(cssText, referencedVars);
		collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames);
		const selectors = ruleEntry.rule.selectorList.selectors.map(s => s.text).join(', ');
		lines.push(`${selectors} { ${cssText} }`);
	}

	// Pseudo-element styles (::before, ::after, etc.)
	if (matched.pseudoElements?.length) {
		const pseudoLines: string[] = [];
		for (const pseudo of matched.pseudoElements) {
			for (const ruleEntry of pseudo.matches ?? []) {
				if (ruleEntry.rule.origin === 'user-agent') {
					collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames);
					continue;
				}
				const cssText = ruleEntry.rule.style.cssText?.trim();
				if (!cssText || seenCssTexts.has(cssText)) {
					continue;
				}
				seenCssTexts.add(cssText);
				collectVarReferences(cssText, referencedVars);
				collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames);
				const selectors = ruleEntry.rule.selectorList.selectors.map(s => s.text).join(', ');
				pseudoLines.push(`${selectors} { ${cssText} }`);
			}
		}
		if (pseudoLines.length > 0) {
			lines.push('');
			lines.push('/* Pseudo-elements */');
			lines.push(...pseudoLines);
		}
	}

	// Inherited author rules — only inheritable properties
	const inheritedLines: string[] = [];
	for (const entry of matched.inherited ?? []) {
		for (const ruleEntry of entry.matchedCSSRules ?? []) {
			if (ruleEntry.rule.origin === 'user-agent') {
				collectPropertyNames(ruleEntry.rule.style.cssProperties, userAgentPropertyNames, true);
				continue;
			}
			const cssText = ruleEntry.rule.style.cssText?.trim();
			if (!cssText) {
				continue;
			}
			// Display: keep only inheritable properties from cssText
			const filtered = filterInheritableDeclarations(cssText);
			if (!filtered || seenCssTexts.has(filtered)) {
				continue;
			}
			seenCssTexts.add(filtered);
			// Track: use cssProperties longhands, inheritable only
			collectVarReferences(filtered, referencedVars);
			collectPropertyNames(ruleEntry.rule.style.cssProperties, authorPropertyNames, true);
			const selectors = ruleEntry.rule.selectorList.selectors.map(s => s.text).join(', ');
			inheritedLines.push(`${selectors} { ${filtered} }`);
		}
	}

	if (inheritedLines.length > 0) {
		lines.push('');
		lines.push('/* Inherited */');
		lines.push(...inheritedLines);
	}

	// Always include DevTools' alwaysShownComputedProperties
	for (const prop of alwaysResolvedProperties) {
		authorPropertyNames.add(prop);
	}

	return { rulesText: lines.join('\n'), referencedVars, authorPropertyNames, userAgentPropertyNames };
}

/**
 * -- Shorthand collapsing configuration ----------------------------------
 *
 * Each constant below describes one kind of CSS shorthand that can be
 * reconstituted from computed longhand values.  The `collapseToShorthands`
 * function walks these lists in declaration order and produces compact
 * output for the agent prompt.
 *
 * Sources:
 *  • MDN "Formal definition → Initial value" tables
 *  • CSS Backgrounds & Borders 3, CSS Transitions 1, CSS Animations 1,
 *    CSS Text Decoration 4, CSS Text 4
 */

// -- Box model (T R B L) shorthands --
// Collapsed with 1-4-value syntax per CSS spec section 8.3.

interface IBoxShorthand {
	shorthand: string;
	sides: [string, string, string, string]; // top/TL, right/TR, bottom/BR, left/BL
}

const boxShorthands: IBoxShorthand[] = [
	// margin: <margin-top> <margin-right> <margin-bottom> <margin-left>
	{ shorthand: 'margin', sides: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'] },
	// padding: <padding-top> <padding-right> <padding-bottom> <padding-left>
	{ shorthand: 'padding', sides: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'] },
	// border-radius: <TL> <TR> <BR> <BL>   (clockwise from top-left)
	{ shorthand: 'border-radius', sides: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'] },
];

// -- Border per-side groups (collapse to border: W S C when uniform) --

const borderSideGroups: IBoxShorthand[] = [
	// border-width: initial medium per MDN (but computed is always an absolute length)
	{ shorthand: 'border-width', sides: ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'] },
	// border-style: initial none per MDN
	{ shorthand: 'border-style', sides: ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'] },
	// border-color: initial currentcolor per MDN
	{ shorthand: 'border-color', sides: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'] },
];

// -- Longhands that are dropped entirely when all at their initial values --

interface IDefaultsGroup {
	/** Longhands to check and remove. */
	longhands: Record<string, string>;
}

const dropWhenAllDefault: IDefaultsGroup[] = [
	// border-image  (CSS Backgrounds & Borders 3 section 6.8)
	{
		longhands: {
			'border-image-source': 'none',
			'border-image-slice': '100%',
			'border-image-width': '1',
			'border-image-outset': '0',
			'border-image-repeat': 'stretch',
		},
	},
	// animation-range  (CSS Scroll-driven Animations section 5.2)  initial: normal
	{
		longhands: {
			'animation-range-start': 'normal',
			'animation-range-end': 'normal',
		},
	},
];

// -- Background collapse (color-only shorthand when images/position/etc. default) --

interface IBackgroundCollapseGroup {
	/** background-color longhand  */
	colorLonghand: string;
	/** Other background longhands that must all be at their initial value. */
	otherLonghands: Record<string, string>;
}

const backgroundCollapse: IBackgroundCollapseGroup = {
	colorLonghand: 'background-color',
	otherLonghands: {
		// MDN background formal definition initial values:
		'background-image': 'none',            // initial: none
		'background-position-x': '0px',        // initial: 0% (computed as 0px)
		'background-position-y': '0px',        // initial: 0%
		'background-size': 'auto',             // initial: auto auto
		'background-repeat': 'repeat',         // initial: repeat
		'background-attachment': 'scroll',     // initial: scroll
		'background-origin': 'padding-box',    // initial: padding-box
		'background-clip': 'border-box',       // initial: border-box
	},
};

// -- Simple shorthand collapse (longhands → single shorthand, omit defaults) --

interface ISimpleShorthand {
	shorthand: string;
	longhands: Array<{ name: string; initial: string }>;
}

const simpleShorthands: ISimpleShorthand[] = [
	// text-decoration (CSS Text Decoration 4 section 3)
	// Constituents: text-decoration-line || text-decoration-style || text-decoration-color || text-decoration-thickness
	{
		shorthand: 'text-decoration',
		longhands: [
			{ name: 'text-decoration-line', initial: 'none' },
			{ name: 'text-decoration-style', initial: 'solid' },
			{ name: 'text-decoration-color', initial: 'currentcolor' },
			{ name: 'text-decoration-thickness', initial: 'auto' },
		],
	},
];

// -- white-space (CSS Text 4 section 3) --
// Shorthand for white-space-collapse || text-wrap-mode.
// Named keyword mappings for the well-known combinations:

const whiteSpaceKeywords: Array<{ collapse: string; wrap: string; keyword: string }> = [
	{ collapse: 'collapse', wrap: 'wrap', keyword: 'normal' },
	{ collapse: 'collapse', wrap: 'nowrap', keyword: 'nowrap' },
	{ collapse: 'preserve', wrap: 'nowrap', keyword: 'pre' },
	{ collapse: 'preserve', wrap: 'wrap', keyword: 'pre-wrap' },
	{ collapse: 'preserve-breaks', wrap: 'wrap', keyword: 'pre-line' },
	{ collapse: 'break-spaces', wrap: 'wrap', keyword: 'break-spaces' },
];

// -- Comma-separated list shorthands (transition, animation) --

interface IListShorthand {
	shorthand: string;
	longhands: Array<{ name: string; initial: string }>;
}

const listShorthands: IListShorthand[] = [
	// transition (CSS Transitions 1 section 2.1)
	// Constituents: transition-property || transition-duration || transition-timing-function || transition-delay || transition-behavior
	{
		shorthand: 'transition',
		longhands: [
			{ name: 'transition-property', initial: 'all' },
			{ name: 'transition-duration', initial: '0s' },
			{ name: 'transition-timing-function', initial: 'ease' },
			{ name: 'transition-delay', initial: '0s' },
			{ name: 'transition-behavior', initial: 'normal' },
		],
	},
	// animation (CSS Animations 1 section 3 + Scroll-driven Animations section 5)
	// Constituents: animation-name || animation-duration || animation-timing-function || animation-delay
	//             || animation-iteration-count || animation-direction || animation-fill-mode
	//             || animation-play-state || animation-timeline
	{
		shorthand: 'animation',
		longhands: [
			{ name: 'animation-name', initial: 'none' },
			{ name: 'animation-duration', initial: '0s' },
			{ name: 'animation-timing-function', initial: 'ease' },
			{ name: 'animation-delay', initial: '0s' },
			{ name: 'animation-iteration-count', initial: '1' },
			{ name: 'animation-direction', initial: 'normal' },
			{ name: 'animation-fill-mode', initial: 'none' },
			{ name: 'animation-play-state', initial: 'running' },
			{ name: 'animation-timeline', initial: 'auto' },
		],
	},
];

// -- Helper functions --

/**
 * Tries to collapse a box shorthand (4 sides → 1-4 value shorthand).
 * Returns the collapsed value or undefined if not all sides are present.
 */
function collapseBoxValues(entries: Map<string, string>, sides: [string, string, string, string]): string | undefined {
	const [topKey, rightKey, bottomKey, leftKey] = sides;
	const top = entries.get(topKey);
	const right = entries.get(rightKey);
	const bottom = entries.get(bottomKey);
	const left = entries.get(leftKey);

	if (top === undefined || right === undefined || bottom === undefined || left === undefined) {
		return undefined;
	}

	entries.delete(topKey);
	entries.delete(rightKey);
	entries.delete(bottomKey);
	entries.delete(leftKey);

	if (top === right && right === bottom && bottom === left) {
		return top;
	}
	if (top === bottom && right === left) {
		return `${top} ${right}`;
	}
	if (right === left) {
		return `${top} ${right} ${bottom}`;
	}
	return `${top} ${right} ${bottom} ${left}`;
}

/**
 * Splits a CSS value by top-level commas, respecting parenthesized groups
 * like `cubic-bezier(0.16, 1, 0.3, 1)`.
 */
function splitCSSList(value: string): string[] {
	const items: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < value.length; i++) {
		const ch = value[i];
		if (ch === '(') {
			depth++;
		} else if (ch === ')') {
			depth--;
		} else if (ch === ',' && depth === 0) {
			items.push(value.substring(start, i).trim());
			start = i + 1;
		}
	}
	items.push(value.substring(start).trim());
	return items;
}

/**
 * Collapses comma-separated list longhands into a single shorthand declaration.
 */
function collapseListShorthand(
	entries: Map<string, string>,
	output: string[],
	shorthand: string,
	longhands: Array<{ name: string; initial: string }>,
): void {
	const values = longhands.map(({ name }) => entries.get(name));
	if (!values.every(v => v !== undefined)) {
		return;
	}

	const lists = values.map(v => splitCSSList(v as string));
	const itemCount = lists[0].length;
	if (!lists.every(l => l.length === itemCount)) {
		return;
	}

	for (const { name } of longhands) {
		entries.delete(name);
	}

	const items: string[] = [];
	for (let i = 0; i < itemCount; i++) {
		const parts: string[] = [];
		for (let j = 0; j < longhands.length; j++) {
			const val = lists[j][i];
			if (val !== longhands[j].initial) {
				parts.push(val);
			}
		}
		items.push(parts.length > 0 ? parts.join(' ') : longhands[0].initial);
	}

	output.push(`${shorthand}: ${items.join(', ')};`);
}

// -- Main entry point --

/**
 * Collapses resolved computed properties into shorthands where possible,
 * then returns sorted CSS declaration lines.  Driven entirely by the
 * constant shorthand configuration tables above.
 */
export function collapseToShorthands(entries: Map<string, string>): string[] {
	const shorthandLines: string[] = [];

	// 1. Box shorthands (margin, padding, border-radius)
	for (const { shorthand, sides } of boxShorthands) {
		const collapsed = collapseBoxValues(entries, sides);
		if (collapsed !== undefined) {
			shorthandLines.push(`${shorthand}: ${collapsed};`);
		}
	}

	// 2. Border: try full `border: W S C` when all four sides are uniform,
	//    otherwise collapse each group (border-width, border-style, border-color).
	const borderVals = borderSideGroups.map(g => g.sides.map(s => entries.get(s)));
	const hasAllBorderProps = borderVals.every(group => group.every(v => v !== undefined));
	if (hasAllBorderProps) {
		const allUniform = borderVals.every(group => group.every(v => v === group[0]));
		if (allUniform) {
			for (const group of borderSideGroups) {
				for (const side of group.sides) {
					entries.delete(side);
				}
			}
			shorthandLines.push(`border: ${borderVals[0][0]} ${borderVals[1][0]} ${borderVals[2][0]};`);
		} else {
			for (const group of borderSideGroups) {
				const collapsed = collapseBoxValues(entries, group.sides);
				if (collapsed !== undefined) {
					shorthandLines.push(`${group.shorthand}: ${collapsed};`);
				}
			}
		}
	}

	// 3. Drop-when-all-default groups (border-image, etc.)
	for (const { longhands } of dropWhenAllDefault) {
		const allDefault = Object.entries(longhands).every(([k, v]) => entries.get(k) === v);
		if (allDefault && Object.keys(longhands).some(k => entries.has(k))) {
			for (const key of Object.keys(longhands)) {
				entries.delete(key);
			}
		}
	}

	// 4. Background collapse (→ `background: <color>` when other props at default)
	{
		const { colorLonghand, otherLonghands } = backgroundCollapse;
		const bgColor = entries.get(colorLonghand);
		const allOthersDefault = Object.entries(otherLonghands).every(([k, v]) => entries.get(k) === v);
		if (allOthersDefault && bgColor !== undefined) {
			entries.delete(colorLonghand);
			for (const key of Object.keys(otherLonghands)) {
				entries.delete(key);
			}
			shorthandLines.push(`background: ${bgColor};`);
		}
	}

	// 5. Simple shorthands (text-decoration, etc.) — combine longhands, omit defaults
	for (const { shorthand, longhands } of simpleShorthands) {
		const first = entries.get(longhands[0].name);
		if (first === undefined) {
			continue;
		}
		// Snapshot values before deleting
		const values = longhands.map(({ name }) => entries.get(name));
		for (const { name } of longhands) {
			entries.delete(name);
		}
		// Build shorthand value, omitting longhands at their initial value
		const parts: string[] = [];
		for (let i = 0; i < longhands.length; i++) {
			const val = values[i] ?? longhands[i].initial;
			if (val !== longhands[i].initial) {
				parts.push(val);
			}
		}
		shorthandLines.push(`${shorthand}: ${parts.length > 0 ? parts.join(' ') : longhands[0].initial};`);
	}

	// 6. white-space (CSS Text 4) — map longhand pair to named keyword
	{
		const wsCollapse = entries.get('white-space-collapse');
		const textWrap = entries.get('text-wrap-mode');
		if (wsCollapse !== undefined && textWrap !== undefined) {
			entries.delete('white-space-collapse');
			entries.delete('text-wrap-mode');
			const match = whiteSpaceKeywords.find(k => k.collapse === wsCollapse && k.wrap === textWrap);
			shorthandLines.push(`white-space: ${match ? match.keyword : `${wsCollapse} ${textWrap}`};`);
		}
	}

	// 7. Comma-separated list shorthands (transition, animation)
	for (const { shorthand, longhands } of listShorthands) {
		collapseListShorthand(entries, shorthandLines, shorthand, longhands);
	}

	// 8. Remaining properties as individual lines, sorted
	const remainingLines: string[] = [];
	for (const [name, value] of Array.from(entries.entries()).sort(([a], [b]) => a.localeCompare(b))) {
		remainingLines.push(`${name}: ${value};`);
	}

	return [...shorthandLines, ...remainingLines];
}
