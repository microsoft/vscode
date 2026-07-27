/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { containsRootAnchoredHas, findRootAnchoredHas } from '../stylelint/validateHasSelectors.ts';

suite('stylelint root-anchored :has() check', () => {

	test('flags root anchors regardless of position in the compound', () => {
		assert.ok(containsRootAnchoredHas('body:has(.automation-dialog) .context-view.monaco-component'));
		assert.ok(containsRootAnchoredHas('.monaco-workbench.floating-panels:has(.part.activitybar.compact) .part.statusbar'));
		assert.ok(containsRootAnchoredHas('.style-override.monaco-workbench:has(.part.sidebar) .part'));
		assert.ok(containsRootAnchoredHas('BODY:HAS(.foo)'));
		assert.ok(containsRootAnchoredHas(':root:has(.foo)'));
		assert.ok(containsRootAnchoredHas(':is(body, .embedded):has(.foo)'));
		assert.ok(containsRootAnchoredHas(':where(html, .embedded):has(.foo)'));
		assert.ok(containsRootAnchoredHas('body:not(.x):has(.foo)'));
		assert.ok(containsRootAnchoredHas('.foo, body:has(.bar)'));
		assert.ok(containsRootAnchoredHas('.monaco\\2d workbench:has(.foo)'));
		assert.ok(containsRootAnchoredHas('.monaco/**/-workbench:has(.foo)'));
		assert.ok(containsRootAnchoredHas('body:/**/has(.foo)'));
		assert.ok(containsRootAnchoredHas('body:\\68 as(.foo)'));
		assert.ok(containsRootAnchoredHas(':has(.foo).monaco-workbench'));
		assert.ok(containsRootAnchoredHas(':has(.foo):is(body, .embedded)'));
	});

	test('ignores :has() anchored below the root', () => {
		assert.ok(!containsRootAnchoredHas('.monaco-workbench .part > .title:has(.start-debug-action-item) > .title-actions'));
		assert.ok(!containsRootAnchoredHas('.style-override.monaco-workbench .part:not(.editor):has(> .content)'));
		assert.ok(!containsRootAnchoredHas('.interactive-session .foo:has(.bar)'));
		assert.ok(!containsRootAnchoredHas('.automations-list-widget .automations-row:has(:focus-visible)'));
		assert.ok(!containsRootAnchoredHas('.foo:not(.monaco-workbench):has(.bar)'));
		assert.ok(!containsRootAnchoredHas('[data-example=".monaco-workbench"]:has(.bar)'));
	});

	test('requires complete tokens', () => {
		assert.ok(!containsRootAnchoredHas('.monaco-workbench-test:has(.foo)'));
		assert.ok(!containsRootAnchoredHas('bodyguard:has(.foo)'));
		assert.ok(!containsRootAnchoredHas('.htmlish:has(.foo)'));
		assert.ok(!containsRootAnchoredHas('.bodyclass:has(.foo)'));
	});

	test('scans only stylesheet selectors', () => {
		assert.ok(findRootAnchoredHas('/* body:has(.foo) */\n.foo {}') === undefined);
		assert.ok(findRootAnchoredHas('a { --example: body:has(.foo); }') === undefined);
		assert.ok(findRootAnchoredHas('@supports selector(body:has(.foo)) { .foo {} }') === undefined);
	});

	test('scans nested stylesheet selectors', () => {
		assert.ok(findRootAnchoredHas('body { &:has(.foo) {} }') !== undefined);
		assert.ok(findRootAnchoredHas('.monaco-workbench { color: red; &:has(.foo) {} }') !== undefined);
		assert.ok(findRootAnchoredHas(':is(body, .embedded) { &:has(.foo) {} }') !== undefined);
		assert.ok(findRootAnchoredHas('.embedded, body { &:has(.foo) {} }') !== undefined);
		assert.ok(findRootAnchoredHas('@media (width > 0) { .monaco-workbench { &:has(.foo) {} } }') !== undefined);
		assert.ok(findRootAnchoredHas('body { @media (width > 0) { &:has(.foo) {} } }') !== undefined);
		assert.ok(findRootAnchoredHas('body { @supports (display: grid) { &:has(.foo) {} } }') !== undefined);
		assert.ok(findRootAnchoredHas('.first { color: red } body:has(.foo) {}') !== undefined);
	});

	test('does not propagate root anchoring to nested descendants', () => {
		assert.ok(findRootAnchoredHas('.monaco-workbench .child { &:has(.foo) {} }') === undefined);
		assert.ok(findRootAnchoredHas('body { .child { &:has(.foo) {} } }') === undefined);
		assert.ok(findRootAnchoredHas('body { & .child:has(.foo) {} }') === undefined);
		assert.ok(findRootAnchoredHas('.embedded { @media (width > 0) { &:has(.foo) {} } }') === undefined);
	});
});
