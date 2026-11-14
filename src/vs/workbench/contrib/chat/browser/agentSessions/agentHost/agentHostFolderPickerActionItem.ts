/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IActionProvider } from '../../../../../../base/browser/ui/dropdown/dropdown.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IManagedHoverTooltipMarkdownString } from '../../../../../../base/browser/ui/hover/hover.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ISCMService } from '../../../../scm/common/scm.js';
import type { IChatWidget } from '../../chat.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from '../../widget/input/chatInputPickerActionItem.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { createFolderPickerTip } from './agentHostFolderPickerTip.js';
import { AgentHostWorktreeFolderChoices } from './agentHostWorktreeFolderChoices.js';

/**
 * Folder picker for agent-host sessions in multi-root windows. An agent-host
 * session runs in a single working directory chosen at creation time, so before
 * the session starts this chip lets the user pick which root folder the session
 * will run in. The choice is recorded in {@link IAgentHostNewSessionFolderService},
 * keyed by the (untitled) chat session resource, where the working-directory
 * resolution sites pick it up. Once the session has started its working
 * directory is fixed, so the chip stays visible (showing the chosen folder)
 * but is disabled via the action's precondition.
 */
export class AgentHostFolderPickerActionItem extends ChatInputPickerActionViewItem {

	private _hoverSetup = false;
	/** The choices in a window with a single local folder while worktree support is on: New Worktree, the folder and its worktrees. */
	private readonly _worktree: AgentHostWorktreeFolderChoices;

	constructor(
		action: MenuItemAction,
		private readonly _widget: IChatWidget,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
		@IAgentHostCustomizationService private readonly _customizationService: IAgentHostCustomizationService,
		@ISCMService private readonly _scmService: ISCMService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const selected = this._selectedFolder();
				if (this._worktree.isActive()) {
					return this._worktree.getActions(action, selected, () => {
						if (this.element) {
							this.renderLabel(this.element);
						}
					});
				}
				return this._workspaceContextService.getWorkspace().folders.map(folder => ({
					...action,
					id: `agentHostFolder.${folder.uri.toString()}`,
					label: folder.name,
					checked: selected?.toString() === folder.uri.toString(),
					icon: { id: 'folder' },
					enabled: true,
					tooltip: folder.uri.fsPath,
					run: async () => {
						const sessionResource = this._sessionResource();
						if (sessionResource) {
							this._newSessionFolderService.setFolder(sessionResource, folder.uri);
						}
						if (this.element) {
							this.renderLabel(this.element);
						}
					},
				} satisfies IActionWidgetDropdownAction));
			}
		};

		const actionBarActionProvider: IActionProvider = {
			getActions: () => []
		};

		const folderPickerOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider,
			actionBarActionProvider,
			showItemKeybindings: false,
			reporter: { id: 'AgentHostFolderPicker', name: 'AgentHostFolderPicker', includeOptions: false },
			listOptionsProvider: createFolderPickerTip(storageService),
		};

		super(action, folderPickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		this._worktree = this._register(instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => this._sessionResource()));
		this._register(this._worktree.onDidChange(() => {
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));

		this._register(this._newSessionFolderService.onDidChangeFolder(() => {
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
		this._register(this._widget.onDidChangeViewModel(() => {
			this._worktree.refresh();
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
		// Re-render when asynchronous session state reveals the session's working directory.
		this._register(this._customizationService.onDidChangeCustomizations(() => {
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	private _sessionResource(): URI | undefined {
		return this._widget.viewModel?.sessionResource;
	}

	private _selectedFolder(): URI | undefined {
		const folders = this._workspaceContextService.getWorkspace().folders;
		const sessionResource = this._sessionResource();
		const stored = sessionResource ? this._newSessionFolderService.getFolder(sessionResource) : undefined;
		// Stale workspace selections are cleared by the folder service; standalone selections remain valid.
		if (stored) {
			return stored;
		}
		// A started session's working directory is fixed at creation time and may
		// differ from the current workspace's first folder (e.g. a single-folder
		// session opened inside a multi-root workspace), so show its own folder
		// rather than the workspace default.
		const sessionWorkingDirectory = sessionResource ? this._customizationService.getClientWorkingDirectoryUris(sessionResource)[0] : undefined;
		if (sessionWorkingDirectory) {
			return sessionWorkingDirectory;
		}
		// No explicit choice for this session yet: default to the folder the
		// user last picked in this window (if still valid) so a new chat keeps
		// the previous selection instead of resetting to the first folder.
		return this._newSessionFolderService.getDefaultFolder() ?? folders[0]?.uri;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		const selected = this._selectedFolder();
		const folder = selected && this._workspaceContextService.getWorkspace().folders.find(f => f.uri.toString() === selected.toString());
		// With worktree support, by its icon only, a folder or a worktree, but New Worktree by its name
		const chip = selected && this._worktree?.isActive() ? this._worktree.getChip(selected) : undefined;
		const label = chip ? chip.description : folder ? folder.name : (selected ? basename(selected) : localize('agentHost.selectFolder', "Folder"));
		const shownLabel = chip ? chip.label : label;
		const compact = this.pickerOptions.compact.get();
		element.classList.toggle('icon-only', compact || !shownLabel);
		dom.reset(
			element,
			...renderLabelWithIcons(chip?.icon === Codicon.worktree ? `$(${Codicon.worktree.id})` : `$(folder-compact)`),
			...(!compact && shownLabel ? [dom.$('span.chat-input-picker-label', undefined, shownLabel)] : []),
		);
		// Set the aria label after the visible text is in place: the base class
		// derives it from `element.textContent`, so labeling first would lag one
		// selection behind.
		this.setAriaLabelAttributes(element);
		element.ariaLabel = label;
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);

		// The chip often shows a disabled folder name — the working directory is
		// fixed once the session starts — so a plain folder name alone doesn't
		// explain what it represents. Surface a descriptive hover with the full
		// folder path and current git branch, mirroring the agents window's
		// session header. Set up once with a content factory so the hover always
		// reflects the latest selection/branch at the time it is shown.
		if (this.element && !this._hoverSetup) {
			this._hoverSetup = true;
			this._register(this._hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'),
				this.element,
				() => this._buildHoverContent(),
			));
		}
	}

	/**
	 * Builds the hover content for the folder chip: the full folder path and,
	 * when the folder maps to a git repository, the current branch name.
	 * Returns `undefined` when no folder is selected so no hover is shown.
	 */
	private _buildHoverContent(): IManagedHoverTooltipMarkdownString | undefined {
		const selected = this._selectedFolder();
		if (!selected) {
			return undefined;
		}

		const md = new MarkdownString('', { supportThemeIcons: true });
		const fallbackLines: string[] = [];

		// What the chip shows by its icon only, by name
		const chip = this._worktree.isActive() ? this._worktree.getChip(selected) : undefined;
		if (chip) {
			md.appendText(chip.description);
			md.appendMarkdown('\n\n');
			fallbackLines.push(chip.description);
		}
		md.appendMarkdown(`$(${(chip?.icon ?? Codicon.folder).id}) `);
		md.appendText(selected.fsPath);
		fallbackLines.push(selected.fsPath);

		const branch = this._branchName(selected);
		if (branch) {
			md.appendMarkdown('\n\n$(git-branch) ');
			md.appendText(branch);
			fallbackLines.push(branch);
		}

		return { markdown: md, markdownNotSupportedFallback: fallbackLines.join('\n') };
	}

	/**
	 * Resolves the current git branch name for the given folder via the SCM
	 * service, or `undefined` when the folder has no associated repository or
	 * branch information.
	 */
	private _branchName(folderUri: URI): string | undefined {
		const repository = this._scmService.getRepository(folderUri);
		const historyProvider = repository?.provider.historyProvider.get();
		return historyProvider?.historyItemRef.get()?.name.trim() || undefined;
	}
}
