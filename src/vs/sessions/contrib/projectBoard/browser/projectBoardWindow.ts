/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onDidChangeFullscreen } from '../../../../base/browser/browser.js';
import { $, hide, show } from '../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isNative } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { hasCustomTitlebar } from '../../../../platform/window/common/window.js';
import { IAuxiliaryTitlebarPart } from '../../../../workbench/browser/parts/titlebar/titlebarPart.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IAuxiliaryWindow } from '../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IWorkbenchLayoutService, shouldShowCustomTitleBar } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ITitleService } from '../../../../workbench/services/title/browser/titleService.js';
import { TitleService } from '../../../browser/parts/titlebarPart.js';

export class ProjectBoardWindow extends Disposable {

	readonly content: HTMLElement;
	private titlebar: ReturnType<TitleService['createAuxiliaryWindowTitlebarPart']> | undefined;

	constructor(
		private readonly auxiliaryWindow: IAuxiliaryWindow,
		title: string,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITitleService titleService: TitleService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super();

		this.content = auxiliaryWindow.container.appendChild($('.project-board-window-content'));
		this.content.style.position = 'relative';
		this.content.style.width = '100%';
		this.content.style.height = '100%';
		this.content.style.overflow = 'hidden';
		this._register(toDisposable(() => this.content.remove()));

		auxiliaryWindow.window.document.title = title;

		let titlebar: IAuxiliaryTitlebarPart | undefined;
		let titlebarVisible = false;
		if (isNative && hasCustomTitlebar(configurationService)) {
			const scopedContextKeyService = this._register(contextKeyService.createScoped(auxiliaryWindow.container));
			IsAuxiliaryWindowContext.bindTo(scopedContextKeyService).set(true);
			const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
				[IContextKeyService, scopedContextKeyService]
			)));
			const part = this._register(titleService.createAuxiliaryWindowTitlebarPart(auxiliaryWindow.container, title, scopedInstantiationService));
			this.titlebar = part;
			titlebar = part;
			this._register(toDisposable(() => part.container.remove()));

			const updateVisibility = () => {
				titlebarVisible = shouldShowCustomTitleBar(configurationService, auxiliaryWindow.window);
				if (titlebarVisible) {
					show(part.container);
				} else {
					hide(part.container);
				}
				auxiliaryWindow.layout();
			};
			this._register(titlebar.onDidChange(() => auxiliaryWindow.layout()));
			this._register(layoutService.onDidChangePartVisibility(updateVisibility));
			this._register(configurationService.onDidChangeConfiguration(updateVisibility));
			this._register(onDidChangeFullscreen(windowId => {
				if (windowId === auxiliaryWindow.window.vscodeWindowId) {
					updateVisibility();
				}
			}));
			updateVisibility();
		}

		this._register(auxiliaryWindow.onWillLayout(dimension => {
			const titlebarHeight = titlebar && titlebarVisible ? titlebar.height : 0;
			titlebar?.layout(dimension.width, titlebarHeight, 0, 0);
			this.content.style.height = `${Math.max(0, dimension.height - titlebarHeight)}px`;
		}));
		auxiliaryWindow.layout();
	}

	setTitle(title: string): void {
		this.titlebar?.setAuxiliaryWindowTitle(title);
		this.auxiliaryWindow.window.document.title = title;
	}
}
