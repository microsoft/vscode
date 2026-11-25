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
import { IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { basename, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { localize } from '../../../../../../nls.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownListOptionsProvider, IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ISCMService } from '../../../../scm/common/scm.js';
import type { IChatWidget } from '../../chat.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from '../../widget/input/chatInputPickerActionItem.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { createFolderPickerTip } from './agentHostFolderPickerTip.js';
import { AgentHostWorktreeFolderChoices } from './agentHostWorktreeFolderChoices.js';
import './media/agentHostChatInputPicker.css';
import { IAgentHostWorktreeSendChoiceService } from './agentHostWorktreeSendChoice.js';
import { markWorktreeSendChoiceTarget } from './agentHostNewWorktreeToggle.js';

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
/** The class of the folder picker's list, whose rows with a detail are laid out in agentHostChatInputPicker.css. */
export const FOLDER_PICKER_LIST_CLASS = 'agent-host-folder-picker-list';

function withFolderPickerListClass(provider: IActionWidgetDropdownListOptionsProvider): IActionWidgetDropdownListOptionsProvider {
	return {
		getListOptions: () => {
			const options = provider.getListOptions();
			return { ...options, className: [options?.className, FOLDER_PICKER_LIST_CLASS].filter(Boolean).join(' ') };
		},
	};
}

/** As `.agent-host-folder-chip .chat-input-picker-label` bounds the name in agentHostChatInputPicker.css. */
const FOLDER_CHIP_LABEL_MAX_WIDTH = 160;

let textMeasureContext: CanvasRenderingContext2D | null | undefined;
function measureTextWidth(text: string, font: string): number {
	textMeasureContext ??= mainWindow.document.createElement('canvas').getContext('2d');
	if (!textMeasureContext) {
		return 0;
	}
	textMeasureContext.font = font;
	return textMeasureContext.measureText(text).width;
}

export class AgentHostFolderPickerActionItem extends ChatInputPickerActionViewItem {

	private _hoverSetup = false;
	private _container: HTMLElement | undefined;
	private _labelElement: HTMLElement | undefined;
	/** What the chip needs besides its name, its icon, gap and padding, and its name's font, as last rendered. */
	private _chrome: { readonly width: number; readonly font: string } | undefined;
	/** What the chip shows as it last rendered, and what it showed as {@link _chrome} was measured: it is measured again only as that changes. */
	private _renderedKey: string | undefined;
	private _chromeKey: string | undefined;
	private readonly _fontsListener = this._register(new MutableDisposable());
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
		@IThemeService themeService: IThemeService,
		@IAgentHostWorktreeSendChoiceService private readonly _sendChoice: IAgentHostWorktreeSendChoiceService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const selected = this._selectedFolder();
				if (this._worktree.isActive()) {
					return this._worktree.getActions(action, selected, () => {
						if (this.element) {
							this.renderLabel(this.element);
						}
						// The user's pick of New Worktree or the folder is their answer for later new chats in the folder
						const sessionResource = this._sessionResource();
						if (sessionResource) {
							this._sendChoice.rememberSelection(sessionResource);
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
			listOptionsProvider: withFolderPickerListClass(createFolderPickerTip(storageService)),
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
		// Another product icon theme can size its icon differently under the same name: measured again as it is next laid out
		this._register(themeService.onDidProductIconThemeChange(() => this._chromeKey = undefined));
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
		const selected = this._displayedFolder();
		const folder = selected && this._workspaceContextService.getWorkspace().folders.find(f => f.uri.toString() === selected.toString());
		const chip = this._chip(selected);
		const label = chip ? chip.description : folder ? folder.name : (selected ? basename(selected) : localize('agentHost.selectFolder', "Folder"));
		const shownLabel = chip ? chip.label : label;
		const compact = !chip && this.pickerOptions.compact.get();
		// Never compact by its name, which a long one shows ellipsized
		element.classList.toggle('compact', compact);
		element.classList.toggle('agent-host-folder-chip', !!chip);
		element.classList.toggle('icon-only', compact || !shownLabel);
		this._labelElement = !compact && shownLabel ? dom.$('span.chat-input-picker-label', undefined, shownLabel) : undefined;
		const icon = chip?.icon === Codicon.worktree || chip?.icon === Codicon.comment ? chip.icon.id : 'folder-compact';
		this._renderedKey = `${icon}|${!!chip}|${compact}|${shownLabel ?? ''}`;
		dom.reset(
			element,
			...renderLabelWithIcons(`$(${icon})`),
			...(this._labelElement ? [this._labelElement] : []),
		);
		// Set the aria label after the visible text is in place: the base class
		// derives it from `element.textContent`, so labeling first would lag one
		// selection behind.
		this.setAriaLabelAttributes(element);
		element.ariaLabel = label;
		return null;
	}

	override render(container: HTMLElement): void {
		this._container = container;
		this._register(markWorktreeSendChoiceTarget(container, this._sendChoice, () => this._sessionResource(), this._widget.onDidChangeViewModel));
		this._chromeKey = undefined;
		// Its icon's font can load after it was measured with a fallback: measured again as it is next laid out
		this._fontsListener.value = dom.addDisposableListener(dom.getWindow(container).document.fonts, 'loadingdone', () => this._chromeKey = undefined);
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
	 * The width the chip needs while it always shows its name, which it does not give up to fit the toolbar as compact
	 * pickers do: for the toolbar's responsive budget, so that its neighbors overflow instead. `undefined` while it can be
	 * compact.
	 */
	getMinimumWidth(): number | undefined {
		const chip = this._chip(this._displayedFolder());
		if (!chip) {
			return undefined;
		}
		// Only as what it shows changes: measuring reads the layout, which its toolbar asks for on every layout
		if (!this._chrome || this._chromeKey !== this._renderedKey) {
			const chrome = this.measureChrome();
			if (chrome) {
				this._chrome = chrome;
				this._chromeKey = this._renderedKey;
			}
		}
		// Of the name it shows now, also while in the overflow, rather than of the width the toolbar gave it
		return this._chrome && Math.ceil(this._chrome.width + Math.min(measureTextWidth(chip.label, this._chrome.font), FOLDER_CHIP_LABEL_MAX_WIDTH));
	}

	/** With worktree support, the chip by its icon and name: a folder, a worktree or New Worktree, also while compact. */
	private _chip(selected: URI | undefined): { readonly icon: ThemeIcon; readonly label: string; readonly description: string } | undefined {
		if (!this._worktree?.isActive()) {
			return undefined;
		}
		return selected && this._worktree.getChip(selected, this._startedWorktree());
	}

	/**
	 * The folder the chip stands for, by its name, hover path and branch: the worktree made for a session that started in a
	 * new worktree, else the selected folder, which stays the one the new worktree was made of.
	 */
	private _displayedFolder(): URI | undefined {
		const started = this._worktree.isActive() && this._worktree.isNewWorktreeSelected() ? this._startedWorktree() : undefined;
		return started ?? this._selectedFolder();
	}

	/**
	 * Where the session works as its host says, where that is not the folder a new worktree of it is made of (the one chosen
	 * for it, else the window's): once it started in a new worktree, the worktree made for it.
	 */
	private _startedWorktree(): URI | undefined {
		const sessionResource = this._sessionResource();
		const workingDirectory = sessionResource && this._customizationService.getClientWorkingDirectoryUris(sessionResource)[0];
		const base = (sessionResource && this._newSessionFolderService.getFolder(sessionResource))
			?? this._newSessionFolderService.getDefaultFolder()
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
		return workingDirectory && !(base && extUriBiasedIgnorePathCase.isEqual(workingDirectory, base)) ? workingDirectory : undefined;
	}

	/**
	 * What the chip needs besides its name, as it shows now; `undefined` while it is not in the DOM. Measured from what does
	 * not give way as the toolbar narrows it, its icon, gaps, margins, paddings and borders, rather than from its width, which
	 * is less than it needs while narrowed.
	 */
	protected measureChrome(): { readonly width: number; readonly font: string } | undefined {
		const element = this.element;
		const container = this._container;
		const label = this._labelElement;
		// Not while it has no layout, such as in a hidden chat input, whose sizes read as zero
		if (!element?.isConnected || !container || !label || !element.getClientRects().length) {
			return undefined;
		}
		const window = dom.getWindow(container);
		const px = (value: string) => Number.parseFloat(value) || 0;
		const edges = (style: CSSStyleDeclaration) => px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
		const elementStyle = window.getComputedStyle(element);
		const labelStyle = window.getComputedStyle(label);
		let width = px(labelStyle.marginLeft) + px(labelStyle.marginRight) + px(elementStyle.columnGap) * Math.max(0, element.children.length - 1);
		for (const child of element.children) {
			if (child !== label) {
				const childStyle = window.getComputedStyle(child);
				width += child.getBoundingClientRect().width + px(childStyle.marginLeft) + px(childStyle.marginRight);
			}
		}
		// The element and what holds it in the toolbar's item
		for (let node: HTMLElement | null = element; node && node !== container; node = node.parentElement) {
			const style = node === element ? elementStyle : window.getComputedStyle(node);
			width += edges(style) + px(style.marginLeft) + px(style.marginRight);
		}
		width += edges(window.getComputedStyle(container));
		return { width, font: labelStyle.font };
	}

	/**
	 * Builds the hover content for the folder chip: the full folder path and,
	 * when the folder maps to a git repository, the current branch name.
	 * Returns `undefined` when no folder is selected so no hover is shown.
	 */
	protected _buildHoverContent(): IManagedHoverTooltipMarkdownString | undefined {
		const selected = this._displayedFolder();
		if (!selected) {
			return undefined;
		}

		const md = new MarkdownString('', { supportThemeIcons: true });
		const fallbackLines: string[] = [];

		// What the chip shows by its icon only, by name
		const chip = this._worktree.isActive() ? this._worktree.getChip(selected, this._startedWorktree()) : undefined;
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
