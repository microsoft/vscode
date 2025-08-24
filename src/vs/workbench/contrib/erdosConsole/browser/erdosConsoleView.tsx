/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-ignore: TypeScript dependency injection decorators
/* eslint-disable */

import './erdosConsoleView.css';

import React from 'react';

import * as DOM from '../../../../base/browser/dom.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ErdosConsoleFocused, ErdosConsoleInstancesExistContext } from '../../../common/contextkeys.js';
import { IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ErdosViewPane } from '../../../browser/erdosViewPane/erdosViewPane.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ErdosConsole } from './erdosConsole.js';
import { IRuntimeSessionService, RuntimeStartMode } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { LanguageRuntimeSessionMode } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IReactComponentContainer, ISize, ErdosReactRenderer } from '../../../../base/browser/erdosReactRenderer.js';
import { IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { LANGUAGE_RUNTIME_DUPLICATE_ACTIVE_SESSION_ID, LANGUAGE_RUNTIME_START_NEW_SESSION_ID } from '../../languageRuntime/browser/languageRuntimeActions.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { localize } from '../../../../nls.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';

/**
 * ErdosConsoleViewPane class.
 */
export class ErdosConsoleViewPane extends ErdosViewPane implements IReactComponentContainer {
	private _onSizeChangedEmitter = this._register(new Emitter<ISize>());
	private _onVisibilityChangedEmitter = this._register(new Emitter<boolean>());
	private _onSaveScrollPositionEmitter = this._register(new Emitter<void>());
	private _onRestoreScrollPositionEmitter = this._register(new Emitter<void>());
	private _onFocusedEmitter = this._register(new Emitter<void>());
	private _width = 0;
	private _height = 0;
	private _erdosConsoleContainer!: HTMLElement;
	private _erdosReactRenderer: ErdosReactRenderer | undefined;
	private _erdosConsoleFocusedContextKey: IContextKey<boolean>;
	private readonly _sessionDropdown: MutableDisposable<DropdownWithPrimaryActionViewItem> = this._register(new MutableDisposable());
	private _erdosConsoleInstancesExistContextKey: IContextKey<boolean>;

	get width() {
		return this._width;
	}

	get height() {
		return this._height;
	}

	get containerVisible() {
		return this.isBodyVisible();
	}

	takeFocus(): void {
		this.focus();
	}

	focusChanged(focused: boolean) {
		this._erdosConsoleFocusedContextKey.set(focused);

		if (focused) {
			this._onFocusedEmitter.fire();
		}
	}

	readonly onSizeChanged: Event<ISize> = this._onSizeChangedEmitter.event;
	readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChangedEmitter.event;
	readonly onSaveScrollPosition: Event<void> = this._onSaveScrollPositionEmitter.event;
	readonly onRestoreScrollPosition: Event<void> = this._onRestoreScrollPositionEmitter.event;
	readonly onFocused: Event<void> = this._onFocusedEmitter.event;

	constructor(
		options: IViewPaneOptions,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService openerService: IOpenerService,
		@IErdosConsoleService private readonly erdosConsoleService: IErdosConsoleService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
	) {
		super(
			options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService);

		this._erdosConsoleFocusedContextKey = ErdosConsoleFocused.bindTo(contextKeyService);
		this._erdosConsoleInstancesExistContextKey = ErdosConsoleInstancesExistContext.bindTo(contextKeyService);

		this._register(this.onDidChangeBodyVisibility(visible => {
			this._onVisibilityChangedEmitter.fire(visible);
		}));

		this._register(this.runtimeSessionService.onDidStartRuntime(() => this.updateActions()));
		this._register(this.runtimeSessionService.onDidChangeForegroundSession(() => this.updateActions()));
		this._register(this.runtimeSessionService.onDidDeleteRuntimeSession(() => this.updateActions()));

		this._register(this.erdosConsoleService.onDidStartErdosConsoleInstance(() => {
			this.updateConsoleInstancesExistContext();
		}));

		this._register(this.erdosConsoleService.onDidDeleteErdosConsoleInstance(() => {
			this.updateConsoleInstancesExistContext();
		}));
	}

	public override dispose(): void {
		super.dispose();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._erdosConsoleContainer = DOM.$('.erdos-console-container');
		container.appendChild(this._erdosConsoleContainer);

		this._erdosReactRenderer = this._register(new ErdosReactRenderer(this._erdosConsoleContainer));
		this._erdosReactRenderer.render(
			<ErdosConsole reactComponentContainer={this} />
		);

		const focusTracker = this._register(DOM.trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => this.focusChanged(true)));
		this._register(focusTracker.onDidBlur(() => this.focusChanged(false)));

		this.updateConsoleInstancesExistContext();
	}

	override focusElement(): void {
		this.erdosConsoleService.activeErdosConsoleInstance?.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this._erdosConsoleContainer.style.width = `${width}px`;
		this._erdosConsoleContainer.style.height = `${height}px`;

		this._width = width;
		this._height = height;

		this._onSizeChangedEmitter.fire({
			width,
			height
		});
	}

	override createActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === LANGUAGE_RUNTIME_DUPLICATE_ACTIVE_SESSION_ID && this.erdosConsoleService.erdosConsoleInstances.length > 0) {
			if (action instanceof MenuItemAction) {
				const dropdownAction = new Action('console.session.quickLaunch', localize('console.session.quickLaunch', 'Quick Launch Session...'), 'codicon-chevron-down', true);
				this._register(dropdownAction);

				this._sessionDropdown.value = new DropdownWithPrimaryActionViewItem(
					action,
					dropdownAction,
					[],
					'',
					{},
					this.contextMenuService, this.keybindingService, this.notificationService, this.contextKeyService, this.themeService, this.accessibilityService);
				this.updateSessionDropdown(dropdownAction);

				return this._sessionDropdown.value;
			}
		}
		return super.createActionViewItem(action, options);
	}

	private updateSessionDropdown(dropdownAction: Action): void {
		const currentRuntime = this.runtimeSessionService.foregroundSession?.runtimeMetadata;

		let activeRuntimes = this.runtimeSessionService.activeSessions
			.sort((a, b) => b.lastUsed - a.lastUsed)
			.map(session => session.runtimeMetadata)
			.filter((runtime, index, runtimes) =>
				runtime.runtimeId !== currentRuntime?.runtimeId && runtimes.findIndex(r => r.runtimeId === runtime.runtimeId) === index
			)

		if (currentRuntime) {
			activeRuntimes.unshift(currentRuntime);
		}

		activeRuntimes = activeRuntimes.slice(0, 5);

		const dropdownMenuActions = activeRuntimes.map(runtime => new Action(
			`console.startSession.${runtime.runtimeId}`,
			runtime.runtimeName,
			undefined,
			true,
			() => {
				this.runtimeSessionService.startNewRuntimeSession(
					runtime.runtimeId,
					runtime.runtimeName,
					LanguageRuntimeSessionMode.Console,
					undefined,
					'User selected runtime',
					RuntimeStartMode.Starting,
					true
				);
			})
		);

		if (dropdownMenuActions.length === 0) {
			dropdownMenuActions.push(
				new Action(
					'console.startSession.none',
					localize('console.startSession.none', 'No Sessions'),
					undefined,
					false
				)
			);
		}

		dropdownMenuActions.push(new Action(
			'console.startSession.other',
			localize('console.startSession.other', 'Start Another...'),
			undefined,
			true,
			() => {
				this.commandService.executeCommand(LANGUAGE_RUNTIME_START_NEW_SESSION_ID);
			})
		);

		dropdownMenuActions.forEach(action => this._register(action));

		this._sessionDropdown.value?.update(dropdownAction, dropdownMenuActions, 'codicon-chevron-down');
	}

	private updateConsoleInstancesExistContext(): void {
		const hasInstances = this.erdosConsoleService.erdosConsoleInstances.length > 0;
		this._erdosConsoleInstancesExistContextKey.set(hasInstances);
	}
}
