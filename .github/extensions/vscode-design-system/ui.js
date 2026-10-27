/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const node = (tag, text, className) => {
	const element = document.createElement(tag);
	if (text !== undefined) {
		element.textContent = text;
	}
	if (className) {
		element.className = className;
	}
	return element;
};

export function sourceLink(source, label = 'View source') {
	const link = node('a', label);
	link.href = `/source?file=${encodeURIComponent(source.file)}#L${source.line ?? 1}`;
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	link.setAttribute('aria-label', `${label}: ${source.file}, line ${source.line ?? 1} (opens in a new tab)`);
	return link;
}

export function card(title, text) {
	const item = node('article', undefined, 'card');
	item.append(node('h3', title), node('p', text, 'muted'));
	return item;
}

export function problem(error) {
	const target = document.querySelector('#problem');
	target.hidden = false;
	target.textContent = `${error.message}. Use Reload sources to retry.`;
}

export async function request(url, options) {
	const response = await fetch(url, options);
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return response.json();
}

export async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		const status = document.querySelector('#status');
		status.hidden = false;
		status.textContent = `Copied ${text}`;
	} catch (error) {
		problem(new Error(`Couldn't copy: ${error.message}. Select the visible text to copy it`));
	}
}
