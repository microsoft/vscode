/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns the HTML for the mobile-friendly remote control web client.
 * This is served as a single-page app by the HTTP server.
 */
export function getRemoteControlWebClientHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="VS Code Remote">
<title>VS Code Remote Control</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	background: #1e1e1e; color: #cccccc;
	min-height: 100vh; padding: 16px;
}
.header {
	text-align: center; padding: 16px 0 24px;
	border-bottom: 1px solid #333;
	margin-bottom: 16px;
}
.header h1 { font-size: 20px; color: #fff; font-weight: 600; }
.header .status {
	font-size: 13px; margin-top: 8px; color: #888;
}
.header .status.connected { color: #4ec9b0; }
.empty {
	text-align: center; padding: 48px 16px;
	color: #666; font-size: 15px;
}
.empty .icon { font-size: 48px; margin-bottom: 16px; }
.card {
	background: #252526; border: 1px solid #333; border-radius: 8px;
	margin-bottom: 12px; overflow: hidden;
}
.card-header {
	padding: 12px 16px; border-bottom: 1px solid #333;
	display: flex; align-items: center; gap: 8px;
}
.card-header .badge {
	background: #f0c674; color: #1e1e1e; font-size: 11px;
	padding: 2px 8px; border-radius: 10px; font-weight: 600;
}
.card-header .title {
	font-size: 14px; color: #ddd; flex: 1;
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.card-header .time { font-size: 12px; color: #666; }
.card-body { padding: 12px 16px; }
.card-body .label { font-size: 11px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
.card-body .command {
	background: #1e1e1e; border: 1px solid #444; border-radius: 4px;
	padding: 10px 12px; font-family: 'SF Mono', 'Cascadia Code', Consolas, monospace;
	font-size: 13px; color: #ce9178; word-break: break-all;
	margin-bottom: 8px; white-space: pre-wrap;
}
.card-body .cwd {
	font-size: 12px; color: #888; margin-bottom: 12px;
}
.card-actions {
	display: flex; gap: 8px; padding: 0 16px 12px;
}
.btn {
	flex: 1; padding: 12px; border: none; border-radius: 6px;
	font-size: 15px; font-weight: 600; cursor: pointer;
	transition: opacity 0.15s;
}
.btn:active { opacity: 0.7; }
.btn.approve { background: #388a34; color: #fff; }
.btn.deny { background: #c72e2e; color: #fff; }
.btn:disabled { opacity: 0.4; cursor: default; }
.history { margin-top: 24px; }
.history h2 {
	font-size: 14px; color: #888; padding-bottom: 8px;
	border-bottom: 1px solid #333; margin-bottom: 12px;
}
.history-item {
	padding: 8px 12px; background: #252526; border-radius: 6px;
	margin-bottom: 6px; font-size: 13px; display: flex;
	align-items: center; gap: 8px;
}
.history-item .result { font-size: 18px; }
.history-item .cmd {
	flex: 1; font-family: monospace; color: #999;
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
</style>
</head>
<body>
<div class="header">
	<h1>VS Code Remote Control</h1>
	<div class="status" id="status">Connecting...</div>
</div>
<div id="pending"></div>
<div id="history-section" class="history" style="display:none">
	<h2>Recent</h2>
	<div id="history"></div>
</div>
<script>
(function() {
	const pendingEl = document.getElementById('pending');
	const historyEl = document.getElementById('history');
	const historySectionEl = document.getElementById('history-section');
	const statusEl = document.getElementById('status');
	const history = [];
	let pendingConfirmations = [];
	let responding = {};

	function timeAgo(ts) {
		const s = Math.floor((Date.now() - ts) / 1000);
		if (s < 5) return 'just now';
		if (s < 60) return s + 's ago';
		return Math.floor(s / 60) + 'm ago';
	}

	function render() {
		if (pendingConfirmations.length === 0) {
			pendingEl.innerHTML = '<div class="empty"><div class="icon">&#x2615;</div>No pending approvals.<br>The agent will ask when it needs you.</div>';
		} else {
			pendingEl.innerHTML = pendingConfirmations.map(c => {
				const disabled = responding[c.toolCallId] ? 'disabled' : '';
				return '<div class="card">'
					+ '<div class="card-header">'
					+ '<span class="badge">Needs Approval</span>'
					+ '<span class="title">' + esc(c.title) + '</span>'
					+ '<span class="time">' + timeAgo(c.timestamp) + '</span>'
					+ '</div>'
					+ '<div class="card-body">'
					+ '<div class="label">Command</div>'
					+ '<div class="command">' + esc(c.command) + '</div>'
					+ '<div class="cwd">in ' + esc(c.cwd) + '</div>'
					+ '</div>'
					+ '<div class="card-actions">'
					+ '<button class="btn approve" ' + disabled + ' onclick="approve(\\'' + esc(c.toolCallId) + '\\')">Approve</button>'
					+ '<button class="btn deny" ' + disabled + ' onclick="deny(\\'' + esc(c.toolCallId) + '\\')">Deny</button>'
					+ '</div>'
					+ '</div>';
			}).join('');
		}
		if (history.length > 0) {
			historySectionEl.style.display = '';
			historyEl.innerHTML = history.slice().reverse().map(h =>
				'<div class="history-item">'
				+ '<span class="result">' + (h.approved ? '&#x2705;' : '&#x274C;') + '</span>'
				+ '<span class="cmd">' + esc(h.command) + '</span>'
				+ '</div>'
			).join('');
		}
	}

	function esc(s) {
		const d = document.createElement('div');
		d.textContent = s || '';
		return d.innerHTML;
	}

	window.approve = function(id) {
		respond(id, true);
	};
	window.deny = function(id) {
		respond(id, false);
	};

	function respond(toolCallId, approved) {
		responding[toolCallId] = true;
		render();
		fetch('/api/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ toolCallId, approved })
		}).then(r => r.json()).then(data => {
			if (data.ok) {
				const c = pendingConfirmations.find(p => p.toolCallId === toolCallId);
				if (c) {
					history.push({ command: c.command, approved, time: Date.now() });
				}
				pendingConfirmations = pendingConfirmations.filter(p => p.toolCallId !== toolCallId);
				delete responding[toolCallId];
				render();
			}
		}).catch(() => {
			delete responding[toolCallId];
			render();
		});
	}

	// SSE for real-time updates
	function connectSSE() {
		const es = new EventSource('/api/events');
		es.onopen = function() {
			statusEl.textContent = 'Connected';
			statusEl.className = 'status connected';
		};
		es.addEventListener('confirmations', function(e) {
			pendingConfirmations = JSON.parse(e.data);
			render();
		});
		es.onerror = function() {
			statusEl.textContent = 'Reconnecting...';
			statusEl.className = 'status';
			es.close();
			setTimeout(connectSSE, 3000);
		};
	}

	// Initial fetch
	fetch('/api/pending').then(r => r.json()).then(data => {
		pendingConfirmations = data.confirmations || [];
		render();
	});

	connectSSE();
	render();

	// Keep times fresh
	setInterval(render, 15000);
})();
</script>
</body>
</html>`;
}
