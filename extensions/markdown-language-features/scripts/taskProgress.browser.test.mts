/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import JSON5 from 'json5';
import { chromium } from 'playwright';
import { buildTaskProgressHtml } from './buildTaskProgressHtml.mts';

it('renders isolated progress widgets with live checkbox/source updates, localized accessible zero state, theme tokens and no guest requests', async () => {
	const extensionDir = fileURLToPath(new URL('..', import.meta.url));
	const html = await buildTaskProgressHtml(path.join(extensionDir, 'markdown-editor-src', 'taskProgress'));
	const source = '- [ ] Todo\n- [x] Done\n\n```widget:task-progress\n```\n\n```widget:task-progress\n```\n\n```text\nOrdinary code\n```\n';
	const themes: Record<string, string> = {};
	for (const name of ['dark', 'light']) {
		const theme = JSON5.parse(await readFile(fileURLToPath(new URL(`../../theme-defaults/themes/${name}_modern.json`, import.meta.url)), 'utf8')) as { colors: Record<string, string> };
		const tokens = ['editor.foreground', 'editor.background', 'descriptionForeground', 'progressBar.background', 'focusBorder']
			.map(token => `--vscode-${token.replaceAll('.', '-')}: ${theme.colors[token]};`).join(' ');
		const track = name === 'dark' ? 'rgba(121, 121, 121, 0.4)' : 'rgba(100, 100, 100, 0.4)';
		themes[name] = `${tokens} --vscode-scrollbarSlider-background: ${track}; --vscode-font-size: 13px; --vscode-font-family: "Segoe UI"; color-scheme: ${name};`;
	}
	const bundle = await esbuild.build({
		stdin: {
			resolveDir: extensionDir,
			loader: 'ts',
			contents: `
				import { EditorModel, EditorView, StringValue } from '@vscode/markdown-editor';
				import { VirtualizedIframeEmbeddedEditorFactory } from '@vscode/markdown-editor/web-editors';
				import { createTaskProgressProvider } from './markdown-editor-src/taskProgress/taskProgressProvider';
				import { codeBlockEditorTheme } from './markdown-editor-src/codeBlockEditorTheme';
				const model = new EditorModel();
				model.sourceText.set(new StringValue(${JSON.stringify(source)}), undefined);
				model.presentation.set('reading', undefined);
				const provider = createTaskProgressProvider(model, {
					title: 'Tâches', summary: '{0} tâches terminées sur {1}', language: 'fr',
				});
				let view: EditorView | undefined;
				const themes = ${JSON.stringify(themes)};
				document.documentElement.style.cssText = themes.dark;
				document.body.dataset.vscodeThemeKind = 'vscode-dark';
				const factory = new VirtualizedIframeEmbeddedEditorFactory({
					providers: [provider],
					scriptNonce: 'task-progress-test',
					...codeBlockEditorTheme(document),
					onDidChange: () => view?.refreshEmbeddedCodeEditors(),
				});
				view = new EditorView(model, {
					presentation: 'reading',
					embeddedCodeEditorFactory: factory,
					onToggleCheckbox: (item, checked) => model.setTaskCheckboxChecked(item, checked),
				});
				view.element.classList.add('md-theme-vscode-default');
				document.getElementById('editor').appendChild(view.element);
				window.taskProgressTest = {
					setSource: text => model.replaceSourceText(new StringValue(text)),
					getSource: () => model.sourceText.get().value,
					setReadonly: value => model.readonlyMode.set(value, undefined),
					refreshProviders: () => factory.updateProviders([provider]),
					setTheme: name => {
						document.documentElement.style.cssText = themes[name];
						document.body.dataset.vscodeThemeKind = 'vscode-' + name;
					},
					dispose: () => { view.dispose(); factory.dispose(); },
				};
			`,
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		external: ['node:fs/promises'],
		plugins: [{
			name: 'task-progress-html',
			setup(build) {
				build.onLoad({ filter: /taskProgress\.html$/ }, () => ({ contents: html, loader: 'text' }));
			},
		}],
	});
	const editorCss = await readFile(fileURLToPath(import.meta.resolve('@vscode/markdown-editor/editor.css')), 'utf8');
	const themeCss = await readFile(fileURLToPath(import.meta.resolve('@vscode/markdown-editor/themes/vscode-default.css')), 'utf8');
	const context = await chromium.launchPersistentContext('.task-progress-browser', {
		channel: process.platform === 'win32' ? 'msedge' : undefined,
		headless: true,
		viewport: { width: 800, height: 600 },
		reducedMotion: 'no-preference',
	});
	const page = await context.newPage();
	const errors: string[] = [];
	const guestRequests: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	page.on('request', request => {
		if (request.frame().parentFrame()) {
			guestRequests.push(request.url());
		}
	});
	await page.route('https://task-progress.test/**', route => {
		if (route.request().url().endsWith('/test.js')) {
			return route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text });
		}
		return route.fulfill({
			contentType: 'text/html',
			body: `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-task-progress-test'; style-src 'unsafe-inline'; frame-src 'self';"><style>${editorCss} ${themeCss} body { background: var(--vscode-editor-background); }</style></head><body><div id="editor"></div><script nonce="task-progress-test" src="/test.js"></script></body></html>`,
		});
	});
	try {
		await page.goto('https://task-progress.test/');
		await page.waitForFunction(() => document.querySelectorAll('iframe').length === 2);
		const summaries = () => page.frames().filter(frame => frame.parentFrame()).map(frame => frame.locator('#summary'));
		await Promise.all(summaries().map(summary => summary.waitFor({ state: 'visible' })));
		assert.deepEqual(await Promise.all(summaries().map(summary => summary.textContent())), [
			'1 tâches terminées sur 2', '1 tâches terminées sur 2',
		]);
		assert.deepEqual(await page.locator('.md-embedded-code-editor').evaluateAll(elements => elements.map(element => ({
			background: getComputedStyle(element).backgroundColor,
			border: getComputedStyle(element).borderTopWidth,
			padding: getComputedStyle(element).padding,
		}))), [
			{ background: 'rgba(0, 0, 0, 0)', border: '1px', padding: '0px' },
			{ background: 'rgba(0, 0, 0, 0)', border: '1px', padding: '0px' },
		]);
		assert.equal(await page.locator('pre.md-code-block').evaluate(element =>
			getComputedStyle(element).backgroundColor), 'rgb(246, 248, 250)');
		await page.waitForFunction(() => Array.from(document.querySelectorAll('.md-embedded-code-editor')).every(editor => {
			const bounds = editor.firstElementChild!.getBoundingClientRect();
			return Array.from(document.querySelectorAll('iframe')).some(frame => {
				const frameBounds = frame.getBoundingClientRect();
				return Math.abs(frameBounds.top - bounds.top) < 1
					&& Math.abs(frameBounds.left - bounds.left) < 1
					&& Math.abs(frameBounds.width - bounds.width) < 1
					&& Math.abs(editor.getBoundingClientRect().bottom - frameBounds.bottom - 1) < 1;
			});
		}));
		const appearance = () => page.frames().find(frame => frame.parentFrame())!.locator('main').evaluate(main => {
			const fill = main.querySelector<HTMLElement>('#fill')!;
			const track = main.querySelector<HTMLElement>('#progress')!;
			return {
				foreground: getComputedStyle(main).color,
				description: getComputedStyle(main.querySelector('#summary')!).color,
				background: getComputedStyle(main).backgroundColor,
				bodyBackground: getComputedStyle(main.ownerDocument.body).backgroundColor,
				border: getComputedStyle(main).borderTopWidth,
				padding: getComputedStyle(main).padding,
				colorScheme: getComputedStyle(main.ownerDocument.documentElement).colorScheme,
				fill: getComputedStyle(fill).backgroundColor,
				track: getComputedStyle(track).backgroundColor,
				fontSize: getComputedStyle(main).fontSize,
				transition: getComputedStyle(fill).transitionDuration,
			};
		});
		assert.deepEqual(await appearance(), {
			foreground: 'rgb(204, 204, 204)', description: 'rgb(157, 157, 157)',
			background: 'rgba(0, 0, 0, 0)', bodyBackground: 'rgba(0, 0, 0, 0)', border: '0px',
			padding: '12px 16px', colorScheme: 'dark',
			fill: 'rgb(0, 120, 212)', track: 'rgba(121, 121, 121, 0.4)', fontSize: '13px', transition: '0.22s',
		});
		await page.evaluate(() => {
			for (const frame of document.querySelectorAll('iframe')) {
				frame.contentDocument!.body.dataset.themeTest = 'same-document';
			}
		});
		await page.evaluate('window.taskProgressTest.setTheme("light")');
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).every(frame =>
			frame.contentDocument?.body.dataset.themeTest === 'same-document'
			&& getComputedStyle(frame.contentDocument.body).color === 'rgb(59, 59, 59)'));
		await page.evaluate('window.taskProgressTest.setTheme("dark")');
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).every(frame =>
			frame.contentDocument?.body.dataset.themeTest === 'same-document'
			&& getComputedStyle(frame.contentDocument.body).color === 'rgb(204, 204, 204)'));
		await page.evaluate(() => { document.body.dataset.vscodeThemeKind = 'vscode-high-contrast-light'; });
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).every(frame =>
			frame.contentDocument && getComputedStyle(frame.contentDocument.documentElement).colorScheme === 'light'));
		await page.evaluate(() => { document.body.dataset.vscodeThemeKind = 'vscode-high-contrast'; });
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).every(frame =>
			frame.contentDocument && getComputedStyle(frame.contentDocument.documentElement).colorScheme === 'dark'));
		await page.frames().find(frame => frame.parentFrame())!.locator('#fill').evaluate(fill => {
			fill.addEventListener('transitionrun', () => {
				(fill as HTMLElement).dataset.transitionStarted = getComputedStyle(fill).transform;
			}, { once: true });
			fill.addEventListener('transitionend', () => {
				(fill as HTMLElement).dataset.transitionEnded = 'true';
			}, { once: true });
		});
		await page.locator('input.md-checkbox').first().check();
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).every(frame =>
			frame.contentDocument?.getElementById('summary')?.textContent === '2 tâches terminées sur 2'));
		await page.frames().find(frame => frame.parentFrame())!.waitForFunction(() =>
			document.getElementById('fill')?.dataset.transitionEnded === 'true');
		const animated = await page.frames().find(frame => frame.parentFrame())!.locator('#fill').evaluate(fill => ({
			start: new DOMMatrixReadOnly((fill as HTMLElement).dataset.transitionStarted).a,
			end: new DOMMatrixReadOnly(getComputedStyle(fill).transform).a,
		}));
		assert.ok(animated.start >= 0.5 && animated.start < 1);
		assert.equal(animated.end, 1);
		assert.equal(await page.evaluate('window.taskProgressTest.getSource()'), source.replace('- [ ]', '- [x]'));
		await page.evaluate('window.taskProgressTest.refreshProviders()');
		await page.waitForFunction(() => document.querySelectorAll('iframe').length === 2
			&& Array.from(document.querySelectorAll('iframe')).every(frame =>
				frame.contentDocument?.getElementById('summary')?.textContent === '2 tâches terminées sur 2'));
		await page.evaluate(`window.taskProgressTest.setSource(${JSON.stringify(source.replace('- [x] Done', '- [ ] Done\n- [ ] New'))})`);
		await page.waitForFunction(() => document.querySelectorAll('iframe').length === 2
			&& Array.from(document.querySelectorAll('iframe')).every(frame =>
				frame.contentDocument?.getElementById('summary')?.textContent === '0 tâches terminées sur 3'));
		await page.evaluate('window.taskProgressTest.setReadonly(true)');
		const zeroSource = '```widget:task-progress\n```\n';
		await page.evaluate(`window.taskProgressTest.setSource(${JSON.stringify(zeroSource)})`);
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).some(frame =>
			frame.contentDocument?.getElementById('summary')?.textContent === '0 tâches terminées sur 0'));
		const zeroFrame = page.frames().find(frame => frame.parentFrame() && frame.locator('main'));
		assert.ok(zeroFrame);
		const accessible = await zeroFrame.locator('main').evaluate(main => {
			const progress = main.querySelector('#progress')!;
			return {
				label: progress.getAttribute('aria-labelledby'),
				description: progress.getAttribute('aria-describedby'),
				valueText: progress.getAttribute('aria-valuetext'),
				value: Number(progress.getAttribute('aria-valuenow')),
				max: Number(progress.getAttribute('aria-valuemax')),
				language: main.ownerDocument.documentElement.lang,
				color: getComputedStyle(main).color,
			};
		});
		assert.deepEqual(accessible, {
			label: 'title', description: 'summary', valueText: '0 tâches terminées sur 0',
			value: 0, max: 1, language: 'fr', color: 'rgb(204, 204, 204)',
		});
		await page.evaluate('window.taskProgressTest.setTheme("light")');
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).some(frame =>
			frame.contentDocument?.getElementById('summary')?.textContent === '0 tâches terminées sur 0'
			&& getComputedStyle(frame.contentDocument.body).color === 'rgb(59, 59, 59)'));
		assert.deepEqual(await appearance(), {
			foreground: 'rgb(59, 59, 59)', description: 'rgb(59, 59, 59)',
			background: 'rgba(0, 0, 0, 0)', bodyBackground: 'rgba(0, 0, 0, 0)', border: '0px',
			padding: '12px 16px', colorScheme: 'light',
			fill: 'rgb(0, 95, 184)', track: 'rgba(100, 100, 100, 0.4)', fontSize: '13px', transition: '0.22s',
		});
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.evaluate(`window.taskProgressTest.setSource(${JSON.stringify('- [x] Done\n- [ ] Todo\n\n' + zeroSource)})`);
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).some(frame =>
			frame.contentDocument?.getElementById('summary')?.textContent === '1 tâches terminées sur 2'));
		const lightFrame = page.frames().find(frame => frame.parentFrame())!;
		assert.deepEqual(await lightFrame.locator('#fill').evaluate(fill => ({
			duration: getComputedStyle(fill).transitionDuration,
			animations: fill.getAnimations().length,
			ratio: new DOMMatrixReadOnly(getComputedStyle(fill).transform).a,
		})), { duration: '0s', animations: 0, ratio: 0.5 });
		await page.evaluate(`window.taskProgressTest.setSource(${JSON.stringify(zeroSource)})`);
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).some(frame =>
			frame.contentDocument?.getElementById('summary')?.textContent === '0 tâches terminées sur 0'));
		await page.setViewportSize({ width: 240, height: 600 });
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).every(frame =>
			frame.getBoundingClientRect().height >= (frame.contentDocument?.querySelector('main')?.getBoundingClientRect().height ?? 0)));
		await page.emulateMedia({ forcedColors: 'active' });
		assert.equal(await lightFrame.locator('#progress').evaluate(progress => getComputedStyle(progress).borderTopWidth), '1px');
		assert.equal(await page.evaluate('window.taskProgressTest.getSource()'), zeroSource);
		await page.emulateMedia({ forcedColors: 'none' });
		await page.evaluate('window.taskProgressTest.setSource("")');
		await page.waitForFunction(() => document.querySelectorAll('iframe').length > 0
			&& Array.from(document.querySelectorAll('iframe')).every(frame => frame.style.top === '-100000px'));
		await page.evaluate(() => {
			for (const frame of document.querySelectorAll('iframe')) {
				frame.contentDocument!.body.dataset.parked = 'true';
			}
		});
		await page.evaluate('window.taskProgressTest.setTheme("dark")');
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).every(frame =>
			frame.contentDocument?.body.dataset.parked === 'true'
			&& getComputedStyle(frame.contentDocument.body).color === 'rgb(204, 204, 204)'));
		await page.evaluate(`window.taskProgressTest.setSource(${JSON.stringify(zeroSource)})`);
		await page.waitForFunction(() => Array.from(document.querySelectorAll('iframe')).filter(frame =>
			frame.style.top !== '-100000px').length === 1);
		assert.ok(await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).every(frame =>
			frame.contentDocument?.body.dataset.parked === 'true')));
		await page.evaluate('window.taskProgressTest.dispose()');
		assert.deepEqual({ errors, guestRequests, iframeCount: await page.locator('iframe').count() }, { errors: [], guestRequests: [], iframeCount: 0 });
	} catch (error) {
		console.error('Task progress browser state:', await page.evaluate(`({
			source: window.taskProgressTest?.getSource(),
			frames: Array.from(document.querySelectorAll('iframe'), frame => ({
				summary: frame.contentDocument?.getElementById('summary')?.textContent,
				height: frame.getBoundingClientRect().height,
			})),
		})`), errors);
		throw error;
	} finally {
		await context.close();
		await rm('.task-progress-browser', { recursive: true });
	}
});
