/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, type ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../browser/menus.js';
import { SessionCanvasesEnabledContext, SessionCanvasesSupportedContext, SessionIsArchivedContext } from '../../../common/contextkeys.js';
import { SessionCanvasActions, SessionCanvasCommands, type SessionCanvasOperation } from './sessionCanvasActions.js';
import { ISessionCanvasService, SessionCanvasService } from './sessionCanvasService.js';
import { SessionCanvasContextContribution } from './sessionCanvasContext.contribution.js';

registerSingleton(ISessionCanvasService, SessionCanvasService, InstantiationType.Eager);

const canvasEnabled = ContextKeyExpr.and(ChatContextKeys.enabled, SessionCanvasesEnabledContext, SessionIsArchivedContext.negate(), SessionCanvasesSupportedContext);

const commands = [
	['manage', localize2('canvas.manage', "Canvases")],
	['open', localize2('canvas.open', "Open Canvas")],
	['reveal', localize2('canvas.reveal', "Reveal Canvas")],
	['invokeAction', localize2('canvas.invokeAction', "Run Canvas Action")],
	['close', localize2('canvas.close', "Close Canvas")],
	['refresh', localize2('canvas.refresh', "Refresh Canvases")],
	['reload', localize2('canvas.reload', "Restart Canvas Provider")],
	['getState', localize2('canvas.getState', "Get Canvas State")],
] satisfies [SessionCanvasOperation, ReturnType<typeof localize2>][];

for (const [operation, title] of commands) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: SessionCanvasCommands[operation],
				title,
				icon: Codicon.browser,
				precondition: canvasEnabled,
				f1: operation !== 'getState',
				menu: operation === 'manage' ? [
					{ id: Menus.SessionBarToolbar, group: 'navigation', order: 9, when: canvasEnabled },
					{ id: Menus.SessionHeaderContext, group: '2_edit', order: 3, when: canvasEnabled },
				] : undefined,
			});
		}
		override run(accessor: ServicesAccessor, context?: unknown) {
			return accessor.get(IInstantiationService).createInstance(SessionCanvasActions).run(operation, context);
		}
	});
}

/** Instantiates the canvas source resolver before editor restoration. */
class SessionCanvasesContribution extends Disposable {
	static readonly ID = 'workbench.contrib.sessionCanvases';

	constructor(
		@ISessionCanvasService canvasService: ISessionCanvasService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._register(bindContextKey(SessionCanvasesEnabledContext, contextKeyService, reader => canvasService.enabled.read(reader)));
	}
}

registerWorkbenchContribution2(SessionCanvasesContribution.ID, SessionCanvasesContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionCanvasContextContribution.ID, SessionCanvasContextContribution, WorkbenchPhase.BlockRestore);
