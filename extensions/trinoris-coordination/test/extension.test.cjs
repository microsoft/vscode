const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const extensionRoot = path.resolve(__dirname, '..');

function createVscodeMock() {
	const commands = new Map();
	let treeView;
	class Disposable {
		dispose() { }
	}
	class EventEmitter {
		listeners = [];
		event = listener => {
			this.listeners.push(listener);
			return new Disposable();
		};
		fire(value) {
			for (const listener of this.listeners) {
				listener(value);
			}
		}
	}
	class ThemeIcon {
		constructor(id) { this.id = id; }
	}
	class TreeItem {
		constructor(label, collapsibleState) {
			this.label = label;
			this.collapsibleState = collapsibleState;
		}
	}
	const folder = { name: 'trinoris-workspace', uri: { fsPath: '/workspace/trinoris', toString: () => 'file:///workspace/trinoris' } };
	return {
		commands,
		get treeView() { return treeView; },
		Disposable,
		EventEmitter,
		ThemeIcon,
		TreeItem,
		TreeItemCollapsibleState: { None: 0, Expanded: 1 },
		ConfigurationTarget: { Global: 1 },
		workspace: {
			isTrusted: true,
			workspaceFolders: [folder],
			getConfiguration: () => ({ get: (key, fallback) => key === 'agentCli.path' ? '/fake/bin/trinoris-agent' : fallback, update: async () => undefined }),
			onDidChangeWorkspaceFolders: () => new Disposable(),
			onDidChangeConfiguration: () => new Disposable(),
		},
		window: {
			createOutputChannel: () => ({ info() { }, warn() { }, error() { }, show() { }, dispose() { } }),
			createTreeView: (id, options) => {
				treeView = { id, provider: options.treeDataProvider, onDidChangeVisibility: () => new Disposable() };
				return treeView;
			},
			showInformationMessage: async () => undefined,
			showWarningMessage: async () => undefined,
		},
		commandsApi: {
			registerCommand: (id, callback) => {
				commands.set(id, callback);
				return new Disposable();
			},
			executeCommand: async () => undefined,
		},
	};
}

test('minimal profile packages and activates the Trinoris coordinator view', async () => {
	const features = JSON.parse(fs.readFileSync(path.resolve(extensionRoot, '../../build/features.json'), 'utf8'));
	const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
	assert.equal(features.profiles.minimal.coordinationUI, true);
	assert.ok(features.profiles.minimal.bundledExtensions.includes('trinoris.coordination'));
	assert.ok(manifest.activationEvents.includes('onStartupFinished'));
	assert.ok(manifest.contributes.views['trinoris-coordination'].some(view => view.id === 'trinoris-coordination.overview'));

	const vscode = createVscodeMock();
	let journalRecords = [{ at: '2026-11-02T18:40:00Z', agent_class: 'coordinator', agent_instance: 'lead', operation: 'handoff.publish', outcome: 'ok', scopes: ['build'] }];
	const previousLoad = Module._load;
	const extensionPath = require.resolve('../out/extension.js');
	delete require.cache[extensionPath];
	Module._load = function (request, parent, isMain) {
		if (request === 'vscode') {
			return { ...vscode, commands: vscode.commandsApi };
		}
		if (request === 'node:child_process') {
			return {
				execFile(command, args, _options, callback) {
					let output = '';
					if (args[0] === '--version') {
						output = '0.3.1';
					} else if (args[0] === 'capabilities') {
						const error = new Error('Unknown command');
						error.code = 1;
						queueMicrotask(() => callback(error, '', 'Unknown command'));
						return;
					} else if (args[0] === 'status') {
						output = JSON.stringify({ error: { message: 'Missing coordination configuration; run setup' } });
					} else if (args[0] === 'log') {
						output = JSON.stringify(journalRecords);
					} else {
						output = '[]';
					}
					queueMicrotask(() => callback(null, output, ''));
				},
			};
		}
		return previousLoad.call(this, request, parent, isMain);
	};

	try {
		const extension = require(extensionPath);
		const context = { subscriptions: [], workspaceState: { get: () => undefined, update: async () => undefined } };
		await extension.activate(context);

		assert.equal(vscode.treeView.id, 'trinoris-coordination.overview');
		assert.ok(vscode.commands.has('trinoris-coordination.refresh'));
		const sections = vscode.treeView.provider.getChildren();
		const activity = sections.find(section => section.id === 'activity');
		assert.ok(activity, 'activity / journey-log section is present');
		const entries = vscode.treeView.provider.getChildren(activity);
		assert.equal(entries.length, 1);
		assert.equal(entries[0].label, 'lead · handoff.publish');
		assert.match(entries[0].description, /2026-11-02T18:40:00Z.*build.*ok/);
		const scopes = sections.find(section => section.id === 'scopes');
		assert.match(vscode.treeView.provider.getChildren(scopes)[0].label, /Missing coordination configuration; run setup/);

		journalRecords = [];
		await vscode.commands.get('trinoris-coordination.refresh')();
		const refreshedSections = vscode.treeView.provider.getChildren();
		const refreshedActivity = refreshedSections.find(section => section.id === 'activity');
		assert.equal(vscode.treeView.provider.getChildren(refreshedActivity)[0].label, 'No journey log entries for this workspace yet. Run a coordination action, then refresh.');
	} finally {
		Module._load = previousLoad;
		delete require.cache[extensionPath];
	}
});
