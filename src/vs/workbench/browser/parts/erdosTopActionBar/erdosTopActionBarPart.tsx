/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosTopActionBarPart.css';

import React from 'react';

import { Part } from '../../part.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ErdosTopActionBarFocused } from '../../../common/contextkeys.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ErdosReactRenderer } from '../../../../base/browser/erdosReactRenderer.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IErdosTopActionBarService } from '../../../services/erdosTopActionBar/browser/erdosTopActionBarService.js';
import { IErdosTopActionBarContainer, ErdosTopActionBar } from './erdosTopActionBar.js';

export class ErdosTopActionBarPart extends Part implements IErdosTopActionBarContainer, IErdosTopActionBarService {
	declare readonly _serviceBrand: undefined;

	private _width = 0;

	private _onWidthChangedEmitter = this._register(new Emitter<number>());

	get width() {
		return this._width;
	}

	readonly height: number = 34;
	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;

	get minimumHeight(): number {
		return this.height;
	}

	get maximumHeight(): number {
		return this.height;
	}

	private _onDidChangeSize = this._register(new Emitter<{ width: number; height: number } | undefined>());
	override get onDidChange() { return this._onDidChangeSize.event; }

	readonly onWidthChanged: Event<number> = this._onWidthChangedEmitter.event;

	private erdosReactRenderer: ErdosReactRenderer | undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService
	) {
		super(Parts.ERDOS_TOP_ACTION_BAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.element.tabIndex = -1;

		this.erdosReactRenderer = this._register(new ErdosReactRenderer(this.element));
		this.erdosReactRenderer.render(
			<ErdosTopActionBar erdosTopActionBarContainer={this} />
		);

		const scopedContextKeyService = this.contextKeyService.createScoped(this.element);
		ErdosTopActionBarFocused.bindTo(scopedContextKeyService).set(true);

		return this.element;
	}

	override layout(width: number, height: number, _top: number, _left: number): void {
		super.layout(width, height, _top, _left);
		this._width = width;
		this._onWidthChangedEmitter.fire(width);
	}

	toJSON(): object {
		return {
			type: Parts.ERDOS_TOP_ACTION_BAR_PART
		};
	}

	focus(): void {
		this.element.focus();
	}
}

registerSingleton(IErdosTopActionBarService, ErdosTopActionBarPart, InstantiationType.Eager);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'workbench.top-action-bar.focusTopActionBar',
	weight: KeybindingWeight.WorkbenchContrib,
	primary: KeyCode.Escape,
	when: ErdosTopActionBarFocused,
	handler: (accessor: ServicesAccessor) => {
		const erdosTopActionBarService = accessor.get(IErdosTopActionBarService);
		erdosTopActionBarService.focus();
	}
});
