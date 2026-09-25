/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { markOnboardingTarget, ONBOARDING_TARGET_ATTR, registerOnboardingTargetProvider, resolveOnboardingTarget } from '../../browser/spotlight/onboardingTarget.js';

suite('Onboarding target providers', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createTarget(): HTMLElement {
		const target = $('button');
		target.style.cssText = 'position: fixed; width: 100px; height: 30px;';
		mainWindow.document.body.appendChild(target);
		disposables.add(toDisposable(() => target.remove()));
		return target;
	}

	test('resolves an owner-provided control without marking or opening it', async () => {
		const element = createTarget();
		let opened = 0;
		const scopes: (string | undefined)[] = [];
		disposables.add(registerOnboardingTargetProvider('test.control', scope => {
			scopes.push(scope);
			return { element, open: () => { opened++; } };
		}));
		const target = resolveOnboardingTarget(mainWindow, 'test.control', 'prepared');
		const openedBefore = opened;
		await target?.open?.();

		assert.deepStrictEqual({ correctElement: target?.element === element, marked: element.hasAttribute(ONBOARDING_TARGET_ATTR), scopes, openedBefore, opened }, {
			correctElement: true,
			marked: false,
			scopes: ['prepared', 'prepared'],
			openedBefore: 0,
			opened: 1,
		});
	});

	test('a provider that cannot resolve the requested scope does not fall back to a marked control', () => {
		const element = createTarget();
		disposables.add(markOnboardingTarget(element, 'test.control', { scope: 'stale' }));
		disposables.add(registerOnboardingTargetProvider('test.control', () => undefined));

		assert.strictEqual(resolveOnboardingTarget(mainWindow, 'test.control', 'stale'), undefined);
	});

	test('ignores hidden, detached and other-window controls', () => {
		const element = createTarget();
		disposables.add(registerOnboardingTargetProvider('test.control', () => ({ element })));
		element.style.display = 'none';
		const hidden = resolveOnboardingTarget(mainWindow, 'test.control');
		element.style.display = '';
		const otherWindow = upcastPartial<Window>({ document: mainWindow.document.implementation.createHTMLDocument() });
		const wrongWindow = resolveOnboardingTarget(otherWindow, 'test.control');
		element.remove();
		const detached = resolveOnboardingTarget(mainWindow, 'test.control');

		assert.deepStrictEqual({ hidden, wrongWindow, detached }, { hidden: undefined, wrongWindow: undefined, detached: undefined });
	});

	test('restores marked-target behavior when the provider is disposed', async () => {
		const element = createTarget();
		let opened = 0;
		disposables.add(markOnboardingTarget(element, 'test.control', { open: () => { opened++; } }));
		const provider = disposables.add(registerOnboardingTargetProvider('test.control', () => undefined));
		provider.dispose();
		const target = resolveOnboardingTarget(mainWindow, 'test.control');
		await target?.open?.();

		assert.deepStrictEqual({ correctElement: target?.element === element, opened }, { correctElement: true, opened: 1 });
	});

	test('does not invoke a resolved control after the same provider callback is re-registered', async () => {
		const element = createTarget();
		let opened = 0;
		const resolve = () => ({
			element,
			open: () => { opened++; },
		});
		const provider = disposables.add(registerOnboardingTargetProvider('test.control', resolve));
		const target = resolveOnboardingTarget(mainWindow, 'test.control');
		provider.dispose();
		disposables.add(registerOnboardingTargetProvider('test.control', resolve));
		await target?.open?.();

		assert.strictEqual(opened, 0);
	});

	test('does not open a control that its owner has replaced', async () => {
		let element = createTarget();
		let opened = 0;
		disposables.add(registerOnboardingTargetProvider('test.control', () => ({
			element,
			open: () => { opened++; },
		})));
		const oldTarget = resolveOnboardingTarget(mainWindow, 'test.control');
		element = createTarget();
		await oldTarget?.open?.();
		const openedBefore = opened;
		await resolveOnboardingTarget(mainWindow, 'test.control')?.open?.();

		assert.deepStrictEqual({ openedBefore, opened }, { openedBefore: 0, opened: 1 });
	});

	test('rejects duplicate providers without replacing the owner', () => {
		const element = createTarget();
		disposables.add(registerOnboardingTargetProvider('test.control', () => ({ element })));
		assert.throws(() => registerOnboardingTargetProvider('test.control', () => undefined), /already registered/);
		assert.strictEqual(resolveOnboardingTarget(mainWindow, 'test.control')?.element, element);
	});
});
