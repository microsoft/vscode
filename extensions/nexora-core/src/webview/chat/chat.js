/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* global acquireVsCodeApi */
(function () {
	const vscode = acquireVsCodeApi();

	const initial = (window.__NEXORA_INITIAL_STATE__ || { connected: false, auth: { github: false, vercel: false } });

	const messages = document.getElementById('messages');
	const input = document.getElementById('input');
	const send = document.getElementById('send');
	const generate = document.getElementById('generate');
	const deploy = document.getElementById('deploy');
	const connector = document.getElementById('connector');
	const statusDot = document.getElementById('statusDot');
	const statusText = document.getElementById('statusText');
	const githubBadge = document.getElementById('githubBadge');
	const vercelBadge = document.getElementById('vercelBadge');
	const welcome = document.getElementById('welcome');

	let lastLoadingMessage = null;

	function updateStatus(connected) {
		statusDot.classList.remove('nx-dotOk', 'nx-dotBad');
		if (connected) {
			statusDot.classList.add('nx-dotOk');
			statusText.textContent = 'Backend connected';
		} else {
			statusDot.classList.add('nx-dotBad');
			statusText.textContent = 'Backend disconnected';
		}
	}

	function updateAuthStatus(github, vercel) {
		githubBadge.classList.toggle('nx-connected', !!github);
		githubBadge.title = github ? 'GitHub connected' : 'Click to connect GitHub';

		vercelBadge.classList.toggle('nx-connected', !!vercel);
		vercelBadge.title = vercel ? 'Vercel connected' : 'Click to connect Vercel';
	}

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = String(text);
		return div.innerHTML;
	}

	function formatContent(content) {
		let html = escapeHtml(content);

		const codeBlockRegex = /```([\s\S]*?)```/g;
		html = html.replace(codeBlockRegex, function (_match, code) {
			const trimmed = String(code).trim();
			const copyId = 'code-' + Math.random().toString(36).slice(2, 11);
			return (
				'<div class="nx-codeHeader">' +
				'<span class="nx-codeTitle">Code</span>' +
				'<button class="nx-copyBtn" data-copy-target="' + copyId + '">Copy</button>' +
				'</div>' +
				'<pre class="nx-codeBlock" id="' + copyId + '">' +
				trimmed +
				'</pre>'
			);
		});

		html = html.replace(/`([^`]+)`/g, '<code class="nx-inlineCode">$1</code>');
		html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		html = html.replace(/\n/g, '<br/>');
		return html;
	}

	function addMessage(role, content, isLoading) {
		if (welcome) {
			welcome.remove();
		}

		if (isLoading && lastLoadingMessage) {
			lastLoadingMessage.remove();
		}

		const div = document.createElement('div');
		div.className = 'nx-msg ' + (role === 'user' ? 'nx-user' : 'nx-assistant') + (isLoading ? ' nx-msgLoading' : '');

		const header = document.createElement('div');
		header.className = 'nx-msgHeader';
		header.textContent = role === 'user' ? 'You' : 'Nexora';

		const body = document.createElement('div');
		body.className = 'nx-msgBody';

		if (isLoading) {
			body.textContent = content;
		} else {
			body.innerHTML = formatContent(content);
		}

		div.appendChild(header);
		div.appendChild(body);

		messages.appendChild(div);
		messages.scrollTop = messages.scrollHeight;

		if (isLoading) {
			lastLoadingMessage = div;
		} else if (lastLoadingMessage) {
			lastLoadingMessage.remove();
			lastLoadingMessage = null;
		}
	}

	function sendMessage() {
		const text = input.value.trim();
		if (!text) {
			return;
		}
		addMessage('user', text, false);
		vscode.postMessage({ type: 'sendMessage', message: text });
		input.value = '';
	}

	function generateCode() {
		const text = input.value.trim();
		if (!text) {
			return;
		}
		const selectedConnector = connector.value;
		addMessage('user', '[Generate] ' + text, false);
		vscode.postMessage({ type: 'generateCode', prompt: text, connector: selectedConnector });
		input.value = '';
	}

	function deployProject() {
		const text = input.value.trim();
		if (!text) {
			return;
		}
		const baseName = text.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 30);
		const timestamp = Date.now().toString().slice(-4);
		const repoName = 'nexora-' + baseName + '-' + timestamp;
		const projectName = repoName;

		addMessage('user', '[Deploy] ' + text, false);
		vscode.postMessage({
			type: 'deployProject',
			prompt: text,
			repoName: repoName,
			projectName: projectName
		});
		input.value = '';
	}

	send.onclick = sendMessage;
	generate.onclick = generateCode;
	deploy.onclick = deployProject;

	githubBadge.onclick = () => vscode.postMessage({ type: 'connectGitHub' });
	vercelBadge.onclick = () => vscode.postMessage({ type: 'connectVercel' });

	input.onkeypress = (e) => {
		if (e.key === 'Enter') {
			if (e.shiftKey) {
				generateCode();
			} else {
				sendMessage();
			}
		}
	};

	window.addEventListener('click', (e) => {
		const target = e.target;
		if (target && target.classList && target.classList.contains('nx-copyBtn')) {
			const id = target.getAttribute('data-copy-target');
			if (!id) {
				return;
			}
			const el = document.getElementById(id);
			if (!el) {
				return;
			}
			navigator.clipboard.writeText(el.textContent || '');
			const old = target.textContent;
			target.textContent = 'Copied';
			setTimeout(() => (target.textContent = old), 800);
		}
	});

	window.addEventListener('message', (e) => {
		if (!e || !e.data) {
			return;
		}
		if (e.data.type === 'addMessage') {
			addMessage(e.data.role, e.data.content, e.data.isLoading);
		} else if (e.data.type === 'backendStatus') {
			updateStatus(e.data.connected);
		} else if (e.data.type === 'authStatus') {
			updateAuthStatus(e.data.github, e.data.vercel);
		}
	});

	// Apply initial state immediately
	updateStatus(!!initial.connected);
	updateAuthStatus(!!initial.auth.github, !!initial.auth.vercel);

	// Request fresh state
	vscode.postMessage({ type: 'checkBackend' });
	vscode.postMessage({ type: 'checkAuthStatus' });
}());
