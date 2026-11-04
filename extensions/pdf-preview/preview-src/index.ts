/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AnnotationEditorType, AnnotationMode, getDocument, GlobalWorkerOptions, PasswordResponses, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist';
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import './index.css';

type ExtensionMessage =
	| { readonly type: 'load'; readonly data: Uint8Array }
	| { readonly type: 'message'; readonly text: string; readonly load?: number }
	| { readonly type: 'password'; readonly password: string; readonly load: number }
	| { readonly type: 'zoom'; readonly value: number | string }
	| { readonly type: 'goToPage'; readonly page: string }
	| { readonly type: 'goToSection'; readonly index: number }
	| { readonly type: 'find'; readonly query: string; readonly again: boolean; readonly previous: boolean }
	| { readonly type: 'findClose' };

type Destination = string | unknown[];

const vscode = acquireVsCodeApi<{ readonly location: string }>();
const assets = new URL('pdfjs/', import.meta.url).href;
const container = document.getElementById('viewerContainer') as HTMLDivElement;
const message = document.getElementById('message')!;

// The worker can't load files through the service worker of the webview, so start it from its
// source and let pdf.js load CMaps, fonts and image decoders on the page (`useWorkerFetch: false`)
const workerStarted = fetch(`${assets}pdf.worker.min.mjs`).then(response => response.text()).then(source => {
	GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })), { type: 'module' });
});

const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus });
const style = getComputedStyle(document.documentElement);
const viewer = new PDFViewer({
	container,
	eventBus,
	linkService,
	findController: new PDFFindController({ eventBus, linkService }),
	annotationMode: AnnotationMode.ENABLE,
	annotationEditorMode: AnnotationEditorType.DISABLE,
	imageResourcesPath: new URL('images/', import.meta.url).href,
	// Show documents in the colors of high contrast themes, like other editors
	pageColors: document.body.className.includes('vscode-high-contrast')
		? { background: style.getPropertyValue('--vscode-editor-background'), foreground: style.getPropertyValue('--vscode-editor-foreground') }
		: undefined,
});
linkService.setViewer(viewer);

let loadingTask: PDFDocumentLoadingTask | undefined;
let loads = Promise.resolve();
let latestLoad = 0;
let sectionDestinations: Destination[] = [];
let setPassword: ((password: string) => void) | undefined;

async function load(data: Uint8Array, id: number): Promise<void> {
	await workerStarted;
	// Documents share the worker, which pdf.js only allows once the previous document is destroyed
	await loadingTask?.destroy();
	if (id !== latestLoad) {
		return; // A newer version of the file arrived meanwhile
	}
	const task = loadingTask = getDocument({
		data,
		cMapUrl: `${assets}cmaps/`,
		standardFontDataUrl: `${assets}standard_fonts/`,
		wasmUrl: `${assets}wasm/`,
		useWorkerFetch: false,
		enableXfa: false,
	});
	task.onPassword = (callback: (password: string) => void, reason: number) => {
		setPassword = callback;
		vscode.postMessage({ type: 'password', incorrect: reason === PasswordResponses.INCORRECT_PASSWORD, load: id });
	};

	try {
		const pdfDocument = await task.promise;
		// Restore the position after a reload or after the editor was hidden
		const location = vscode.getState()?.location;
		eventBus.on('pagesinit', () => {
			viewer.currentScaleValue = 'auto';
			if (location) {
				// The new version of the file may have fewer pages
				linkService.setHash(location.replace(/^page=\d+/, page => `page=${Math.min(Number(page.slice(5)), pdfDocument.numPages)}`));
			}
		}, { once: true });
		viewer.setDocument(pdfDocument);
		linkService.setDocument(pdfDocument);
		message.textContent = '';

		const [pageLabels, sections] = await Promise.all([pdfDocument.getPageLabels(), getSections(pdfDocument)]);
		viewer.setPageLabels(pageLabels);
		sectionDestinations = sections.map(section => section.destination);
		vscode.postMessage({ type: 'loaded', pageCount: pdfDocument.numPages, pageLabels, outline: sections.map(({ title, level, page }) => ({ title, level, page })) });
	} catch {
		// Unless a newer document replaced this one
		if (!task.destroyed) {
			vscode.postMessage({ type: 'error' });
		}
	}
}

/**
 * Returns the sections of the outline of `pdfDocument` that point to a place in the document.
 */
async function getSections(pdfDocument: PDFDocumentProxy) {
	const sections: { title: string; level: number; destination: Destination }[] = [];
	const visit = (items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>> | null, level: number) => {
		for (const item of items ?? []) {
			if (item.dest) {
				sections.push({ title: item.title, level, destination: item.dest });
			}
			visit(item.items, level + 1);
		}
	};
	visit(await pdfDocument.getOutline(), 0);
	return Promise.all(sections.map(async section => ({ ...section, page: await getPageNumber(pdfDocument, section.destination).catch(() => undefined) })));
}

async function getPageNumber(pdfDocument: PDFDocumentProxy, destination: Destination): Promise<number> {
	const [page] = (typeof destination === 'string' ? await pdfDocument.getDestination(destination) : destination) ?? [];
	return typeof page === 'number' ? page + 1 : await pdfDocument.getPageIndex(page as Parameters<PDFDocumentProxy['getPageIndex']>[0]) + 1;
}

eventBus.on('updateviewarea', ({ location }: { location: { pageNumber: number; pdfOpenParams: string } }) => {
	vscode.setState({ location: location.pdfOpenParams.slice(1) });
	vscode.postMessage({ type: 'view', page: location.pageNumber, scale: viewer.currentScale });
});
for (const event of ['updatefindmatchescount', 'updatefindcontrolstate']) {
	eventBus.on(event, ({ matchesCount }: { matchesCount: { current: number; total: number } }) => vscode.postMessage({ type: 'find', ...matchesCount }));
}

window.addEventListener('message', ({ data }: MessageEvent<ExtensionMessage>) => {
	switch (data.type) {
		case 'load': {
			const id = ++latestLoad;
			// A document that waits for its password would hold up the next one
			void loadingTask?.destroy();
			loads = loads.then(() => load(data.data, id)).catch(() => vscode.postMessage({ type: 'error' }));
			break;
		}
		case 'message':
			if (data.load === undefined || data.load === latestLoad) {
				message.textContent = data.text;
			}
			break;
		case 'password':
			if (data.load === latestLoad) {
				setPassword?.(data.password);
			}
			break;
		case 'zoom':
			if (typeof data.value === 'number') {
				viewer.updateScale({ steps: data.value });
			} else {
				viewer.currentScaleValue = data.value;
			}
			break;
		case 'goToPage':
			viewer.currentPageLabel = data.page;
			break;
		case 'goToSection':
			void linkService.goToDestination(sectionDestinations[data.index]);
			break;
		case 'find':
			eventBus.dispatch('find', { source: null, type: data.again ? 'again' : '', query: data.query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: data.previous, matchDiacritics: false });
			break;
		case 'findClose':
			eventBus.dispatch('findbarclose', { source: null });
			break;
	}
});

// Zoom with Ctrl or Cmd and the mouse wheel, which is also what pinching on a trackpad sends
container.addEventListener('wheel', event => {
	if (event.ctrlKey || event.metaKey) {
		event.preventDefault();
		viewer.updateScale({ scaleFactor: Math.exp(-Math.max(-25, Math.min(25, event.deltaY)) / 100), origin: [event.clientX, event.clientY], drawingDelay: 400 });
	}
}, { passive: false });

// Fit the pages to the editor again when it is resized
window.addEventListener('resize', () => {
	const scale = viewer.currentScaleValue;
	if (scale === 'auto' || scale === 'page-width' || scale === 'page-fit') {
		viewer.currentScaleValue = scale;
	}
	viewer.update();
});

// Keyboard navigation scrolls the focused element, so move focus from the webview to the document
window.addEventListener('focus', () => container.focus());

vscode.postMessage({ type: 'ready' });
