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
import * as dom from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { CodeAction, CodeActionList, CodeActionProvider } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
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
const SHARE_AS_PRIVATE_GIST_COMMAND_ID = 'workbench.action.shareAsPrivateGist';
const SHOW_SHARE_CODE_TIP_COMMAND_ID = 'workbench.action.showShareCodeTip';
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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this.registerPrivateGistShareAction();
		this.registerCopyGitHubDotComLinkAction();
		this.registerShareCodeTipAction();
		this.registerShareCodeActionProvider();

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
			static readonly ID = SHARE_AS_PRIVATE_GIST_COMMAND_ID;
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
					// Surface next to existing Share entries (e.g. Copy vscode.dev Link),
					// including when there is no text selection.
					menu: [
						{
							id: MenuId.EditorContextShare,
							group: '0_vscode',
							order: 1,
						},
						{
							id: MenuId.MenubarShare,
							group: '0_vscode',
							order: 1,
						},
						{
							id: MenuId.EditorTitleContextShare,
							group: '0_vscode',
							order: 1,
						},
						{
							id: MenuId.ExplorerContextShare,
							group: '0_vscode',
							order: 1,
						},
						{
							id: MenuId.EditorLineNumberContext,
							group: '1_cutcopypaste',
							order: 3,
						},
					]
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

	private registerShareCodeTipAction(): void {
		this._register(registerAction2(class ShowShareCodeTipAction extends Action2 {
			constructor() {
				super({
					id: SHOW_SHARE_CODE_TIP_COMMAND_ID,
					title: localize2('showShareCodeTip', 'Show me how to share this code'),
					f1: true,
					category: localize2('shareCategory', 'Share'),
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const dialogService = accessor.get(IDialogService);
				const commandService = accessor.get(ICommandService);
				const codeEditorService = accessor.get(ICodeEditorService);

				// Capture selection before dialog focus can clear it.
				const editor = codeEditorService.getActiveCodeEditor();
				const preserved = editor?.getSelection() ?? undefined;
				if (editor && preserved && !preserved.isEmpty()) {
					editor.setSelection(preserved);
				}

				const markdown = new MarkdownString(undefined, { supportThemeIcons: true, isTrusted: true });
				markdown.appendMarkdown(localize(
					'showShareCodeTip.body',
					"With code selected, open the editor context menu and choose **Share**:\n\n- **Share as Private Gist** — share the selection privately (prototype)\n- **Copy GitHub.com Link** — copy a github.com permalink for the current line\n- **Copy vscode.dev Link** — existing VS Code share action\n\nTip: you can also use **Share: Share as Private Gist** from the Command Palette."
				));

				const result = await dialogService.prompt({
					type: Severity.Info,
					message: localize('showShareCodeTip.title', "Show me how to share this code"),
					custom: {
						icon: Codicon.lightbulb,
						markdownDetails: [{
							markdown,
							classes: ['share-dialog-input-text']
						}]
					},
					cancelButton: localize('showShareCodeTip.close', "Close"),
					buttons: [
						{
							label: localize('showShareCodeTip.tryGist', "Share as Private Gist"),
							run: () => 'gist' as const
						}
					]
				});

				if (result.result === 'gist') {
					const active = codeEditorService.getActiveCodeEditor();
					if (active && preserved && !preserved.isEmpty()) {
						active.setSelection(preserved);
						active.focus();
					}
					await commandService.executeCommand(SHARE_AS_PRIVATE_GIST_COMMAND_ID);
				}
			}
		}));
	}

	/**
	 * Reuses the editor lightbulb / Quick Fix surface (VS Code equivalent of
	 * Visual Studio Quick Actions) to surface a share tip when text is selected.
	 */
	private registerShareCodeActionProvider(): void {
		const provider: CodeActionProvider = {
			providedCodeActionKinds: [CodeActionKind.QuickFix.value, CodeActionKind.Refactor.value],
			provideCodeActions: (model: ITextModel, range: Range | Selection): CodeActionList | undefined => {
				if (range.isEmpty()) {
					return undefined;
				}
				const text = model.getValueInRange(range);
				if (!text || text.trim().length < 2) {
					return undefined;
				}

				const action: CodeAction = {
					title: localize('shareCodeAction.title', "Show me how to share this code"),
					kind: CodeActionKind.QuickFix.value,
					isPreferred: true,
					command: {
						id: SHOW_SHARE_CODE_TIP_COMMAND_ID,
						title: localize('shareCodeAction.title', "Show me how to share this code"),
					}
				};

				return {
					actions: [action],
					dispose() { }
				};
			}
		};

		this._register(this.languageFeaturesService.codeActionProvider.register('*', provider));
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

/**
 * Selection lightbulb affordance (VS Code content-widget pattern used by Quick Fix).
 * Shows when text is selected; click opens the share tip quick action.
 */
class ShareSelectionLightbulbWidget extends Disposable implements IContentWidget {
	readonly allowEditorOverflow = true;
	readonly suppressMouseDown = true;

	private readonly _domNode: HTMLElement;
	private _position: IContentWidgetPosition | null = null;
	private _visible = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _onClick: () => void,
	) {
		super();
		this._domNode = dom.$('div.share-selection-lightbulb');
		this._domNode.setAttribute('role', 'button');
		this._domNode.setAttribute('tabindex', '0');
		this._domNode.setAttribute('aria-label', localize('shareSelectionLightbulb.aria', "Show me how to share this code"));
		this._domNode.title = localize('shareSelectionLightbulb.title', "Show me how to share this code");
		const icon = dom.$('span');
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.lightbulb));
		this._domNode.appendChild(icon);

		const trigger = (e: Event) => {
			e.preventDefault();
			e.stopPropagation();
			this._onClick();
		};
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.MOUSE_DOWN, trigger));
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				trigger(e);
			}
		}));
	}

	getId(): string { return 'share.selectionLightbulb'; }
	getDomNode(): HTMLElement { return this._domNode; }
	getPosition(): IContentWidgetPosition | null { return this._position; }

	show(selection: Selection): void {
		this._position = {
			position: selection.getStartPosition(),
			preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
		};
		if (!this._visible) {
			this._editor.addContentWidget(this);
			this._visible = true;
		} else {
			this._editor.layoutContentWidget(this);
		}
		this._domNode.classList.add('visible');
	}

	hide(): void {
		if (!this._visible) {
			return;
		}
		this._domNode.classList.remove('visible');
		this._editor.removeContentWidget(this);
		this._visible = false;
		this._position = null;
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}

class ShareSelectionLightbulbController extends Disposable implements IEditorContribution {
	static readonly ID = 'editor.contrib.shareSelectionLightbulb';

	private readonly _widget: ShareSelectionLightbulbWidget;
	private readonly _update: RunOnceScheduler;

	constructor(
		private readonly _editor: ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();
		this._widget = this._register(new ShareSelectionLightbulbWidget(this._editor, () => {
			void this._commandService.executeCommand(SHOW_SHARE_CODE_TIP_COMMAND_ID);
		}));
		this._update = this._register(new RunOnceScheduler(() => this._render(), 100));
		this._register(this._editor.onDidChangeCursorSelection(() => this._update.schedule()));
		this._register(this._editor.onDidChangeModel(() => this._update.schedule()));
		this._register(this._editor.onDidScrollChange(() => this._update.schedule()));
		this._update.schedule();
	}

	private _render(): void {
		const model = this._editor.getModel();
		const selection = this._editor.getSelection();
		if (!model || !selection || selection.isEmpty()) {
			this._widget.hide();
			return;
		}
		const text = model.getValueInRange(selection);
		if (!text || text.trim().length < 2) {
			this._widget.hide();
			return;
		}
		this._widget.show(selection);
	}
}

registerEditorContribution(ShareSelectionLightbulbController.ID, ShareSelectionLightbulbController, EditorContributionInstantiation.AfterFirstRender);
