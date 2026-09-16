/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './share.css';
import './selectionShareChip.js';
import { SELECTION_SHARE_CHIP_COMMAND_ID } from './selectionShareChip.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { WorkspaceFolderCountContext } from '../../../common/contextkeys.js';
import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { ShareProviderCountContext, ShareService } from './shareService.js';
import { IShareService } from '../common/share.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';

const targetMenus = [
	MenuId.EditorContextShare,
	MenuId.SCMResourceContextShare,
	MenuId.OpenEditorsContextShare,
	MenuId.EditorTitleContextShare,
	MenuId.MenubarShare,
	// MenuId.EditorLineNumberContext, // todo@joyceerhl add share
	MenuId.ExplorerContextShare
];

class ShareWorkbenchContribution extends Disposable {
	private static SHARE_ENABLED_SETTING = 'workbench.experimental.share.enabled';

	private _disposables: DisposableStore | undefined;

	constructor(
		@IShareService private readonly shareService: IShareService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		if (this.configurationService.getValue<boolean>(ShareWorkbenchContribution.SHARE_ENABLED_SETTING)) {
			this.registerActions();
		}
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ShareWorkbenchContribution.SHARE_ENABLED_SETTING)) {
				const settingValue = this.configurationService.getValue<boolean>(ShareWorkbenchContribution.SHARE_ENABLED_SETTING);
				if (settingValue === true && this._disposables === undefined) {
					this.registerActions();
				} else if (settingValue === false && this._disposables !== undefined) {
					this._disposables?.clear();
					this._disposables = undefined;
				}
			}
		}));
	}

	override dispose(): void {
		super.dispose();
		this._disposables?.dispose();
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
							{ id: MenuId.CommandCenter, order: 3 }
						]
					});
				}

				override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
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


registerAction2(class ShareSelectionAsPrivateGistAction extends Action2 {
	constructor() {
		super({
			id: SELECTION_SHARE_CHIP_COMMAND_ID,
			title: localize2('shareSelectionAsPrivateGist', 'Share Selection as Private Gist'),
			f1: true,
			category: localize2('shareCategory', 'Share'),
			icon: Codicon.gistSecret,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const codeEditorService = accessor.get(ICodeEditorService);
		const dialogService = accessor.get(IDialogService);
		const clipboardService = accessor.get(IClipboardService);
		const editor = codeEditorService.getActiveCodeEditor();
		if (!editor) {
			return;
		}
		const model = editor.getModel();
		const selection = editor.getSelection();
		if (!model || !selection || selection.isEmpty()) {
			await dialogService.info(
				localize('shareSelectionAsPrivateGist.noSelectionTitle', "Share as Private Gist"),
				localize('shareSelectionAsPrivateGist.noSelection', "Select a block of text in the editor, then use the Share chip.")
			);
			return;
		}

		const selectedText = model.getValueInRange(selection);
		const lineCount = selection.endLineNumber - selection.startLineNumber + 1;
		const fileLabel = model.uri.path.split('/').pop() || model.uri.path || 'selection';
		const previewLimit = 280;
		const preview = selectedText.length > previewLimit
			? `${selectedText.slice(0, previewLimit)}\n…`
			: selectedText;
		const markdown = new MarkdownString(undefined, { supportThemeIcons: false });
		markdown.appendCodeblock('', preview);

		const result = await dialogService.prompt({
			type: Severity.Info,
			message: localize('shareSelectionAsPrivateGist.title', "Share as Private Gist"),
			detail: localize(
				'shareSelectionAsPrivateGist.detail',
				"Prototype selection chip — no gist will be created. {0} line(s) from '{1}' are ready to share privately.",
				lineCount,
				fileLabel
			),
			custom: {
				icon: Codicon.gistSecret,
				markdownDetails: [{
					markdown,
					classes: ['share-dialog-input-text', 'share-private-gist-preview']
				}]
			},
			cancelButton: localize('shareSelectionAsPrivateGist.cancel', "Cancel"),
			buttons: [
				{
					label: localize('shareSelectionAsPrivateGist.confirm', "Share Private Gist"),
					run: () => 'shared' as const
				},
				{
					label: localize('shareSelectionAsPrivateGist.copy', "Copy Selection"),
					run: async () => {
						await clipboardService.writeText(selectedText);
						return 'copied' as const;
					}
				}
			]
		});

		if (result.result === 'shared') {
			await dialogService.info(
				localize('shareSelectionAsPrivateGist.doneTitle', "Private Gist Ready"),
				localize(
					'shareSelectionAsPrivateGist.done',
					"Selection chip prototype complete. Selected text from '{0}' would be shared as a private gist ({1} characters).",
					fileLabel,
					selectedText.length
				)
			);
		} else if (result.result === 'copied') {
			await dialogService.info(
				localize('shareSelectionAsPrivateGist.copiedTitle', "Selection Copied"),
				localize('shareSelectionAsPrivateGist.copied', "Copied the selected text to the clipboard.")
			);
		}
	}
});

