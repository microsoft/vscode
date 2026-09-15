/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert';

import * as vscode from 'vscode';
import { suite, test, vi } from 'vitest';

const openTextDocument = vi.hoisted(() => vi.fn());

vi.mock('vscode', async importOriginal => {
	const actual = await importOriginal<typeof import('vscode')>();
	class TreeItem {
		id?: string;
		resourceUri?: vscode.Uri;
		description?: string;
		tooltip?: string;
		iconPath?: vscode.ThemeIcon;
		contextValue?: string;
		accessibilityInformation?: vscode.AccessibilityInformation;
		command?: vscode.Command;

		constructor(
			readonly label: string,
			readonly collapsibleState: vscode.TreeItemCollapsibleState,
		) { }
	}
	class ThemeIcon extends actual.ThemeIcon {
		static override readonly File = new ThemeIcon('file');
	}
	return {
		...actual,
		ThemeIcon,
		TreeItem,
		TreeItemCollapsibleState: {
			None: 0,
			Collapsed: 1,
			Expanded: 2,
		},
		workspace: {
			onDidSaveTextDocument: () => ({ dispose: () => { } }),
			openTextDocument,
		},
	};
});

import type { IGitExtensionService } from '../../../../platform/git/common/gitExtensionService';
import type { API, Change, Repository } from '../../../../platform/git/vscode/git';
import type { ICodeReviewService, TypeScriptChangeClassificationInput, TypeScriptChangeClassificationResult, TypeScriptMetricsResult } from '../../../../platform/languageContextProvider/common/codeReviewService';
import type { ILogService } from '../../../../platform/log/common/logService';
import { Event } from '../../../../util/vs/base/common/event';
import { ChangedEntitiesTreeDataProvider } from '../changedEntitiesView';

suite('Changed entities view', () => {
	test('classifies one aggregate Git file lazily and renders nested entity paths', async () => {
		const original = [
			'class Reader {',
			'\tlisten(): void {',
			'\t\tstart();',
			'\t}',
			'}',
		].join('\n');
		const modified = [
			'class Reader {',
			'\tlisten(options?: object): void {',
			'\t\tstart();',
			'\t\tlog();',
			'\t}',
			'}',
		].join('\n');
		openTextDocument.mockReset();
		openTextDocument.mockResolvedValue({ getText: () => modified });

		const uri = vscode.Uri.file('C:\\workspace\\src\\reader.ts');
		const change = {
			uri,
			originalUri: uri,
			renameUri: undefined,
			status: 5 /* Status.MODIFIED */,
		} satisfies Change;
		const repository = {
			rootUri: vscode.Uri.file('C:\\workspace'),
			state: {
				indexChanges: [change],
				workingTreeChanges: [change],
				untrackedChanges: [],
				mergeChanges: [],
				onDidChange: Event.None,
			},
			show: vi.fn(async () => original),
		} as unknown as Repository;
		const api = {
			repositories: [repository],
			onDidOpenRepository: Event.None,
			onDidCloseRepository: Event.None,
		} as unknown as API;
		const gitExtensionService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			extensionAvailable: true,
			getExtensionApi: () => api,
		} satisfies IGitExtensionService;
		const entityLink = vscode.Uri.parse('vscode-insiders://GitHub.copilot-chat/openCodeReviewDiff?id=review');
		const closeEntityLink = vscode.Uri.parse('vscode-insiders://GitHub.copilot-chat/openCodeReviewDiff?id=close');
		const namespaceEntityLink = vscode.Uri.parse('vscode-insiders://GitHub.copilot-chat/openCodeReviewDiff?id=namespace');
		const readEntityLink = vscode.Uri.parse('vscode-insiders://GitHub.copilot-chat/openCodeReviewDiff?id=read');
		const codeReviewService = new TestCodeReviewService({
			modified: [
				{
					kind: 'method',
					path: ['Reader', 'listen'],
					pathKinds: ['class', 'method'],
					range: { start: 1, end: 5 },
					entityLink,
					changes: [
						{ changeType: 'changed', range: { start: 1, end: 2 }, classifications: ['structural'] },
						{ changeType: 'added', range: { start: 3, end: 4 }, classifications: ['code'] },
					],
				},
				{
					kind: 'method',
					path: ['Reader', 'close'],
					pathKinds: ['class', 'method'],
					range: { start: 5, end: 8 },
					entityLink: closeEntityLink,
					changes: [
						{ changeType: 'added', range: { start: 5, end: 8 }, classifications: ['structural'] },
					],
				},
			],
			original: [
				{
					kind: 'function',
					path: ['ReaderOptions', 'fromOptions'],
					pathKinds: ['module', 'function'],
					range: { start: 0, end: 1 },
					entityLink: namespaceEntityLink,
					changes: [
						{ changeType: 'deleted', range: { start: 0, end: 1 }, classifications: ['code'] },
					],
				},
				{
					kind: 'method',
					path: ['Reader', 'read'],
					pathKinds: ['class', 'method'],
					range: { start: 8, end: 10 },
					entityLink: readEntityLink,
					changes: [
						{ changeType: 'deleted', range: { start: 8, end: 10 }, classifications: ['code'] },
					],
				},
			],
		}, new Map([
			[modified, {
				entities: [
					{
						kind: 'method',
						path: ['Reader', 'listen'],
						range: new vscode.Range(1, 0, 5, 0),
						metrics: { cognitiveComplexity: 5, cyclomaticComplexity: 7, runtimeComplexity: 'O(n)' },
					},
					{
						kind: 'method',
						path: ['Reader', 'close'],
						range: new vscode.Range(5, 0, 8, 0),
						metrics: { cognitiveComplexity: 99, cyclomaticComplexity: 99, runtimeComplexity: 'O(n^2)' },
					},
					{
						kind: 'method',
						path: ['Reader', 'read'],
						range: new vscode.Range(8, 0, 10, 0),
						metrics: { cognitiveComplexity: 2, cyclomaticComplexity: 3, runtimeComplexity: 'O(1)' },
					},
				],
			}],
			[original, {
				entities: [
					{
						kind: 'function',
						path: ['ReaderOptions', 'fromOptions'],
						range: new vscode.Range(0, 0, 1, 0),
						metrics: { cognitiveComplexity: 4, cyclomaticComplexity: 5, runtimeComplexity: 'O(n log n)' },
					},
					{
						kind: 'method',
						path: ['Reader', 'listen'],
						range: new vscode.Range(1, 0, 5, 0),
						metrics: { cognitiveComplexity: 3, cyclomaticComplexity: 4, runtimeComplexity: 'O(1)' },
					},
					{
						kind: 'method',
						path: ['Reader', 'read'],
						range: new vscode.Range(8, 0, 10, 0),
						metrics: { cognitiveComplexity: 6, cyclomaticComplexity: 5, runtimeComplexity: 'O(log n)' },
					},
				],
			}],
		]));
		const logService = { error: vi.fn() } as unknown as ILogService;
		const provider = new ChangedEntitiesTreeDataProvider(gitExtensionService, codeReviewService, logService);
		const refreshEvents: unknown[] = [];
		const refreshListener = provider.onDidChangeTreeData(element => refreshEvents.push(element));
		try {
			const [group] = await provider.getChildren();
			const files = await provider.getChildren(group);
			assert.strictEqual(codeReviewService.inputs.length, 0);
			const entities = await provider.getChildren(files[0]);
			const namespaceMembers = await provider.getChildren(entities[0]);
			const members = await provider.getChildren(entities[1]);

			assert.deepStrictEqual({
				fileCount: files.length,
				fileLabel: files[0].treeItem.label,
				fileDescription: files[0].treeItem.description,
				fileTooltip: files[0].treeItem.tooltip,
				fileAccessibilityLabel: files[0].treeItem.accessibilityInformation?.label,
				fileIcon: files[0].treeItem.iconPath instanceof vscode.ThemeIcon ? files[0].treeItem.iconPath.id : undefined,
				fileRefreshEvents: refreshEvents.map(element => element === files[0]),
				inputs: codeReviewService.inputs,
				metricInputs: codeReviewService.metricInputs,
				entityGroups: entities.map(entity => ({
					label: entity.treeItem.label,
					icon: entity.treeItem.iconPath instanceof vscode.ThemeIcon ? entity.treeItem.iconPath.id : undefined,
					description: entity.treeItem.description,
					tooltip: entity.treeItem.tooltip,
					accessibilityLabel: entity.treeItem.accessibilityInformation?.label,
					collapsibleState: entity.treeItem.collapsibleState,
					command: entity.treeItem.command,
				})),
				namespaceMembers: namespaceMembers.map(member => ({
					label: member.treeItem.label,
					icon: member.treeItem.iconPath instanceof vscode.ThemeIcon ? member.treeItem.iconPath.id : undefined,
					description: member.treeItem.description,
					tooltip: member.treeItem.tooltip,
					accessibilityLabel: member.treeItem.accessibilityInformation?.label,
				})),
				members: members.map(member => ({
					label: member.treeItem.label,
					icon: member.treeItem.iconPath instanceof vscode.ThemeIcon ? member.treeItem.iconPath.id : undefined,
					description: member.treeItem.description,
					tooltip: member.treeItem.tooltip,
					accessibilityLabel: member.treeItem.accessibilityInformation?.label,
					command: member.treeItem.command,
				})),
			}, {
				fileCount: 1,
				fileLabel: 'reader.ts',
				fileDescription: 'src — Cognitive -6, Cyclomatic -4',
				fileTooltip: 'src\\reader.ts — Cognitive -6, Cyclomatic -4',
				fileAccessibilityLabel: 'Changed file src\\reader.ts, cognitive complexity decreased by 6, cyclomatic complexity decreased by 4',
				fileIcon: 'file',
				fileRefreshEvents: [true],
				inputs: [{
					filePath: uri.fsPath,
					modified: {
						content: modified,
						added: [{ start: 3, end: 4 }],
						changed: [{ start: 1, end: 2 }],
					},
					original: {
						content: original,
						deleted: [],
					},
				}],
				metricInputs: [
					{ filePath: uri.fsPath, content: modified },
					{ filePath: uri.fsPath, content: original },
				],
				entityGroups: [
					{
						label: 'ReaderOptions',
						icon: 'symbol-namespace',
						description: 'Cognitive -4, Cyclomatic -5',
						tooltip: 'ReaderOptions — Cognitive -4, Cyclomatic -5',
						accessibilityLabel: 'ReaderOptions, namespace changed entity group, cognitive complexity decreased by 4, cyclomatic complexity decreased by 5',
						collapsibleState: 2,
						command: undefined,
					},
					{
						label: 'Reader',
						icon: 'symbol-class',
						description: 'Cognitive -2, Cyclomatic +1',
						tooltip: 'Reader — Cognitive -2, Cyclomatic +1',
						accessibilityLabel: 'Reader, class changed entity group, cognitive complexity decreased by 2, cyclomatic complexity increased by 1',
						collapsibleState: 2,
						command: undefined,
					},
				],
				namespaceMembers: [{
					label: 'fromOptions',
					icon: 'symbol-function',
					description: 'Code deletion — Cognitive -4, Cyclomatic -5, Runtime O(n log n)',
					tooltip: 'ReaderOptions.fromOptions — Code deletion — Cognitive -4, Cyclomatic -5, Runtime O(n log n)',
					accessibilityLabel: 'ReaderOptions.fromOptions, function, Code deletion, cognitive complexity decreased by 4, cyclomatic complexity decreased by 5, runtime complexity O(n log n). Open diff',
				}],
				members: [
					{
						label: 'listen',
						icon: 'symbol-method',
						description: 'Structural change, Code addition — Cognitive +2, Cyclomatic +3, Runtime O(n)',
						tooltip: 'Reader.listen — Structural change, Code addition — Cognitive +2, Cyclomatic +3, Runtime O(n)',
						accessibilityLabel: 'Reader.listen, method, Structural change, Code addition, cognitive complexity increased by 2, cyclomatic complexity increased by 3, runtime complexity O(n). Open diff',
						command: {
							command: 'github.copilot.openChangedEntityDiff',
							title: 'Open Entity Diff',
							arguments: [entityLink],
						},
					},
					{
						label: 'close',
						icon: 'symbol-method',
						description: 'Structural addition',
						tooltip: 'Reader.close — Structural addition',
						accessibilityLabel: 'Reader.close, method, Structural addition. Open diff',
						command: {
							command: 'github.copilot.openChangedEntityDiff',
							title: 'Open Entity Diff',
							arguments: [closeEntityLink],
						},
					},
					{
						label: 'read',
						icon: 'symbol-method',
						description: 'Code deletion — Cognitive -4, Cyclomatic -2, Runtime O(1)',
						tooltip: 'Reader.read — Code deletion — Cognitive -4, Cyclomatic -2, Runtime O(1)',
						accessibilityLabel: 'Reader.read, method, Code deletion, cognitive complexity decreased by 4, cyclomatic complexity decreased by 2, runtime complexity O(1). Open diff',
						command: {
							command: 'github.copilot.openChangedEntityDiff',
							title: 'Open Entity Diff',
							arguments: [readEntityLink],
						},
					},
				],
			});
		} finally {
			refreshListener.dispose();
			provider.dispose();
		}
	});
});

class TestCodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;
	readonly inputs: TypeScriptChangeClassificationInput[] = [];
	readonly metricInputs: { readonly filePath: string; readonly content?: string }[] = [];

	constructor(
		private readonly result: TypeScriptChangeClassificationResult,
		private readonly metricsByContent: ReadonlyMap<string, TypeScriptMetricsResult> = new Map(),
	) { }

	async computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined> {
		this.metricInputs.push({ filePath, content });
		return content === undefined ? undefined : this.metricsByContent.get(content);
	}

	async classifyChanges(input: TypeScriptChangeClassificationInput): Promise<TypeScriptChangeClassificationResult> {
		this.inputs.push(input);
		return this.result;
	}

	async openDiff(): Promise<void> { }

	dispose(): void { }
}
