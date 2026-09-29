/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatWorkingLogo, ChatWorkingProgressLogo, getConfiguredProgressAnimation } from '../../../browser/widget/chatWorkingLogo.js';
import { ChatConfiguration, ChatProgressAnimation } from '../../../common/constants.js';

suite('ChatWorkingLogo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const drawStyles = [ChatProgressAnimation.Draw, ChatProgressAnimation.DrawMonochrome];

	function createConfiguration() {
		const configuration = new TestConfigurationService();
		store.add(toDisposable(() => configuration.onDidChangeConfigurationEmitter.dispose()));
		const fireChange = (key = ChatConfiguration.PersistentProgress) => configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: section => section === key,
		});
		return { configuration, fireChange };
	}

	test('an unregistered progress setting falls back to Off and switches Draw styles without replacing its faces', async () => {
		const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		store.add(toDisposable(() => parent.remove()));
		const { configuration, fireChange } = createConfiguration();
		const logo = store.add(new ChatWorkingProgressLogo('stable', configuration, store.add(new NullLogService())));
		parent.appendChild(logo.domNode);
		const faces = [...logo.domNode.children];
		const initial = { animation: logo.domNode.dataset.animation, animations: logo.domNode.getAnimations({ subtree: true }).length };
		const snapshots = [];
		for (const animation of [...Object.values(ChatProgressAnimation), ChatProgressAnimation.Draw]) {
			await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
			fireChange();
			const style = mainWindow.getComputedStyle(logo.domNode);
			snapshots.push({
				animation: logo.domNode.dataset.animation,
				duration: logo.durationMs,
				filter: style.filter,
				visibility: style.visibility,
				animations: logo.domNode.getAnimations({ subtree: true }).length,
			});
		}
		const animations = logo.domNode.getAnimations({ subtree: true });
		fireChange(ChatConfiguration.ThinkingPhrases);
		const sameAnimations = logo.domNode.getAnimations({ subtree: true }).every((animation, index) => animation === animations[index]);
		logo.dispose();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.DrawMonochrome);
		fireChange();
		assert.deepStrictEqual({
			initial, snapshots,
			sameFaces: [...logo.domNode.children].every((face, index) => face === faces[index]),
			sameAnimations,
			animationAfterDisposal: logo.domNode.dataset.animation,
		}, {
			initial: { animation: 'off', animations: 0 },
			snapshots: [
				{ animation: 'off', duration: 2400, filter: 'none', visibility: 'visible', animations: 0 },
				{ animation: 'draw', duration: 2400, filter: 'none', visibility: 'visible', animations: 3 },
				{ animation: 'drawMonochrome', duration: 2400, filter: 'grayscale(1)', visibility: 'visible', animations: 3 },
				{ animation: 'drawMonochromeNoIcon', duration: 2400, filter: 'grayscale(1)', visibility: 'hidden', animations: 0 },
				{ animation: 'draw', duration: 2400, filter: 'none', visibility: 'visible', animations: 3 },
			],
			sameFaces: true,
			sameAnimations: true,
			animationAfterDisposal: 'draw',
		});
	});

	test('changing the configured style does not reactivate an inactive logo', async () => {
		const { configuration, fireChange } = createConfiguration();
		const logo = store.add(new ChatWorkingProgressLogo('insider', configuration, store.add(new NullLogService())));
		mainWindow.document.body.appendChild(logo.domNode);
		logo.setActive(false);
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.DrawMonochrome);
		fireChange();
		assert.deepStrictEqual({
			animation: logo.domNode.dataset.animation,
			animations: logo.domNode.getAnimations({ subtree: true }).length,
			active: logo.domNode.classList.contains('chat-working-logo-active'),
			color: logo.domNode.style.color,
			filter: mainWindow.getComputedStyle(logo.domNode).filter,
		}, {
			animation: 'drawMonochrome',
			animations: 0,
			active: false,
			color: 'var(--vscode-chat-workingProgressInsidersIconForeground)',
			filter: 'grayscale(1)',
		});
	});

	test('removed animation settings resolve to Draw before migration and for experiment defaults', async () => {
		const { configuration } = createConfiguration();
		const logger = store.add(new NullLogService());
		const results = [];
		for (const animation of ['weave', 'orbit', 'accordion', 'dial']) {
			await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
			results.push(getConfiguredProgressAnimation(configuration, logger));
		}
		assert.deepStrictEqual(results, Array(4).fill(ChatProgressAnimation.Draw));
	});

	test('unsupported animation settings are logged and leave the logo static', async () => {
		const { configuration } = createConfiguration();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, 'unsupported');
		const warnings: string[] = [];
		const logger = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const logo = store.add(new ChatWorkingProgressLogo('stable', configuration, logger));
		assert.deepStrictEqual({ animation: logo.domNode.dataset.animation, static: logo.domNode.classList.contains('chat-working-logo-static'), warnings }, {
			animation: 'off',
			static: true,
			warnings: ['ChatWorkingProgressLogo: unsupported progress animation, using Off'],
		});
	});

	test('unsupported animation settings warn once per value across render hot paths', async () => {
		const { configuration } = createConfiguration();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, 'pulse');
		const warnings: string[] = [];
		const logger = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const results = [1, 2, 3].map(() => getConfiguredProgressAnimation(configuration, logger));
		assert.deepStrictEqual({ results, warnings: warnings.length }, { results: [ChatProgressAnimation.Off, ChatProgressAnimation.Off, ChatProgressAnimation.Off], warnings: 1 });
	});

	test('uses the same decorative ribbon faces and product theme colors for every style', () => {
		const logos = Object.values(ChatProgressAnimation).flatMap(animation => [
			store.add(new ChatWorkingLogo(animation, 'stable')),
			store.add(new ChatWorkingLogo(animation, 'insider')),
		]);
		const paths = logos.map(logo => [...logo.domNode.querySelectorAll('path')].map(path => path.getAttribute('d')));
		assert.deepStrictEqual({
			faceCounts: logos.map(logo => logo.domNode.children.length),
			sameGeometry: paths.every(value => JSON.stringify(value) === JSON.stringify(paths[0])),
			decorative: logos.every(logo => logo.domNode.getAttribute('aria-hidden') === 'true'),
			palettes: logos.map(logo => logo.domNode.style.color),
		}, {
			faceCounts: Array(8).fill(3),
			sameGeometry: true,
			decorative: true,
			palettes: Object.values(ChatProgressAnimation).flatMap(() => ['var(--vscode-chat-workingProgressStableIconForeground)', 'var(--vscode-chat-workingProgressInsidersIconForeground)']),
		});
	});

	test('monochrome preserves high contrast theme colors', () => {
		const filters = ['hc-black', 'hc-light'].flatMap(theme => {
			const parent = mainWindow.document.body.appendChild($(`.${theme}`));
			store.add(toDisposable(() => parent.remove()));
			return (['stable', 'insider'] as const).map(quality => {
				const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.DrawMonochrome, quality));
				parent.appendChild(logo.domNode);
				return mainWindow.getComputedStyle(logo.domNode).filter;
			});
		});
		assert.deepStrictEqual(filters, ['none', 'none', 'none', 'none']);
	});

	for (const animation of drawStyles) {
		test(`${animation} builds and undraws in the same three-beat order without fading or moving the faces`, () => {
			const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
			store.add(toDisposable(() => parent.remove()));
			const samples = [
				{ time: 0, reveal: [0, 0, 0] },
				{ time: 160, reveal: [0.5, 0, 0] },
				{ time: 320, reveal: [1, 0, 0] },
				{ time: 480, reveal: [1, 0.5, 0] },
				{ time: 640, reveal: [1, 1, 0] },
				{ time: 800, reveal: [1, 1, 0.5] },
				{ time: 960, reveal: [1, 1, 1] },
				{ time: 1200, reveal: [1, 1, 1] },
				{ time: 1440, reveal: [1, 1, 1] },
				{ time: 1600, reveal: [0.5, 1, 1] },
				{ time: 1760, reveal: [0, 1, 1] },
				{ time: 1920, reveal: [0, 0.5, 1] },
				{ time: 2080, reveal: [0, 0, 1] },
				{ time: 2240, reveal: [0, 0, 0.5] },
				{ time: 2400, reveal: [0, 0, 0] },
				{ time: 2560, reveal: [0.5, 0, 0] },
			];
			const sizes = [12, 16, 64];
			const observations = sizes.flatMap(size => {
				const logo = store.add(new ChatWorkingLogo(animation));
				logo.domNode.style.width = logo.domNode.style.height = `${size}px`;
				parent.appendChild(logo.domNode);
				const faces = ['descending', 'spine', 'ascending'].map(name => {
					const face = logo.domNode.querySelector<HTMLElement>(`.chat-working-logo-${name}`);
					assert.ok(face);
					return face;
				});
				const animations = logo.domNode.getAnimations({ subtree: true });
				assert.strictEqual(animations.length, 3);
				for (const animation of animations) {
					animation.pause();
				}
				return samples.map(sample => {
					for (const animation of animations) {
						animation.currentTime = sample.time;
					}
					const styles = faces.map(face => mainWindow.getComputedStyle(face));
					const reveal = styles.map(style => {
						assert.ok(style.clipPath.startsWith('inset('), style.clipPath);
						const [top, right = top, bottom = top, left = right] = style.clipPath.slice(6, -1).split(/\s+/).map(value => Number.parseFloat(value));
						return Math.round((1 - Math.max(top + bottom, left + right) / 100) * 1000) / 1000;
					});
					return {
						size, time: sample.time, reveal,
						opacity: styles.map(style => Math.round(Number(style.opacity) * 1000) / 1000),
						stationary: styles.every(style => style.transform === 'none'),
					};
				});
			});
			assert.deepStrictEqual(observations, sizes.flatMap(size => samples.map(sample => ({
				size, time: sample.time, reveal: sample.reveal, opacity: Array(3).fill(1), stationary: true,
			}))));
		});

		test(`${animation} draw and erase sweep each ribbon in the same counterclockwise direction`, () => {
			const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
			store.add(toDisposable(() => parent.remove()));
			const samples = [
				{ face: 'descending', time: 160, insets: [0, 50, 0, 0] },
				{ face: 'spine', time: 480, insets: [50, 0, 0, 0] },
				{ face: 'ascending', time: 800, insets: [0, 0, 0, 50] },
				{ face: 'descending', time: 1600, insets: [0, 0, 0, 50] },
				{ face: 'spine', time: 1920, insets: [0, 0, 50, 0] },
				{ face: 'ascending', time: 2240, insets: [0, 50, 0, 0] },
			];
			const sizes = [12, 16, 64];
			const observations = sizes.flatMap(size => {
				const logo = store.add(new ChatWorkingLogo(animation));
				logo.domNode.style.width = logo.domNode.style.height = `${size}px`;
				parent.appendChild(logo.domNode);
				const animations = logo.domNode.getAnimations({ subtree: true });
				assert.strictEqual(animations.length, 3);
				for (const animation of animations) {
					animation.pause();
				}
				return samples.map(sample => {
					for (const animation of animations) {
						animation.currentTime = sample.time;
					}
					const face = logo.domNode.querySelector(`.chat-working-logo-${sample.face}`);
					assert.ok(face);
					const clip = mainWindow.getComputedStyle(face).clipPath;
					const [top, right = top, bottom = top, left = right] = clip.slice(6, -1).split(/\s+/).map(value => Math.round(Number.parseFloat(value)));
					return { size, face: sample.face, time: sample.time, insets: [top, right, bottom, left] };
				});
			});
			assert.deepStrictEqual(observations, sizes.flatMap(size => samples.map(sample => ({ size, ...sample }))));
		});
	}

	test('draw resolves to a full static logo when stopped, reduced, or disabled', () => {
		const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		store.add(toDisposable(() => parent.remove()));
		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'insider'));
		parent.appendChild(logo.domNode);
		const faces = [...logo.domNode.children];
		const snapshot = () => faces.map(face => {
			const style = mainWindow.getComputedStyle(face);
			return { clip: style.clipPath, opacity: style.opacity };
		});
		for (const animation of logo.domNode.getAnimations({ subtree: true })) {
			animation.pause();
			animation.currentTime = logo.durationMs * 0.3;
		}
		logo.setActive(false);
		const stopped = snapshot();
		logo.setActive(true);
		parent.classList.add('monaco-reduce-motion');
		const reduced = snapshot();
		const reducedAnimations = logo.domNode.getAnimations({ subtree: true }).length;
		parent.classList.remove('monaco-reduce-motion');
		logo.setAnimation(ChatProgressAnimation.Off);
		const disabled = snapshot();
		const sameFaces = [...logo.domNode.children].every((face, index) => face === faces[index]);
		logo.dispose();
		const assembled = Array.from({ length: 3 }, () => ({ clip: 'none', opacity: '1' }));
		assert.deepStrictEqual({ stopped, reduced, reducedAnimations, disabled, sameFaces, connected: logo.domNode.isConnected }, {
			stopped: assembled, reduced: assembled, reducedAnimations: 0, disabled: assembled, sameFaces: true, connected: false,
		});
	});

	test('stops motion and removes the mark on disposal', () => {
		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw));
		mainWindow.document.body.appendChild(logo.domNode);
		logo.setActive(false);
		const stoppedAnimations = logo.domNode.getAnimations({ subtree: true }).length;
		logo.setActive(true);
		const active = logo.domNode.classList.contains('chat-working-logo-active');
		logo.dispose();
		assert.deepStrictEqual({ stoppedAnimations, active, connected: logo.domNode.isConnected }, {
			stoppedAnimations: 0,
			active: true,
			connected: false,
		});
	});

	test('reduced motion leaves every face assembled and keeps the no-icon style hidden', () => {
		const parent = mainWindow.document.body.appendChild($('.monaco-reduce-motion'));
		store.add(toDisposable(() => parent.remove()));
		const snapshots = Object.values(ChatProgressAnimation).map(animation => {
			const logo = store.add(new ChatWorkingLogo(animation));
			parent.appendChild(logo.domNode);
			return {
				visibility: mainWindow.getComputedStyle(logo.domNode).visibility,
				faces: [...logo.domNode.children].map(face => {
					const style = mainWindow.getComputedStyle(face);
					return { transform: style.transform, opacity: style.opacity, animation: style.animationName, clip: style.clipPath };
				}),
			};
		});
		assert.deepStrictEqual(snapshots, Object.values(ChatProgressAnimation).map(animation => ({
			visibility: animation === ChatProgressAnimation.DrawMonochromeNoIcon ? 'hidden' : 'visible',
			faces: Array.from({ length: 3 }, () => ({ transform: 'none', opacity: '1', animation: 'none', clip: 'none' })),
		})));
	});
});
