// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { WaveformEditorProvider } from './waveformEditorProvider';
import { SignalHierarchyProvider } from './signalHierarchyProvider';
import { DisplayedSignalsProvider } from './displayedSignalsProvider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	console.log('Activating Waveform Surfer extension...');

	// Initialize WASM module
	const wasmPath = vscode.Uri.joinPath(
		context.extensionUri,
		'target/wasm32-unknown-unknown/release/surfer_parser.wasm'
	);

	let wasmModule: WebAssembly.Module | undefined;
	try {
		const wasmBytes = await vscode.workspace.fs.readFile(wasmPath);
		wasmModule = await WebAssembly.compile(wasmBytes);
		console.log('WASM module loaded successfully');
	} catch (error) {
		console.error('Failed to load WASM module:', error);
		vscode.window.showErrorMessage('Failed to initialize waveform parser. Please check the extension installation.');
	}

	// Create tree data providers
	const signalHierarchyProvider = new SignalHierarchyProvider();
	const displayedSignalsProvider = new DisplayedSignalsProvider();

	// Register tree views
	const hierarchyTreeView = vscode.window.createTreeView('waveformSurferNetlistView', {
		treeDataProvider: signalHierarchyProvider,
		canSelectMany: true,
		manageCheckboxStateManually: true,
	});

	const displayedSignalsTreeView = vscode.window.createTreeView('waveformSurferDisplayedSignalsView', {
		treeDataProvider: displayedSignalsProvider,
		canSelectMany: true,
	});

	// Create custom editor provider
	const editorProvider = new WaveformEditorProvider(
		context,
		wasmModule,
		signalHierarchyProvider,
		displayedSignalsProvider
	);

	// Register custom editor
	const editorDisposable = vscode.window.registerCustomEditorProvider(
		'waveformSurfer.waveformViewer',
		editorProvider,
		{
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		}
	);

	// Register commands
	const addSignalCommand = vscode.commands.registerCommand(
		'waveformSurfer.addSignal',
		(item) => {
			editorProvider.addSignal(item);
		}
	);

	const removeSignalCommand = vscode.commands.registerCommand(
		'waveformSurfer.removeSignal',
		(item) => {
			editorProvider.removeSignal(item);
		}
	);

	const zoomFitCommand = vscode.commands.registerCommand(
		'waveformSurfer.zoomFit',
		() => {
			editorProvider.zoomToFit();
		}
	);

	const exportImageCommand = vscode.commands.registerCommand(
		'waveformSurfer.exportImage',
		() => {
			editorProvider.exportImage();
		}
	);

	// Set up context for when documents are active
	const updateContext = (hasActiveDocument: boolean) => {
		vscode.commands.executeCommand('setContext', 'waveformSurfer:hasActiveDocument', hasActiveDocument);
	};

	// Listen for active editor changes
	const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
		const activeEditor = vscode.window.activeTextEditor;
		const fileExtension = activeEditor?.document.fileName.split('.').pop()?.toLowerCase();
		const hasWaveformDocument = Boolean(activeEditor && fileExtension &&
			['vcd', 'fst', 'ghw', 'fsdb'].includes(fileExtension));
		updateContext(hasWaveformDocument);
	});

	// Add disposables to context
	context.subscriptions.push(
		editorDisposable,
		addSignalCommand,
		removeSignalCommand,
		zoomFitCommand,
		exportImageCommand,
		hierarchyTreeView,
		displayedSignalsTreeView,
		activeEditorDisposable
	);

	// Set initial context
	updateContext(false);

	console.log('Waveform Surfer extension activated successfully');
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('Waveform Surfer extension deactivated');
}
