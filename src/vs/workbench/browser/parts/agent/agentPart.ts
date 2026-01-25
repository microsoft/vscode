/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nikolaas Bender. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Part } from '../../part.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { Parts, IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { Dimension } from '../../../../base/browser/dom.js';

export class AgentManagerPart extends Part {

	static readonly ID = Parts.AGENT_PART;

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	private container: HTMLElement | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService
	) {
		super(AgentManagerPart.ID, { hasTitle: true }, themeService, storageService, layoutService);
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.container = document.createElement('div');
		this.container.classList.add('agent-manager-part');
		this.container.style.height = '100%';
		this.container.style.width = '100%';
		this.container.style.display = 'flex';
		this.container.style.flexDirection = 'column';
		this.container.style.backgroundColor = 'var(--vscode-editor-background)'; // Match editor background for now

		// Header
		const header = document.createElement('div');
		header.style.padding = '10px';
		header.style.fontWeight = 'bold';
		header.style.borderBottom = '1px solid var(--vscode-sideBar-border)';
		header.innerText = 'AGENT DECK (PROJECT IRWIN)';
		this.container.appendChild(header);

		// Body
		const body = document.createElement('div');
		body.style.flex = '1';
		body.style.padding = '20px';
		body.innerText = 'Agent Runtime not connected.\n\nWaiting for container injection...';
		this.container.appendChild(body);

		parent.appendChild(this.container);
		return this.container;
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);
		if (this.container) {
			// Layout logic if needed
		}
	}

	toJSON(): object {
		return {
			type: Parts.AGENT_PART
		};
	}
}
