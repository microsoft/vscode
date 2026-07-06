/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// <reference types="@types/vscode-webview" />
import { provideVSCodeDesignSystem, vsCodeButton } from '@vscode/webview-ui-toolkit';

interface SanitizableHTMLElement extends HTMLElement {
	setHTML(html: string, options: { readonly sanitizer: Sanitizer | SanitizerConfig | SanitizerPresets }): void;
}

const solutionsContainer = document.getElementById('solutionsContainer');
const vscode = acquireVsCodeApi();
let currentFocusIndex: number = 0;
let solutionEventHandlersInitialized = false;

const snippetSanitizerElements: SanitizerElementWithAttributes[] = [
	{ name: 'pre', attributes: ['class', 'style', 'tabindex'] },
	{ name: 'code' },
	{ name: 'span', attributes: ['class', 'style'] },
];

provideVSCodeDesignSystem().register(vsCodeButton());

type Message = {
	command: string;
	solutions: {
		htmlSnippet: string;
		citation?: {
			message: string;
			url: string;
		};
	}[];
	percentage: number;
};

window.addEventListener('DOMContentLoaded', () => {
	// Notify the extension that the webview is ready
	vscode.postMessage({ command: 'webviewReady' });
	initializeSolutionEventHandlers();
});

window.addEventListener('message', (event) => {
	const message = event.data as Message; // The JSON data our extension sent

	switch (message.command) {
		case 'solutionsUpdated':
			handleSolutionUpdate(message);
			break;
		case 'navigatePreviousSolution':
			navigatePreviousSolution();
			break;
		case 'navigateNextSolution':
			navigateNextSolution();
			break;
	}
});

function handleSolutionUpdate(message: Message) {
	updateLoadingContainer(message);

	if (solutionsContainer) {
		solutionsContainer.replaceChildren(...message.solutions.flatMap((solution, index) => createSolutionElements(solution, index)));
	}
}

function createSolutionElements(solution: Message['solutions'][number], index: number): HTMLElement[] {
	const solutionNumber = index + 1;
	const heading = document.createElement('h3');
	heading.className = 'solutionHeading';
	heading.id = `solution-${solutionNumber}-heading`;
	heading.textContent = `Suggestion ${solutionNumber}`;

	const snippetContainer = document.createElement('div');
	snippetContainer.className = 'snippetContainer';
	snippetContainer.setAttribute('aria-labelledby', heading.id);
	snippetContainer.setAttribute('role', 'group');
	snippetContainer.dataset.solutionIndex = String(index);
	setSnippetHtml(snippetContainer, solution.htmlSnippet);

	const acceptButton = document.createElement('vscode-button');
	acceptButton.setAttribute('role', 'button');
	acceptButton.className = 'acceptButton';
	acceptButton.id = `acceptButton${index}`;
	acceptButton.setAttribute('appearance', 'secondary');
	acceptButton.dataset.solutionIndex = String(index);
	acceptButton.textContent = `Accept suggestion ${solutionNumber}`;

	const elements: HTMLElement[] = [heading, snippetContainer];
	const citation = solution.citation ? createCitationElement(solution.citation) : undefined;
	if (citation) {
		elements.push(citation);
	}
	elements.push(acceptButton);
	return elements;
}

function setSnippetHtml(element: HTMLElement, html: string): void {
	const sanitizerElement = element as unknown as SanitizableHTMLElement;
	sanitizerElement.setHTML(html, { sanitizer: getSnippetSanitizer() });
}

let snippetSanitizer: Sanitizer | undefined;
function getSnippetSanitizer(): Sanitizer {
	return snippetSanitizer ??= new Sanitizer({
		elements: snippetSanitizerElements,
	});
}

function createCitationElement(citation: NonNullable<Message['solutions'][number]['citation']>): HTMLElement {
	const paragraph = document.createElement('p');

	const warning = document.createElement('span');
	warning.style.verticalAlign = 'text-bottom';
	warning.setAttribute('aria-hidden', 'true');
	warning.textContent = 'Warning';
	paragraph.append(warning, ' ', citation.message, ' ');

	const trustedUrl = getTrustedCitationUrl(citation.url);
	if (trustedUrl) {
		const link = document.createElement('a');
		link.href = trustedUrl;
		link.target = '_blank';
		link.rel = 'noreferrer noopener';
		link.textContent = 'Inspect source code';
		paragraph.append(link);
	}

	return paragraph;
}

function getTrustedCitationUrl(url: string): string | undefined {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.protocol === 'https:' ? parsedUrl.href : undefined;
	} catch {
		return undefined;
	}
}

function navigatePreviousSolution() {
	const snippets = document.querySelectorAll<HTMLElement>('.snippetContainer pre');
	const prevIndex = currentFocusIndex - 1;

	snippets[prevIndex]?.focus();
}

function navigateNextSolution() {
	const snippets = document.querySelectorAll<HTMLElement>('.snippetContainer pre');
	const nextIndex = (currentFocusIndex ?? -1) + 1;

	if (snippets[nextIndex]) {
		snippets[nextIndex].focus();
	} else if (snippets[0]) {
		snippets[0].focus();
	}
}

function updateLoadingContainer(message: Message) {
	const progressBar = document.getElementById('progress-bar') as HTMLProgressElement;
	const loadingContainer = document.getElementById('loadingContainer') as HTMLDivElement;
	if (!progressBar || !loadingContainer) {
		return;
	}
	if (message.percentage >= 100) {
		loadingContainer.innerHTML = `${message.solutions.length} Suggestions`;
	} else {
		const loadingLabelElement = loadingContainer.querySelector('label') as HTMLLabelElement;
		if (loadingLabelElement.textContent !== 'Loading suggestions:\u00A0') {
			loadingLabelElement.textContent = 'Loading suggestions:\u00A0';
		}
		progressBar.value = message.percentage;
	}
}


function initializeSolutionEventHandlers(): void {
	if (solutionEventHandlersInitialized || solutionsContainer === null) {
		return;
	}
	solutionsContainer.addEventListener('focusin', (event) => {
		const target = event.target as HTMLElement | null;
		const index = extractSolutionIndex(target);
		if (index === undefined) {
			return;
		}
		handleFocus(index);
	});
	solutionsContainer.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		const button = target?.closest('vscode-button[data-solution-index]');
		if (!(button instanceof HTMLElement)) {
			return;
		}
		const index = extractSolutionIndex(button);
		if (index === undefined) {
			return;
		}
		handleClick(index);
	});
	solutionEventHandlersInitialized = true;
}

function extractSolutionIndex(element: HTMLElement | null): number | undefined {
	const solutionElement = element?.closest('[data-solution-index]');
	if (!(solutionElement instanceof HTMLElement)) {
		return undefined;
	}
	const attributeValue = solutionElement.getAttribute('data-solution-index');
	if (attributeValue === null) {
		return undefined;
	}
	const index = Number.parseInt(attributeValue, 10);
	return Number.isNaN(index) ? undefined : index;
}

function handleFocus(index: number) {
	currentFocusIndex = index;
	vscode.postMessage({
		command: 'focusSolution',
		solutionIndex: index,
	});
}

function handleClick(index: number) {
	vscode.postMessage({
		command: 'acceptSolution',
		solutionIndex: index,
	});
}

