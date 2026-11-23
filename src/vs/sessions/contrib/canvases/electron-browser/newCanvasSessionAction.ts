/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator, ItemActivation } from '../../../../platform/quickinput/common/quickInput.js';
import { notifyCanvasOpenFailure } from '../../../../workbench/contrib/canvases/common/agentHostCanvasConsent.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { IPinnedCanvasService } from '../../../../workbench/contrib/sessions/browser/pinnedCanvases.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { CANVASES_SECTION_ID, NEW_CANVAS_SESSION_COMMAND_ID, SESSIONS_LIST_CANVASES_SECTION_SETTING, SessionSectionToolbarMenuId, SessionSectionTypeContext } from '../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { SessionsCategories } from '../../../../workbench/contrib/sessions/common/categories.js';
import { ICanvasSessionDraft, ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionCanvasDefinition } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionCanvasCatalogService } from '../common/sessionCanvas.js';
import { pinnedCanvasesAvailable } from './pinnedCanvasActions.js';
import { discoverCanvasEntries, IDiscoverCanvasEntry } from './sessionCanvasActions.js';

const newCanvasSessionAvailable = ContextKeyExpr.and(pinnedCanvasesAvailable, ContextKeyExpr.equals(`config.${SESSIONS_LIST_CANVASES_SECTION_SETTING}`, true));

interface ICanvasPickItem extends IQuickPickItem {
	readonly canvas?: ISessionCanvasDefinition;
	readonly discover?: IDiscoverCanvasEntry;
}

function getPickItems(canvases: readonly ISessionCanvasDefinition[]): (ICanvasPickItem | IQuickPickSeparator)[] {
	return [
		...canvases.map((canvas): ICanvasPickItem => ({
			canvas,
			label: canvas.displayName,
			description: canvas.extensionName ?? canvas.extensionId,
			detail: canvas.description || undefined,
			iconPath: canvas.icon ? { dark: URI.parse(canvas.icon) } : undefined,
		})),
		{ type: 'separator', label: localize('newCanvasSession.discoverMore', "Discover More") },
		...discoverCanvasEntries.map((discover): ICanvasPickItem => ({ discover, label: `$(${discover.icon.id}) ${discover.title}` })),
	];
}

function isSamePickItem(a: ICanvasPickItem, b: ICanvasPickItem): boolean {
	if (a.canvas && b.canvas) {
		return a.canvas.extensionId === b.canvas.extensionId && a.canvas.canvasId === b.canvas.canvasId;
	}
	return a.discover !== undefined && a.discover === b.discover;
}

/**
 * Starts a session whose first content is a new canvas, without sending a message, and shows the canvas from the
 * Canvases section of the sidebar. The canvases come from an unlisted draft, which is discarded unless one opens.
 */
class NewCanvasSessionAction extends Action2 {
	constructor() {
		super({
			id: NEW_CANVAS_SESSION_COMMAND_ID,
			title: localize2('newCanvasSession', "New Canvas..."),
			category: SessionsCategories.Sessions,
			icon: Codicon.add,
			f1: true,
			precondition: newCanvasSessionAvailable,
			menu: [SessionSectionToolbarMenuId, Menus.SessionSectionContext].map(id => ({
				id,
				group: 'navigation',
				order: 1,
				when: ContextKeyExpr.and(newCanvasSessionAvailable, SessionSectionTypeContext.isEqualTo(CANVASES_SECTION_ID)),
			})),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const catalogService = accessor.get(ISessionCanvasCatalogService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsService = accessor.get(ISessionsService);
		const pinnedCanvasService = accessor.get(IPinnedCanvasService);
		const progressService = accessor.get(IProgressService);
		const instantiationService = accessor.get(IInstantiationService);

		const createDraft = (): ICanvasSessionDraft | undefined => {
			try {
				return sessionsManagementService.createCanvasDraft();
			} catch (error) {
				notificationService.error(toErrorMessage(error));
				return undefined;
			}
		};
		const draft = createDraft();
		if (!draft) {
			return;
		}

		const store = new DisposableStore();
		const picker = store.add(quickInputService.createQuickPick<ICanvasPickItem>({ useSeparators: true }));
		picker.placeholder = localize('newCanvasSession.placeholder', "Select a canvas to start a session with");
		picker.matchOnDescription = true;
		picker.matchOnDetail = true;
		// The remembered canvases show at once; the draft lists the installed ones, which replace them.
		const remembered = catalogService.entries.get();
		if (remembered.length === 0) {
			// Until a canvas is listed, nothing is active, so Enter cannot run a Discover More entry by accident.
			picker.itemActivation = ItemActivation.NONE;
		}
		picker.items = getPickItems(remembered);
		picker.busy = true;
		draft.canvases.then(canvases => {
			// Extensions that did not settle in time leave the remembered canvases in place.
			if (canvases) {
				catalogService.replace(canvases);
			}
			if (!store.isDisposed) {
				// Keep the entry the user moved to while the canvases were listed, so Enter still runs it.
				const active = picker.activeItems[0];
				const items = getPickItems(catalogService.entries.get());
				picker.items = items;
				const kept = active && items.find((item): item is ICanvasPickItem => item.type !== 'separator' && isSamePickItem(item, active));
				if (kept) {
					picker.activeItems = [kept];
				}
				picker.busy = false;
			}
		}, error => {
			if (!store.isDisposed) {
				picker.busy = false;
				notificationService.error(localize('newCanvasSession.listFailed', "Could not list canvases: {0}", toErrorMessage(error)));
			}
		});
		const picked = await new Promise<ICanvasPickItem | undefined>(resolve => {
			store.add(picker.onDidAccept(() => {
				const [item] = picker.selectedItems;
				if (!item) {
					return;
				}
				resolve(item);
				picker.hide();
			}));
			store.add(picker.onDidHide(() => resolve(undefined)));
			picker.show();
		});
		store.dispose();

		const canvas = picked?.canvas;
		if (!canvas) {
			draft.dispose();
			if (picked?.discover) {
				await instantiationService.invokeFunction(picked.discover.run);
			}
			return;
		}

		const start = async (getDraft: () => ICanvasSessionDraft | undefined): Promise<void> => {
			const current = getDraft();
			if (!current) {
				return;
			}
			try {
				const reference = await progressService.withProgress({
					location: ProgressLocation.Notification,
					title: localize('newCanvasSession.progress', "Starting {0}...", canvas.displayName),
					delay: 500,
				}, () => current.open(canvas));
				if (!reference) {
					return;
				}
				try {
					// Pinning lists the canvas in the Canvases section. When it cannot be pinned, show its session instead.
					if (pinnedCanvasService.pin(reference.object)) {
						await pinnedCanvasService.show(reference.object);
					} else {
						await sessionsService.openSession(reference.object.session);
					}
				} finally {
					reference.dispose();
				}
			} catch (error) {
				notifyCanvasOpenFailure(notificationService, error, canvas.displayName, () => start(createDraft));
			} finally {
				current.dispose();
			}
		};
		await start(() => draft);
	}
}

registerAction2(NewCanvasSessionAction);
