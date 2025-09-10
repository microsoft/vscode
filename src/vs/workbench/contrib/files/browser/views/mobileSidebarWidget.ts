/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { IPaneCompositePart } from '../../../../browser/parts/paneCompositePart.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { EmbeddedCompositeHost } from './embeddedCompositeHost.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';

export class MobileSidebarWidget extends Disposable {

	private container: HTMLElement;
	private activityBarContainer: HTMLElement;
	private contentContainer: HTMLElement;
	private currentViewletId: string | undefined;
	private embeddedHost: EmbeddedCompositeHost | undefined;

	private readonly _onDidChangeActiveComposite = this._register(new Emitter<void>());
	readonly onDidChangeActiveComposite: Event<void> = this._onDidChangeActiveComposite.event;

	constructor(
		parent: HTMLElement,
		_sidebarPart: IPaneCompositePart | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchLayoutService _layoutService: IWorkbenchLayoutService,
		@IThemeService _themeService: IThemeService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewsService _viewsService: IViewsService,
		@ICommandService _commandService: ICommandService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService
	) {
		super();

		// Create main container with vertical layout
		this.container = document.createElement('div');
		this.container.className = 'mobile-sidebar-widget';
		this.container.style.display = 'flex';
		this.container.style.flexDirection = 'column';
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		parent.appendChild(this.container);

		// Create activity bar container (top)
		this.activityBarContainer = document.createElement('div');
		this.activityBarContainer.className = 'mobile-sidebar-activity-bar';
		this.container.appendChild(this.activityBarContainer);

		// Create content container (bottom)
		this.contentContainer = document.createElement('div');
		this.contentContainer.className = 'mobile-sidebar-content';
		this.contentContainer.style.flex = '1';
		this.container.appendChild(this.contentContainer);

		this.createActivityBar();
	}

	private createActivityBar(): void {
		// Get pinned viewlets from storage (same as real activity bar)
		const pinnedViewletIds = this.getPinnedViewletIds();
		console.log('[MobileSidebar] Pinned viewlet IDs from storage:', pinnedViewletIds);

		const allContainers = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.Sidebar);
		console.log('[MobileSidebar] All available containers:', allContainers.map(c => ({ id: c.id, title: c.title.value })));

		// Get containers in the order they're pinned
		let viewContainers = pinnedViewletIds
			.map(id => allContainers.find(c => c.id === id))
			.filter(c => c !== undefined) as typeof allContainers;

		// If no containers found, show all available ones
		if (viewContainers.length === 0) {
			console.log('[MobileSidebar] No pinned containers found, showing all available');
			viewContainers = allContainers;
		}

		console.log('[MobileSidebar] Final containers to show:', viewContainers.map(c => ({ id: c.id, title: c.title.value })));

		// Create action bar container (horizontal)
		const actionBar = document.createElement('div');
		actionBar.className = 'mobile-activity-actions';
		actionBar.style.display = 'flex';
		actionBar.style.flexDirection = 'row';
		this.activityBarContainer.appendChild(actionBar);

		// Add menu button first
		this.createMenuButton(actionBar);

		// Add buttons for each view container
		console.log('[MobileSidebar] Creating buttons for', viewContainers.length, 'containers');
		viewContainers.forEach(container => {
			console.log('[MobileSidebar] Creating button for:', container.id, container.title.value);
			const button = document.createElement('div');
			button.className = 'action-item';
			button.setAttribute('role', 'button');
			button.setAttribute('aria-label', container.title.value);
			button.setAttribute('tabindex', '0');

			// Create icon container
			const iconContainer = document.createElement('div');
			iconContainer.className = 'action-label';

			// Add the icon
			const icon = document.createElement('div');
			// Extract the codicon class from the container icon
			let iconClass = 'files'; // default

			// Try to get the icon from the container
			if (container.icon) {
				if (typeof container.icon === 'string') {
					iconClass = container.icon;
				} else if (typeof container.icon === 'object' && 'id' in container.icon) {
					iconClass = (container.icon as any).id;
				}
			}

			// Map some known container IDs to their icons if icon extraction failed
			const iconMap: Record<string, string> = {
				'workbench.view.explorer': 'files',
				'workbench.view.search': 'search',
				'workbench.view.scm': 'source-control',
				'workbench.view.debug': 'debug-alt',
				'workbench.view.extensions': 'extensions'
			};

			if (iconMap[container.id]) {
				iconClass = iconMap[container.id];
			}

			console.log('[MobileSidebar] Icon for', container.id, ':', iconClass);
			icon.className = `codicon codicon-${iconClass}`;
			iconContainer.appendChild(icon);

			button.appendChild(iconContainer);

			// Add click handler
			button.addEventListener('click', () => {
				this.showViewlet(container.id);
			});

			// Add keyboard handler
			button.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.showViewlet(container.id);
				}
			});

			actionBar.appendChild(button);
		});
	}

	private async showViewlet(viewletId: string): Promise<void> {
		if (this.currentViewletId === viewletId) {
			return; // Already showing this viewlet
		}

		this.currentViewletId = viewletId;
		console.log('[MobileSidebar] Switching to viewlet:', viewletId);

		// Clear previous content
		this.contentContainer.innerHTML = '';

		// Dispose previous host if exists
		if (this.embeddedHost) {
			this.embeddedHost.dispose();
			this.embeddedHost = undefined;
		}

		// Create content wrapper
		const wrapper = document.createElement('div');
		wrapper.className = 'mobile-sidebar-viewlet-content';
		wrapper.style.width = '100%';
		wrapper.style.height = '100%';
		wrapper.style.position = 'relative';
		this.contentContainer.appendChild(wrapper);

		try {
			// Create embedded composite host
			this.embeddedHost = this._instantiationService.createInstance(
				EmbeddedCompositeHost,
				wrapper,
				ViewContainerLocation.Sidebar
			);

			// Open the composite in our embedded host
			const composite = await this.embeddedHost.openComposite(viewletId);

			if (composite) {
				console.log('[MobileSidebar] Composite rendered successfully:', viewletId);

				// Layout the composite
				const bounds = wrapper.getBoundingClientRect();
				this.embeddedHost.layout(new Dimension(bounds.width, bounds.height));
			} else {
				console.log('[MobileSidebar] Failed to render composite:', viewletId);
				this.showPlaceholder(wrapper, viewletId);
			}
		} catch (error) {
			console.error('[MobileSidebar] Error creating embedded host:', error);
			this.showPlaceholder(wrapper, viewletId);
		}

		// Update active state on buttons
		this.updateActiveButton(viewletId);

		this._onDidChangeActiveComposite.fire();
	}

	private showPlaceholder(wrapper: HTMLElement, viewletId: string): void {
		const viewContainer = this.viewDescriptorService.getViewContainerById(viewletId);
		if (viewContainer) {
			wrapper.innerHTML = `
				<div style="padding: 20px;">
					<h3>${viewContainer.title.value}</h3>
					<p style="color: var(--vscode-descriptionForeground);">Unable to load viewlet</p>
				</div>
			`;
		}
	}

	private updateActiveButton(viewletId: string): void {
		const buttons = this.activityBarContainer.querySelectorAll('.action-item');
		const viewContainers = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.Sidebar);

		buttons.forEach((button, index) => {
			button.classList.remove('checked');
			if (viewContainers[index] && viewContainers[index].id === viewletId) {
				button.classList.add('checked');
			}
		});
	}

	refresh(): void {
		// Try to show the currently active viewlet from the normal sidebar if any
		const activeComposite = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
		if (activeComposite) {
			const activeViewletId = activeComposite.getId();
			console.log('[MobileSidebar] Refreshing with active viewlet:', activeViewletId);
			this.showViewlet(activeViewletId);
		} else {
			// Show the first pinned viewlet (usually Explorer)
			const pinnedViewletIds = this.getPinnedViewletIds();
			if (pinnedViewletIds.length > 0) {
				console.log('[MobileSidebar] No active viewlet, showing first pinned:', pinnedViewletIds[0]);
				this.showViewlet(pinnedViewletIds[0]);
			} else {
				// Fallback to first available container
				const viewContainers = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.Sidebar);
				if (viewContainers.length > 0) {
					console.log('[MobileSidebar] No pinned viewlets, showing first available:', viewContainers[0].id);
					this.showViewlet(viewContainers[0].id);
				}
			}
		}
	}

	layout(dimension: Dimension): void {
		const activityBarHeight = 48; // Fixed height for activity bar
		const contentHeight = dimension.height - activityBarHeight;

		// Layout activity bar (horizontal at top)
		this.activityBarContainer.style.width = `${dimension.width}px`;
		this.activityBarContainer.style.height = `${activityBarHeight}px`;

		// Layout content area (below activity bar)
		this.contentContainer.style.width = `${dimension.width}px`;
		this.contentContainer.style.height = `${contentHeight}px`;

		// Layout embedded host if exists
		if (this.embeddedHost) {
			this.embeddedHost.layout(new Dimension(dimension.width, contentHeight));
		}
	}

	focus(): void {
		// Focus the first button if available
		const firstButton = this.activityBarContainer.querySelector('.action-item') as HTMLElement;
		if (firstButton) {
			firstButton.focus();
		}
	}

	private getPinnedViewletIds(): string[] {
		// Get pinned viewlets from storage, same key as activity bar
		const pinnedString = this.storageService.get('workbench.activity.pinnedViewlets2', 1 /* WORKSPACE */, '[]');
		console.log('[MobileSidebar] Raw storage value for pinnedViewlets2:', pinnedString);

		try {
			const pinned = JSON.parse(pinnedString);
			if (Array.isArray(pinned) && pinned.length > 0) {
				return pinned;
			}
		} catch (e) {
			console.error('[MobileSidebar] Error parsing pinned viewlets:', e);
		}

		// Default viewlets if nothing stored
		console.log('[MobileSidebar] Using default viewlets');
		return ['workbench.view.explorer', 'workbench.view.search', 'workbench.view.scm', 'workbench.view.debug', 'workbench.view.extensions'];
	}

	private createMenuButton(container: HTMLElement): void {
		const menuButton = document.createElement('div');
		menuButton.className = 'action-item menu-button';
		menuButton.setAttribute('role', 'button');
		menuButton.setAttribute('aria-label', 'Menu');
		menuButton.setAttribute('tabindex', '0');

		const iconContainer = document.createElement('div');
		iconContainer.className = 'action-label';

		const icon = document.createElement('div');
		icon.className = 'codicon codicon-menu';
		iconContainer.appendChild(icon);
		menuButton.appendChild(iconContainer);

		// Add click handler to show menu
		menuButton.addEventListener('click', (e) => {
			this.showMenu(e);
		});

		// Add keyboard handler
		menuButton.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.showMenu(e);
			}
		});

		container.appendChild(menuButton);
		console.log('[MobileSidebar] Menu button added');
	}

	private showMenu(e: MouseEvent | KeyboardEvent): void {
		const target = e.target as HTMLElement;

		// Use the context menu service's built-in menu handling which properly handles mnemonics
		this.contextMenuService.showContextMenu({
			getAnchor: () => target,
			menuId: MenuId.MenubarMainMenu,
			menuActionOptions: {
				renderShortTitle: true  // Use short titles for mobile context
			},
			contextKeyService: this.contextKeyService,
			// Let the context menu service handle mnemonic processing automatically
		});
	}

	override dispose(): void {
		if (this.embeddedHost) {
			this.embeddedHost.dispose();
		}
		super.dispose();
	}
}
