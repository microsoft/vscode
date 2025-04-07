/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DecorationCssRuleExtractor } from '../../../browser/gpu/css/decorationCssRuleExtractor.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { $, getActiveDocument } from '../../../../base/browser/dom.js';

function randomClass(): string {
	return 'test-class-' + generateUuid();
}

suite('DecorationCssRulerExtractor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let doc: Document;
	let container: HTMLElement;
	let extractor: DecorationCssRuleExtractor;
	let testClassName: string;

	function addStyleElement(content: string): void {
		const styleElement = $('style');
		styleElement.textContent = content;
		container.append(styleElement);
	}

	function assertStyles(className: string, expectedCssText: string[]): void {
		deepStrictEqual(extractor.getStyleRules(container, className).map(e => e.cssText), expectedCssText);
	}

	setup(() => {
		doc = getActiveDocument();
		extractor = store.add(new DecorationCssRuleExtractor());
		testClassName = randomClass();
		container = $('div');
		doc.body.append(container);
	});

	teardown(() => {
		container.remove();
	});

	test('unknown class should give no styles', () => {
		assertStyles(randomClass(), []);
	});

	test('single style should be picked up', () => {
		addStyleElement(`.${testClassName} { color: red; }`);
		assertStyles(testClassName, [
			`.${testClassName} { color: red; }`
		]);
	});

	test('multiple styles from the same selector should be picked up', () => {
		addStyleElement(`.${testClassName} { color: red; opacity: 0.5; }`);
		assertStyles(testClassName, [
			`.${testClassName} { color: red; opacity: 0.5; }`
		]);
	});

	test('multiple styles from  different selectors should be picked up', () => {
		addStyleElement([
			`.${testClassName} { color: red; opacity: 0.5; }`,
			`.${testClassName}:hover { opacity: 1; }`,
		].join('\n'));
		assertStyles(testClassName, [
			`.${testClassName} { color: red; opacity: 0.5; }`,
			`.${testClassName}:hover { opacity: 1; }`,
		]);
	});

	test('multiple styles from the different stylesheets should be picked up', () => {
		addStyleElement(`.${testClassName} { color: red; opacity: 0.5; }`);
		addStyleElement(`.${testClassName}:hover { opacity: 1; }`);
		assertStyles(testClassName, [
			`.${testClassName} { color: red; opacity: 0.5; }`,
			`.${testClassName}:hover { opacity: 1; }`,
		]);
	});

	test('should not pick up styles from selectors where the prefix is the class', () => {
		addStyleElement([
			`.${testClassName} { color: red; }`,
			`.${testClassName}-ignoreme { opacity: 1; }`,
			`.${testClassName}fake { opacity: 1; }`,
		].join('\n'));
		assertStyles(testClassName, [
			`.${testClassName} { color: red; }`,
		]);
	});
});
