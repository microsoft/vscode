/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IOpenedMainWindow, IOpenEmptyWindowOptions, IOpenWindowOptions, IWindowOpenable, isFolderToOpen } from '../../../platform/window/common/window.js';
import { constObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { getChatSessionToOpenInEditor, openSessionInVSCode, returnToVSCodeEditor, shouldShowReturnToVSCodeEditor } from '../../electron-browser/actions/vscodeActions.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { IRemoteAgentHostService } from '../../../platform/agentHost/common/remoteAgentHostService.js';
import { Codicon } from '../../../base/common/codicons.js';

suite('VS Code Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows return action only when there is no other main window', () => {
		const currentWindow = createWindow(1);
		const otherWindow = createWindow(2);

		assert.deepStrictEqual({
			onlyAgentsWindow: shouldShowReturnToVSCodeEditor([currentWindow], currentWindow.id),
			agentsWindowNotListed: shouldShowReturnToVSCodeEditor([], currentWindow.id),
			otherWindowOpen: shouldShowReturnToVSCodeEditor([currentWindow, otherWindow], currentWindow.id),
			onlyOtherWindowListed: shouldShowReturnToVSCodeEditor([otherWindow], currentWindow.id),
		}, {
			onlyAgentsWindow: true,
			agentsWindowNotListed: true,
			otherWindowOpen: false,
			onlyOtherWindowListed: false,
		});
	});

	test('opens an editor window before closing the Agents window', async () => {
		const calls: string[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(): Promise<void> {
				calls.push('open');
			}
			override async closeWindow(options?: { targetWindowId?: number }): Promise<void> {
				calls.push(`close:${options?.targetWindowId}`);
			}
		}();

		await returnToVSCodeEditor(nativeHostService, 7);

		assert.deepStrictEqual(calls, ['open', 'close:7']);
	});

	test('only transfers materialized sessions to the editor window', () => {
		const provisional = createSession('provisional', false);
		const materialized = createSession('materialized', true);

		assert.deepStrictEqual({
			provisional: getChatSessionToOpenInEditor(provisional)?.toString(),
			materialized: getChatSessionToOpenInEditor(materialized)?.toString(),
			missing: getChatSessionToOpenInEditor(undefined),
		}, {
			provisional: undefined,
			materialized: 'test:/materialized',
			missing: undefined,
		});
	});

	test('opens the complete session workspace in one editor window', async () => {
		const calls: { folders?: string[]; forceNewWindow?: boolean; chatSessionToOpen?: string }[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
				calls.push({
					folders: Array.isArray(toOpen) ? toOpen.filter(isFolderToOpen).map(openable => openable.folderUri.toString()) : undefined,
					forceNewWindow: options?.forceNewWindow,
					chatSessionToOpen: options?.chatSessionToOpen?.toString(),
				});
			}
		}();
		const session = createSession('multi-folder', true, [URI.file('/repo-a'), URI.file('/repo-b')]);

		await openSessionInVSCode(
			nativeHostService,
			session,
			new class extends mock<ISessionsProvidersService>() { }(),
			new class extends mock<IRemoteAgentHostService>() { }(),
		);

		assert.deepStrictEqual(calls, [{
			folders: ['file:///repo-a', 'file:///repo-b'],
			forceNewWindow: true,
			chatSessionToOpen: 'test:/multi-folder',
		}]);
	});

	test('opens an empty editor window when the session has no workspace', async () => {
		const calls: { empty: boolean }[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]): Promise<void> {
				calls.push({ empty: !Array.isArray(toOpen) });
			}
		}();

		await openSessionInVSCode(
			nativeHostService,
			undefined,
			new class extends mock<ISessionsProvidersService>() { }(),
			new class extends mock<IRemoteAgentHostService>() { }(),
		);

		assert.deepStrictEqual(calls, [{ empty: true }]);
	});
});

function createWindow(id: number): IOpenedMainWindow {
	return {
		id,
		title: `Window ${id}`,
		dirty: false,
	};
}

function createSession(id: string, isCreated: boolean, folders?: URI[]): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.from({ scheme: 'test', path: `/${id}` });
		override readonly providerId = 'test';
		override readonly isCreated = constObservable(isCreated);
		override readonly workspace = constObservable(folders ? {
			uri: URI.from({ scheme: 'test', path: `/${id}/workspace` }),
			label: id,
			icon: Codicon.folder,
			folders: folders.map((folder, index) => ({
				root: folder,
				workingDirectory: folder,
				name: `Repository ${index + 1}`,
				description: undefined,
			})),
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		} : undefined);
	}();
}
