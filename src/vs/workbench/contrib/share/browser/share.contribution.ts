/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./share';
import { CancellationToken } from '../../../../base/common/cancellation';
import { Codicon } from '../../../../base/common/codicons';
import { MarkdownString } from '../../../../base/common/htmlContent';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes';
import { localize, localize2 } from '../../../../nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry';
import { Severity } from '../../../../platform/notification/common/notification';
import { IOpenerService } from '../../../../platform/opener/common/opener';
import { Registry } from '../../../../platform/registry/common/platform';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { WorkspaceFolderCountContext } from '../../../common/contextkeys';
import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions';
import { ShareProviderCountContext, ShareService } from './shareService';
import { IShareService } from '../common/share';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';
import { IEditorService } from '../../../services/editor/common/editorService';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from '../../../common/configuration';
import { DisposableStore } from '../../../../base/common/lifecycle';

const targetMenus = [
	MenuId.EditorContextShare,
	MenuId.SCMResourceContextShare,
	MenuId.OpenEditorsContextShare,
	MenuId.EditorTitleContextShare,
	MenuId.MenubarShare,
	// MenuId.EditorLineNumberContext, // todo@joyceerhl add share
	MenuId.ExplorerContextShare
];

class ShareWorkbenchContribution {
	private static SHARE_ENABLED_SETTING = 'workbench.experimental.share.enabled';

	private _disposables: DisposableStore | undefined;

	constructor(
		@IShareService private readonly shareService: IShareService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		if (this.configurationService.getValue<boolean>(ShareWorkbenchContribution.SHARE_ENABLED_SETTING)) {
			this.registerActions();
		}
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ShareWorkbenchContribution.SHARE_ENABLED_SETTING)) {
				const settingValue = this.configurationService.getValue<boolean>(ShareWorkbenchContribution.SHARE_ENABLED_SETTING);
				if (settingValue === true && this._disposables === undefined) {
					this.registerActions();
				} else if (settingValue === false && this._disposables !== undefined) {
					this._disposables?.clear();
					this._disposables = undefined;
				}
			}
		});
	}

	private registerActions() {
		if (!this._disposables) {
			this._disposables = new DisposableStore();
		}

		this._disposables.add(
			registerAction2(class ShareAction extends Action2 {
				static readonly ID = 'workbench.action.share';
				static readonly LABEL = localize2('share', 'Share...');

				constructor() {
					super({
						id: ShareAction.ID,
						title: ShareAction.LABEL,
						f1: true,
						icon: Codicon.linkExternal,
						precondition: ContextKeyExpr.and(ShareProviderCountContext.notEqualsTo(0), WorkspaceFolderCountContext.notEqualsTo(0)),
						keybinding: {
							weight: KeybindingWeight.WorkbenchContrib,
							primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.KeyS,
						},
						menu: [
							{ id: MenuId.CommandCenter, order: 1000 }
						]
					});
				}

				override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
					const shareService = accessor.get(IShareService);
					const activeEditor = accessor.get(IEditorService)?.activeEditor;
					const resourceUri = (activeEditor && EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }))
						?? accessor.get(IWorkspaceContextService).getWorkspace().folders[0].uri;
					const clipboardService = accessor.get(IClipboardService);
					const dialogService = accessor.get(IDialogService);
					const urlService = accessor.get(IOpenerService);
					const progressService = accessor.get(IProgressService);
					const selection = accessor.get(ICodeEditorService).getActiveCodeEditor()?.getSelection() ?? undefined;

					const result = await progressService.withProgress({
						location: ProgressLocation.Window,
						detail: localize('generating link', 'Generating link...')
					}, async () => shareService.provideShare({ resourceUri, selection }, CancellationToken.None));

					if (result) {
						const uriText = result.toString();
						const isResultText = typeof result === 'string';
						await clipboardService.writeText(uriText);

						dialogService.prompt(
							{
								type: Severity.Info,
								message: isResultText ? localize('shareTextSuccess', 'Copied text to clipboard!') : localize('shareSuccess', 'Copied link to clipboard!'),
								custom: {
									icon: Codicon.check,
									markdownDetails: [{
										markdown: new MarkdownString(`<div aria-label='${uriText}'>${uriText}</div>`, { supportHtml: true }),
										classes: [isResultText ? 'share-dialog-input-text' : 'share-dialog-input-link']
									}]
								},
								cancelButton: localize('close', 'Close'),
								buttons: isResultText ? [] : [{ label: localize('open link', 'Open Link'), run: () => { urlService.open(result, { openExternal: true }); } }]
							}
						);
					}
				}
			})
		);

		const actions = this.shareService.getShareActions();
		for (const menuId of targetMenus) {
			for (const action of actions) {
				// todo@joyceerhl avoid duplicates
				this._disposables.add(MenuRegistry.appendMenuItem(menuId, action));
			}
		}
	}
}

registerSingleton(IShareService, ShareService, InstantiationType.Delayed);
const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ShareWorkbenchContribution, LifecyclePhase.Eventually);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.experimental.share.enabled': {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			markdownDescription: localize('experimental.share.enabled', "Controls whether to render the Share action next to the command center when {0} is {1}.", '`#window.commandCenter#`', '`true`'),
			restricted: false,
		}
	}
});
