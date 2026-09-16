/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './share.css';
import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
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
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
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

interface IEditorLineNumberContextArgs {
	readonly lineNumber?: number;
	readonly uri?: URI;
}

/**
 * Prototype helper: builds a github.com blob URL that looks like a real permalink.
 * Uses the current file path when available; falls back to a sample growth-eng path.
 */
function buildPrototypeGitHubDotComLink(resource: URI | undefined, lineNumber: number, workspaceContextService: IWorkspaceContextService): string {
	const safeLine = Math.max(1, Math.floor(lineNumber || 1));
	let relativePath = 'explorations/prototypes/team-agentic-stack/index.html';

	if (resource && (resource.scheme === Schemas.file || resource.scheme === Schemas.vscodeRemote)) {
		const folder = workspaceContextService.getWorkspaceFolder(resource);
		if (folder) {
			const folderPath = folder.uri.path.replace(/\/+$/, '');
			const resourcePath = resource.path;
			if (resourcePath.startsWith(folderPath + '/')) {
				relativePath = resourcePath.slice(folderPath.length + 1).replace(/^\/+/, '');
			} else {
				const parts = resourcePath.split('/').filter(Boolean);
				relativePath = parts.slice(-4).join('/') || relativePath;
			}
		} else {
			const parts = resource.path.split('/').filter(Boolean);
			relativePath = parts.slice(-4).join('/') || relativePath;
		}
	}

	// Encode path segments but keep slashes for a natural github.com blob URL.
	const encodedPath = relativePath
		.split('/')
		.filter(Boolean)
		.map(segment => encodeURIComponent(segment))
		.join('/');

	return `https://github.com/github/growth-eng/blob/main/${encodedPath}#L${safeLine}`;
}

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

		this.registerPrivateGistShareAction();
		this.registerCopyGitHubDotComLinkAction();

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


	private registerPrivateGistShareAction(): void {
		this._register(registerAction2(class ShareAsPrivateGistAction extends Action2 {
			static readonly ID = 'workbench.action.shareAsPrivateGist';
			static readonly LABEL = localize2('shareAsPrivateGist', 'Share as Private Gist');

			constructor() {
				super({
					id: ShareAsPrivateGistAction.ID,
					title: ShareAsPrivateGistAction.LABEL,
					f1: true,
					category: localize2('shareCategory', 'Share'),
					icon: Codicon.gistSecret,
					precondition: EditorContextKeys.hasNonEmptySelection,
					menu: [
						{
							id: MenuId.EditorContextShare,
							group: '0_gist',
							order: 1,
							when: EditorContextKeys.hasNonEmptySelection
						},
						{
							id: MenuId.MenubarShare,
							group: '0_gist',
							order: 1,
							when: EditorContextKeys.hasNonEmptySelection
						},
						{
							id: MenuId.EditorTitleContextShare,
							group: '0_gist',
							order: 1,
							when: EditorContextKeys.hasNonEmptySelection
						}
					]
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
						localize('shareAsPrivateGist.noSelectionTitle', "Share as Private Gist"),
						localize('shareAsPrivateGist.noSelection', "Select a block of text in the editor, then choose Share as Private Gist.")
					);
					return;
				}

				const selectedText = model.getValueInRange(selection);
				const lineCount = selection.endLineNumber - selection.startLineNumber + 1;
				const resource = model.uri;
				const fileLabel = resource.path.split('/').pop() || resource.path || 'selection';
				const previewLimit = 280;
				const preview = selectedText.length > previewLimit
					? `${selectedText.slice(0, previewLimit)}\n…`
					: selectedText;
				const markdown = new MarkdownString(undefined, { supportThemeIcons: false });
				markdown.appendCodeblock('', preview);

				const result = await dialogService.prompt({
					type: Severity.Info,
					message: localize('shareAsPrivateGist.title', "Share as Private Gist"),
					detail: localize(
						'shareAsPrivateGist.detail',
						"Prototype only — no gist will be created. {0} line(s) from '{1}' are ready to share privately.",
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
					cancelButton: localize('shareAsPrivateGist.cancel', "Cancel"),
					buttons: [
						{
							label: localize('shareAsPrivateGist.confirm', "Share Private Gist"),
							run: () => 'shared' as const
						},
						{
							label: localize('shareAsPrivateGist.copy', "Copy Selection"),
							run: async () => {
								await clipboardService.writeText(selectedText);
								return 'copied' as const;
							}
						}
					]
				});

				if (result.result === 'shared') {
					await dialogService.info(
						localize('shareAsPrivateGist.doneTitle', "Private Gist Ready"),
						localize(
							'shareAsPrivateGist.done',
							"UI prototype complete. Selected text from '{0}' would be shared as a private gist ({1} characters).",
							fileLabel,
							selectedText.length
						)
					);
				} else if (result.result === 'copied') {
					await dialogService.info(
						localize('shareAsPrivateGist.copiedTitle', "Selection Copied"),
						localize('shareAsPrivateGist.copied', "Copied the selected text to the clipboard.")
					);
				}
			}
		}));
	}

	private registerCopyGitHubDotComLinkAction(): void {
		this._register(registerAction2(class CopyGitHubDotComLinkAction extends Action2 {
			static readonly ID = 'workbench.action.copyGitHubDotComLink';
			static readonly LABEL = localize2('copyGitHubDotComLink', 'Copy GitHub.com Link');

			constructor() {
				super({
					id: CopyGitHubDotComLinkAction.ID,
					title: CopyGitHubDotComLinkAction.LABEL,
					f1: true,
					category: localize2('shareCategory', 'Share'),
					icon: Codicon.github,
					menu: {
						id: MenuId.EditorLineNumberContext,
						group: '1_cutcopypaste',
						order: 3,
					}
				});
			}

			override async run(accessor: ServicesAccessor, context?: IEditorLineNumberContextArgs): Promise<void> {
				const clipboardService = accessor.get(IClipboardService);
				const notificationService = accessor.get(INotificationService);
				const openerService = accessor.get(IOpenerService);
				const codeEditorService = accessor.get(ICodeEditorService);
				const workspaceContextService = accessor.get(IWorkspaceContextService);

				const editor = codeEditorService.getActiveCodeEditor();
				const model = editor?.getModel();
				const resource = context?.uri ?? model?.uri;
				const lineNumber = context?.lineNumber
					?? editor?.getSelection()?.positionLineNumber
					?? editor?.getPosition()?.lineNumber
					?? 1;

				const link = buildPrototypeGitHubDotComLink(resource, lineNumber, workspaceContextService);
				await clipboardService.writeText(link);

				notificationService.notify({
					severity: Severity.Info,
					message: localize('copyGitHubDotComLink.copied', "GitHub.com link copied to clipboard"),
					actions: {
						primary: [
							new Action(
								'workbench.action.openCopiedGitHubDotComLink',
								localize('copyGitHubDotComLink.open', "Open Link"),
								undefined,
								true,
								async () => {
									await openerService.open(URI.parse(link), { openExternal: true });
								}
							)
						]
					}
				});
			}
		}));
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
