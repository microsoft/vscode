/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, clearNode } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { editorForeground, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { localize } from '../../../../nls.js';

export class EditorGroupWatermark extends Disposable {

	private readonly shortcuts: HTMLElement;
	private readonly transientDisposables = this._register(new DisposableStore());
	private readonly rootElement: HTMLElement;
	private resizeObserver: ResizeObserver | undefined;

	private enabled = false;
	private workbenchState: WorkbenchState;

	constructor(
		container: HTMLElement,
		@IKeybindingService keybindingService: IKeybindingService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.workbenchState = this.contextService.getWorkbenchState();

		// Create Specter-style watermark structure
		const root = append(container, $('.editor-group-watermark.specter-watermark'));
		this.rootElement = root;
		
		// Set up resize observer for responsive layout
		if (typeof ResizeObserver !== 'undefined') {
			this.resizeObserver = new ResizeObserver(() => {
				this.updateResponsiveLayout();
			});
			this.resizeObserver.observe(container);
			this._register({
				dispose: () => {
					if (this.resizeObserver) {
						this.resizeObserver.disconnect();
					}
				}
			});
		}
		
		// Title
		append(root, $('.specter-title', undefined, 'Specter'));
		
		// Getting Started Section
		const gettingStarted = append(root, $('.specter-section.getting-started'));
		append(gettingStarted, $('.section-title', undefined, localize('specter.gettingStarted', 'Getting started with Specter')));
		
		const tasks = append(gettingStarted, $('.tasks'));
		
		// Task 1 - Code with Bsurf
		const task1 = append(tasks, $('.task'));
		const task1Left = append(task1, $('.task-left'));
		const task1Radio = append(task1Left, $('input', { type: 'radio', name: 'specter-tasks' }));
		const task1Label = append(task1Left, $('label', undefined, localize('specter.codeWithBsurf', 'Code with Bsurf')));
		append(task1, $('.keybinding', undefined, 'Cmd+L'));
		
		// Add click handler to open chat panel
		task1Radio.onclick = () => this.commandService.executeCommand('workbench.action.chat.open');
		task1Label.onclick = () => this.commandService.executeCommand('workbench.action.chat.open');
		
		// Task 2
		const task2 = append(tasks, $('.task'));
		const task2Left = append(task2, $('.task-left'));
		append(task2Left, $('input', { type: 'radio', name: 'specter-tasks' }));
		append(task2Left, $('label', undefined, localize('specter.openPalette', 'Open Command Palette')));
		append(task2, $('.keybinding', undefined, 'Shift+Cmd+P'));
		
		const footer = append(gettingStarted, $('.section-footer'));
		append(footer, $('span', undefined, '0% done'));
		const changeKeys = append(footer, $('a', { href: '#' }, localize('specter.changeKeys', 'Change keybindings')));
		changeKeys.onclick = () => this.commandService.executeCommand('workbench.action.openGlobalKeybindings');
		
		// Two-column layout for Start and Recent
		const columnsContainer = append(root, $('.specter-columns'));
		
		// Start Section (Left column)
		const startSection = append(columnsContainer, $('.specter-section.start-section'));
		append(startSection, $('.section-title', undefined, localize('specter.start', 'Start')));
		
		const buttons = append(startSection, $('.buttons'));
		
		// Open Folder Button
		const openFolderBtn = append(buttons, $('button.specter-button.prominent', undefined, localize('specter.openFolder', 'Open Folder')));
		openFolderBtn.onclick = () => this.commandService.executeCommand('workbench.action.files.openFolder');
		
		// Generate Project Button
		append(buttons, $('button.specter-button', undefined, localize('specter.newProject', '+ Generate a New Project')));
		
		// Clone Repository Button
		const cloneBtn = append(buttons, $('button.specter-button', undefined, localize('specter.clone', 'Clone Repository')));
		cloneBtn.onclick = () => this.commandService.executeCommand('git.clone');
		
		// SSH Button
		const sshBtn = append(buttons, $('button.specter-button', undefined, localize('specter.ssh', 'Connect via SSH')));
		sshBtn.onclick = () => this.commandService.executeCommand('opensshremotes.openEmptyWindow');
		
		// Recent Projects Section (Right column)
		const recentSection = append(columnsContainer, $('.specter-section.recent-section'));
		append(recentSection, $('.section-title', undefined, localize('specter.recent', 'Recent Projects')));
		
		const recentList = append(recentSection, $('.recent-list'));
		this.shortcuts = recentList;

		this.registerListeners();
		this.render();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.tips.enabled')) {
				this.render();
			}
		}));

		this._register(this.contextService.onDidChangeWorkbenchState(workbenchState => {
			if (this.workbenchState !== workbenchState) {
				this.workbenchState = workbenchState;
				this.render();
			}
		}));
	}

	private render(): void {
		this.enabled = this.configurationService.getValue<boolean>('workbench.tips.enabled');
		clearNode(this.shortcuts);
		this.transientDisposables.clear();

		if (!this.enabled) {
			return;
		}

		// Show "No recent projects" message
		append(this.shortcuts, $('.no-recent', undefined, localize('specter.noRecent', 'No recent projects')));
	}

	private updateResponsiveLayout(): void {
		// Update layout based on container width
		// The CSS handles most of this, but we can add dynamic adjustments here if needed
		if (this.rootElement) {
			const width = this.rootElement.clientWidth;
			
			// Add a class for narrow layouts
			if (width < 500) {
				this.rootElement.classList.add('narrow-layout');
			} else {
				this.rootElement.classList.remove('narrow-layout');
			}
		}
	}
}

registerColor('editorWatermark.foreground', { dark: transparent(editorForeground, 0.6), light: transparent(editorForeground, 0.68), hcDark: editorForeground, hcLight: editorForeground }, localize('editorLineHighlight', 'Foreground color for the labels in the editor watermark.'));
