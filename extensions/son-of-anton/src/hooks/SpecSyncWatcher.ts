/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const SPECS_DIR = '.son-of-anton/specs';

/**
 * Result of a spec sync check.
 */
export interface SpecSyncWarning {
	specFile: string;
	codeFile: string;
	message: string;
	direction: 'code-to-spec' | 'spec-to-code';
}

/**
 * Watches for file changes and checks bidirectional sync between
 * spec files and code files. Emits warnings when either side changes
 * in a way that may affect the other.
 */
export class SpecSyncWatcher {
	private readonly disposables: vscode.Disposable[] = [];
	private specFileMap: Map<string, string[]> = new Map();

	private readonly _onDidDetectSync = new vscode.EventEmitter<SpecSyncWarning>();
	readonly onDidDetectSync: vscode.Event<SpecSyncWarning> = this._onDidDetectSync.event;

	private readonly diagnosticCollection: vscode.DiagnosticCollection;

	constructor() {
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection('son-of-anton-spec-sync');
	}

	/**
	 * Start watching for file changes that affect spec-code sync.
	 */
	start(): void {
		// Watch for code file changes (Code → Spec sync)
		const codeWatcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx,py,rs}');
		codeWatcher.onDidChange(uri => this.onCodeFileChanged(uri));
		codeWatcher.onDidCreate(uri => this.onCodeFileChanged(uri));
		this.disposables.push(codeWatcher);

		// Watch for spec file changes (Spec → Code sync)
		const specWatcher = vscode.workspace.createFileSystemWatcher(`**/${SPECS_DIR}/**/*.md`);
		specWatcher.onDidChange(uri => this.onSpecFileChanged(uri));
		specWatcher.onDidCreate(uri => this.onSpecFileChanged(uri));
		this.disposables.push(specWatcher);

		// Initial scan to build the file map
		this.buildSpecFileMap();
	}

	/**
	 * Build a mapping from code files to their spec directories.
	 * This allows quick lookup when a code file changes.
	 */
	async buildSpecFileMap(): Promise<void> {
		this.specFileMap.clear();
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (!workspacePath) {
			return;
		}

		const specsUri = vscode.Uri.file(`${workspacePath}/${SPECS_DIR}`);

		try {
			const features = await vscode.workspace.fs.readDirectory(specsUri);

			for (const [featureName, type] of features) {
				if (type !== vscode.FileType.Directory) {
					continue;
				}

				const tasksUri = vscode.Uri.file(`${workspacePath}/${SPECS_DIR}/${featureName}/tasks.md`);
				try {
					const content = await vscode.workspace.fs.readFile(tasksUri);
					const text = Buffer.from(content).toString('utf-8');
					const files = this.extractFilesFromTasks(text);

					for (const file of files) {
						const existing = this.specFileMap.get(file) ?? [];
						existing.push(`${SPECS_DIR}/${featureName}`);
						this.specFileMap.set(file, existing);
					}
				} catch {
					// No tasks.md for this feature yet
				}
			}
		} catch {
			// Specs directory doesn't exist yet
		}
	}

	/**
	 * Handle a code file change — check if it affects any spec.
	 */
	private onCodeFileChanged(uri: vscode.Uri): void {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
		const relativePath = uri.fsPath.replace(workspacePath + '/', '');

		const affectedSpecs = this.specFileMap.get(relativePath) ?? [];

		for (const specDir of affectedSpecs) {
			const warning: SpecSyncWarning = {
				specFile: `${specDir}/tasks.md`,
				codeFile: relativePath,
				message: `Code file "${relativePath}" changed. This file is referenced by a spec in ${specDir}. Review the spec for consistency.`,
				direction: 'code-to-spec',
			};

			this._onDidDetectSync.fire(warning);
			this.addDiagnostic(uri, warning.message);
		}
	}

	/**
	 * Handle a spec file change — check if code files need updating.
	 */
	private onSpecFileChanged(uri: vscode.Uri): void {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
		const relativePath = uri.fsPath.replace(workspacePath + '/', '');

		// Rebuild the file map when specs change
		this.buildSpecFileMap();

		const fileName = relativePath.split('/').pop() ?? '';

		if (fileName === 'requirements.md') {
			const warning: SpecSyncWarning = {
				specFile: relativePath,
				codeFile: relativePath.replace('requirements.md', 'design.md'),
				message: 'Requirements updated — design and tasks may need regeneration.',
				direction: 'spec-to-code',
			};
			this._onDidDetectSync.fire(warning);
		}

		if (fileName === 'design.md') {
			const warning: SpecSyncWarning = {
				specFile: relativePath,
				codeFile: relativePath.replace('design.md', 'tasks.md'),
				message: 'Design updated — tasks may need regeneration.',
				direction: 'spec-to-code',
			};
			this._onDidDetectSync.fire(warning);
		}

		if (fileName === 'tasks.md') {
			const warning: SpecSyncWarning = {
				specFile: relativePath,
				codeFile: '',
				message: 'Tasks updated — verify referenced files still align with the design.',
				direction: 'spec-to-code',
			};
			this._onDidDetectSync.fire(warning);
		}
	}

	/**
	 * Add a diagnostic (warning) to a file.
	 */
	private addDiagnostic(uri: vscode.Uri, message: string): void {
		const diagnostic = new vscode.Diagnostic(
			new vscode.Range(0, 0, 0, 0),
			message,
			vscode.DiagnosticSeverity.Warning,
		);
		diagnostic.source = 'Son of Anton (Spec Sync)';

		const existing = this.diagnosticCollection.get(uri) ?? [];
		this.diagnosticCollection.set(uri, [...existing, diagnostic]);

		// Auto-clear after 5 minutes
		setTimeout(() => {
			const current = this.diagnosticCollection.get(uri) ?? [];
			const filtered = current.filter(d => d !== diagnostic);
			if (filtered.length > 0) {
				this.diagnosticCollection.set(uri, filtered);
			} else {
				this.diagnosticCollection.delete(uri);
			}
		}, 5 * 60 * 1000);
	}

	/**
	 * Extract file paths from a tasks.md content.
	 */
	private extractFilesFromTasks(content: string): string[] {
		const files: string[] = [];
		const fileFieldRegex = /-\s*\*\*Files:\*\*\s*(.+)/g;

		let match;
		while ((match = fileFieldRegex.exec(content)) !== null) {
			const fileList = match[1]
				.split(',')
				.map(f => f.trim().replace(/\s*\(.+\)\s*$/, ''))
				.filter(Boolean);
			files.push(...fileList);
		}

		return files;
	}

	/**
	 * Dispose all watchers.
	 */
	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this._onDidDetectSync.dispose();
		this.diagnosticCollection.dispose();
	}
}
