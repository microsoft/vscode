/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, QuickInputHideReason } from '../../../../../platform/quickinput/common/quickInput.js';
import { ICanvasReference } from '../../../../../workbench/common/canvasReference.js';
import { IPinnedCanvasService } from '../../../../../workbench/contrib/sessions/browser/pinnedCanvases.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { NEW_CANVAS_SESSION_COMMAND_ID } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListCommon.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionReplacedEvent } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { ISession, ISessionCanvasDefinition } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionCanvasCatalogService } from '../../common/sessionCanvas.js';
import '../../electron-browser/newCanvasSessionAction.js';

suite('NewCanvasSessionAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const canvas: ISessionCanvasDefinition = { canvasId: 'plan', extensionId: 'user:agent-plan', extensionSource: 'user', displayName: 'Agent Plan', description: '', requiresInput: false };

	/**
	 * Starts a session with a canvas, which the session that opening the canvas starts replaces under the ID `committed`,
	 * except when the draft fails to open the canvas before that. Every call to list state, the draft, and the sidebar is
	 * recorded in order.
	 */
	async function startCanvasSession(outcome: 'pinned' | 'notPinned' | 'failedBeforeStart' | 'failedAfterStart' | 'disposed'): Promise<string[]> {
		const calls: string[] = [];
		const replaced = store.add(new Emitter<ISessionReplacedEvent>());
		const accepted = store.add(new Emitter<IQuickPickDidAcceptEvent>());
		const hidden = store.add(new Emitter<IQuickInputHideEvent>());
		const committed = upcastPartial<ISession>({ sessionId: 'committed', resource: URI.parse('session:/committed') });
		const reference: ICanvasReference = { providerId: 'local-agent-host', session: committed.resource, chat: URI.parse('chat:/committed'), canvas: URI.parse('ahp-canvas:/plan') };
		const picker = upcastPartial<IQuickPick<IQuickPickItem & { readonly canvas?: ISessionCanvasDefinition }>>({
			items: [],
			activeItems: [],
			selectedItems: [],
			onDidAccept: accepted.event,
			onDidHide: hidden.event,
			show: () => {
				picker.selectedItems = picker.items.filter(item => item.canvas);
				accepted.fire({ inBackground: false });
			},
			hide: () => hidden.fire({ reason: QuickInputHideReason.Gesture }),
			dispose: () => { },
		});
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionCanvasCatalogService, upcastPartial<ISessionCanvasCatalogService>({ entries: constObservable([canvas]), replace: () => { } }));
		instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({ createQuickPick: (() => picker) as IQuickInputService['createQuickPick'] }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: message => { calls.push(`error ${message}`); } }));
		instantiationService.stub(IProgressService, upcastPartial<IProgressService>({ withProgress: (_options, task) => task({ report: () => { } }) }));
		instantiationService.stub(ISessionsListModelService, upcastPartial<ISessionsListModelService>({
			hideCanvasSessionById: sessionId => { calls.push(`hide ${sessionId}`); },
			showCanvasSessionById: sessionId => { calls.push(`list ${sessionId}`); },
		}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidReplaceSession: replaced.event,
			createCanvasDraft: () => ({
				sessionId: 'draft',
				canvases: Promise.resolve([canvas]),
				open: async () => {
					calls.push('open');
					if (outcome === 'failedBeforeStart') {
						throw new Error('no runtime');
					}
					replaced.fire({ from: upcastPartial<ISession>({ sessionId: 'draft' }), to: committed });
					if (outcome === 'failedAfterStart') {
						throw new Error('not published');
					}
					return outcome === 'disposed' ? undefined : { object: reference, dispose: () => calls.push('release') };
				},
				dispose: () => calls.push('dispose draft'),
			}),
		}));
		instantiationService.stub(IPinnedCanvasService, upcastPartial<IPinnedCanvasService>({
			pin: () => { calls.push('pin'); return outcome === 'pinned'; },
			show: async () => { calls.push('show pin'); },
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ openSession: async resource => { calls.push(`open session ${resource}`); } }));

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(NEW_CANVAS_SESSION_COMMAND_ID)!.handler(accessor));
		return calls;
	}

	test('leaves the session out of the Sessions list before it is listed, and lists it again only when its canvas cannot be pinned or does not open', async () => {
		const results: Record<string, string[]> = {};
		for (const outcome of ['pinned', 'notPinned', 'failedBeforeStart', 'failedAfterStart', 'disposed'] as const) {
			results[outcome] = await startCanvasSession(outcome);
		}

		assert.deepStrictEqual(results, {
			pinned: ['hide draft', 'open', 'pin', 'show pin', 'release', 'dispose draft'],
			notPinned: ['hide draft', 'open', 'pin', 'list committed', 'open session session:/committed', 'release', 'dispose draft'],
			failedBeforeStart: ['hide draft', 'open', 'list draft', 'error Could not open canvas Agent Plan: no runtime', 'dispose draft'],
			failedAfterStart: ['hide draft', 'open', 'list committed', 'error Could not open canvas Agent Plan: not published', 'dispose draft'],
			disposed: ['hide draft', 'open', 'list committed', 'dispose draft'],
		});
	});
});
