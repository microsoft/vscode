/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { z } from 'zod';
import { ILogger } from '../../../../../platform/log/common/logService';
import { generateUuid } from '../../../../../util/vs/base/common/uuid';
import { DiffStateManager } from '../diffState';
import { ReadonlyContentProvider, createReadonlyUri } from '../readonlyContentProvider';
import { makeTextResult } from './utils';

function makeErrorResult(message: string): { content: [{ type: 'text'; text: string }]; isError: true } {
	return {
		content: [{ type: 'text', text: message }],
		isError: true,
	};
}

export function registerOpenDiffTool(server: McpServer, logger: ILogger, diffState: DiffStateManager, contentProvider: ReadonlyContentProvider, sessionId: string): void {
	const schema = {
		original_file_path: z.string().describe('Path to the original file'),
		new_file_contents: z.string().describe('The new file contents to compare against'),
		tab_name: z.string().describe('Name for the diff tab'),
	};
	server.registerTool(
		'open_diff',
		{
			description: 'Opens a diff view comparing original file content with new content. Blocks until user accepts, rejects, or closes the diff.',
			inputSchema: schema,
		},
		// @ts-ignore - TS2589: zod type instantiation too deep for server.tool() generics
		async (args: { original_file_path: string; new_file_contents: string; tab_name: string }) => {
			const { original_file_path, new_file_contents, tab_name } = args;
			logger.info(`[DIFF] ===== OPEN_DIFF START ===== file=${original_file_path}, tab=${tab_name}`);
			try {
				// Read original file content for the readonly left side
				// If the file doesn't exist, use empty string (new file scenario)
				let originalContent: string;
				try {
					originalContent = await fs.readFile(original_file_path, 'utf-8');
				} catch (err: unknown) {
					const e = err as NodeJS.ErrnoException;
					if (e.code === 'ENOENT') {
						originalContent = '';
					} else {
						throw err;
					}
				}

				// Create unique suffix for this diff
				const uniqueSuffix = `${Date.now()}-${generateUuid()}`;
				logger.info(`[DIFF] uniqueSuffix=${uniqueSuffix}`);

				// Create readonly URIs for both sides
				const originalUri = createReadonlyUri(original_file_path, `original-${uniqueSuffix}`);
				const newUri = createReadonlyUri(original_file_path, `modified-${uniqueSuffix}`);
				logger.info(`[DIFF] modifiedUri=${newUri.toString()}`);

				// Set the content for both readonly documents
				contentProvider.setContent(originalUri, originalContent);
				contentProvider.setContent(newUri, new_file_contents);

				const title = tab_name;
				// Open diff with readonly virtual documents on both sides
				logger.info('[DIFF] Calling vscode.diff command');
				await vscode.commands.executeCommand('vscode.diff', originalUri, newUri, title, {
					preview: false,
					preserveFocus: true,
				});
				logger.info('[DIFF] vscode.diff command completed');

				// Wait for user action: Accept, Reject, or tab close
				const result = await new Promise<{ status: 'SAVED' | 'REJECTED'; trigger: string }>(resolve => {
					const disposables: vscode.Disposable[] = [];

					let cleanedUp = false;
					const diffId = newUri.toString();
					logger.info(`[DIFF] diffId=${diffId}`);

					const cleanup = () => {
						logger.info(`[DIFF] cleanup() called, cleanedUp=${cleanedUp}, diffId=${diffId}`);
						if (cleanedUp) {
							return;
						}
						cleanedUp = true;
						disposables.forEach(d => { d.dispose(); });
						diffState.unregister(diffId);
						contentProvider.clearContent(originalUri);
						contentProvider.clearContent(newUri);
						logger.info('[DIFF] cleanup() done');
					};

					const closeDiffTab = async () => {
						logger.info(`[DIFF] closeDiffTab() looking for modifiedUri=${newUri.toString()}`);
						for (const group of vscode.window.tabGroups.all) {
							for (const tab of group.tabs) {
								if (tab.input instanceof vscode.TabInputTextDiff) {
									const tabModifiedUri = tab.input.modified.toString();
									if (tabModifiedUri === newUri.toString()) {
										logger.info('[DIFF] Found matching tab, closing it');
										try {
											await vscode.window.tabGroups.close(tab);
											logger.info('[DIFF] Tab closed');
										} catch (e: unknown) {
											logger.info(`[DIFF] Tab close error: ${e instanceof Error ? e.message : String(e)}`);
										}
										return;
									}
								}
							}
						}
						logger.info('[DIFF] No matching tab found');
					};

					const wrappedResolve = (result: { status: 'SAVED' | 'REJECTED'; trigger: string }) => {
						logger.info(`[DIFF] wrappedResolve() status=${result.status}, trigger=${result.trigger}`);
						cleanup();
						void closeDiffTab();
						resolve(result);
					};

					// Register this diff so editor title buttons can access it
					logger.info('[DIFF] Registering diff');
					diffState.register({
						diffId,
						sessionId,
						tabName: tab_name,
						originalUri,
						modifiedUri: newUri,
						newContents: new_file_contents,
						cleanup,
						resolve: wrappedResolve,
					});

					// Watch for tab close
					disposables.push(
						vscode.window.tabGroups.onDidChangeTabs(event => {
							logger.info(`[DIFF] onDidChangeTabs: opened=${event.opened.length}, closed=${event.closed.length}, changed=${event.changed.length}, myDiffId=${diffId}`);
							for (const closedTab of event.closed) {
								if (closedTab.input instanceof vscode.TabInputTextDiff) {
									logger.info(`[DIFF] closedTab modifiedUri=${closedTab.input.modified.toString()}`);
								}
								const diff = diffState.getByTab(closedTab);
								logger.info(`[DIFF] getActiveDiffByTab returned: ${diff?.diffId ?? 'undefined'}`);
								if (diff && diff.diffId === diffId) {
									logger.info(`[DIFF] MATCH - Tab closed manually: ${tab_name}`);
									cleanup();
									// Do NOT resolve - leave Promise pending, client handles timeout
									return;
								}
							}
						})
					);
					logger.info('[DIFF] Setup complete, waiting for user action');
				});

				logger.info(`[DIFF] ===== OPEN_DIFF END ===== result=${result.status}`);
				return makeTextResult({
					success: true,
					result: result.status,
					trigger: result.trigger,
					tab_name: tab_name,
					message: result.status === 'SAVED'
						? `User accepted changes for ${original_file_path}`
						: `User rejected changes for ${original_file_path}`
				});
			} catch (err: unknown) {
				logger.error(`[DIFF] ERROR: ${err instanceof Error ? err.message : String(err)}`);
				return makeErrorResult(`Failed to open diff: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	);
}
