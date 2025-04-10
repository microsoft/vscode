// src/fileExplorer.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Workspace state interface
interface DirectoryState {
	directory: { [key: string]: DirectoryState };
	file: { [key: string]: string };
}

interface WorkspaceState {
	[key: string]: DirectoryState;
}

const CONSTANTS = {
	DEFAULT_VISIBLE_RANGE: new vscode.Range(0, 0, 30, 0),
	FILE_EXTENSION: '.py',
	REFRESH_DELAY_MS: 50,
	WATCHER_PATTERN: '**/*.py',
};

export class FileExplorer implements vscode.TreeDataProvider<FileItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<
		FileItem | undefined | null | void
	> = new vscode.EventEmitter<FileItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<
		FileItem | undefined | null | void
	> = this._onDidChangeTreeData.event;

	// Track expanded directories
	private expandedDirectories: Set<string> = new Set();
	private workspaceState: WorkspaceState = {};
	private activeFilePath: string | undefined;
	private treeView: vscode.TreeView<FileItem> | undefined;
	private visibleRanges: Map<string, vscode.Range> = new Map();
	public context: vscode.ExtensionContext | undefined;

	constructor(private rootPath: string) {
		// Normalize the root path
		this.rootPath = path.normalize(rootPath);

		// Initialize the workspace state
		this.updateWorkspaceState();

		// Add debouncing for file changes
		let fileChangeTimeout: NodeJS.Timeout | null = null;

		// Listen for file changes with debouncing
		const fileWatcher = vscode.workspace.createFileSystemWatcher(
			CONSTANTS.WATCHER_PATTERN,
		);
		const handleFileChangeWithDebounce = (uri: vscode.Uri) => {
			if (fileChangeTimeout) {
				clearTimeout(fileChangeTimeout);
			}
			fileChangeTimeout = setTimeout(() => {
				this.handleFileChange(uri);
				fileChangeTimeout = null;
			}, 300); // 300ms debounce
		};

		fileWatcher.onDidChange(handleFileChangeWithDebounce);
		fileWatcher.onDidCreate(handleFileChangeWithDebounce);
		fileWatcher.onDidDelete(handleFileChangeWithDebounce);

		// Track active editor changes
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor && editor.document.languageId === 'python') {
				this.activeFilePath = editor.document.uri.fsPath;
				this.updateWorkspaceState();
			}
		});

		// Get initial active editor
		if (
			vscode.window.activeTextEditor &&
			vscode.window.activeTextEditor.document.languageId === 'python'
		) {
			this.activeFilePath =
				vscode.window.activeTextEditor.document.uri.fsPath;
		}
	}

	// Store the TreeView reference
	setTreeView(treeView: vscode.TreeView<FileItem>): void {
		this.treeView = treeView;
	}

	private handleFileChange(uri: vscode.Uri): void {
		if (path.extname(uri.fsPath) === CONSTANTS.FILE_EXTENSION) {
			this.updateWorkspaceState();
		}
	}

	// Parse Python file to extract class and function signatures
	private parsePythonFile(
		filePath: string,
		getFullContent: boolean = false,
	): string {
		try {
			const content = fs.readFileSync(filePath, 'utf8');

			// If it's the active file, return the full content
			if (getFullContent) {
				return content;
			}

			// Extract class and function signatures using regex
			const signatures: string[] = [];

			// Match class definitions - improved to handle comments before class definitions
			// but only extract the actual class signature
			const classRegex =
				/^([ \t]*)(?:#.*\n[ \t]*)*class\s+(\w+)(?:\s*\(([^)]*)\))?:/gm;
			let classMatch;
			while ((classMatch = classRegex.exec(content)) !== null) {
				const indentation = classMatch[1] || '';
				const className = classMatch[2];
				const inheritance = classMatch[3] || '';

				const classStart = classMatch.index;
				const classBlock = this.extractBlock(content, classStart);

				// Start building the class signature with inheritance if present, but no comments
				let classSignature = `\n${indentation}class ${className}`;
				if (inheritance) {
					classSignature += `(${inheritance})`;
				}
				classSignature += `:`;

				// Match method definitions within this class
				const methodRegex = new RegExp(
					`^(${indentation}[ \\t]+)(?:#.*\\n${indentation}[ \\t]+)*def\\s+(\\w+)\\s*\\([^)]*\\):`,
					'gm',
				);
				const classMethods: string[] = [];

				let methodMatch;
				const methodContent = classBlock;
				while (
					(methodMatch = methodRegex.exec(methodContent)) !== null
				) {
					const methodIndent = methodMatch[1];
					const methodName = methodMatch[2];
					// Output only the method signature without comments
					classMethods.push(`\n${methodIndent}def ${methodName}():`);
				}

				// Add methods to class signature
				classSignature += classMethods.join('\n\n');
				signatures.push(classSignature);
			}

			// Match standalone function definitions
			const funcRegex =
				/^([ \t]*)(?:#.*\n[ \t]*)*def\s+(\w+)\s*\([^)]*\):/gm;
			let funcMatch;
			while ((funcMatch = funcRegex.exec(content)) !== null) {
				const indentation = funcMatch[1] || '';
				const funcName = funcMatch[2];
				// Output only the function signature without comments
				signatures.push(`${indentation}def ${funcName}():`);
			}

			return signatures.join('\n\n');
		} catch (err) {
			console.error(`Error parsing Python file: ${filePath}`, err);
			return '';
		}
	}

	// Helper to extract a code block starting from a position
	private extractBlock(content: string, startPos: number): string {
		// Find the end of the line
		const lineEnd = content.indexOf('\n', startPos);
		if (lineEnd === -1) {
			return content.substring(startPos);
		}

		// Find the indentation level of the next line
		const nextLineStart = lineEnd + 1;
		if (nextLineStart >= content.length) {
			return content.substring(startPos);
		}

		const indentMatch = /^(\s+)/.exec(content.substring(nextLineStart));
		if (!indentMatch) {
			return content.substring(startPos, lineEnd);
		}

		const indentLevel = indentMatch[1].length;

		// Find the end of the block
		let line;
		let blockEnd = content.length;

		const lines = content.substring(nextLineStart).split('\n');
		for (let i = 0; i < lines.length; i++) {
			line = lines[i];

			// If we find a line with less indentation, end the block
			if (line.trim().length > 0 && line.search(/\S/) < indentLevel) {
				blockEnd = nextLineStart + lines.slice(0, i).join('\n').length;
				break;
			}
		}

		return content.substring(startPos, blockEnd);
	}

	// Recursively build the workspace state
	private buildDirectoryState(
		directoryPath: string,
		isExpanded: boolean,
	): DirectoryState {
		const result: DirectoryState = {
			directory: {},
			file: {},
		};

		if (!fs.existsSync(directoryPath)) {
			return result;
		}

		// Only process expanded directories
		if (isExpanded || directoryPath === this.rootPath) {
			try {
				const entries = fs.readdirSync(directoryPath);

				for (const entry of entries) {
					const fullPath = path.join(directoryPath, entry);
					const stat = fs.statSync(fullPath);

					if (stat.isDirectory()) {
						// Process subdirectory
						const isSubdirExpanded =
							this.expandedDirectories.has(fullPath);
						result.directory[entry] = this.buildDirectoryState(
							fullPath,
							isSubdirExpanded,
						);
					} else if (
						path.extname(entry) === CONSTANTS.FILE_EXTENSION
					) {
						// Process Python file
						const isActiveFile = fullPath === this.activeFilePath;
						result.file[entry] = this.parsePythonFile(
							fullPath,
							isActiveFile,
						);
					}
				}
			} catch (err) {
				console.error(
					`Error building directory state for ${directoryPath}:`,
					err,
				);
			}
		}

		return result;
	}

	/**
	 * Update the workspace state
	 * @param notify Whether to notify listeners about the state change
	 */
	private updateWorkspaceState(notify: boolean = true): void {
		if (this.rootPath) {
			const rootDirName = path.basename(this.rootPath);
			const rootDir = path.dirname(this.rootPath);
			this.workspaceState = {
				[this.rootPath]: this.buildDirectoryState(this.rootPath, true),
			};

			// Notify state change if requested
			if (notify) {
				this.notifyStateChange();
			}
		}
	}

	// Notify state change using a custom event
	private notifyStateChange(): void {
		vscode.commands.executeCommand(
			'curveExplorer.stateChanged',
			this.workspaceState,
		);
	}

	/**
	 * Get the current workspace state
	 * @param activeFilePath Optional path to a file that should be treated as the active file
	 * @returns The current workspace state
	 */
	getState(activeFilePath?: string): {
		workspaceState: WorkspaceState;
		visibleRange?: {
			content: string;
			range: vscode.Range;
			filePath: string;
		};
	} {
		if (activeFilePath) {
			// If an active file is specified, create a new workspace state with that file as active
			const tempActiveFile = this.activeFilePath;
			this.activeFilePath = activeFilePath;

			// Update workspace state with the new active file
			this.updateWorkspaceState(false); // Don't notify changes

			// Store the result
			const result = this.workspaceState;
			const visibleRange = this.getVisibleRange();

			// Restore the original active file
			this.activeFilePath = tempActiveFile;
			this.updateWorkspaceState(false); // Restore original state without notifying
			return { workspaceState: result, visibleRange: visibleRange };
		}
		return {
			workspaceState: this.workspaceState,
			visibleRange: this.getVisibleRange(),
		};
	}
	/**
	 * Get the currently visible editor content for the active file
	 */
	getVisibleRange(): {
		content: string;
		range: vscode.Range;
		filePath: string;
	} {
		if (
			this.activeFilePath &&
			(this.activeFilePath.endsWith(CONSTANTS.FILE_EXTENSION) ||
				this.activeFilePath.endsWith('Dockerfile'))
		) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.uri.fsPath === this.activeFilePath) {
				this.visibleRanges.set(
					this.activeFilePath,
					editor.visibleRanges[0],
				);
				return {
					content: editor.document.getText(),
					range: editor.visibleRanges[0],
					filePath: this.activeFilePath,
				};
			} else {
				// Get visible range from memento state
				const visibleRangesState = this.context?.workspaceState.get(
					'visibleRanges',
					{},
				) as Record<string, any>;

				let range = CONSTANTS.DEFAULT_VISIBLE_RANGE; // Default range

				if (
					visibleRangesState &&
					visibleRangesState[this.activeFilePath]
				) {
					const storedRange = visibleRangesState[this.activeFilePath];
					range = new vscode.Range(
						storedRange.start.line,
						storedRange.start.character,
						storedRange.end.line,
						storedRange.end.character,
					);
				}
				const content = fs.readFileSync(this.activeFilePath, 'utf8');
				return {
					content: content,
					range: range,
					filePath: this.activeFilePath,
				};
			}
		}
		return {
			content: '',
			range: new vscode.Range(0, 0, 0, 0),
			filePath: '',
		};
	}

	refresh(): void {
		this.updateWorkspaceState();
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: FileItem): vscode.TreeItem {
		return element;
	}

	// Handle expanded/collapsed state changes
	onDidExpandElement(element: FileItem): void {
		if (element.resourceUri) {
			this.expandedDirectories.add(element.resourceUri.fsPath);
			this.updateWorkspaceState();
		}
	}

	onDidCollapseElement(element: FileItem): void {
		if (element.resourceUri) {
			this.expandedDirectories.delete(element.resourceUri.fsPath);
			this.updateWorkspaceState();
		}
	}

	/**
	 * Expand the tree view to reveal a specific file
	 * @param filePath The full path to the file to reveal
	 */
	async expandPathToFile(filePath: string): Promise<void> {
		if (
			!filePath ||
			!this.rootPath ||
			!filePath.startsWith(this.rootPath)
		) {
			return;
		}

		// Add all parent directories to expanded directories set
		const normalizedRootPath = path.normalize(this.rootPath);
		const pathsToExpand: string[] = [];

		// Add the file's parent directory
		let currentPath = path.normalize(path.dirname(filePath));

		// Build array of paths from the file up to the workspace root
		while (currentPath.length >= normalizedRootPath.length) {
			pathsToExpand.push(currentPath);
			if (currentPath === normalizedRootPath) {
				break;
			}
			currentPath = path.dirname(currentPath);
		}

		// Make sure root is included
		if (!pathsToExpand.includes(normalizedRootPath)) {
			pathsToExpand.push(normalizedRootPath);
		}

		// Sort paths by depth (root first, then deeper paths)
		pathsToExpand.sort(
			(a, b) => a.split(path.sep).length - b.split(path.sep).length,
		);

		console.log('Paths to expand:', pathsToExpand);

		// Clear existing expanded directories and add new ones
		this.expandedDirectories.clear();

		// Programmatically expand each directory in order
		for (const dirPath of pathsToExpand) {
			// Add to expanded directories
			this.expandedDirectories.add(dirPath);

			// If we have a tree view reference, programmatically reveal the item
			if (this.treeView) {
				try {
					// Create a FileItem for this directory to reveal it
					const dirItem = new FileItem(
						vscode.Uri.file(dirPath),
						vscode.TreeItemCollapsibleState.Expanded,
						'folder',
					);

					// Use the tree view API to reveal this item
					await this.treeView.reveal(dirItem, {
						expand: true,
						select: false,
						focus: false,
					});

					// Small delay to allow UI to update
					await new Promise((resolve) =>
						setTimeout(resolve, CONSTANTS.REFRESH_DELAY_MS),
					);
				} catch (err) {
					console.error(`Error revealing path ${dirPath}:`, err);
				}
			}
		}

		// Update state and refresh view
		this.updateWorkspaceState();
		this._onDidChangeTreeData.fire();
		this.refresh();

		// Reveal the final file
		if (this.treeView) {
			const fileItem = new FileItem(
				vscode.Uri.file(filePath),
				vscode.TreeItemCollapsibleState.None,
				'file',
			);
			await this.treeView.reveal(fileItem, {
				expand: true,
				select: true,
			});
		}
		this.refresh();
	}

	async getChildren(element?: FileItem): Promise<FileItem[]> {
		if (!this.rootPath) {
			vscode.window.showInformationMessage('No workspace folder is open');
			return Promise.resolve([]);
		}

		const targetPath = element ? element.resourceUri.fsPath : this.rootPath;
		const normalizedTargetPath = path.normalize(targetPath);

		if (fs.existsSync(normalizedTargetPath)) {
			try {
				const files = fs.readdirSync(normalizedTargetPath);

				// Sort directories first, then files
				const sortedFiles = files.sort((a, b) => {
					const aPath = path.join(normalizedTargetPath, a);
					const bPath = path.join(normalizedTargetPath, b);

					const aIsDir = fs.statSync(aPath).isDirectory();
					const bIsDir = fs.statSync(bPath).isDirectory();

					if (aIsDir && !bIsDir) {
						return -1;
					}
					if (!aIsDir && bIsDir) {
						return 1;
					}
					return a.localeCompare(b);
				});

				return sortedFiles.map((file) => {
					const filePath = path.join(normalizedTargetPath, file);
					const normalizedFilePath = path.normalize(filePath);
					const stat = fs.statSync(normalizedFilePath);
					const isDirectory = stat.isDirectory();

					// Special handling for directories
					let collapsibleState = vscode.TreeItemCollapsibleState.None;

					if (isDirectory) {
						// Check if this directory should be expanded
						// Use both the normalized and non-normalized paths for maximum compatibility
						const shouldExpand =
							this.expandedDirectories.has(normalizedFilePath) ||
							this.expandedDirectories.has(filePath);

						collapsibleState = shouldExpand
							? vscode.TreeItemCollapsibleState.Expanded
							: vscode.TreeItemCollapsibleState.Collapsed;
					}

					return new FileItem(
						vscode.Uri.file(normalizedFilePath),
						collapsibleState,
						isDirectory ? 'folder' : 'file',
					);
				});
			} catch (err) {
				vscode.window.showErrorMessage(
					`Error reading directory: ${err}`,
				);
				return [];
			}
		}

		return [];
	}
}

class FileItem extends vscode.TreeItem {
	constructor(
		public readonly resourceUri: vscode.Uri,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly contextValue: string,
	) {
		super(resourceUri, collapsibleState);

		this.tooltip = this.resourceUri.fsPath;
		this.description = '';

		if (this.contextValue === 'file') {
			this.command = {
				command: 'curveExplorer.openFile',
				title: 'Open File',
				arguments: [this.resourceUri],
			};
		}
	}

	// Override equals method to help with finding and revealing items
	public equals(other: FileItem): boolean {
		if (!other) {
			return false;
		}
		return this.resourceUri.fsPath === other.resourceUri.fsPath;
	}
}

export const fileExplorer = new FileExplorer(
	vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
);
