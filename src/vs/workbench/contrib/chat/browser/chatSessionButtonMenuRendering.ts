/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IActionViewItemService, IActionViewItemFactory } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { localize } from '../../../../nls.js';
import { IChatSessionsService } from '../common/chatSessionsService.js';
import { AUX_WINDOW_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { ChatEditorInput } from './chatEditorInput.js';

export class ChatSessionButtonMenuRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatSessionButtonMenuRendering';

	private readonly registeredContributions = new Set<string>();

	constructor(
		@IActionViewItemService private readonly actionViewItemService: IActionViewItemService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		// Register for existing contributions
		this.registerForExistingContributions();

		// Listen for new contributions
		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			this.registerForExistingContributions();
		}));
	}

	private registerForExistingContributions(): void {
		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		for (const contribution of contributions) {
			if (!this.registeredContributions.has(contribution.type)) {
				this.registerForContribution(contribution);
				this.registeredContributions.add(contribution.type);
			}
		}
	}

	private registerForContribution(contribution: { type: string; displayName: string }): void {
		const commandId = `workbench.action.chat.openNewSessionEditor.${contribution.type}`;
		
		const factory: IActionViewItemFactory = (action: IAction, options: IActionViewItemOptions, instantiationService: IInstantiationService, windowId: number) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}

			const dropdownAction = toAction({
				id: `chatSessionButton.${contribution.type}.more`,
				label: localize('more', "More..."),
				run() { }
			});

			// Create dropdown actions for new session variants
			const dropdownActions: IAction[] = [
				toAction({
					id: `workbench.action.chat.newSessionInNewWindow.${contribution.type}`,
					label: localize('newSessionInNewWindow', "New {0} in New Window", contribution.displayName),
					run: async () => {
						const editorService = instantiationService.invokeFunction(accessor => accessor.get(IEditorService));
						await editorService.openEditor({
							resource: ChatEditorInput.getNewEditorUri().with({ query: `chatSessionType=${contribution.type}` }),
							options: {
								pinned: true,
								auxiliary: { compact: false }
							}
						}, AUX_WINDOW_GROUP);
					}
				}),
				toAction({
					id: `workbench.action.chat.newSessionToSide.${contribution.type}`,
					label: localize('newSessionToSide', "New {0} to the Side", contribution.displayName),
					run: async () => {
						const editorService = instantiationService.invokeFunction(accessor => accessor.get(IEditorService));
						await editorService.openEditor({
							resource: ChatEditorInput.getNewEditorUri().with({ query: `chatSessionType=${contribution.type}` }),
							options: { pinned: true }
						}, SIDE_GROUP);
					}
				})
			];

			return instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, dropdownAction, dropdownActions, '', { ...options, skipTelemetry: true });
		};

		const disposable = this.actionViewItemService.register(MenuId.ViewTitle, commandId, factory);
		this._register(disposable);
	}
}