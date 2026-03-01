// src/extension.ts — mia-three-universe core extension
// Central nervous system for all three-universe features.

const vscode = require('vscode');
const { MiaHttpClientImpl } = require('./api/httpClient');
const { NarrativeWebSocket } = require('./ws/narrativeWebSocket');
const { MCPClientService } = require('./mcp/mcpClient');

/** @type {Map<string, import('vscode').LogOutputChannel>} */
const outputChannels = new Map();

/** @type {string} */
let connectionState = 'disconnected';

/** @type {import('vscode').EventEmitter<any>} */
let narrativeEventEmitter;

/** @type {import('vscode').EventEmitter<string>} */
let connectionStateEmitter;

/** @type {MiaHttpClientImpl | null} */
let httpClient = null;

/** @type {NarrativeWebSocket | null} */
let wsClient = null;

/** @type {MCPClientService | null} */
let mcpClient = null;

/**
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
	const config = vscode.workspace.getConfiguration('mia');

	if (!config.get('enabled', true)) {
		return;
	}

	narrativeEventEmitter = new vscode.EventEmitter();
	connectionStateEmitter = new vscode.EventEmitter();

	const serverUrl = config.get('serverUrl', '');

	// Initialize HTTP client
	httpClient = new MiaHttpClientImpl(serverUrl, context);

	// Initialize WebSocket if server configured
	if (serverUrl) {
		wsClient = new NarrativeWebSocket(serverUrl, context);
		wsClient.onEvent((event) => narrativeEventEmitter.fire(event));
		wsClient.onStateChanged((state) => {
			connectionState = state;
			connectionStateEmitter.fire(state);
		});
		wsClient.connect();
	}

	// Initialize MCP client
	mcpClient = new MCPClientService(serverUrl, context);

	// Register tree data providers
	const universeExplorerProvider = new UniverseExplorerProvider();
	const beatTimelineProvider = new BeatTimelineProvider();

	vscode.window.registerTreeDataProvider('mia.universeExplorer', universeExplorerProvider);
	vscode.window.registerTreeDataProvider('mia.beatTimeline', beatTimelineProvider);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('mia.analyzeFile', () => analyzeCurrentFile()),
		vscode.commands.registerCommand('mia.showPanel', () => showAgentPanel(context)),
		vscode.commands.registerCommand('mia.createChart', () => createChart()),
		vscode.commands.registerCommand('mia.createBeat', () => createBeat()),
		vscode.commands.registerCommand('mia.switchUniverse', () => switchUniverse()),
		vscode.commands.registerCommand('mia.showDashboard', () => showDashboard()),
		vscode.commands.registerCommand('mia.decompose', () => decomposePrompt()),
		vscode.commands.registerCommand('mia.quickAnalysis', () => quickAnalysis()),
	);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('mia.serverUrl')) {
				const newUrl = vscode.workspace.getConfiguration('mia').get('serverUrl', '');
				if (httpClient) httpClient.setServerUrl(newUrl);
				if (wsClient) wsClient.reconnect(newUrl);
			}
		})
	);

	// Status bar item showing connection state
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
	statusBar.text = '$(circle-slash) Mia';
	statusBar.tooltip = 'Mia Three Universe — disconnected';
	statusBar.command = 'mia.showPanel';
	statusBar.show();
	context.subscriptions.push(statusBar);

	connectionStateEmitter.event((state) => {
		switch (state) {
			case 'connected':
				statusBar.text = '$(circle-filled) Mia';
				statusBar.tooltip = 'Mia Three Universe — connected';
				break;
			case 'connecting':
			case 'reconnecting':
				statusBar.text = '$(loading~spin) Mia';
				statusBar.tooltip = `Mia Three Universe — ${state}`;
				break;
			default:
				statusBar.text = '$(circle-slash) Mia';
				statusBar.tooltip = 'Mia Three Universe — disconnected';
		}
	});

	getLog('server').info('Mia Three Universe extension activated');
	if (serverUrl) {
		getLog('server').info(`Server URL: ${serverUrl}`);
	} else {
		getLog('server').info('No server URL configured. Set mia.serverUrl to connect.');
	}

	// Export the public API for other mia extensions
	return {
		getServerUrl: () => vscode.workspace.getConfiguration('mia').get('serverUrl', ''),
		isConnected: () => connectionState === 'connected',
		getConnectionState: () => connectionState,
		analyzeFile: (uri) => analyzeFileByUri(uri),
		onNarrativeEvent: (handler) => narrativeEventEmitter.event(handler),
		onConnectionStateChanged: (handler) => connectionStateEmitter.event(handler),
		getOutputChannel: (universe) => getLog(universe),
		getHttpClient: () => httpClient,
		getMCPClient: () => mcpClient,
	};
}

function deactivate() {
	if (wsClient) wsClient.disconnect();
	for (const channel of outputChannels.values()) {
		channel.dispose();
	}
	outputChannels.clear();
}

// ─── Output Channels ────────────────────────────────────────────

const CHANNEL_NAMES = {
	engineer: 'Mia: Engineer 🔧',
	ceremony: 'Mia: Ceremony 🌿',
	story: 'Mia: Story 📖',
	narrative: 'Mia: Narrative',
	server: 'Mia: Server',
};

function getLog(universe) {
	if (!outputChannels.has(universe)) {
		const name = CHANNEL_NAMES[universe] || `Mia: ${universe}`;
		outputChannels.set(universe, vscode.window.createOutputChannel(name, { log: true }));
	}
	return outputChannels.get(universe);
}

// ─── Commands ───────────────────────────────────────────────────

async function analyzeCurrentFile() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No active file to analyze.');
		return;
	}
	return analyzeFileByUri(editor.document.uri.toString());
}

async function analyzeFileByUri(uri) {
	if (!httpClient) return null;

	const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
	const content = doc.getText();

	try {
		const result = await httpClient.analyzeThreeUniverse(uri, content);
		getLog('engineer').info(`Analysis: ${result.engineer.summary}`);
		getLog('ceremony').info(`Analysis: ${result.ceremony.summary}`);
		getLog('story').info(`Analysis: ${result.story.summary}`);
		vscode.window.showInformationMessage(`Analysis complete — significance: ${result.overallSignificance}/5`);
		return result;
	} catch (err) {
		getLog('server').error(`Analysis failed: ${err.message}`);
		vscode.window.showErrorMessage(`Mia analysis failed: ${err.message}`);
		return null;
	}
}

async function showAgentPanel(context) {
	vscode.window.showInformationMessage('Agent Panel — coming in mia.agent-panel extension');
}

async function createChart() {
	const title = await vscode.window.showInputBox({ prompt: 'Chart title', placeHolder: 'What are you creating?' });
	if (!title) return;

	const desiredOutcome = await vscode.window.showInputBox({ prompt: 'Desired Outcome', placeHolder: 'What does success look like?' });
	if (!desiredOutcome) return;

	const currentReality = await vscode.window.showInputBox({ prompt: 'Current Reality', placeHolder: 'Where are you now?' });
	if (!currentReality) return;

	if (httpClient) {
		try {
			const chart = await httpClient.createChart({ title, desiredOutcome, currentReality });
			vscode.window.showInformationMessage(`Created chart: ${chart.title}`);
		} catch (err) {
			getLog('server').error(`Failed to create chart: ${err.message}`);
			// Fallback: create locally
			saveChartLocally({ title, desiredOutcome, currentReality });
		}
	} else {
		saveChartLocally({ title, desiredOutcome, currentReality });
	}
}

function saveChartLocally(chartData) {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) return;

	const stcDir = vscode.Uri.joinPath(folders[0].uri, '.stc', 'charts');
	const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	const chart = {
		id,
		...chartData,
		actionSteps: [],
		created: new Date().toISOString(),
		modified: new Date().toISOString(),
	};

	const fileUri = vscode.Uri.joinPath(stcDir, `${id}.json`);
	vscode.workspace.fs.createDirectory(stcDir).then(() => {
		const content = Buffer.from(JSON.stringify(chart, null, 2));
		vscode.workspace.fs.writeFile(fileUri, content);
		vscode.window.showInformationMessage(`Chart saved locally: ${chartData.title}`);
	});
}

async function createBeat() {
	const description = await vscode.window.showInputBox({ prompt: 'Beat description', placeHolder: 'What just happened?' });
	if (!description) return;

	const type = await vscode.window.showQuickPick(
		['engineering', 'relational', 'narrative', 'transition', 'milestone'],
		{ placeHolder: 'Beat type' }
	);
	if (!type) return;

	if (httpClient) {
		try {
			const beat = await httpClient.createBeat({ type, description });
			vscode.window.showInformationMessage(`Beat logged: ${beat.description}`);
		} catch (err) {
			getLog('server').warn(`Failed to send beat to server: ${err.message}`);
			vscode.window.showInformationMessage(`Beat logged locally: ${description}`);
		}
	} else {
		getLog('narrative').info(`[BEAT:${type}] ${description}`);
		vscode.window.showInformationMessage(`Beat logged locally: ${description}`);
	}
}

async function switchUniverse() {
	const choice = await vscode.window.showQuickPick(
		['balanced', 'engineer', 'ceremony', 'story'],
		{ placeHolder: 'Select primary universe focus' }
	);
	if (!choice) return;

	const config = vscode.workspace.getConfiguration('mia');
	await config.update('primaryUniverse', choice, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(`Universe focus: ${choice}`);
}

async function showDashboard() {
	vscode.commands.executeCommand('workbench.view.extension.mia-stc-dashboard');
}

async function decomposePrompt() {
	const editor = vscode.window.activeTextEditor;
	const selection = editor?.selection;
	const text = selection && !selection.isEmpty
		? editor.document.getText(selection)
		: await vscode.window.showInputBox({ prompt: 'Enter prompt to decompose', placeHolder: 'Complex prompt...' });

	if (!text) return;

	if (httpClient) {
		try {
			const result = await httpClient.decompose(text);
			getLog('narrative').info(`Decomposed into ${result.actions.length} actions`);
			vscode.window.showInformationMessage(`Decomposed: ${result.actions.length} actions, ${result.implicitIntents.length} implicit intents`);
		} catch (err) {
			getLog('server').error(`Decomposition failed: ${err.message}`);
		}
	}
}

async function quickAnalysis() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const selection = editor.selection;
	const text = !selection.isEmpty
		? editor.document.getText(selection)
		: editor.document.lineAt(editor.selection.active.line).text;

	getLog('narrative').info(`Quick analysis: "${text.slice(0, 80)}..."`);
	vscode.window.showInformationMessage(`Quick analysis of: "${text.slice(0, 50)}..."`);
}

// ─── Tree Data Providers ────────────────────────────────────────

class UniverseExplorerProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element) {
		return element;
	}

	getChildren(element) {
		if (!element) {
			return [
				new UniverseTreeItem('🔧 Engineer', 'engineer', vscode.TreeItemCollapsibleState.Collapsed),
				new UniverseTreeItem('🌿 Ceremony', 'ceremony', vscode.TreeItemCollapsibleState.Collapsed),
				new UniverseTreeItem('📖 Story', 'story', vscode.TreeItemCollapsibleState.Collapsed),
			];
		}
		// Child items would show recent analyses per universe
		return [
			new vscode.TreeItem('No analyses yet', vscode.TreeItemCollapsibleState.None),
		];
	}
}

class UniverseTreeItem extends vscode.TreeItem {
	constructor(label, universe, collapsibleState) {
		super(label, collapsibleState);
		this.universe = universe;
		this.contextValue = 'universe';
		this.tooltip = `${label} Universe`;
	}
}

class BeatTimelineProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element) {
		return element;
	}

	getChildren(element) {
		if (!element) {
			return [
				new vscode.TreeItem('No beats recorded yet', vscode.TreeItemCollapsibleState.None),
			];
		}
		return [];
	}
}

module.exports = { activate, deactivate };
