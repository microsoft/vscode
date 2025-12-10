/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { OutputChannelLogger } from '../utils/logger';
import { LaTeXLogParser, LaTeXLogItem } from '../diagnostics/logParser';

export interface BuildResultItem {
	label: string;
	description?: string;
	tooltip?: string;
	iconPath?: vscode.ThemeIcon;
	command?: {
		command: string;
		title: string;
		arguments?: any[];
	};
	children?: BuildResultItem[];
	collapsibleState?: vscode.TreeItemCollapsibleState;
	resourceUri?: vscode.Uri;
	contextValue?: string;
}

/**
 * Provides a tree view of LaTeX build results (errors, warnings, info)
 * Allows users to navigate to issues in the editor
 */
export class BuildResultsProvider
	implements vscode.TreeDataProvider<BuildResultItem>, vscode.Disposable {
	private _onDidChangeTreeData: vscode.EventEmitter<BuildResultItem | undefined | null | void> =
		new vscode.EventEmitter<BuildResultItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<BuildResultItem | undefined | null | void> =
		this._onDidChangeTreeData.event;

	private buildResults: Map<
		string,
		{
			uri: vscode.Uri;
			items: LaTeXLogItem[];
			timestamp: number;
		}
	> = new Map();

	constructor(
		private readonly logger: OutputChannelLogger,
		_logParser: LaTeXLogParser
	) {
		// logParser parameter kept for API consistency, may be used for enhanced parsing in future
	}

	/**
	 * Update build results from a compilation
	 */
	async updateBuildResults(uri: vscode.Uri, logContent: string): Promise<void> {
		try {
			// Parse the log to extract items
			const items: LaTeXLogItem[] = [];

			// Parse log content to extract items
			this.parseLogToItems(logContent, uri, items);

			this.buildResults.set(uri.toString(), {
				uri,
				items,
				timestamp: Date.now(),
			});

			this._onDidChangeTreeData.fire();
			this.logger.info(`Updated build results for ${uri.toString()}: ${items.length} items`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Failed to update build results: ${message}`);
		}
	}

	/**
	 * Clear build results for a document
	 */
	clearBuildResults(uri: vscode.Uri): void {
		this.buildResults.delete(uri.toString());
		this._onDidChangeTreeData.fire();
	}

	/**
	 * Clear all build results
	 */
	clearAll(): void {
		this.buildResults.clear();
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: BuildResultItem): vscode.TreeItem {
		const item = new vscode.TreeItem(
			element.label,
			element.collapsibleState ?? vscode.TreeItemCollapsibleState.None
		);

		if (element.description) {
			item.description = element.description;
		}

		if (element.tooltip) {
			item.tooltip = element.tooltip;
		} else if (element.description) {
			item.tooltip = `${element.label} - ${element.description}`;
		}

		if (element.iconPath) {
			item.iconPath = element.iconPath;
		}

		if (element.command) {
			item.command = element.command;
		}

		if (element.resourceUri) {
			item.resourceUri = element.resourceUri;
		}

		if (element.contextValue) {
			item.contextValue = element.contextValue;
		}

		return item;
	}

	getChildren(element?: BuildResultItem): BuildResultItem[] {
		if (!element) {
			// Root level: show all files with build results
			const fileItems: BuildResultItem[] = [];
			for (const [uriString, result] of this.buildResults.entries()) {
				const errorCount = result.items.filter((i) => i.type === 'error').length;
				const warningCount = result.items.filter((i) => i.type === 'warning').length;

				const fileName = vscode.Uri.parse(uriString).path.split('/').pop() || 'Unknown';
				const description =
					errorCount > 0 || warningCount > 0
						? `${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`
						: 'No issues';

				fileItems.push({
					label: fileName,
					description: description,
					tooltip: `${result.uri.fsPath || result.uri.toString()}\n${description}`,
					iconPath:
						errorCount > 0
							? new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))
							: warningCount > 0
								? new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'))
								: new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed')),
					collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
					resourceUri: result.uri,
					contextValue: 'latexBuildResult:file',
				});
			}

			if (fileItems.length === 0) {
				return [
					{
						label: 'No build results',
						description: 'Compile a LaTeX document to see results here',
						iconPath: new vscode.ThemeIcon('info'),
					},
				];
			}

			return fileItems.sort((a, b) => {
				// Sort by error count, then warning count
				const aResult = this.buildResults.get(a.resourceUri!.toString());
				const bResult = this.buildResults.get(b.resourceUri!.toString());
				if (!aResult || !bResult) {
					return 0;
				}

				const aErrors = aResult.items.filter((i) => i.type === 'error').length;
				const bErrors = bResult.items.filter((i) => i.type === 'error').length;
				if (aErrors !== bErrors) {
					return bErrors - aErrors;
				}

				const aWarnings = aResult.items.filter((i) => i.type === 'warning').length;
				const bWarnings = bResult.items.filter((i) => i.type === 'warning').length;
				return bWarnings - aWarnings;
			});
		}

		// Child level: show items for the selected file or group
		const uriString = element.resourceUri?.toString();
		if (!uriString) {
			// Check if this is a group item
			const groupMatch = element.label.match(/^(Errors|Warnings|Info) \((\d+)\)$/);
			if (groupMatch) {
				// Find the parent file item
				// We need to track parent context - for now, return empty and handle differently
				return [];
			}
			return [];
		}

		const result = this.buildResults.get(uriString);
		if (!result) {
			return [];
		}

		// Check if this element is a group header (by checking if it has a group context)
		if (element.contextValue === 'latexBuildResult:group') {
			// Return individual items for this group
			const groupType = element.label.startsWith('Errors')
				? 'error'
				: element.label.startsWith('Warnings')
					? 'warning'
					: 'info';

			let items: LaTeXLogItem[];
			if (groupType === 'error') {
				items = result.items.filter((i) => i.type === 'error');
			} else if (groupType === 'warning') {
				items = result.items.filter((i) => i.type === 'warning');
			} else {
				items = result.items.filter(
					(i) => i.type === 'typesetting' || (i.type === '' && i.text.trim())
				);
			}

			return items.map((item) => {
				const lineInfo = item.line > 0 ? `Line ${item.line}` : '';
				const fileInfo =
					item.file && item.file !== result.uri.fsPath ? ` (${item.file.split('/').pop()})` : '';

				return {
					label: item.text.trim() || 'Unknown issue',
					description: lineInfo + fileInfo,
					tooltip: `${item.text.trim()}\n${lineInfo}${fileInfo ? `\nFile: ${item.file}` : ''}`,
					iconPath:
						groupType === 'error'
							? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('errorForeground'))
							: groupType === 'warning'
								? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('warningForeground'))
								: new vscode.ThemeIcon('circle-outline'),
					command: {
						command: 'vscode.open',
						title: 'Go to Issue',
						arguments: [
							result.uri,
							{
								selection:
									item.line > 0
										? new vscode.Range(Math.max(0, item.line - 1), 0, Math.max(0, item.line - 1), 0)
										: undefined,
							},
						],
					},
					resourceUri: result.uri,
					contextValue: `latexBuildResult:${groupType}`,
				};
			});
		}

		// This is a file item - show groups
		// Group items by type
		const errors = result.items.filter((i) => i.type === 'error');
		const warnings = result.items.filter((i) => i.type === 'warning');
		const info = result.items.filter(
			(i) => i.type === 'typesetting' || (i.type === '' && i.text.trim())
		);

		const children: BuildResultItem[] = [];

		if (errors.length > 0) {
			children.push({
				label: `Errors (${errors.length})`,
				iconPath: new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground')),
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				contextValue: 'latexBuildResult:group',
				resourceUri: result.uri, // Store URI for group items too
			});
		}

		if (warnings.length > 0) {
			children.push({
				label: `Warnings (${warnings.length})`,
				iconPath: new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground')),
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				contextValue: 'latexBuildResult:group',
				resourceUri: result.uri,
			});
		}

		if (info.length > 0 && info.length <= 20) {
			// Only show info if there aren't too many
			children.push({
				label: `Info (${info.length})`,
				iconPath: new vscode.ThemeIcon('info'),
				collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
				contextValue: 'latexBuildResult:group',
				resourceUri: result.uri,
			});
		}

		return children;
	}

	/**
	 * Parse log content to extract items
	 * This is a simplified parser that extracts basic error/warning patterns
	 */
	private parseLogToItems(logContent: string, uri: vscode.Uri, items: LaTeXLogItem[]): void {
		const lines = logContent.split('\n');
		let currentItem: LaTeXLogItem | null = null;
		let inError = false;
		let inWarning = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// Error pattern: ! Error message
			if (line.match(/^!\s+/)) {
				if (currentItem) {
					items.push(currentItem);
				}
				inError = true;
				inWarning = false;
				currentItem = {
					type: 'error',
					file: uri.fsPath || uri.toString(),
					line: this.extractLineNumber(line, lines, i),
					text: line.replace(/^!\s+/, '').trim(),
				};
			}
			// Warning pattern: LaTeX Warning: or Package Warning:
			else if (
				line.match(/^LaTeX Warning:/i) ||
				line.match(/^Package \S+ Warning:/i) ||
				line.match(/^Class \S+ Warning:/i)
			) {
				if (currentItem) {
					items.push(currentItem);
				}
				inError = false;
				inWarning = true;
				currentItem = {
					type: 'warning',
					file: uri.fsPath || uri.toString(),
					line: this.extractLineNumber(line, lines, i),
					text: line.trim(),
				};
			}
			// Line number pattern: l.<number>
			else if (line.match(/^l\.\d+/)) {
				if (currentItem && inError) {
					// Update line number for current error
					const lineMatch = line.match(/^l\.(\d+)/);
					if (lineMatch) {
						currentItem.line = parseInt(lineMatch[1], 10);
					}
					// Get error position text
					const posMatch = line.match(/^l\.\d+\s+(?:\.\.\.)?\s*(.+)$/);
					if (posMatch) {
						currentItem.errorPosText = posMatch[1].trim();
					}
				}
			}
			// Continue current item (error or warning continuation)
			else if (currentItem && trimmed && (inError || inWarning)) {
				// Only add continuation if it's not another error/warning pattern
				if (!trimmed.match(/^!\s+/) && !trimmed.match(/Warning:/i)) {
					currentItem.text += ' ' + trimmed;
				}
			}
			// Typesetting info (overfull/underfull boxes)
			else if (trimmed.match(/^(Overfull|Underfull)/)) {
				if (currentItem) {
					items.push(currentItem);
					currentItem = null;
				}
				const lineNum = this.extractLineNumber(line, lines, i);
				items.push({
					type: 'typesetting',
					file: uri.fsPath || uri.toString(),
					line: lineNum,
					text: trimmed,
				});
				inError = false;
				inWarning = false;
			}
		}

		if (currentItem) {
			items.push(currentItem);
		}
	}

	/**
	 * Extract line number from log line or nearby lines
	 */
	private extractLineNumber(line: string, allLines: string[], currentIndex: number): number {
		// Try to find line number in current line
		const lineMatch = line.match(/line\s+(\d+)/i);
		if (lineMatch) {
			return parseInt(lineMatch[1], 10);
		}

		// Look for l.<number> pattern
		const lPattern = line.match(/^l\.(\d+)/);
		if (lPattern) {
			return parseInt(lPattern[1], 10);
		}

		// Look in nearby lines
		for (
			let i = Math.max(0, currentIndex - 3);
			i <= Math.min(allLines.length - 1, currentIndex + 3);
			i++
		) {
			const nearbyLine = allLines[i];
			const nearbyMatch = nearbyLine.match(/line\s+(\d+)/i) || nearbyLine.match(/^l\.(\d+)/);
			if (nearbyMatch) {
				return parseInt(nearbyMatch[1], 10);
			}
		}

		return 0;
	}

	dispose(): void {
		this.buildResults.clear();
		this._onDidChangeTreeData.dispose();
	}
}
