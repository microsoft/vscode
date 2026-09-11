/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	browserViewSemanticThemeCssProperties,
	IBrowserViewSemanticTheme,
	serializeBrowserViewSemanticThemeCss,
} from '../../common/browserViewSemanticTheme.js';

suite('BrowserView Semantic Theme', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('serializes only the fixed, known custom properties with valid color values', () => {
		const theme: IBrowserViewSemanticTheme = {
			fgDefault: '#112233',
			bgAccentEmphasis: 'rgba(1, 2, 3, 0.5)',
			borderDefault: 'hsl(120, 50%, 50%)',
			focusOutlineColor: 'transparent',
		};
		const css = serializeBrowserViewSemanticThemeCss(theme);

		assert.ok(css.startsWith(':root {'), 'result should be a single :root rule');
		assert.ok(css.includes('--fgColor-default: #112233;'));
		assert.ok(css.includes('--bgColor-accent-emphasis: rgba(1, 2, 3, 0.5);'));
		assert.ok(css.includes('--borderColor-default: hsl(120, 50%, 50%);'));
		assert.ok(css.includes('--focus-outline-color: transparent;'));

		// Nothing beyond these four declarations should have been emitted.
		const declarationCount = (css.match(/;/g) ?? []).length;
		assert.strictEqual(declarationCount, 4);
	});

	test('returns an empty string for an undefined theme or a theme with no valid fields', () => {
		assert.strictEqual(serializeBrowserViewSemanticThemeCss(undefined), '');
		assert.strictEqual(serializeBrowserViewSemanticThemeCss({}), '');
	});

	test('drops values that do not look like a plain color, without breaking other declarations', () => {
		const maliciousTheme = {
			fgDefault: '#112233',
			// Attempts to break out of the declaration/rule to inject arbitrary CSS or script.
			fgMuted: 'red; } body { background: url(javascript:alert(1)) </style><script>alert(1)</script>',
			bgDefault: 'expression(alert(1))',
			borderDefault: '',
		} as unknown as IBrowserViewSemanticTheme;

		const css = serializeBrowserViewSemanticThemeCss(maliciousTheme);

		assert.ok(css.includes('--fgColor-default: #112233;'));
		assert.ok(!css.includes('fgColor-muted'));
		assert.ok(!css.includes('bgColor-default'));
		assert.ok(!css.includes('borderColor-default'));
		assert.ok(!css.includes('script'));
		assert.ok(!css.includes('body'), 'a dropped value must never inject a sibling selector');
		// The only `}` allowed is the single closing brace of the whole `:root { ... }`
		// rule itself; a dropped value must never let a rule close early and open a new one.
		assert.strictEqual((css.match(/}/g) ?? []).length, 1, 'a dropped value must never let a rule close early');
		assert.ok(css.trimEnd().endsWith('}'), 'the lone closing brace must be the last character');
	});

	test('accepts the full range of expected VS Code Color#toString() formats', () => {
		const formats: IBrowserViewSemanticTheme = {
			fgDefault: '#fff',
			fgMuted: '#ffffff',
			fgAccent: '#ffffffff',
			fgDanger: 'rgb(255, 0, 0)',
			fgSuccess: 'rgba(255, 0, 0, 1)',
			bgDefault: 'hsl(0, 100%, 50%)',
			bgMuted: 'hsla(0, 100%, 50%, 0.5)',
		};
		const css = serializeBrowserViewSemanticThemeCss(formats);
		for (const key of Object.keys(formats) as (keyof IBrowserViewSemanticTheme)[]) {
			assert.ok(css.includes(`${browserViewSemanticThemeCssProperties[key]}: ${formats[key]};`), `expected declaration for ${key}`);
		}
	});

	test('the CSS property mapping table is exactly the interface field set, with no extras', () => {
		const theme: Required<IBrowserViewSemanticTheme> = Object.fromEntries(
			Object.keys(browserViewSemanticThemeCssProperties).map(key => [key, '#000000'])
		) as unknown as Required<IBrowserViewSemanticTheme>;

		const css = serializeBrowserViewSemanticThemeCss(theme);
		const emittedProperties = Object.values(browserViewSemanticThemeCssProperties);
		for (const property of emittedProperties) {
			assert.ok(css.includes(`${property}: #000000;`), `missing expected property ${property}`);
		}
		const declarationCount = (css.match(/;/g) ?? []).length;
		assert.strictEqual(declarationCount, emittedProperties.length);
	});
});
