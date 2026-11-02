/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Hosts the Mermaid code block editor the way the Markdown editor does: a web editor protocol host, theme
// CSS injected into the page's head, and a frame sized to the reported height.
// Run with `node --test scripts/markdownEditor.browser.test.mts` from this extension's directory.

import assert from 'node:assert/strict';
import path from 'node:path';
import { it } from 'node:test';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import { renderMermaidEditorHtml } from '../src/markdownEditor/editorHtml.ts';

const extensionDir = path.join(import.meta.dirname, '..');

const themes = {
	light: '--vscode-editor-background: #ffffff; --vscode-editorWidget-background: #f8f8f8; --vscode-editor-foreground: #3b3b3b; --vscode-chart-line: #ff0000; --vscode-errorForeground: #f85149; color-scheme: light;',
	dark: '--vscode-editor-background: #1f1f1f; --vscode-editorWidget-background: #202020; --vscode-editor-foreground: #cccccc; --vscode-chart-line: #ff0000; --vscode-errorForeground: #f85149; color-scheme: dark;',
};

it('renders diagrams at their natural size in the VS Code theme, and follows edits, theme changes, and errors', async () => {
	const build = (contents: string) => esbuild.build({
		stdin: { contents, resolveDir: extensionDir, loader: 'ts' },
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		loader: { '.ttf': 'dataurl', '.css': 'text' },
	});
	const [guest, host] = await Promise.all([
		build(`import './preview-src/markdownEditor/index';`),
		build(`
			import { HubRpcConnection, WindowMessageTransport } from '@vscode/hubrpc/web';
			import { WebEditorHost } from '@vscode/web-editors';
			const frame = document.querySelector('iframe');
			const host = new WebEditorHost({
				connection: HubRpcConnection.fromTransport(new WindowMessageTransport(window, frame.contentWindow, true)),
				initialText: 'flowchart LR\\n A[First] --> B[Second]',
			});
			const reportedHeights = [];
			host.onDidReportSize(({ height }) => { reportedHeights.push(height); frame.style.height = height + 'px'; });
			window.mermaidTest = { setText: text => host.setText(text), reportedHeights };
		`),
	]);
	const editorHtml = renderMermaidEditorHtml('').replace('<head>', `<head><style data-theme>html:root { ${themes.light} }</style>`);

	const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.route('https://mermaid.test/**', route => {
			const url = route.request().url();
			const body = url.endsWith('/editor/index.html') ? editorHtml
				: url.endsWith('/editor/index.js') ? guest.outputFiles[0].text
					: url.endsWith('/host.js') ? host.outputFiles[0].text
						: `<html><body style="margin: 0"><iframe src="/editor/index.html" style="width: 800px; height: 150px; border: none; display: block"></iframe><script type="module" src="/host.js"></script></body></html>`;
			return route.fulfill({ contentType: url.endsWith('.js') ? 'text/javascript' : 'text/html', body });
		});
		await page.goto('https://mermaid.test/');
		const frame = page.frames().find(f => f.url().endsWith('/editor/index.html'))!;
		const nodeFill = () => frame.locator('.node rect').first().evaluate(rect => getComputedStyle(rect).fill);
		await frame.locator('svg').filter({ hasText: 'First' }).waitFor();

		// Natural size: a small diagram stays narrower than the frame, and the frame follows its height without scrolling.
		await page.waitForFunction(() => window.mermaidTest.reportedHeights.length > 0);
		const layout = await frame.evaluate(() => ({
			svgWidth: document.querySelector('svg')!.getBoundingClientRect().width,
			frameWidth: document.documentElement.clientWidth,
			frameHeight: document.documentElement.clientHeight,
			svgHeight: document.querySelector('svg')!.getBoundingClientRect().height,
			scrolls: document.body.scrollHeight > document.body.clientHeight,
		}));
		assert.ok(layout.svgWidth < layout.frameWidth, JSON.stringify(layout));
		assert.ok(Math.abs(layout.frameHeight - layout.svgHeight) < 1, JSON.stringify(layout));
		assert.equal(layout.scrolls, false);

		// The VS Code theme mapping: nodes use the widget background, and a theme change renders again.
		assert.equal(await nodeFill(), 'rgb(248, 248, 248)');
		await frame.evaluate(css => { document.querySelector('style[data-theme]')!.textContent = `html:root { ${css} }`; }, themes.dark);
		await frame.waitForFunction(() => getComputedStyle(document.querySelector('.node rect')!).fill === 'rgb(32, 32, 32)');
		assert.equal(await frame.evaluate(() => document.body.classList.contains('vscode-dark')), true);

		await page.evaluate(() => window.mermaidTest.setText('flowchart LR\n A[Updated] --> B[Second]'));
		await frame.locator('svg').filter({ hasText: 'Updated' }).waitFor();
		await page.evaluate(() => window.mermaidTest.setText('not a diagram'));
		await frame.getByRole('alert').waitFor();
		assert.match(await frame.getByRole('alert').textContent() ?? '', /\S/);
		await page.evaluate(() => window.mermaidTest.setText('flowchart LR\n A[Recovered] --> B[Second]'));
		await frame.locator('svg').filter({ hasText: 'Recovered' }).waitFor();

		// Subgraph titles stay centered unless an edge crosses them there, so the title of a subgraph whose
		// edge enters at its top center moves to the top left. A subgraph narrower than its title is widened
		// to keep the title off its sides.
		await page.evaluate(() => window.mermaidTest.setText('flowchart TD\n A[Source] --> B\n A --> D\n A --> E\n subgraph Webview\n  B[Layout graph] --> C[Render SVG]\n end\n subgraph Children\n  D[Left child]\n  E[Right child]\n end\n subgraph Long[A subgraph title that is much wider than its content]\n  F[Step]\n end'));
		await frame.locator('svg').filter({ hasText: 'Children' }).waitFor();
		const subgraphTitles = await frame.evaluate(() => {
			const measure = (name: string) => {
				const cluster = [...document.querySelectorAll('g.cluster')].find(cluster => cluster.querySelector('.cluster-label')!.textContent!.trim().startsWith(name))!;
				const rect = cluster.querySelector('rect')!;
				const box = rect.getBoundingClientRect();
				const title = cluster.querySelector('.cluster-label foreignObject')!.getBoundingClientRect();
				const scale = box.width / rect.width.baseVal.value;
				const crossedByEdge = [...document.querySelectorAll<SVGPathElement>('.edgePaths path')].some(path => {
					const toScreen = path.getScreenCTM()!;
					for (let length = 0; length <= path.getTotalLength(); length++) {
						const point = path.getPointAtLength(length).matrixTransform(toScreen);
						if (point.x >= title.left && point.x <= title.right && point.y >= title.top && point.y <= title.bottom) {
							return true;
						}
					}
					return false;
				});
				return { insetLeft: Math.round((title.left - box.left) / scale), insetRight: Math.round((box.right - title.right) / scale), insetTop: Math.round((title.top - box.top) / scale), crossedByEdge };
			};
			const [webview, children, long] = ['Webview', 'Children', 'A subgraph title'].map(measure);
			return {
				webview: { insetLeft: webview.insetLeft, insetTop: webview.insetTop, crossedByEdge: webview.crossedByEdge },
				children: { centered: Math.abs(children.insetLeft - children.insetRight) <= 1, crossedByEdge: children.crossedByEdge },
				long: { insetLeft: long.insetLeft, insetRight: long.insetRight },
			};
		});
		assert.deepEqual(subgraphTitles, {
			webview: { insetLeft: 12, insetTop: 8, crossedByEdge: false },
			children: { centered: true, crossedByEdge: false },
			long: { insetLeft: 12, insetRight: 12 },
		});

		// An edge that cannot avoid a title passes behind it: no pixel of the (red) edge shows over the title's
		// text where the edge crosses it, while the edge's arrowhead below the title stays whole.
		await page.evaluate(() => window.mermaidTest.setText('flowchart TD\n A[Source] --> B\n subgraph Long[A subgraph title that is much wider than its content]\n  B[Step]\n end'));
		await frame.locator('svg').filter({ hasText: 'much wider' }).waitFor();
		const crossing = await frame.evaluate(() => {
			const title = document.querySelector('.cluster-label foreignObject')!.getBoundingClientRect();
			const path = document.querySelector<SVGPathElement>('.edgePaths path')!;
			const toScreen = path.getScreenCTM()!;
			const middle = (title.top + title.bottom) / 2;
			let closest = { distance: Infinity, x: 0 };
			for (let length = 0; length <= path.getTotalLength(); length++) {
				const point = path.getPointAtLength(length).matrixTransform(toScreen);
				if (Math.abs(point.y - middle) < closest.distance) {
					closest = { distance: Math.abs(point.y - middle), x: point.x };
				}
			}
			const x = Math.round(closest.x) - 2;
			const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(toScreen);
			return {
				text: { x, y: Math.round(title.top) + 4, width: 5, height: Math.round(title.height) - 8 },
				aboveTitle: { x, y: Math.round(title.top) - 16, width: 5, height: 4 },
				arrowhead: { x: Math.round(end.x) - 2, y: Math.round(end.y) + 1, width: 5, height: 2 },
			};
		});
		const countRedPixels = async (clip: { x: number; y: number; width: number; height: number }) => page.evaluate(async base64 => {
			const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
			const context = new OffscreenCanvas(image.width, image.height).getContext('2d')!;
			context.drawImage(image, 0, 0);
			const { data } = context.getImageData(0, 0, image.width, image.height);
			let count = 0;
			for (let i = 0; i < data.length; i += 4) {
				count += data[i] - Math.max(data[i + 1], data[i + 2]) > 40 ? 1 : 0;
			}
			return count;
		}, (await page.screenshot({ clip })).toString('base64'));
		assert.deepEqual({
			edgeOverText: await countRedPixels(crossing.text) > 0,
			edgeAboveTitle: await countRedPixels(crossing.aboveTitle) > 0,
			arrowhead: await countRedPixels(crossing.arrowhead) > 0,
		}, { edgeOverText: false, edgeAboveTitle: true, arrowhead: true });

		// Class diagram namespaces get the same treatment as subgraphs. The edge entering this one runs just
		// inside the left-aligned position, so the title moves a little closer to the border instead.
		await page.evaluate(() => window.mermaidTest.setText('classDiagram\n namespace Rendering {\n  class Renderer\n }\n Client --> Renderer'));
		await frame.locator('svg').filter({ hasText: 'Rendering' }).waitFor();
		const namespaceTitle = await frame.evaluate(() => {
			const cluster = document.querySelector('g.cluster')!;
			const rect = cluster.querySelector('rect')!;
			const box = rect.getBoundingClientRect();
			const title = cluster.querySelector('.cluster-label foreignObject')!.getBoundingClientRect();
			const scale = box.width / rect.width.baseVal.value;
			const path = document.querySelector<SVGPathElement>('.edgePaths path')!;
			const toScreen = path.getScreenCTM()!;
			let crossedByEdge = false;
			for (let length = 0; length <= path.getTotalLength(); length++) {
				const point = path.getPointAtLength(length).matrixTransform(toScreen);
				crossedByEdge ||= point.x >= title.left && point.x <= title.right && point.y >= title.top && point.y <= title.bottom;
			}
			const insetLeft = (title.left - box.left) / scale;
			return { nearLeft: insetLeft >= 4 && insetLeft <= 12, insetTop: Math.round((title.top - box.top) / scale), crossedByEdge };
		});
		assert.deepEqual(namespaceTitle, { nearLeft: true, insetTop: 8, crossedByEdge: false });

		// A subgraph that edges attach to keeps its sides, so the edges still end at its border rather than
		// inside it, even though its title is wider than its content.
		await page.evaluate(() => window.mermaidTest.setText('flowchart LR\n A[Source] --> S\n subgraph S[A subgraph title wider than its content]\n  B[Step]\n end\n S --> C[Next]'));
		await frame.locator('svg').filter({ hasText: 'wider than its content' }).waitFor();
		const attachedEdges = await frame.evaluate(() => {
			const box = document.querySelector('g.cluster rect')!.getBoundingClientRect();
			const endpoint = (id: string, atEnd: boolean) => {
				const path = document.querySelector<SVGPathElement>(`.edgePaths path[id$="-${id}"]`)!;
				return path.getPointAtLength(atEnd ? path.getTotalLength() : 0).matrixTransform(path.getScreenCTM()!);
			};
			return { incomingEndsOutside: endpoint('L_A_S_0', true).x <= box.left + 0.5, outgoingStartsOutside: endpoint('L_S_C_0', false).x >= box.right - 0.5 };
		});
		assert.deepEqual(attachedEdges, { incomingEndsOutside: true, outgoingStartsOutside: true });
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
	}
});

it('keeps subgraph titles clear of SVG text edge labels', async () => {
	// No Mermaid layout reliably puts an edge label in a title's band, so place titles on a minimal diagram
	// shaped like Mermaid's output with `htmlLabels: false`: an edge label behind the centered title.
	const placement = await esbuild.build({
		stdin: { contents: `import { placeSubgraphTitles } from './preview-src/shared/subgraphTitles'; window.placeSubgraphTitles = placeSubgraphTitles;`, resolveDir: extensionDir, loader: 'ts' },
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
	});
	const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent(`<svg id="diagram" aria-roledescription="flowchart-v2" viewBox="0 0 216 116" xmlns="http://www.w3.org/2000/svg">
			<g class="cluster"><rect x="8" y="8" width="200" height="100"></rect><g class="cluster-label" transform="translate(78, 16)"><foreignObject width="60" height="20"></foreignObject></g></g>
			<g class="edgePaths"></g>
			<g class="edgeLabel" transform="translate(108, 26)"><g class="label"><rect class="background" x="-20" y="-10" width="40" height="20"></rect><text>Label</text></g></g>
		</svg>`);
		await page.addScriptTag({ content: placement.outputFiles[0].text });
		const result = await page.evaluate(() => {
			const svg = document.querySelector('svg')!;
			const changed = window.placeSubgraphTitles(svg);
			return { changed, transform: svg.querySelector('.cluster-label')!.getAttribute('transform') };
		});
		assert.deepEqual(result, { changed: true, transform: 'translate(20, 16)' });
	} finally {
		await browser.close();
	}
});

declare global {
	interface Window {
		mermaidTest: { setText(text: string): void; reportedHeights: number[] };
		placeSubgraphTitles(svg: SVGSVGElement): boolean;
	}
}
