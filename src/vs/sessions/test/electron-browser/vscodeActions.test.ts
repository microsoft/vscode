/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IOpenedMainWindow } from '../../../platform/window/common/window.js';
import { constObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { getChatSessionToOpenInEditor, OpenSessionInVSCodeAction, OpenVSCodeWindowAction, returnToVSCodeEditor, shouldShowReturnToVSCodeEditor, ShouldShowReturnToVSCodeEditorAction } from '../../electron-browser/actions/vscodeActions.js';
import { IContext, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { ServiceIdentifier, ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';

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

	test('classic-window actions stay available unless a product opts out', () => {
		// Nothing binds this key, so an expression that is false when unset would hide these actions.
		const context = (unavailable: boolean | undefined) => new class extends mock<IContext>() {
			override getValue<T>(key: string): T | undefined {
				return (key === 'sessionsClassicWindowUnavailable' ? unavailable : undefined) as T | undefined;
			}
		};
		// The bare precondition and one inside a conjunction, because `and()` canonicalizes too.
		const bare = new OpenVSCodeWindowAction().desc.precondition;
		const conjoined = new OpenSessionInVSCodeAction().desc.precondition;

		assert.deepStrictEqual({
			unset: [bare?.evaluate(context(undefined)), conjoined?.evaluate(context(undefined))],
			optedOut: [bare?.evaluate(context(true)), conjoined?.evaluate(context(true))],
			optedIn: [bare?.evaluate(context(false)), conjoined?.evaluate(context(false))],
		}, {
			unset: [true, true],
			optedOut: [false, false],
			optedIn: [true, true],
		});
	});

	test('the sign-in dialog is not offered a return action when a product opts out', async () => {
		const run = async (unavailable: boolean | undefined) => {
			let queriedWindows = false;
			const accessor: ServicesAccessor = {
				get: <T>(id: ServiceIdentifier<T>): T => (id === IContextKeyService
					? new class extends mock<IContextKeyService>() {
						override getContextKeyValue<V>(key: string): V | undefined {
							return (key === 'sessionsClassicWindowUnavailable' ? unavailable : undefined) as V | undefined;
						}
					}
					: new class extends mock<INativeHostService>() {
						override async getWindows(): Promise<IOpenedMainWindow[]> {
							queriedWindows = true;
							return [];
						}
					}) as T
			};
			return { shown: await new ShouldShowReturnToVSCodeEditorAction().run(accessor), queriedWindows };
		};

		assert.deepStrictEqual({
			unset: await run(undefined),
			optedIn: await run(false),
			optedOut: await run(true),
		}, {
			unset: { shown: true, queriedWindows: true },
			optedIn: { shown: true, queriedWindows: true },
			// Opting out short-circuits before the native host is asked.
			optedOut: { shown: false, queriedWindows: false },
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
});

function createWindow(id: number): IOpenedMainWindow {
	return {
		id,
		title: `Window ${id}`,
		dirty: false,
	};
}

function createSession(id: string, isCreated: boolean): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.from({ scheme: 'test', path: `/${id}` });
		override readonly isCreated = constObservable(isCreated);
	}();
}
