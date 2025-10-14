/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import * as DOM from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import './specterEmptyState.css';

export class SpecterEmptyStateContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.specterEmptyState';

	private container: HTMLElement | null = null;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		// Wait for layout to be ready
		setTimeout(() => {
			this.initialize();
		}, 100);
	}

	private initialize(): void {
		this._register(this.editorService.onDidVisibleEditorsChange(() => {
			this.updateEmptyState();
		}));

		this.updateEmptyState();
	}

	private updateEmptyState(): void {
		const hasEditors = this.editorService.visibleEditors.length > 0;

		if (!hasEditors && !this.container) {
			this.createEmptyState();
		} else if (hasEditors && this.container) {
			this.removeEmptyState();
		}
	}

	private createEmptyState(): void {
		const editorPart = mainWindow.document.querySelector('.part.editor > .content');
		if (!editorPart) { return; }

		// Create main container
		this.container = DOM.$('.specter-empty-state');

		// Title
		const title = DOM.$('.specter-title', {}, 'Specter');

		// Getting Started section
		const gettingStarted = this.createGettingStartedSection();

		// Start section
		const startSection = this.createStartSection();

		// Recent Projects section
		const recentSection = this.createRecentSection();

		// Assemble
		this.container.appendChild(title);
		this.container.appendChild(gettingStarted);
		this.container.appendChild(startSection);
		this.container.appendChild(recentSection);

		editorPart.appendChild(this.container);
	}

	private createGettingStartedSection(): HTMLElement {
		const section = DOM.$('.specter-section.getting-started');

		const sectionTitle = DOM.$('.section-title', {}, 'Getting started with Specter');

		const tasks = DOM.$('.tasks');

		// Checkbox 1
		const task1 = DOM.$('.task');
		const checkbox1 = DOM.$('input', { type: 'checkbox' });
		const label1 = DOM.$('label', {}, 'Configure Security Tools');
		const keys1 = DOM.$('.keybinding', {}, 'Cmd+L');
		task1.append(checkbox1, label1, keys1);

		// Checkbox 2
		const task2 = DOM.$('.task');
		const checkbox2 = DOM.$('input', { type: 'checkbox' });
		const label2 = DOM.$('label', {}, 'Open Command Palette');
		const keys2 = DOM.$('.keybinding', {}, 'Shift+Cmd+P');
		task2.append(checkbox2, label2, keys2);

		tasks.append(task1, task2);

		const footer = DOM.$('.section-footer');
		const progress = DOM.$('span', {}, '0% done');
		const changeKeys = DOM.$('a', { href: '#' }, 'Change keybindings');
		footer.append(progress, changeKeys);

		section.append(sectionTitle, tasks, footer);
		return section;
	}

	private createStartSection(): HTMLElement {
		const section = DOM.$('.specter-section.start-section');

		const sectionTitle = DOM.$('.section-title', {}, 'Start');

		const buttons = DOM.$('.buttons');

		// Open Folder button (prominent)
		const openFolderBtn = DOM.$('button.specter-button.prominent');
		openFolderBtn.textContent = 'Open Folder';
		openFolderBtn.onclick = () => this.commandService.executeCommand('workbench.action.files.openFolder');

		// Generate New Project button
		const newProjectBtn = DOM.$('button.specter-button');
		newProjectBtn.textContent = '+ Generate a New Project';

		// Clone Repository button
		const cloneBtn = DOM.$('button.specter-button');
		cloneBtn.textContent = 'Clone Repository';
		cloneBtn.onclick = () => this.commandService.executeCommand('git.clone');

		// Connect via SSH button
		const sshBtn = DOM.$('button.specter-button');
		sshBtn.textContent = 'Connect via SSH';
		sshBtn.onclick = () => this.commandService.executeCommand('opensshremotes.openEmptyWindow');

		buttons.append(openFolderBtn, newProjectBtn, cloneBtn, sshBtn);
		section.append(sectionTitle, buttons);

		return section;
	}

	private createRecentSection(): HTMLElement {
		const section = DOM.$('.specter-section.recent-section');

		const sectionTitle = DOM.$('.section-title', {}, 'Recent Projects');

		const recentList = DOM.$('.recent-list');

		// Get recent workspaces from editor service
		// For now, show placeholder
		const noRecent = DOM.$('.no-recent', {}, 'No recent projects');
		recentList.appendChild(noRecent);

		section.append(sectionTitle, recentList);
		return section;
	}

	private removeEmptyState(): void {
		if (this.container && this.container.parentElement) {
			this.container.parentElement.removeChild(this.container);
			this.container = null;
		}
	}

	override dispose(): void {
		this.removeEmptyState();
		super.dispose();
	}
}

// Register the contribution
registerWorkbenchContribution2(
	SpecterEmptyStateContribution.ID,
	SpecterEmptyStateContribution,
	WorkbenchPhase.Eventually
);
