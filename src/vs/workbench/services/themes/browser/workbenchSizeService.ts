/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getSizeRegistry, SizeIdentifier, SizeValue } from '../../../../platform/theme/common/sizeRegistry.js';
import { ISizeService, SIZE_CUSTOMIZATIONS_SETTING } from '../../../../platform/theme/common/sizeService.js';
import { IColorTheme } from '../../../../platform/theme/common/themeService.js';

export class WorkbenchSizeService extends Disposable implements ISizeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSizes = this._register(new Emitter<void>());
	readonly onDidChangeSizes = this._onDidChangeSizes.event;

	private customizations: Record<string, number> = Object.create(null);

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.update();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SIZE_CUSTOMIZATIONS_SETTING)) {
				this.update();
				this._onDidChangeSizes.fire();
			}
		}));
		this._register(getSizeRegistry().onDidChangeSchema(() => {
			this.update();
			this._onDidChangeSizes.fire();
		}));
	}

	getSize(id: SizeIdentifier, theme: IColorTheme): SizeValue | undefined {
		return getSizeRegistry().resolveSize(id, theme, this.customizations);
	}

	private update(): void {
		this.customizations = Object.create(null);
		const value = this.configurationService.getValue<unknown>(SIZE_CUSTOMIZATIONS_SETTING);
		if (value === undefined) {
			return;
		}
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			this.logService.warn(`${SIZE_CUSTOMIZATIONS_SETTING} must be an object of semantic size tokens.`);
			return;
		}
		const sizes = new Map(getSizeRegistry().getSizes().map(size => [size.id, size]));
		for (const [id, customized] of Object.entries(value)) {
			const customization = sizes.get(id)?.customization;
			if (!customization) {
				this.logService.warn(`${SIZE_CUSTOMIZATIONS_SETTING}: '${id}' is not a customizable semantic size token.`);
			} else if (typeof customized !== 'number' || !Number.isInteger(customized) || customized < customization.minimum || customized > customization.maximum) {
				this.logService.warn(`${SIZE_CUSTOMIZATIONS_SETTING}: '${id}' must be an integer between ${customization.minimum} and ${customization.maximum}.`);
			} else {
				this.customizations[id] = customized;
			}
		}
	}
}

registerSingleton(ISizeService, WorkbenchSizeService, InstantiationType.Delayed);
