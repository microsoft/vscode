/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function createChatPanel(container: HTMLElement) {
	const chatWrapper = document.createElement('div');
	chatWrapper.style.display = 'flex';
	chatWrapper.style.flexDirection = 'column';
	chatWrapper.style.height = '100%';
	chatWrapper.style.padding = '10px';
	chatWrapper.style.backgroundColor = '#1e1e1e';
	chatWrapper.style.color = '#ffffff';

	const messagesBox = document.createElement('div');
	messagesBox.style.flex = '1';
	messagesBox.style.overflowY = 'auto';
	messagesBox.style.border = '1px solid #444';
	messagesBox.style.padding = '10px';
	messagesBox.style.marginBottom = '10px';
	messagesBox.id = 'messagesBox';

	const inputBox = document.createElement('input');
	inputBox.type = 'text';
	inputBox.placeholder = 'Type your message...';
	inputBox.style.padding = '8px';
	inputBox.style.border = '1px solid #555';
	inputBox.style.backgroundColor = '#2d2d2d';
	inputBox.style.color = '#fff';

	const sendButton = document.createElement('button');
	sendButton.innerText = 'Send';
	sendButton.style.marginTop = '10px';
	sendButton.style.padding = '8px';
	sendButton.style.backgroundColor = '#007acc';
	sendButton.style.color = '#fff';
	sendButton.style.border = 'none';
	sendButton.style.cursor = 'pointer';

	sendButton.onclick = () => {
		const message = inputBox.value.trim();
		if (message) {
			const p = document.createElement('p');
			p.innerText = `You: ${message}`;
			messagesBox.appendChild(p);
			inputBox.value = '';
			messagesBox.scrollTop = messagesBox.scrollHeight;
		}
	};

	chatWrapper.appendChild(messagesBox);
	chatWrapper.appendChild(inputBox);
	chatWrapper.appendChild(sendButton);

	container.innerHTML = ''; // Clear if already anything
	container.appendChild(chatWrapper);
}
