// Story Monitor extension — Live narrative event dashboard
const vscode = require('vscode');

let miaApi = null;

function activate(context) {
	const coreExt = vscode.extensions.getExtension('mia.three-universe');
	if (coreExt) {
		miaApi = coreExt.exports;
	}

	const sessionExplorerProvider = new SessionExplorerProvider();
	vscode.window.registerTreeDataProvider('mia.sessionExplorer', sessionExplorerProvider);

	// Event feed buffer
	const eventFeed = [];
	const maxEvents = 200;

	// Subscribe to narrative events
	if (miaApi) {
		miaApi.onNarrativeEvent((event) => {
			eventFeed.unshift(event);
			if (eventFeed.length > maxEvents) eventFeed.pop();
			sessionExplorerProvider.refresh();
		});
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('mia.storyMonitor.open', () => {
			openDashboardWebview(context, eventFeed);
		}),
		vscode.commands.registerCommand('mia.storyMonitor.toggleAmbient', () => {
			const config = vscode.workspace.getConfiguration('mia');
			const current = config.get('storyMonitor.ambient', false);
			config.update('storyMonitor.ambient', !current, vscode.ConfigurationTarget.Global);
			vscode.window.showInformationMessage(`Ambient mode: ${!current ? 'ON' : 'OFF'}`);
		}),
	);

	// Ambient mode status bar
	const ambientStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 35);
	updateAmbientStatusBar(ambientStatusBar);
	context.subscriptions.push(ambientStatusBar);

	vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('mia.storyMonitor.ambient')) {
			updateAmbientStatusBar(ambientStatusBar);
		}
	});
}

function deactivate() {}

function updateAmbientStatusBar(statusBar) {
	const ambient = vscode.workspace.getConfiguration('mia').get('storyMonitor.ambient', false);
	if (ambient) {
		statusBar.text = '$(pulse) Story: Active';
		statusBar.tooltip = 'Story Monitor — Ambient Mode ON';
		statusBar.show();
	} else {
		statusBar.hide();
	}
}

class SessionExplorerProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}

	refresh() { this._onDidChangeTreeData.fire(); }

	getTreeItem(element) { return element; }

	getChildren(element) {
		if (!element) {
			return [
				new vscode.TreeItem('📖 Current Session', vscode.TreeItemCollapsibleState.Collapsed),
				new vscode.TreeItem('📚 Recent Sessions', vscode.TreeItemCollapsibleState.Collapsed),
			];
		}
		return [
			new vscode.TreeItem('No session data yet — connect to mia-code-server', vscode.TreeItemCollapsibleState.None),
		];
	}
}

function openDashboardWebview(context, eventFeed) {
	const panel = vscode.window.createWebviewPanel(
		'storyMonitor', 'Story Monitor', vscode.ViewColumn.Two, { enableScripts: true }
	);

	const eventsHtml = eventFeed.length > 0
		? eventFeed.slice(0, 50).map(e => {
			const icon = { engineer: '🔧', ceremony: '🌿', story: '📖' }[e.universe] || '📌';
			const dots = '●'.repeat(e.significance || 1) + '○'.repeat(5 - (e.significance || 1));
			return `<div class="event"><span class="icon">${icon}</span> <span class="sig">${dots}</span> <span class="desc">${e.type}: ${JSON.stringify(e.payload).slice(0, 80)}</span> <span class="time">${e.timestamp || ''}</span></div>`;
		}).join('\n')
		: '<div class="empty">No events yet — waiting for narrative events from mia-code-server</div>';

	panel.webview.html = `<!DOCTYPE html>
<html><head>
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
h1 { color: #A78BFA; font-size: 1.3em; }
h2 { color: #A9B1D6; font-size: 1em; margin-top: 20px; }
.gauges { display: flex; gap: 20px; margin: 16px 0; }
.gauge { text-align: center; }
.gauge-circle { width: 60px; height: 60px; border-radius: 50%; border: 3px solid; display: flex; align-items: center; justify-content: center; font-size: 1.2em; }
.eng { border-color: #4A9EFF; color: #4A9EFF; }
.cer { border-color: #4ADE80; color: #4ADE80; }
.sto { border-color: #A78BFA; color: #A78BFA; }
.event { padding: 6px 0; border-bottom: 1px solid #1E1F2E; font-size: 0.9em; }
.icon { font-size: 1.1em; }
.sig { color: #E0AF68; font-size: 0.7em; }
.time { color: #565F89; font-size: 0.8em; float: right; }
.empty { color: #565F89; font-style: italic; padding: 20px; }
</style>
</head><body>
<h1>📖 Story Monitor</h1>
<h2>Universe Coherence</h2>
<div class="gauges">
	<div class="gauge"><div class="gauge-circle eng">🔧</div><div>Engineer</div></div>
	<div class="gauge"><div class="gauge-circle cer">🌿</div><div>Ceremony</div></div>
	<div class="gauge"><div class="gauge-circle sto">📖</div><div>Story</div></div>
</div>
<h2>Event Feed</h2>
${eventsHtml}
</body></html>`;
}

module.exports = { activate, deactivate };
