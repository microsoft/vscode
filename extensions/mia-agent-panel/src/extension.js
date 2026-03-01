// Agent Panel extension — Three-universe agentic chat webview
const vscode = require('vscode');

let miaApi = null;
let currentPanel = null;

function activate(context) {
	const coreExt = vscode.extensions.getExtension('mia.three-universe');
	if (coreExt) {
		miaApi = coreExt.exports;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('mia.showPanel', () => {
			if (currentPanel) {
				currentPanel.reveal(vscode.ViewColumn.Two);
				return;
			}
			currentPanel = createAgentPanel(context);
		}),
		vscode.commands.registerCommand('mia.agentPanel.clear', () => {
			if (currentPanel) {
				currentPanel.webview.postMessage({ type: 'clear' });
			}
		}),
	);
}

function deactivate() {
	if (currentPanel) {
		currentPanel.dispose();
		currentPanel = null;
	}
}

function createAgentPanel(context) {
	const panel = vscode.window.createWebviewPanel(
		'miaAgentPanel', 'Mia Agent', vscode.ViewColumn.Two,
		{ enableScripts: true, retainContextWhenHidden: true }
	);

	panel.webview.html = getAgentPanelHtml();

	panel.webview.onDidReceiveMessage(async (message) => {
		if (message.type === 'chat') {
			await handleChatMessage(panel, message.text);
		}
	});

	panel.onDidDispose(() => { currentPanel = null; });

	return panel;
}

async function handleChatMessage(panel, text) {
	// Parse slash commands
	let universe = vscode.workspace.getConfiguration('mia').get('primaryUniverse', 'balanced');
	let processedText = text;

	if (text.startsWith('/')) {
		const [cmd, ...rest] = text.split(' ');
		processedText = rest.join(' ');
		switch (cmd) {
			case '/analyze': return vscode.commands.executeCommand('mia.analyzeFile');
			case '/chart': return vscode.commands.executeCommand('mia.createChart');
			case '/beat': return vscode.commands.executeCommand('mia.createBeat');
			case '/decompose': return vscode.commands.executeCommand('mia.decompose');
			case '/universe':
				if (['eng', 'engineer'].includes(rest[0])) universe = 'engineer';
				else if (['cer', 'ceremony'].includes(rest[0])) universe = 'ceremony';
				else if (['story'].includes(rest[0])) universe = 'story';
				processedText = rest.slice(1).join(' ') || text;
				break;
			case '/session':
				panel.webview.postMessage({ type: 'response', text: 'Session info — connect to server', universe: 'narrative' });
				return;
			case '/help':
				panel.webview.postMessage({
					type: 'response',
					text: '**Commands:**\n- `/analyze` — Analyze current file\n- `/chart` — Create STC chart\n- `/beat` — Log story beat\n- `/decompose` — PDE decompose\n- `/universe [eng|cer|story]` — Set universe\n- `/session` — Session info\n- `/help` — This help',
					universe: 'narrative',
				});
				return;
		}
	}

	// Parse @mentions
	if (processedText.includes('@engineer')) universe = 'engineer';
	else if (processedText.includes('@ceremony')) universe = 'ceremony';
	else if (processedText.includes('@story')) universe = 'story';

	// Get context
	const editor = vscode.window.activeTextEditor;
	const chatContext = {
		activeFile: editor?.document.uri.toString(),
		selection: editor?.selection && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : undefined,
	};

	if (miaApi && miaApi.isConnected()) {
		try {
			const client = miaApi.getHttpClient();
			let fullResponse = '';
			for await (const chunk of client.sendChatMessage({ message: processedText, universe, context: chatContext })) {
				if (chunk.done) break;
				fullResponse += chunk.content;
				panel.webview.postMessage({ type: 'stream', text: chunk.content, universe: chunk.universe });
			}
			panel.webview.postMessage({ type: 'streamEnd' });
		} catch (err) {
			panel.webview.postMessage({ type: 'response', text: `Error: ${err.message}`, universe: 'server' });
		}
	} else {
		panel.webview.postMessage({
			type: 'response',
			text: `🔌 Not connected to mia-code-server. Configure \`mia.serverUrl\` to enable agentic chat.\n\n*Your message: "${processedText}"*`,
			universe: 'narrative',
		});
	}
}

function getAgentPanelHtml() {
	return `<!DOCTYPE html>
<html><head>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); height: 100vh; display: flex; flex-direction: column; }
.header { padding: 12px 16px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; align-items: center; gap: 8px; }
.header h2 { font-size: 1em; color: #C0CAF5; }
.universe-dots { display: flex; gap: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.eng { background: #4A9EFF; }
.dot.cer { background: #4ADE80; }
.dot.sto { background: #A78BFA; }
.messages { flex: 1; overflow-y: auto; padding: 16px; }
.msg { margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; max-width: 85%; }
.msg.user { background: #1E1F2E; margin-left: auto; text-align: right; }
.msg.agent { background: #16161E; border-left: 3px solid #4A9EFF; }
.msg.agent.engineer { border-left-color: #4A9EFF; }
.msg.agent.ceremony { border-left-color: #4ADE80; }
.msg.agent.story { border-left-color: #A78BFA; }
.msg.agent.narrative { border-left-color: #565F89; }
.input-area { padding: 12px 16px; border-top: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; }
textarea { flex: 1; resize: none; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px; font-family: inherit; font-size: 0.9em; }
button { background: #4A9EFF; color: white; border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer; }
button:hover { background: #5BABFF; }
</style>
</head><body>
<div class="header">
	<h2>Mia Agent</h2>
	<div class="universe-dots"><div class="dot eng"></div><div class="dot cer"></div><div class="dot sto"></div></div>
</div>
<div class="messages" id="messages">
	<div class="msg agent narrative">Welcome to Mia Agent. Type a message or use slash commands (/help for list).</div>
</div>
<div class="input-area">
	<textarea id="input" rows="2" placeholder="Ask Mia anything... (/ for commands, @ for universe)"></textarea>
	<button id="send">Send</button>
</div>
<script>
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');

function addMessage(text, type, universe) {
	const div = document.createElement('div');
	div.className = 'msg ' + type + (universe ? ' ' + universe : '');
	div.innerHTML = text.replace(/\\n/g, '<br>');
	messagesEl.appendChild(div);
	messagesEl.scrollTop = messagesEl.scrollHeight;
}

sendBtn.addEventListener('click', () => {
	const text = inputEl.value.trim();
	if (!text) return;
	addMessage(text, 'user');
	vscode.postMessage({ type: 'chat', text });
	inputEl.value = '';
});

inputEl.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		sendBtn.click();
	}
});

let streamEl = null;
window.addEventListener('message', (event) => {
	const msg = event.data;
	if (msg.type === 'response') {
		addMessage(msg.text, 'agent', msg.universe || 'narrative');
	} else if (msg.type === 'stream') {
		if (!streamEl) {
			streamEl = document.createElement('div');
			streamEl.className = 'msg agent ' + (msg.universe || 'narrative');
			messagesEl.appendChild(streamEl);
		}
		streamEl.innerHTML += msg.text;
		messagesEl.scrollTop = messagesEl.scrollHeight;
	} else if (msg.type === 'streamEnd') {
		streamEl = null;
	} else if (msg.type === 'clear') {
		messagesEl.innerHTML = '';
	}
});
</script>
</body></html>`;
}

module.exports = { activate, deactivate };
