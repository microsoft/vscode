/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIFrostedGlassOpacity } from '../../../services/layout/browser/layoutService.js';
import '../browser/media/frostedGlass.css';

const FROSTED_GLASS_CLASS = 'modern-ui-frosted-glass';
const FROSTED_GLASS_OPACITY_PROPERTY = '--modern-ui-glass-opacity';

export class FrostedGlassContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.frostedGlass';

	private gpuCompositingEnabled: boolean | undefined;
	private requested = false;
	private opacity: number = ModernUIFrostedGlassOpacity.Default;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IThemeService private readonly themeService: IThemeService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.MODERN_UI) || e.affectsConfiguration(LayoutSettings.MODERN_UI_FROSTED_GLASS) || e.affectsConfiguration(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY)) {
				this.update();
			}
		}));
		this._register(this.accessibilityService.onDidChangeReducedTransparency(() => this.update()));
		this._register(this.themeService.onDidColorThemeChange(() => this.update()));
		this._register(this.nativeHostService.onDidChangeGPUCompositing(enabled => {
			this.gpuCompositingEnabled = enabled;
			this.apply();
		}));
		this._register(this.layoutService.onDidAddContainer(({ container, disposables }) => {
			this.applyTo(container);
			disposables.add(toDisposable(() => {
				container.classList.remove(FROSTED_GLASS_CLASS);
				container.style.removeProperty(FROSTED_GLASS_OPACITY_PROPERTY);
			}));
		}));

		this.update();
		void this.initializeGPUCompositing();
	}

	private getOpacity(): number {
		const value = this.configurationService.getValue<number | undefined>(LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY);
		if (value === undefined) {
			return ModernUIFrostedGlassOpacity.Default;
		}
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			this.logService.warn(`Invalid ${LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY}: expected a finite number. Using the default background opacity.`);
			return ModernUIFrostedGlassOpacity.Default;
		}
		const opacity = clamp(value, ModernUIFrostedGlassOpacity.Minimum, ModernUIFrostedGlassOpacity.Maximum);
		if (opacity !== value) {
			this.logService.warn(`${LayoutSettings.MODERN_UI_FROSTED_GLASS_OPACITY} is out of range. Clamping background opacity to ${opacity}%.`);
		}
		return opacity;
	}

	private update(): void {
		this.opacity = this.getOpacity();
		this.requested = (this.environmentService.isSessionsWindow || this.configurationService.getValue<boolean>(LayoutSettings.MODERN_UI) === true)
			&& this.configurationService.getValue<boolean>(LayoutSettings.MODERN_UI_FROSTED_GLASS) === true
			&& !this.accessibilityService.isTransparencyReduced()
			&& !isHighContrast(this.themeService.getColorTheme().type);

		this.apply();
	}

	private async initializeGPUCompositing(): Promise<void> {
		try {
			const enabled = await this.nativeHostService.isGPUCompositingEnabled();
			if (!this._store.isDisposed && this.gpuCompositingEnabled === undefined) {
				this.gpuCompositingEnabled = enabled;
				this.apply();
			}
		} catch (error) {
			this.logService.warn('Unable to read initial GPU compositing state for frosted glass.', error);
		}
	}

	private apply(): void {
		for (const container of this.layoutService.containers) {
			this.applyTo(container);
		}
	}

	private applyTo(container: HTMLElement): void {
		const enabled = this.requested && this.gpuCompositingEnabled === true;
		if (enabled) {
			container.style.setProperty(FROSTED_GLASS_OPACITY_PROPERTY, `${this.opacity}%`);
		} else {
			container.style.removeProperty(FROSTED_GLASS_OPACITY_PROPERTY);
		}
		container.classList.toggle(FROSTED_GLASS_CLASS, enabled);
	}

	override dispose(): void {
		this.requested = false;
		this.apply();
		super.dispose();
	}
}

registerWorkbenchContribution2(FrostedGlassContribution.ID, FrostedGlassContribution, WorkbenchPhase.AfterRestored);
