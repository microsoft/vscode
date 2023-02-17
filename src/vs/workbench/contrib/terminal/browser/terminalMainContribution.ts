/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { TabFocus } from 'vs/editor/browser/config/tabFocus';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILabelService } from 'vs/platform/label/common/label';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITerminalEditorService, ITerminalGroupService, ITerminalService, terminalEditorId } from 'vs/workbench/contrib/terminal/browser/terminal';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';

/**
 * The main contribution for the terminal contrib. This contains calls to other components necessary
 * to set up the terminal but don't need to be tracked in the long term (where TerminalService would
 * be more relevant).
 */
export class TerminalMainContribution extends Disposable implements IWorkbenchContribution {
	private _editorTabFocus: boolean | undefined;
	private _terminalTabFocus: boolean | undefined;
	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@ILabelService labelService: ILabelService,
		@ITerminalService terminalService: ITerminalService,
		@ITerminalEditorService terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService terminalGroupService: ITerminalGroupService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();

		// Register terminal editors
		editorResolverService.registerEditor(
			`${Schemas.vscodeTerminal}:/**`,
			{
				id: terminalEditorId,
				label: terminalStrings.terminal,
				priority: RegisteredEditorPriority.exclusive
			},
			{
				canSupportResource: uri => uri.scheme === Schemas.vscodeTerminal,
				singlePerResource: true
			},
			{
				createEditorInput: ({ resource, options }) => {
					const instance = terminalService.getInstanceFromResource(resource);
					if (instance) {
						const sourceGroup = terminalGroupService.getGroupForInstance(instance);
						sourceGroup?.removeInstance(instance);
					}
					const resolvedResource = terminalEditorService.resolveResource(instance || resource);
					const editor = terminalEditorService.getInputFromResource(resolvedResource) || { editor: resolvedResource };
					return {
						editor,
						options: {
							...options,
							pinned: true,
							forceReload: true,
							override: terminalEditorId
						}
					};
				}
			}
		);

		// Register a resource formatter for terminal URIs
		labelService.registerFormatter({
			scheme: Schemas.vscodeTerminal,
			formatting: {
				label: '${path}',
				separator: ''
			}
		});

		const viewKey = new Set<string>();
		viewKey.add('focusedView');
		TabFocus.onDidChangeTabFocus(tabFocus => {
			if (contextKeyService.getContextKeyValue('focusedView') === 'terminal') {
				this._terminalTabFocus = tabFocus;
			} else {
				this._editorTabFocus = tabFocus;
			}
		});
		this._register(contextKeyService.onDidChangeContext((c) => {
			if (c.affectsSome(viewKey)) {
				if (contextKeyService.getContextKeyValue('focusedView') === 'terminal') {
					this._editorTabFocus = TabFocus.getTabFocusMode();
					TabFocus.setTabFocusMode(this._terminalTabFocus ?? configurationService.getValue(TerminalSettingId.TabFocusMode));
				} else {
					this._terminalTabFocus = TabFocus.getTabFocusMode();
					TabFocus.setTabFocusMode(this._editorTabFocus ?? configurationService.getValue('editor.tabFocusMode'));
				}
			}
		}));
		this._register(configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('editor.tabFocusMode')) {
				this._editorTabFocus = undefined;
			} else if (e.affectsConfiguration(TerminalSettingId.TabFocusMode)) {
				this._terminalTabFocus = undefined;
			}
		}));
	}
}
