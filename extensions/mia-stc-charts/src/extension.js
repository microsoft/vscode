// STC Charts extension — Structural Tension Chart management
const vscode = require('vscode');

let miaApi = null;

function activate(context) {
	const coreExt = vscode.extensions.getExtension('mia.three-universe');
	if (coreExt) {
		miaApi = coreExt.exports;
	}

	const chartExplorerProvider = new ChartExplorerProvider();
	vscode.window.registerTreeDataProvider('mia.chartExplorer', chartExplorerProvider);

	context.subscriptions.push(
		vscode.commands.registerCommand('mia.stcCharts.review', (item) => {
			openChartWebview(context, item);
		}),
		vscode.commands.registerCommand('mia.stcCharts.archive', (item) => {
			vscode.window.showInformationMessage(`Archived: ${item.label}`);
		}),
		vscode.commands.registerCommand('mia.stcCharts.export', (item) => {
			vscode.window.showInformationMessage(`Exported: ${item.label}`);
		}),
	);

	// Watch .stc/ directory for file changes
	const folders = vscode.workspace.workspaceFolders;
	if (folders) {
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(folders[0], '.stc/charts/*.json')
		);
		watcher.onDidCreate(() => chartExplorerProvider.refresh());
		watcher.onDidChange(() => chartExplorerProvider.refresh());
		watcher.onDidDelete(() => chartExplorerProvider.refresh());
		context.subscriptions.push(watcher);
	}

	// Status bar item for active chart
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
	statusBar.text = '$(graph) No active chart';
	statusBar.tooltip = 'Structural Tension Charts';
	statusBar.command = 'mia.showDashboard';
	statusBar.show();
	context.subscriptions.push(statusBar);
}

function deactivate() {}

class ChartExplorerProvider {
	constructor() {
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}

	refresh() { this._onDidChangeTreeData.fire(); }

	getTreeItem(element) { return element; }

	async getChildren(element) {
		if (element) {
			// Show chart details: desired outcome, current reality, action steps
			const chart = element.chart;
			if (!chart) return [];
			const items = [
				new vscode.TreeItem(`🎯 ${chart.desiredOutcome}`, vscode.TreeItemCollapsibleState.None),
				new vscode.TreeItem(`📍 ${chart.currentReality}`, vscode.TreeItemCollapsibleState.None),
			];
			if (chart.actionSteps) {
				for (const step of chart.actionSteps) {
					const icon = step.completed ? '✅' : '⬜';
					items.push(new vscode.TreeItem(`${icon} ${step.description}`, vscode.TreeItemCollapsibleState.None));
				}
			}
			return items;
		}

		// Root: load charts from .stc/charts/ or server
		const charts = await loadLocalCharts();
		if (charts.length === 0) {
			return [new vscode.TreeItem('No charts yet — run Mia: Create STC Chart', vscode.TreeItemCollapsibleState.None)];
		}

		return charts.map((chart) => {
			const completed = chart.actionSteps ? chart.actionSteps.filter(s => s.completed).length : 0;
			const total = chart.actionSteps ? chart.actionSteps.length : 0;
			const item = new vscode.TreeItem(
				`${chart.title} (${completed}/${total})`,
				vscode.TreeItemCollapsibleState.Collapsed
			);
			item.contextValue = 'stcChart';
			item.chart = chart;
			return item;
		});
	}
}

async function loadLocalCharts() {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders) return [];

	const chartsDir = vscode.Uri.joinPath(folders[0].uri, '.stc', 'charts');
	try {
		const entries = await vscode.workspace.fs.readDirectory(chartsDir);
		const charts = [];
		for (const [name] of entries) {
			if (name.endsWith('.json')) {
				const uri = vscode.Uri.joinPath(chartsDir, name);
				const content = await vscode.workspace.fs.readFile(uri);
				charts.push(JSON.parse(Buffer.from(content).toString()));
			}
		}
		return charts.sort((a, b) => new Date(b.modified) - new Date(a.modified));
	} catch {
		return [];
	}
}

function openChartWebview(context, item) {
	const chart = item.chart;
	if (!chart) return;

	const panel = vscode.window.createWebviewPanel(
		'stcChart', `STC: ${chart.title}`, vscode.ViewColumn.One, { enableScripts: true }
	);

	const completed = chart.actionSteps ? chart.actionSteps.filter(s => s.completed).length : 0;
	const total = chart.actionSteps ? chart.actionSteps.length : 0;
	const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

	panel.webview.html = `<!DOCTYPE html>
<html><head>
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
h1 { color: #4A9EFF; font-size: 1.4em; }
h2 { color: #A9B1D6; font-size: 1.1em; margin-top: 20px; }
.desired { border-left: 3px solid #4ADE80; padding-left: 12px; }
.reality { border-left: 3px solid #F7768E; padding-left: 12px; }
.progress-bar { height: 8px; background: #1E1F2E; border-radius: 4px; margin: 16px 0; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #4A9EFF, #4ADE80); border-radius: 4px; transition: width 0.3s; }
.step { padding: 4px 0; }
.step.done { text-decoration: line-through; opacity: 0.6; }
</style>
</head><body>
<h1>📐 ${chart.title}</h1>
<div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>
<p>${progress}% complete (${completed}/${total} steps)</p>
<h2>🎯 Desired Outcome</h2>
<div class="desired"><p>${chart.desiredOutcome}</p></div>
<h2>📍 Current Reality</h2>
<div class="reality"><p>${chart.currentReality}</p></div>
<h2>📋 Action Steps</h2>
${(chart.actionSteps || []).map(s => `<div class="step ${s.completed ? 'done' : ''}">${s.completed ? '✅' : '⬜'} ${s.description}</div>`).join('\n')}
</body></html>`;
}

module.exports = { activate, deactivate };
