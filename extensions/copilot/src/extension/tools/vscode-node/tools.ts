/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Disposable, DisposableMap } from '../../../util/vs/base/common/lifecycle';
import { autorun, autorunIterableDelta } from '../../../util/vs/base/common/observableInternal';
import { URI } from '../../../util/vs/base/common/uri';
import { getContributedToolName } from '../common/toolNames';
import { isVscodeLanguageModelTool } from '../common/toolsRegistry';
import { IToolsService } from '../common/toolsService';
import { IToolGroupingCache, IToolGroupingService } from '../common/virtualTools/virtualToolTypes';
import '../node/allTools';
import { extractSessionId } from '../node/memoryTool';
import './allTools';

export class ToolsContribution extends Disposable {
	constructor(
		@IToolsService toolsService: IToolsService,
		@IToolGroupingCache toolGrouping: IToolGroupingCache,
		@IToolGroupingService toolGroupingService: IToolGroupingService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
	) {
		super();

		for (const [name, tool] of toolsService.copilotTools) {
			if (isVscodeLanguageModelTool(tool)) {
				this._register(vscode.lm.registerTool(getContributedToolName(name), tool));
			}
		}

		const modelSpecificTools = this._register(new DisposableMap<string>());
		this._register(autorunIterableDelta(
			reader => toolsService.modelSpecificTools.read(reader),
			({ addedValues, removedValues }) => {
				for (const { definition } of removedValues) {
					modelSpecificTools.deleteAndDispose(definition.name);
				}
				for (const { definition, tool } of addedValues) {
					if (isVscodeLanguageModelTool(tool)) {
						modelSpecificTools.set(definition.name, vscode.lm.registerToolDefinition(definition, tool));
					}
				}
			},
			v => v.definition,
		));

		this._register(vscode.commands.registerCommand('github.copilot.debug.resetVirtualToolGroups', async () => {
			await toolGrouping.clear();
			vscode.window.showInformationMessage(l10n.t('Tool groups have been reset. They will be regenerated on the next agent request.'));
		}));

		this._register(vscode.commands.registerCommand('github.copilot.chat.tools.memory.showMemories', async () => {
			const globalStorageUri = this.extensionContext.globalStorageUri;
			const storageUri = this.extensionContext.storageUri;

			interface MemoryItem extends vscode.QuickPickItem {
				fileUri?: URI;
			}

			const items: MemoryItem[] = [];

			// Collect user-scoped memories from globalStorageUri/memory-tool/memories/
			if (globalStorageUri) {
				const userMemoryUri = URI.joinPath(globalStorageUri, 'memory-tool/memories');
				try {
					const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.from(userMemoryUri));
					const fileEntries = entries.filter(([name, type]) => type === vscode.FileType.File && !name.startsWith('.'));
					if (fileEntries.length > 0) {
						items.push({ label: '/memories', kind: vscode.QuickPickItemKind.Separator });
						for (const [name] of fileEntries) {
							items.push({
								label: `$(file) ${name}`,
								description: 'user',
								fileUri: URI.joinPath(userMemoryUri, name),
							});
						}
					}
				} catch {
					// User memory directory may not exist yet
				}
			}

			// Collect local repo-scoped memories only when CAPI memory is disabled
			const capiMemoryEnabled = this.configurationService.getExperimentBasedConfig(ConfigKey.CopilotMemoryEnabled, this.experimentationService);
			if (storageUri && !capiMemoryEnabled) {
				const repoMemoryUri = URI.joinPath(storageUri, 'memory-tool/memories/repo');
				try {
					const entries = await this.fileSystemService.readDirectory(repoMemoryUri);
					const fileEntries = entries.filter(([name, type]) => type === FileType.File && !name.startsWith('.'));
					if (fileEntries.length > 0) {
						items.push({ label: '/memories/repo', kind: vscode.QuickPickItemKind.Separator });
						for (const [name] of fileEntries) {
							items.push({
								label: `$(file) ${name}`,
								description: 'repo',
								fileUri: URI.joinPath(repoMemoryUri, name),
							});
						}
					}
				} catch {
					// Repo memory directory may not exist yet
				}
			}

			// Collect session-scoped memories from storageUri/memory-tool/memories/<sessionId>/
			const sessionResource = vscode.window.activeChatPanelSessionResource;
			if (storageUri && sessionResource) {
				const sessionId = extractSessionId(sessionResource.toString());
				const sessionMemoryUri = URI.joinPath(storageUri, 'memory-tool/memories', sessionId);
				try {
					const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.from(sessionMemoryUri));
					const fileEntries = entries.filter(([name, type]) => type === vscode.FileType.File && !name.startsWith('.'));
					if (fileEntries.length > 0) {
						items.push({ label: '/memories/session', kind: vscode.QuickPickItemKind.Separator });
						for (const [name] of fileEntries) {
							items.push({
								label: `$(file) ${name}`,
								description: 'session',
								fileUri: URI.joinPath(sessionMemoryUri, name),
							});
						}
					}
				} catch {
					// Session memory directory may not exist yet
				}
			}

			if (items.length === 0) {
				vscode.window.showInformationMessage(l10n.t('No memories found.'));
				return;
			}

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: l10n.t('Select a memory file to view'),
			});

			if (selected?.fileUri) {
				await vscode.commands.executeCommand('vscode.open', vscode.Uri.from(selected.fileUri));
			}
		}));

		this._register(vscode.commands.registerCommand('github.copilot.chat.tools.memory.clearMemories', async () => {
			const confirm = await vscode.window.showWarningMessage(
				l10n.t('Are you sure you want to clear all memories? This cannot be undone.'),
				{ modal: true },
				l10n.t('Clear All'),
			);
			if (confirm !== l10n.t('Clear All')) {
				return;
			}

			const globalStorageUri = this.extensionContext.globalStorageUri;
			const storageUri = this.extensionContext.storageUri;
			let hasError = false;
			let hasDeleted = false;

			// Clear user-scoped memories
			if (globalStorageUri) {
				const userMemoryUri = URI.joinPath(globalStorageUri, 'memory-tool/memories');
				try {
					await vscode.workspace.fs.delete(vscode.Uri.from(userMemoryUri), { recursive: true });
					hasDeleted = true;
				} catch (e) {
					if (e instanceof vscode.FileSystemError && e.code === 'FileNotFound') {
						// Nothing to delete
					} else {
						hasError = true;
					}
				}
			}

			// Clear all session memories
			if (storageUri) {
				const sessionMemoryUri = URI.joinPath(storageUri, 'memory-tool/memories');
				try {
					await vscode.workspace.fs.delete(vscode.Uri.from(sessionMemoryUri), { recursive: true });
					hasDeleted = true;
				} catch (e) {
					if (e instanceof vscode.FileSystemError && e.code === 'FileNotFound') {
						// Nothing to delete
					} else {
						hasError = true;
					}
				}
			}

			if (hasError) {
				vscode.window.showErrorMessage(l10n.t('Some memories could not be cleared. Please try again.'));
			} else if (!hasDeleted) {
				vscode.window.showInformationMessage(l10n.t('No memories found.'));
			} else {
				vscode.window.showInformationMessage(l10n.t('All memories have been cleared.'));
			}
		}));

		this._register(autorun(reader => {
			vscode.commands.executeCommand('setContext', 'chat.toolGroupingThreshold', toolGroupingService.threshold.read(reader));
		}));
	}
}
