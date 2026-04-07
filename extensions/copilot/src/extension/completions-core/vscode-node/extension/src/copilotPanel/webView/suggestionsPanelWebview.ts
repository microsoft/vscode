/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { provideVSCodeDesignSystem, vsCodeButton } from '@vscode/webview-ui-toolkit';
import DOMPurify from 'dompurify';

const solutionsContainer = document.getElementById('solutionsContainer');
const vscode = acquireVsCodeApi();
let currentFocusIndex: number = 0;
let solutionEventHandlersInitialized = false;

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
		solutionsContainer.innerHTML = message.solutions
			.map((solution, index) => {
				const renderedCitation = solution.citation
					? `<p>
						<span style="vertical-align: text-bottom" aria-hidden="true">Warning</span>
						${DOMPurify.sanitize(solution.citation.message)}
						<a href="${DOMPurify.sanitize(solution.citation.url)}" target="_blank">Inspect source code</a>
					  </p>`
					: '';
				const sanitizedSnippet = DOMPurify.sanitize(solution.htmlSnippet);

				return `<h3 class='solutionHeading' id="solution-${index + 1}-heading">Suggestion ${index + 1}</h3>
				<div class='snippetContainer' aria-labelledby="solution-${index + 1}-heading" role="group" data-solution-index="${index}">${sanitizedSnippet
					}</div>
				${DOMPurify.sanitize(renderedCitation)}
				<vscode-button role="button" class="acceptButton" id="acceptButton${index}" appearance="secondary" data-solution-index="${index}">Accept suggestion ${index + 1
					}</vscode-button>`;
			})
			.join('');
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

