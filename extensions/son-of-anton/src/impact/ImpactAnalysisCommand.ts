/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Registers the "Show Impact Analysis" command and context menu item.
 * Queries the code graph MCP server for impact data and displays
 * it in the ImpactAnalysisPanel.
 */

import * as vscode from 'vscode';
import { McpClient } from '../mcp/McpClient';
import { ImpactAnalysisPanel, ImpactAnalysisData, ImpactNode, ImpactEdge } from './ImpactAnalysisPanel';

export function registerImpactAnalysisCommand(
	context: vscode.ExtensionContext,
	mcpClient: McpClient,
): void {
	const command = vscode.commands.registerCommand(
		'son-of-anton.showImpactAnalysis',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showWarningMessage('No active editor. Open a file to analyze impact.');
				return;
			}

			const document = editor.document;
			const position = editor.selection.active;

			// Get the symbol at cursor using VS Code's built-in symbol provider
			const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
				'vscode.executeDocumentSymbolProvider',
				document.uri,
			);

			const targetSymbol = findSymbolAtPosition(symbols ?? [], position);
			const wordRange = document.getWordRangeAtPosition(position);
			const fallbackSymbolName = wordRange ? document.getText(wordRange) : undefined;
			const symbolName = targetSymbol?.name ?? fallbackSymbolName;

			if (!symbolName) {
				vscode.window.showWarningMessage('No symbol found at cursor position.');
				return;
			}

			const filePath = vscode.workspace.asRelativePath(document.uri);

			// Show progress while querying
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Analyzing impact of "${symbolName}"...`,
					cancellable: false,
				},
				async () => {
					try {
						const result = await mcpClient.callTool({
							server: 'code-graph',
							tool: 'impact_analysis',
							inputs: { symbol: symbolName, file: filePath },
						});

						const rawData = JSON.parse(result.content);
						const data = transformToImpactData(symbolName, filePath, rawData);

						const panel = ImpactAnalysisPanel.createOrShow(context.extensionUri);
						panel.update(data);
					} catch (err) {
						const message = err instanceof Error ? err.message : String(err);
						vscode.window.showErrorMessage(`Impact analysis failed: ${message}`);
					}
				},
			);
		},
	);

	context.subscriptions.push(command);
}

/**
 * Find the deepest symbol containing the given position.
 */
function findSymbolAtPosition(
	symbols: vscode.DocumentSymbol[],
	position: vscode.Position,
): vscode.DocumentSymbol | undefined {
	for (const symbol of symbols) {
		if (symbol.range.contains(position)) {
			// Check children first for deeper match
			const child = findSymbolAtPosition(symbol.children, position);
			return child ?? symbol;
		}
	}
	return undefined;
}

/**
 * Transform raw MCP impact_analysis response into ImpactAnalysisData.
 */
function transformToImpactData(
	symbolName: string,
	filePath: string,
	raw: Record<string, unknown>,
): ImpactAnalysisData {
	const nodes: ImpactNode[] = [];
	const edges: ImpactEdge[] = [];

	const directCallers = (raw.directCallers ?? raw.direct ?? []) as Array<Record<string, string>>;
	const transitiveCallers = (raw.transitiveCallers ?? raw.transitive ?? []) as Array<Record<string, string>>;
	const testFiles = (raw.testFiles ?? raw.tests ?? []) as Array<Record<string, string>>;
	const documentationFiles = (raw.documentation ?? raw.docs ?? []) as Array<Record<string, string>>;

	for (const caller of directCallers) {
		const id = `direct-${nodes.length}`;
		nodes.push({
			id,
			label: caller.name ?? caller.symbol ?? caller.file ?? 'unknown',
			filePath: caller.file ?? caller.filePath ?? '',
			symbolName: caller.name ?? caller.symbol,
			type: 'direct',
			depth: 1,
			signature: caller.signature,
		});
		edges.push({
			source: id,
			target: 'root',
			relationship: caller.relationship ?? 'calls',
		});
	}

	for (const caller of transitiveCallers) {
		const id = `transitive-${nodes.length}`;
		nodes.push({
			id,
			label: caller.name ?? caller.symbol ?? caller.file ?? 'unknown',
			filePath: caller.file ?? caller.filePath ?? '',
			symbolName: caller.name ?? caller.symbol,
			type: 'transitive',
			depth: parseInt(caller.depth ?? '2', 10),
			signature: caller.signature,
		});
		edges.push({
			source: id,
			target: 'root',
			relationship: caller.relationship ?? 'transitively calls',
		});
	}

	for (const test of testFiles) {
		const id = `test-${nodes.length}`;
		nodes.push({
			id,
			label: test.name ?? test.file ?? 'unknown',
			filePath: test.file ?? test.filePath ?? '',
			type: 'test',
			depth: 1,
		});
		edges.push({
			source: id,
			target: 'root',
			relationship: 'tests',
		});
	}

	for (const doc of documentationFiles) {
		const id = `doc-${nodes.length}`;
		nodes.push({
			id,
			label: doc.name ?? doc.file ?? 'unknown',
			filePath: doc.file ?? doc.filePath ?? '',
			type: 'documentation',
			depth: 1,
		});
		edges.push({
			source: id,
			target: 'root',
			relationship: 'documents',
		});
	}

	return {
		target: {
			name: symbolName,
			filePath,
		},
		nodes,
		edges,
		summary: {
			directCount: directCallers.length,
			transitiveCount: transitiveCallers.length,
			testCount: testFiles.length,
			documentationCount: documentationFiles.length,
		},
	};
}
