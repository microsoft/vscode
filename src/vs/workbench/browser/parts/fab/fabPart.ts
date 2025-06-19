/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/fabpart.css';
import { Part } from '../../part.js';
import { IThemeService, IColorTheme } from '../../../../platform/theme/common/themeService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { $, addDisposableListener, Dimension, EventHelper } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { FAB_BACKGROUND, FAB_FOREGROUND, FAB_HOVER_BACKGROUND } from '../../../common/theme.js';
import { isWeb } from '../../../../base/common/platform.js'; // Using isWeb as a temporary proxy for mobile

export class FabPart extends Part {

	private static readonly PART_ID = Parts.FAB_PART; // Assuming you'll add FAB_PART to Parts enum

	private fabButtonElement: HTMLElement | undefined;
	private fabIconElement: HTMLElement | undefined;

	// For now, visibility is controlled internally based on isWeb.
	// Later, this should react to a proper mobile context key.
	private isVisible: boolean = false;

	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService protected layoutService: IWorkbenchLayoutService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(FabPart.PART_ID, { hasTitle: false }, themeService, storageService, layoutService);

		this.updateVisibility(); // Initial visibility check
		// Later, listen to context key changes for mobile mode
		// this._register(this.contextKeyService.onDidChangeContext(e => {
		// 	if (e.affectsSome(new Set(['isMobile']))) { // Replace 'isMobile' with actual context key
		// 		this.updateVisibility();
		// 	}
		// }));
	}

	private updateVisibility(): void {
		const shouldBeVisible = isWeb; // Temporary: Show FAB only on web as proxy for mobile

		if (shouldBeVisible === this.isVisible) {
			return;
		}

		this.isVisible = shouldBeVisible;

		if (this.element) {
			if (this.isVisible) {
				this.element.style.display = '';
			} else {
				this.element.style.display = 'none';
			}
		}

		// Notify layout service about potential change
		this.layoutService.layout();
	}

	override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.element.classList.add('fab-part'); // Add class for the part container itself

		this.fabButtonElement = document.createElement('button');
		this.fabButtonElement.classList.add('fab-button');
		this.fabButtonElement.setAttribute('role', 'button');
		// For now, hardcode a default command. This could be made configurable or context-aware.
		this.fabButtonElement.setAttribute('aria-label', localize('fabActionLabel', "Show All Commands"));
		this.element.appendChild(this.fabButtonElement);

		this.fabIconElement = $(ThemeIcon.asCSSSelector(Codicon.lightbulbSparkle)); // Example icon
		this.fabButtonElement.appendChild(this.fabIconElement);

		this.registerListeners();
		this.updateStyles(this.themeService.getColorTheme());

		return this.element;
	}

	private registerListeners(): void {
		if (this.fabButtonElement) {
			this._register(addDisposableListener(this.fabButtonElement, EventType.CLICK, (e) => {
				EventHelper.stop(e, true);
				this.commandService.executeCommand('workbench.action.showCommands');
			}));
		}
	}

	protected override updateStyles(theme: IColorTheme): void {
		super.updateStyles(theme);

		if (this.fabButtonElement) {
			const fabBackgroundColor = theme.getColor(FAB_BACKGROUND);
			const fabForegroundColor = theme.getColor(FAB_FOREGROUND);
			const fabHoverBackgroundColor = theme.getColor(FAB_HOVER_BACKGROUND);

			this.fabButtonElement.style.backgroundColor = fabBackgroundColor ? fabBackgroundColor.toString() : '';
			this.fabButtonElement.style.color = fabForegroundColor ? fabForegroundColor.toString() : '';

			// For hover, CSS variables are used in fabpart.css, but we can set them here if needed
			// or rely on the CSS file to use these theme variables directly.
			// For simplicity, fabpart.css will use these variables.
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);
		// The FAB is fixed positioned by CSS, so its layout within the part container
		// doesn't need to react to width/height here unless we were doing more complex things
		// like speed-dial menus that need to be aware of container bounds.
	}


	toJSON(): object {
		return {
			type: Parts.FAB_PART // Assuming FAB_PART will be added to Parts enum
		};
	}
}
