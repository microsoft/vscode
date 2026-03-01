// Mia Terminal extension — Terminal profile and link/command detection
const vscode = require('vscode');

function activate(context) {
	// Register terminal profile provider
	context.subscriptions.push(
		vscode.window.registerTerminalProfileProvider('mia.agent', {
			provideTerminalProfile() {
				const config = vscode.workspace.getConfiguration('mia');
				const serverUrl = config.get('serverUrl', '');
				const universe = config.get('primaryUniverse', 'balanced');

				const env = {
					MIA_SERVER_URL: serverUrl,
					MIA_SESSION_ID: Date.now().toString(36),
					MIA_UNIVERSE: universe,
				};

				return new vscode.TerminalProfile({
					name: 'Mia Agent Terminal',
					shellPath: findMiadiCode() || undefined,
					env,
					iconPath: new vscode.ThemeIcon('comment-discussion'),
					message: '🔧🌿📖 Mia Agent Terminal — Three-Universe CLI\n',
				});
			},
		})
	);

	// Register terminal link provider for narrative references
	context.subscriptions.push(
		vscode.window.registerTerminalLinkProvider({
			provideTerminalLinks(context) {
				const links = [];
				const line = context.line;

				// STC:chart-id
				const stcMatch = line.match(/STC:([a-zA-Z0-9_-]+)/);
				if (stcMatch) {
					links.push({
						startIndex: line.indexOf(stcMatch[0]),
						length: stcMatch[0].length,
						tooltip: `Open STC Chart: ${stcMatch[1]}`,
						data: { type: 'stc', id: stcMatch[1] },
					});
				}

				// BEAT:beat-id
				const beatMatch = line.match(/BEAT:([a-zA-Z0-9_-]+)/);
				if (beatMatch) {
					links.push({
						startIndex: line.indexOf(beatMatch[0]),
						length: beatMatch[0].length,
						tooltip: `Open Beat: ${beatMatch[1]}`,
						data: { type: 'beat', id: beatMatch[1] },
					});
				}

				// SPEC:spec-name
				const specMatch = line.match(/SPEC:([a-zA-Z0-9._-]+)/);
				if (specMatch) {
					links.push({
						startIndex: line.indexOf(specMatch[0]),
						length: specMatch[0].length,
						tooltip: `Open Spec: ${specMatch[1]}`,
						data: { type: 'spec', id: specMatch[1] },
					});
				}

				return links;
			},

			handleTerminalLink(link) {
				const { type, id } = link.data;
				switch (type) {
					case 'stc':
						vscode.commands.executeCommand('mia.showDashboard');
						break;
					case 'beat':
						vscode.commands.executeCommand('mia.storyMonitor.open');
						break;
					case 'spec':
						// Try to find and open the spec file
						vscode.commands.executeCommand('workbench.action.quickOpen', `${id}.spec.md`);
						break;
				}
			},
		})
	);

	// Terminal command observation (passive suggestions)
	vscode.window.onDidEndTerminalShellExecution?.((event) => {
		const cmdLine = event.execution?.commandLine?.value || '';
		if (/git\s+(commit|push)/.test(cmdLine)) {
			vscode.window.showInformationMessage(
				'💡 Log a story beat for this commit?',
				'Create Beat'
			).then((choice) => {
				if (choice === 'Create Beat') {
					vscode.commands.executeCommand('mia.createBeat');
				}
			});
		}
	});
}

function deactivate() {}

function findMiadiCode() {
	// Look for miadi-code in PATH
	try {
		const { execSync } = require('child_process');
		execSync('which miadi-code', { stdio: 'pipe' });
		return 'miadi-code';
	} catch {
		return null;
	}
}

module.exports = { activate, deactivate };
