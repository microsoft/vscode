/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collapseToShorthands, formatMatchedStyles, type IMatchedStyles } from '../../common/cssHelpers.js';

/** Helper: build a Map from an object literal and run collapseToShorthands. */
function collapse(props: Record<string, string>): string[] {
	return collapseToShorthands(new Map(Object.entries(props)));
}

suite('collapseToShorthands', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ── Box shorthands ──

	test('margin: all sides equal → 1-value', () => {
		assert.deepStrictEqual(collapse({
			'margin-top': '10px', 'margin-right': '10px', 'margin-bottom': '10px', 'margin-left': '10px',
		}), ['margin: 10px;']);
	});

	test('padding: vertical/horizontal → 2-value', () => {
		assert.deepStrictEqual(collapse({
			'padding-top': '4px', 'padding-right': '12px', 'padding-bottom': '4px', 'padding-left': '12px',
		}), ['padding: 4px 12px;']);
	});

	test('margin: 3-value when left === right', () => {
		assert.deepStrictEqual(collapse({
			'margin-top': '10px', 'margin-right': '5px', 'margin-bottom': '20px', 'margin-left': '5px',
		}), ['margin: 10px 5px 20px;']);
	});

	test('margin: 4-value when all differ', () => {
		assert.deepStrictEqual(collapse({
			'margin-top': '1px', 'margin-right': '2px', 'margin-bottom': '3px', 'margin-left': '4px',
		}), ['margin: 1px 2px 3px 4px;']);
	});

	test('border-radius: uniform', () => {
		assert.deepStrictEqual(collapse({
			'border-top-left-radius': '6px', 'border-top-right-radius': '6px',
			'border-bottom-right-radius': '6px', 'border-bottom-left-radius': '6px',
		}), ['border-radius: 6px;']);
	});

	// ── Border ──

	test('border: uniform sides → single shorthand', () => {
		assert.deepStrictEqual(collapse({
			'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px', 'border-left-width': '1px',
			'border-top-style': 'solid', 'border-right-style': 'solid', 'border-bottom-style': 'solid', 'border-left-style': 'solid',
			'border-top-color': 'red', 'border-right-color': 'red', 'border-bottom-color': 'red', 'border-left-color': 'red',
		}), ['border: 1px solid red;']);
	});

	test('border: non-uniform → per-group shorthands', () => {
		const result = collapse({
			'border-top-width': '1px', 'border-right-width': '2px', 'border-bottom-width': '1px', 'border-left-width': '2px',
			'border-top-style': 'solid', 'border-right-style': 'solid', 'border-bottom-style': 'solid', 'border-left-style': 'solid',
			'border-top-color': 'red', 'border-right-color': 'red', 'border-bottom-color': 'red', 'border-left-color': 'red',
		});
		assert.deepStrictEqual(result, [
			'border-width: 1px 2px;',
			'border-style: solid;',
			'border-color: red;',
		]);
	});

	// ── Drop-when-all-default ──

	test('border-image at defaults → dropped entirely', () => {
		assert.deepStrictEqual(collapse({
			'border-image-source': 'none', 'border-image-slice': '100%',
			'border-image-width': '1', 'border-image-outset': '0', 'border-image-repeat': 'stretch',
			'color': 'red',
		}), ['color: red;']);
	});

	test('animation-range at defaults → dropped', () => {
		assert.deepStrictEqual(collapse({
			'animation-range-start': 'normal', 'animation-range-end': 'normal',
			'display': 'block',
		}), ['display: block;']);
	});

	// ── Background ──

	test('background: color-only when others at default', () => {
		assert.deepStrictEqual(collapse({
			'background-color': 'rgb(255, 0, 0)',
			'background-image': 'none', 'background-position-x': '0px', 'background-position-y': '0px',
			'background-size': 'auto', 'background-repeat': 'repeat', 'background-attachment': 'scroll',
			'background-origin': 'padding-box', 'background-clip': 'border-box',
		}), ['background: rgb(255, 0, 0);']);
	});

	// ── Text-decoration ──

	test('text-decoration: none', () => {
		assert.deepStrictEqual(collapse({
			'text-decoration-line': 'none', 'text-decoration-style': 'solid',
			'text-decoration-color': 'currentcolor', 'text-decoration-thickness': 'auto',
		}), ['text-decoration: none;']);
	});

	test('text-decoration: underline with non-default style', () => {
		assert.deepStrictEqual(collapse({
			'text-decoration-line': 'underline', 'text-decoration-style': 'wavy',
			'text-decoration-color': 'currentcolor', 'text-decoration-thickness': 'auto',
		}), ['text-decoration: underline wavy;']);
	});

	// ── White-space ──

	test('white-space: nowrap', () => {
		assert.deepStrictEqual(collapse({
			'white-space-collapse': 'collapse', 'text-wrap-mode': 'nowrap',
		}), ['white-space: nowrap;']);
	});

	test('white-space: pre-wrap', () => {
		assert.deepStrictEqual(collapse({
			'white-space-collapse': 'preserve', 'text-wrap-mode': 'wrap',
		}), ['white-space: pre-wrap;']);
	});

	// ── Transition ──

	test('transition: single property with cubic-bezier', () => {
		assert.deepStrictEqual(collapse({
			'transition-property': 'opacity',
			'transition-duration': '0.5s',
			'transition-timing-function': 'cubic-bezier(0.16, 1, 0.3, 1)',
			'transition-delay': '0s',
			'transition-behavior': 'normal',
		}), ['transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1);']);
	});

	test('transition: multi-property comma-separated', () => {
		assert.deepStrictEqual(collapse({
			'transition-property': 'opacity, transform',
			'transition-duration': '0.5s, 0.3s',
			'transition-timing-function': 'ease, ease',
			'transition-delay': '0s, 0s',
			'transition-behavior': 'normal, normal',
		}), ['transition: opacity 0.5s, transform 0.3s;']);
	});

	// ── Animation ──

	test('animation: name and duration only', () => {
		assert.deepStrictEqual(collapse({
			'animation-name': 'fadeIn', 'animation-duration': '0.3s',
			'animation-timing-function': 'ease', 'animation-delay': '0s',
			'animation-iteration-count': '1', 'animation-direction': 'normal',
			'animation-fill-mode': 'none', 'animation-play-state': 'running',
			'animation-timeline': 'auto',
		}), ['animation: fadeIn 0.3s;']);
	});

	test('animation: with fill-mode and custom easing', () => {
		assert.deepStrictEqual(collapse({
			'animation-name': 'slideIn', 'animation-duration': '0.5s',
			'animation-timing-function': 'ease-in-out', 'animation-delay': '0s',
			'animation-iteration-count': '1', 'animation-direction': 'normal',
			'animation-fill-mode': 'forwards', 'animation-play-state': 'running',
			'animation-timeline': 'auto',
		}), ['animation: slideIn 0.5s ease-in-out forwards;']);
	});

	// ── Remaining properties pass through sorted ──

	test('unknown properties pass through alphabetically', () => {
		assert.deepStrictEqual(collapse({
			'z-index': '1', 'color': 'red', 'display': 'flex',
		}), ['color: red;', 'display: flex;', 'z-index: 1;']);
	});

	// ── Mixed: realistic GitHub-like element ──

	test('realistic element with multiple shorthand groups', () => {
		const result = collapse({
			'padding-top': '4px', 'padding-right': '12px', 'padding-bottom': '4px', 'padding-left': '12px',
			'border-top-left-radius': '6px', 'border-top-right-radius': '6px',
			'border-bottom-right-radius': '6px', 'border-bottom-left-radius': '6px',
			'border-top-width': '1px', 'border-right-width': '1px', 'border-bottom-width': '1px', 'border-left-width': '1px',
			'border-top-style': 'solid', 'border-right-style': 'solid', 'border-bottom-style': 'solid', 'border-left-style': 'solid',
			'border-top-color': 'rgb(209, 217, 224)', 'border-right-color': 'rgb(209, 217, 224)',
			'border-bottom-color': 'rgb(209, 217, 224)', 'border-left-color': 'rgb(209, 217, 224)',
			'border-image-source': 'none', 'border-image-slice': '100%',
			'border-image-width': '1', 'border-image-outset': '0', 'border-image-repeat': 'stretch',
			'background-color': 'rgba(0, 0, 0, 0)',
			'background-image': 'none', 'background-position-x': '0px', 'background-position-y': '0px',
			'background-size': 'auto', 'background-repeat': 'repeat', 'background-attachment': 'scroll',
			'background-origin': 'padding-box', 'background-clip': 'border-box',
			'text-decoration-line': 'none', 'text-decoration-style': 'solid',
			'text-decoration-color': 'currentcolor', 'text-decoration-thickness': 'auto',
			'white-space-collapse': 'collapse', 'text-wrap-mode': 'nowrap',
			'transition-property': 'opacity, transform',
			'transition-duration': '0.5s, 0.5s',
			'transition-timing-function': 'cubic-bezier(0.16, 1, 0.3, 1), cubic-bezier(0.16, 1, 0.3, 1)',
			'transition-delay': '0s, 0s',
			'transition-behavior': 'normal, normal',
			'color': 'rgb(255, 255, 255)',
			'display': 'inline-flex',
			'font-size': '14px',
		});
		assert.deepStrictEqual(result, [
			'padding: 4px 12px;',
			'border-radius: 6px;',
			'border: 1px solid rgb(209, 217, 224);',
			'background: rgba(0, 0, 0, 0);',
			'text-decoration: none;',
			'white-space: nowrap;',
			'transition: opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);',
			'color: rgb(255, 255, 255);',
			'display: inline-flex;',
			'font-size: 14px;',
		]);
	});
});

// ── Helper to build CDP-like rule matches ──

function rule(selector: string, cssText: string, origin = 'regular'): { rule: { selectorList: { selectors: { text: string }[] }; origin: string; style: { cssText: string; cssProperties: { name: string; value: string }[] } } } {
	const props = cssText.split(';').map(d => d.trim()).filter(Boolean).map(d => {
		const [name, ...rest] = d.split(':');
		return { name: name.trim(), value: rest.join(':').trim() };
	});
	return { rule: { selectorList: { selectors: [{ text: selector }] }, origin, style: { cssText, cssProperties: props } } };
}

suite('formatAuthorStyles', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('includes direct author rules and skips user-agent', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [
				rule('.btn', 'padding: 8px; color: white;'),
				rule('button', 'display: inline-block;', 'user-agent'),
			],
		};
		const { rulesText } = formatMatchedStyles(matched);
		assert.ok(rulesText.includes('.btn'));
		assert.ok(rulesText.includes('padding: 8px'));
		assert.ok(!rulesText.includes('display: inline-block'));
	});

	test('includes pseudo-element styles', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [rule('.btn', 'color: white;')],
			pseudoElements: [
				{
					pseudoType: 'before',
					matches: [rule('.btn::before', 'content: "→"; color: red;')],
				},
				{
					pseudoType: 'after',
					matches: [rule('.btn::after', 'content: "✓"; color: green;')],
				},
			],
		};
		const { rulesText } = formatMatchedStyles(matched);
		assert.ok(rulesText.includes('/* Pseudo-elements */'));
		assert.ok(rulesText.includes('.btn::before'));
		assert.ok(rulesText.includes('.btn::after'));
		assert.ok(rulesText.includes('content: "→"'));
	});

	test('skips user-agent pseudo-element rules', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [rule('.x', 'color: red;')],
			pseudoElements: [
				{
					pseudoType: 'before',
					matches: [rule('input::before', 'content: "";', 'user-agent')],
				},
			],
		};
		const { rulesText } = formatMatchedStyles(matched);
		assert.ok(!rulesText.includes('Pseudo-elements'));
	});

	test('filters inherited rules to inheritable properties only', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [rule('.child', 'display: flex;')],
			inherited: [{
				matchedCSSRules: [rule('body', 'font-family: sans-serif; background: red; margin: 0;')],
			}],
		};
		const { rulesText } = formatMatchedStyles(matched);
		assert.ok(rulesText.includes('font-family: sans-serif'));
		assert.ok(!rulesText.includes('background'));
		assert.ok(!rulesText.includes('margin'));
	});

	test('collects var references from rules', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [rule('.x', 'color: var(--fg-color); border: var(--border-width) solid;')],
		};
		const { referencedVars } = formatMatchedStyles(matched);
		assert.ok(referencedVars.has('--fg-color'));
		assert.ok(referencedVars.has('--border-width'));
	});

	test('tracks author property names from cssProperties longhands', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [{
				rule: {
					selectorList: { selectors: [{ text: '.x' }] },
					origin: 'regular',
					style: {
						cssText: 'border: 1px solid red;',
						cssProperties: [
							{ name: 'border-top-width', value: '1px' },
							{ name: 'border-top-style', value: 'solid' },
							{ name: 'border-top-color', value: 'red' },
						],
					},
				},
			}],
		};
		const { authorPropertyNames } = formatMatchedStyles(matched);
		assert.ok(authorPropertyNames.has('border-top-width'));
		assert.ok(authorPropertyNames.has('border-top-style'));
		// Always-shown properties
		assert.ok(authorPropertyNames.has('display'));
		assert.ok(authorPropertyNames.has('width'));
	});

	test('tracks user-agent property names from direct rules', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [
				rule('.btn', 'color: white;'),
				rule('button', 'display: inline-block; padding: 2px;', 'user-agent'),
			],
		};
		const { userAgentPropertyNames } = formatMatchedStyles(matched);
		assert.ok(userAgentPropertyNames.has('display'));
		assert.ok(userAgentPropertyNames.has('padding'));
		assert.ok(!userAgentPropertyNames.has('color'));
	});

	test('tracks user-agent property names from pseudo-element rules', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [rule('.x', 'color: red;')],
			pseudoElements: [
				{
					pseudoType: 'before',
					matches: [rule('input::before', 'content: ""; display: block;', 'user-agent')],
				},
			],
		};
		const { userAgentPropertyNames } = formatMatchedStyles(matched);
		assert.ok(userAgentPropertyNames.has('content'));
		assert.ok(userAgentPropertyNames.has('display'));
	});

	test('tracks user-agent property names from inherited rules (inheritable only)', () => {
		const matched: IMatchedStyles = {
			matchedCSSRules: [rule('.child', 'display: flex;')],
			inherited: [{
				matchedCSSRules: [rule('body', 'font-family: sans-serif; margin: 0;', 'user-agent')],
			}],
		};
		const { userAgentPropertyNames } = formatMatchedStyles(matched);
		assert.ok(userAgentPropertyNames.has('font-family'));
		assert.ok(!userAgentPropertyNames.has('margin'));
	});
});
