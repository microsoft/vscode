/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from 'vs/base/browser/dom';
import { alert, status } from 'vs/base/browser/ui/aria/aria';
import { mainWindow } from 'vs/base/browser/window';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { AccessibilitySupport, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';

export class AccessibilityService extends Disposable implements IAccessibilityService {
	declare readonly _serviceBrand: undefined;

	private _accessibilityModeEnabledContext: IContextKey<boolean>;
	protected _accessibilitySupport = AccessibilitySupport.Unknown;
	protected readonly _onDidChangeScreenReaderOptimized = new Emitter<void>();

	protected _configMotionReduced: 'auto' | 'on' | 'off';
	protected _systemMotionReduced: boolean;
	protected readonly _onDidChangeReducedMotion = new Emitter<void>();

	private _linkUnderlinesEnabled: boolean;
	protected readonly _onDidChangeLinkUnderline = new Emitter<void>();

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService
	) {
		super();
		this._accessibilityModeEnabledContext = CONTEXT_ACCESSIBILITY_MODE_ENABLED.bindTo(this._contextKeyService);

		const updateContextKey = () => this._accessibilityModeEnabledContext.set(this.isScreenReaderOptimized());
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.accessibilitySupport')) {
				updateContextKey();
				this._onDidChangeScreenReaderOptimized.fire();
			}
			if (e.affectsConfiguration('workbench.reduceMotion')) {
				this._configMotionReduced = this._configurationService.getValue('workbench.reduceMotion');
				this._onDidChangeReducedMotion.fire();
			}
		}));
		updateContextKey();
		this._register(this.onDidChangeScreenReaderOptimized(() => updateContextKey()));

		const reduceMotionMatcher = mainWindow.matchMedia(`(prefers-reduced-motion: reduce)`);
		this._systemMotionReduced = reduceMotionMatcher.matches;
		this._configMotionReduced = this._configurationService.getValue<'auto' | 'on' | 'off'>('workbench.reduceMotion');

		this._linkUnderlinesEnabled = this._configurationService.getValue('accessibility.underlineLinks');

		this.initReducedMotionListeners(reduceMotionMatcher);
		this.initLinkUnderlineListeners();
	}

	private initReducedMotionListeners(reduceMotionMatcher: MediaQueryList) {

		this._register(addDisposableListener(reduceMotionMatcher, 'change', () => {
			this._systemMotionReduced = reduceMotionMatcher.matches;
			if (this._configMotionReduced === 'auto') {
				this._onDidChangeReducedMotion.fire();
			}
		}));

		const updateRootClasses = () => {
			const reduce = this.isMotionReduced();
			this._layoutService.mainContainer.classList.toggle('reduce-motion', reduce);
			this._layoutService.mainContainer.classList.toggle('enable-motion', !reduce);
		};

		updateRootClasses();
		this._register(this.onDidChangeReducedMotion(() => updateRootClasses()));
	}

	private initLinkUnderlineListeners() {
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.underlineLinks')) {
				const linkUnderlinesEnabled = this._configurationService.getValue<boolean>('accessibility.underlineLinks');
				this._linkUnderlinesEnabled = linkUnderlinesEnabled;
				this._onDidChangeLinkUnderline.fire();
			}
		}));

		const updateLinkUnderlineClasses = () => {
			const underlineLinks = this._linkUnderlinesEnabled;
			this._layoutService.mainContainer.classList.toggle('underline-links', underlineLinks);
		};

		updateLinkUnderlineClasses();

		this._register(this.onDidChangeLinkUnderlines(() => updateLinkUnderlineClasses()));
	}

	public onDidChangeLinkUnderlines(listener: () => void) {
		return this._onDidChangeLinkUnderline.event(listener);
	}

	get onDidChangeScreenReaderOptimized(): Event<void> {
		return this._onDidChangeScreenReaderOptimized.event;
	}

	isScreenReaderOptimized(): boolean {
		const config = this._configurationService.getValue('editor.accessibilitySupport');
		return config === 'on' || (config === 'auto' && this._accessibilitySupport === AccessibilitySupport.Enabled);
	}

	get onDidChangeReducedMotion(): Event<void> {
		return this._onDidChangeReducedMotion.event;
	}

	isMotionReduced(): boolean {
		const config = this._configMotionReduced;
		return config === 'on' || (config === 'auto' && this._systemMotionReduced);
	}

	alwaysUnderlineAccessKeys(): Promise<boolean> {
		return Promise.resolve(false);
	}

	getAccessibilitySupport(): AccessibilitySupport {
		return this._accessibilitySupport;
	}

	setAccessibilitySupport(accessibilitySupport: AccessibilitySupport): void {
		if (this._accessibilitySupport === accessibilitySupport) {
			return;
		}

		this._accessibilitySupport = accessibilitySupport;
		this._onDidChangeScreenReaderOptimized.fire();
	}

	alert(message: string): void {
		alert(message);
	}

	status(message: string): void {
		status(message);
	}
}
