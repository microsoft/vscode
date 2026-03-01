// Editor Intelligence extension — CodeLens, hover, decorations, diagnostics
const vscode = require('vscode');

let miaApi = null;

// Analysis results cache: fileUri -> ThreeUniverseResult
const analysisCache = new Map();

function activate(context) {
	const coreExt = vscode.extensions.getExtension('mia.three-universe');
	if (coreExt) {
		miaApi = coreExt.exports;
	}

	const config = vscode.workspace.getConfiguration('mia');

	// ─── CodeLens Provider ──────────────────────────────────────

	const codeLensProvider = new NarrativeCodeLensProvider();
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider)
	);

	// ─── Hover Provider ─────────────────────────────────────────

	const hoverProvider = new NarrativeHoverProvider();
	context.subscriptions.push(
		vscode.languages.registerHoverProvider({ scheme: 'file' }, hoverProvider)
	);

	// ─── Diagnostics ────────────────────────────────────────────

	const diagnosticCollection = vscode.languages.createDiagnosticCollection('mia');
	context.subscriptions.push(diagnosticCollection);

	// ─── Decorations ────────────────────────────────────────────

	const engineerDecorationType = vscode.window.createTextEditorDecorationType({
		gutterIconPath: '', // Would use SVG
		gutterIconSize: '60%',
		overviewRulerColor: '#4A9EFF33',
		overviewRulerLane: vscode.OverviewRulerLane.Left,
	});

	const ceremonyDecorationType = vscode.window.createTextEditorDecorationType({
		overviewRulerColor: '#4ADE8033',
		overviewRulerLane: vscode.OverviewRulerLane.Center,
	});

	const storyDecorationType = vscode.window.createTextEditorDecorationType({
		overviewRulerColor: '#A78BFA33',
		overviewRulerLane: vscode.OverviewRulerLane.Right,
	});

	// ─── Auto-analyze on save ───────────────────────────────────

	if (config.get('autoAnalyze', false)) {
		context.subscriptions.push(
			vscode.workspace.onDidSaveTextDocument(async (doc) => {
				if (miaApi && miaApi.isConnected()) {
					try {
						const result = await miaApi.analyzeFile(doc.uri.toString());
						if (result) {
							analysisCache.set(doc.uri.toString(), result);
							updateDiagnostics(doc, result, diagnosticCollection);
							codeLensProvider.refresh();
						}
					} catch {
						// Silent failure for auto-analyze
					}
				}
			})
		);
	}

	// Subscribe to narrative events for analysis results
	if (miaApi) {
		miaApi.onNarrativeEvent((event) => {
			if (event.type === 'analysis.complete' && event.payload) {
				const { fileUri, result } = event.payload;
				analysisCache.set(fileUri, result);
				codeLensProvider.refresh();
			}
		});
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('mia.editorIntelligence.refreshDecorations', () => {
			codeLensProvider.refresh();
			vscode.window.showInformationMessage('Mia decorations refreshed');
		})
	);
}

function deactivate() {}

// ─── CodeLens Provider ──────────────────────────────────────────

class NarrativeCodeLensProvider {
	constructor() {
		this._onDidChangeCodeLenses = new vscode.EventEmitter();
		this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
	}

	refresh() {
		this._onDidChangeCodeLenses.fire();
	}

	provideCodeLenses(document) {
		const fileUri = document.uri.toString();
		const result = analysisCache.get(fileUri);
		if (!result) return [];

		const config = vscode.workspace.getConfiguration('mia');
		if (!config.get('decorations.enabled', true)) return [];

		const lenses = [];
		const level = config.get('decorations.level', 'moderate');

		// Add lenses at the top of the file for overall analysis
		const range = new vscode.Range(0, 0, 0, 0);

		if (result.engineer && result.engineer.summary) {
			lenses.push(new vscode.CodeLens(range, {
				title: `🔧 Engineer: ${result.engineer.summary.slice(0, 80)}`,
				command: 'mia.showPanel',
			}));
		}

		if (result.ceremony && result.ceremony.summary) {
			lenses.push(new vscode.CodeLens(range, {
				title: `🌿 Ceremony: ${result.ceremony.summary.slice(0, 80)}`,
				command: 'mia.showPanel',
			}));
		}

		if (result.story && result.story.summary) {
			lenses.push(new vscode.CodeLens(range, {
				title: `📖 Story: ${result.story.summary.slice(0, 80)}`,
				command: 'mia.showPanel',
			}));
		}

		// Add per-insight lenses if in moderate or rich mode
		if (level !== 'minimal') {
			for (const universe of ['engineer', 'ceremony', 'story']) {
				const analysis = result[universe];
				if (!analysis || !analysis.insights) continue;
				for (const insight of analysis.insights) {
					if (insight.location && insight.location.line) {
						const line = Math.max(0, insight.location.line - 1);
						const insightRange = new vscode.Range(line, 0, line, 0);
						const icon = { engineer: '🔧', ceremony: '🌿', story: '📖' }[universe];
						lenses.push(new vscode.CodeLens(insightRange, {
							title: `${icon} ${insight.description.slice(0, 60)}`,
							command: 'mia.showPanel',
						}));
					}
				}
			}
		}

		return lenses;
	}
}

// ─── Hover Provider ─────────────────────────────────────────────

class NarrativeHoverProvider {
	provideHover(document, position) {
		const fileUri = document.uri.toString();
		const result = analysisCache.get(fileUri);
		if (!result) return null;

		const line = position.line + 1;

		// Check for STC comment references
		const lineText = document.lineAt(position.line).text;
		const stcMatch = lineText.match(/\/\/\s*STC:\s*([a-zA-Z0-9_-]+)/);
		if (stcMatch) {
			return new vscode.Hover(
				new vscode.MarkdownString(`**STC Chart**: \`${stcMatch[1]}\`\n\nClick to open chart details.`),
				new vscode.Range(position.line, lineText.indexOf(stcMatch[0]), position.line, lineText.indexOf(stcMatch[0]) + stcMatch[0].length)
			);
		}

		// Show relevant insights for this line
		const relevantInsights = [];
		for (const universe of ['engineer', 'ceremony', 'story']) {
			const analysis = result[universe];
			if (!analysis || !analysis.insights) continue;
			for (const insight of analysis.insights) {
				if (insight.location) {
					const start = insight.location.line;
					const end = insight.location.endLine || start;
					if (line >= start && line <= end) {
						const icon = { engineer: '🔧', ceremony: '🌿', story: '📖' }[universe];
						relevantInsights.push(`### ${icon} ${universe.charAt(0).toUpperCase() + universe.slice(1)}\n${insight.description}`);
					}
				}
			}
		}

		if (relevantInsights.length > 0) {
			return new vscode.Hover(new vscode.MarkdownString(relevantInsights.join('\n\n---\n\n')));
		}

		return null;
	}
}

// ─── Diagnostics ────────────────────────────────────────────────

function updateDiagnostics(document, result, collection) {
	const diagnostics = [];

	for (const universe of ['engineer', 'ceremony', 'story']) {
		const analysis = result[universe];
		if (!analysis || !analysis.insights) continue;

		for (const insight of analysis.insights) {
			if (!insight.location) continue;

			const line = Math.max(0, (insight.location.line || 1) - 1);
			const endLine = insight.location.endLine ? insight.location.endLine - 1 : line;
			const range = new vscode.Range(line, 0, endLine, Number.MAX_SAFE_INTEGER);

			let severity;
			if (insight.significance >= 4) severity = vscode.DiagnosticSeverity.Error;
			else if (insight.significance >= 2) severity = vscode.DiagnosticSeverity.Warning;
			else severity = vscode.DiagnosticSeverity.Information;

			const diagnostic = new vscode.Diagnostic(range, insight.description, severity);
			diagnostic.source = `mia-${universe}`;
			diagnostic.code = insight.id;
			diagnostics.push(diagnostic);
		}
	}

	collection.set(document.uri, diagnostics);
}

module.exports = { activate, deactivate };
