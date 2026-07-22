/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { containsRootAnchoredHas } from '../stylelint/validateHasSelectors.ts';

suite('stylelint root-anchored :has() check', () => {

	test('flags root anchors regardless of position in the compound', () => {
		assert.ok(containsRootAnchoredHas('body:has(.automation-dialog) .context-view.monaco-component {'));
		assert.ok(containsRootAnchoredHas('.monaco-workbench.floating-panels:has(.part.activitybar.compact) .part.statusbar {'));
		assert.ok(containsRootAnchoredHas('.monaco-workbench:has(.sessions-policy-blocked-overlay) .part.titlebar .titlebar-right {'));
		assert.ok(containsRootAnchoredHas('.style-override.monaco-workbench:has(.part.sidebar) .part {'));
		assert.ok(containsRootAnchoredHas('html:has(.foo) {'));
		assert.ok(containsRootAnchoredHas(':root:has(.foo) {'));
		assert.ok(containsRootAnchoredHas('body:not(.x):has(.foo) {'));
		assert.ok(containsRootAnchoredHas('.foo, body:has(.bar) {'));
	});

	test('ignores :has() anchored below the root', () => {
		assert.ok(!containsRootAnchoredHas('.monaco-workbench .part > .title:has(.start-debug-action-item) > .title-actions {'));
		assert.ok(!containsRootAnchoredHas('.style-override.monaco-workbench .part:not(.editor):has(> .content) {'));
		assert.ok(!containsRootAnchoredHas('.interactive-session .foo:has(.bar) {'));
		assert.ok(!containsRootAnchoredHas('.automations-list-widget .automations-row:has(:focus-visible) {'));
	});

	test('requires complete tokens', () => {
		assert.ok(!containsRootAnchoredHas('.monaco-workbench-test:has(.foo) {'));
		assert.ok(!containsRootAnchoredHas('bodyguard:has(.foo) {'));
		assert.ok(!containsRootAnchoredHas('.htmlish:has(.foo) {'));
		assert.ok(!containsRootAnchoredHas('.bodyclass:has(.foo) {'));
	});

	test('lines without :has()', () => {
		assert.ok(!containsRootAnchoredHas('.monaco-workbench .part.statusbar {'));
		assert.ok(!containsRootAnchoredHas('body { margin: 0; }'));
	});
});
