/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../base/browser/dom.js';
import { alert, status } from '../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { AccessibilitySupport, CONTEXT_ACCESSIBILITY_MODE_ENABLED, IAccessibilityService } from '../common/accessibility.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../contextkey/common/contextkey.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';

export class AccessibilityService extends Disposable implements IAccessibilityService {
	declare readonly _serviceBrand: undefined;

	private _accessibilityModeEnabledContext: IContextKey<boolean>;
	protected _accessibilitySupport = AccessibilitySupport.Unknown;
	protected readonly _onDidChangeScreenReaderOptimized = this._register(new Emitter<void>());

	protected _configMotionReduced: 'auto' | 'on' | 'off';
	protected _systemMotionReduced: boolean;
	protected readonly _onDidChangeReducedMotion = this._register(new Emitter<void>());

	protected _configTransparencyReduced: 'auto' | 'on' | 'off';
	protected _systemTransparencyReduced: boolean;
	protected readonly _onDidChangeReducedTransparency = this._register(new Emitter<void>());

	private _linkUnderlinesEnabled: boolean;
	protected readonly _onDidChangeLinkUnderline = this._register(new Emitter<void>());

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
			if (e.affectsConfiguration('workbench.reduceTransparency')) {
				this._configTransparencyReduced = this._configurationService.getValue('workbench.reduceTransparency');
				this._onDidChangeReducedTransparency.fire();
			}
		}));
		updateContextKey();
		this._register(this.onDidChangeScreenReaderOptimized(() => updateContextKey()));

		const reduceMotionMatcher = mainWindow.matchMedia(`(prefers-reduced-motion: reduce)`);
		this._systemMotionReduced = reduceMotionMatcher.matches;
		this._configMotionReduced = this._configurationService.getValue<'auto' | 'on' | 'off'>('workbench.reduceMotion');

		const reduceTransparencyMatcher = mainWindow.matchMedia(`(prefers-reduced-transparency: reduce)`);
		this._systemTransparencyReduced = reduceTransparencyMatcher.matches;
		this._configTransparencyReduced = this._configurationService.getValue<'auto' | 'on' | 'off'>('workbench.reduceTransparency');

		this._linkUnderlinesEnabled = this._configurationService.getValue('accessibility.underlineLinks');

		this.initReducedMotionListeners(reduceMotionMatcher);
		this.initReducedTransparencyListeners(reduceTransparencyMatcher);
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
			this._layoutService.mainContainer.classList.toggle('monaco-reduce-motion', reduce);
			this._layoutService.mainContainer.classList.toggle('monaco-enable-motion', !reduce);
		};

		updateRootClasses();
		this._register(this.onDidChangeReducedMotion(() => updateRootClasses()));
	}

	private initReducedTransparencyListeners(reduceTransparencyMatcher: MediaQueryList) {

		this._register(addDisposableListener(reduceTransparencyMatcher, 'change', () => {
			this._systemTransparencyReduced = reduceTransparencyMatcher.matches;
			if (this._configTransparencyReduced === 'auto') {
				this._onDidChangeReducedTransparency.fire();
			}
		}));

		const updateRootClasses = () => {
			const reduce = this.isTransparencyReduced();
			this._layoutService.mainContainer.classList.toggle('monaco-reduce-transparency', reduce);
		};

		updateRootClasses();
		this._register(this.onDidChangeReducedTransparency(() => updateRootClasses()));
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

	get onDidChangeReducedTransparency(): Event<void> {
		return this._onDidChangeReducedTransparency.event;
	}

	isTransparencyReduced(): boolean {
		const config = this._configTransparencyReduced;
		return config === 'on' || (config === 'auto' && this._systemTransparencyReduced);
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
