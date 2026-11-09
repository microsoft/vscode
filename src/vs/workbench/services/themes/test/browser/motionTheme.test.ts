/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import '../../../../../base/browser/ui/codicons/codicon/codicon-modifiers.css';
import { HoverWidget } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { ProgressBar } from '../../../../../base/browser/ui/progressbar/progressbar.js';
import { Radio } from '../../../../../base/browser/ui/radio/radio.js';
import { Switch } from '../../../../../base/browser/ui/toggle/switch.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { getMotionCssVariables } from '../../../../../platform/theme/common/motion/motionRecipes.js';
import { resolveMotionPreset } from '../../../../../platform/theme/common/motion/motionPresets.js';
import { WebviewThemeDataProvider } from '../../../../contrib/webview/browser/themeing.js';
import { generateColorThemeCSS } from '../../browser/colorThemeCss.js';
import { ColorThemeData } from '../../common/colorThemeData.js';
import { IWorkbenchThemeService } from '../../common/workbenchThemeService.js';

suite('Motion theme export', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('workbench and webviews export the same alias graph in every color scheme', () => {
		for (const scheme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			const theme = ColorThemeData.createUnloadedTheme(scheme);
			const themeService = new class extends mock<IWorkbenchThemeService>() {
				override readonly onDidColorThemeChange = Event.None;
				override getColorTheme() { return theme; }
			};
			const provider = store.add(new WebviewThemeDataProvider(themeService, new TestConfigurationService({ editor: {} })));
			const css = generateColorThemeCSS(theme, '.test').code;
			const styles = provider.getWebviewThemeData().styles;
			assert.deepStrictEqual(Object.entries(getMotionCssVariables()).map(([name, value]) => ({
				name, workbench: css.includes(`${name}: ${value};`), webview: styles[name.slice(2)],
			})), Object.entries(getMotionCssVariables()).map(([name, value]) => ({
				name, workbench: true, webview: value,
			})));
		}
	});

	test('product controls consume the shared timing and stop motion without hiding the state', () => {
		const host = $('.motion-test');
		document.body.append(host);
		store.add(toDisposable(() => host.remove()));
		for (const [name, value] of Object.entries(getMotionCssVariables())) {
			host.style.setProperty(name, value);
		}
		const setting = store.add(new Switch({ ariaLabel: 'Setting' }));
		host.append(setting.domNode);
		const radio = store.add(new Radio({ className: 'segmented', items: [{ text: 'First', isActive: true }, { text: 'Second' }] }));
		host.append(radio.domNode);
		radio.domNode.classList.add('animate-selection');
		const selection = radio.domNode.querySelector<HTMLElement>('.monaco-radio-selection')!;
		const hover = store.add(new HoverWidget(true));
		host.append(hover.containerDomNode);
		const progress = store.add(new ProgressBar(host));
		progress.total(100).setWorked(25);
		const bit = host.querySelector<HTMLElement>('.progress-bit')!;
		const style = (element: HTMLElement) => getWindow(element).getComputedStyle(element);
		const durations = (value: string) => value.split(',').map(duration => Math.round(Number.parseFloat(duration) * 1000));
		const responseDuration = Math.round(resolveMotionPreset('control').phases[0].response.durationMs);
		const visibilityDuration = Math.round(resolveMotionPreset('visibility').phases[0].response.durationMs);
		const prefersReduction = getWindow(host).matchMedia('(prefers-reduced-motion: reduce)').matches;
		assert.deepStrictEqual({
			switchDuration: durations(style(setting.domNode).transitionDuration),
			generatedCurve: style(setting.domNode).transitionTimingFunction.startsWith('linear('),
			selectionDuration: durations(style(selection).transitionDuration),
			hoverDuration: durations(style(hover.containerDomNode).animationDuration),
			progressDuration: durations(style(bit).transitionDuration),
		}, prefersReduction ? { switchDuration: [0], generatedCurve: false, selectionDuration: [0], hoverDuration: [0], progressDuration: [0] }
			: { switchDuration: [responseDuration, responseDuration], generatedCurve: true, selectionDuration: [responseDuration, responseDuration, 100], hoverDuration: [visibilityDuration], progressDuration: [200] });
		host.classList.add('monaco-enable-motion');
		assert.deepStrictEqual({
			switchDuration: durations(style(setting.domNode).transitionDuration),
			selectionDuration: durations(style(selection).transitionDuration),
			hoverDuration: durations(style(hover.containerDomNode).animationDuration),
			progressDuration: durations(style(bit).transitionDuration),
		}, { switchDuration: [responseDuration, responseDuration], selectionDuration: [responseDuration, responseDuration, 100], hoverDuration: [visibilityDuration], progressDuration: [200] });
		host.classList.remove('monaco-enable-motion');
		progress.infinite();
		assert.strictEqual(style(bit).animationDuration, prefersReduction ? '0s' : '4s');
		host.classList.add('monaco-reduce-motion');
		setting.checked = true;
		assert.deepStrictEqual({
			switchDuration: style(setting.domNode).transitionDuration,
			selectionDuration: style(selection).transitionDuration,
			checked: setting.domNode.getAttribute('aria-checked'),
			hoverAnimation: style(hover.containerDomNode).animationName,
			progressAnimation: style(bit).animationName,
			progressDisplay: style(bit).display,
			progressValue: progress.getContainer().getAttribute('aria-valuenow'),
		}, { switchDuration: '0s', selectionDuration: '0s', checked: 'true', hoverAnimation: 'none', progressAnimation: 'none', progressDisplay: 'block', progressValue: null });
	});

	test('compact loading icons preserve their own pacing and honor effective reduction', () => {
		const host = $('.motion-test.monaco-enable-motion');
		document.body.append(host);
		store.add(toDisposable(() => host.remove()));
		for (const [name, value] of Object.entries(getMotionCssVariables())) {
			host.style.setProperty(name, value);
		}
		const icon = $('.codicon.codicon-loading');
		host.append(icon);
		const style = () => getWindow(icon).getComputedStyle(icon);
		assert.deepStrictEqual({
			duration: style().animationDuration,
			easing: style().animationTimingFunction,
		}, { duration: '1.5s', easing: 'steps(30)' });
		host.classList.remove('monaco-enable-motion');
		host.classList.add('monaco-reduce-motion');
		assert.strictEqual(style().animationName, 'none');
		host.classList.remove('monaco-reduce-motion');
		assert.strictEqual(style().animationName, getWindow(host).matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'codicon-spin');
	});
});
