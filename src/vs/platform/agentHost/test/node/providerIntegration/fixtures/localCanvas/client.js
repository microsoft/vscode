/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const query = location.search;
const events = new EventSource(`/events${query}`);
events.onmessage = event => {
	const state = JSON.parse(event.data);
	document.getElementById('document').textContent = state.documentId;
	document.getElementById('value').textContent = String(state.value);
	document.getElementById('interactions').textContent = String(state.interactions);
	document.getElementById('actions').textContent = String(state.actions);
	document.getElementById('error').textContent = '';
};
events.onerror = () => {
	document.getElementById('error').textContent = 'The document provider is unavailable.';
};
document.getElementById('increment').addEventListener('click', () => {
	void fetch(`/increment${query}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ amount: 1 }),
	}).then(async response => {
		if (!response.ok) {
			throw new Error(await response.text());
		}
		document.getElementById('error').textContent = '';
	}).catch(error => {
		document.getElementById('error').textContent = error.message;
	});
});
addEventListener('pagehide', () => events.close(), { once: true });
