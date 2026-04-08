/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { ILaunchConfigService } from '../common/launchConfigService';
import { IStartOptions } from '../node/copilotDebugWorker/shared';
import { CopilotDebugCommandHandle } from './copilotDebugCommandHandle';

const TRACKED_SESSION_KEY = '__copilotTrackedSession';

export const handleDebugSession = (
	launchConfigService: ILaunchConfigService,
	workspaceFolder: vscode.WorkspaceFolder | undefined,
	config: vscode.DebugConfiguration,
	handle: CopilotDebugCommandHandle,
	once: boolean,
	startAgain: (opts: Partial<IStartOptions>) => Promise<void>,
) => {
	const trackedId = generateUuid();
	const store = new DisposableStore();

	let gotRoot = false;
	const sessions = new Set<vscode.DebugSession>();

	async function ended(code: number, message?: string) {
		if (store.isDisposed) {
			return;
		}

		let color: 'red' | 'blue';

		if (code !== 0) {
			color = 'red';
			message ??= l10n.t('Debug session errored');
		} else {
			color = 'blue';
			message ??= l10n.t('Session ended');
		}

		handle.printLabel(color, message);
		store.dispose();
		followup();
	}

	async function followup() {
		switch (once ? 'Q' : await handle.getFollowupKeys(CopilotDebugCommandHandle.COPILOT_LABEL.length + 3)) {
			case 'Enter':
				handleDebugSession(launchConfigService, workspaceFolder, config, handle, once, startAgain);
				break;
			case 'R':
				startAgain({ forceNew: true });
				break;
			case 'S':
				await launchConfigService.add(workspaceFolder?.uri, { configurations: [config] });
				if (workspaceFolder) {
					await launchConfigService.show(workspaceFolder.uri, config.name);
				}
				handle.exit(0);
				break;
			case 'V':
				await handle.printJson(config);
				followup();
				break;
			case 'Q':
			default:
				handle.exit(0);
		}
	}

	handle.ended.then(() => {
		if (!store.isDisposed) {
			sessions.forEach(s => vscode.debug.stopDebugging(s));
		}
	});

	store.add(vscode.debug.registerDebugAdapterTrackerFactory('*', {
		createDebugAdapterTracker(session) {
			if (session.configuration[TRACKED_SESSION_KEY] !== trackedId && (!session.parentSession || !sessions.has(session.parentSession))) {
				return;
			}

			// handle nested sessions:
			const isRoot = !gotRoot;
			gotRoot = true;
			sessions.add(session);

			return {
				onWillStartSession() {
					if (isRoot) {
						handle.printLabel('blue', l10n.t('Debug session starting...'));
					}
				},
				onDidSendMessage(message) {
					if (message.type === 'event' && message.event === 'output' && message.body.output) {
						handle.output(message.body.category, message.body.output);
					}
				},
				onExit(code, signal) {
					if (isRoot) {
						ended(code ?? 0, signal);
					}
				},
				onWillStopSession() {
					if (isRoot) {
						ended(0);
					}
				},
			};
		},
	}));

	vscode.debug.startDebugging(workspaceFolder, { ...config, [TRACKED_SESSION_KEY]: trackedId }).then(ok => {
		if (!ok) {
			// error will be displayed to user by vscode
			ended(1);
		}
	});
};
