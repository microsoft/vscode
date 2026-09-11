/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const query = location.search;

function renderDocument(state) {
	document.getElementById('document').textContent = state.documentId;
	document.getElementById('greetings').textContent = String(state.greetings);
	document.getElementById('last').textContent = state.lastGreeting ?? '(none yet)';
	document.getElementById('error').textContent = '';
}

const updates = new EventSource(`/events${query}`);
updates.addEventListener('message', event => renderDocument(JSON.parse(event.data)));
updates.addEventListener('error', () => {
	document.getElementById('error').textContent = 'Connection interrupted. Reconnecting to the canvas…';
});
window.addEventListener('pagehide', () => updates.close(), { once: true });

async function submitGreeting() {
	const message = document.getElementById('message').value;
	try {
		const response = await fetch(`/greet${query}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message }),
		});
		if (!response.ok) {
			throw new Error((await response.json()).error);
		}
		document.getElementById('message').value = '';
	} catch (error) {
		document.getElementById('error').textContent = error.message;
	}
}

document.getElementById('greet-form').addEventListener('submit', event => {
	event.preventDefault();
	void submitGreeting();
});
