/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Size } from '../../../../base/common/size.js';
import { SizeIdentifier, DEFAULT_SIZE_CONFIG_VALUE, getSizeRegistry } from '../../../../platform/theme/common/sizeUtils.js';
import { ISizeCustomizations } from './workbenchThemeService.js';
import { ThemeConfiguration } from './themeConfiguration.js';
import * as types from '../../../../base/common/types.js';

interface ISizeOrDefaultMap {
	[id: string]: Size | typeof DEFAULT_SIZE_CONFIG_VALUE;
}

export class SizeThemeData {
	private customSizeMap: ISizeOrDefaultMap = {};

	public setCustomizations(settings: ThemeConfiguration) {
		this.setCustomSizes(settings.sizeCustomizations);
	}

	public setCustomSizes(sizes: ISizeCustomizations) {
		this.customSizeMap = {};
		this.overwriteCustomSizes(sizes);

		const themeSpecificSizes = this.getThemeSpecificSizes(sizes) as ISizeCustomizations;
		if (types.isObject(themeSpecificSizes)) {
			this.overwriteCustomSizes(themeSpecificSizes);
		}
	}

	private overwriteCustomSizes(sizes: ISizeCustomizations) {
		for (const id in sizes) {
			const sizeVal = sizes[id];
			if (sizeVal === DEFAULT_SIZE_CONFIG_VALUE) {
				this.customSizeMap[id] = DEFAULT_SIZE_CONFIG_VALUE;
			} else if (typeof sizeVal === 'string') {
				// For size customizations, we store the raw CSS value as a string
				// Create a simple object that returns the CSS value when toString() is called
				const customSize = {
					toString: () => sizeVal,
					width: 0, // Dummy values for Size interface compatibility
					height: 0,
					with: () => customSize,
					scale: () => customSize,
					add: () => customSize,
					subtract: () => customSize,
					equals: () => false
				};
				this.customSizeMap[id] = customSize;
			}
		}
	}

	public getSize(sizeId: SizeIdentifier, useDefault?: boolean): Size | undefined {
		const customSize = this.customSizeMap[sizeId];
		if (customSize && customSize !== DEFAULT_SIZE_CONFIG_VALUE) {
			// We have a custom size override (either a Size instance or our custom object)
			return customSize;
		}
		if (customSize === undefined || (useDefault !== false && customSize !== DEFAULT_SIZE_CONFIG_VALUE)) {
			// No custom override or explicit default requested, get the default string value from the registry
			const sizeRegistry = getSizeRegistry();
			const sizeContribution = sizeRegistry.getSizes().find(s => s.id === sizeId);
			if (sizeContribution?.defaults) {
				let defaultValue: string | null = null;
				if (typeof sizeContribution.defaults === 'object' && sizeContribution.defaults !== null) {
					defaultValue = sizeContribution.defaults.default;
				} else if (typeof sizeContribution.defaults === 'string') {
					defaultValue = sizeContribution.defaults;
				}

				if (defaultValue) {
					// Return a simple object that just returns the CSS string
					return {
						toString: () => defaultValue,
						width: 0,
						height: 0,
						with: () => ({ toString: () => defaultValue } as any),
						scale: () => ({ toString: () => defaultValue } as any),
						add: () => ({ toString: () => defaultValue } as any),
						subtract: () => ({ toString: () => defaultValue } as any),
						equals: () => false
					};
				}
			}
		}
		return undefined;
	}

	public defines(sizeId: SizeIdentifier): boolean {
		return this.customSizeMap[sizeId] !== undefined;
	}

	private getThemeSpecificSizes(sizes: ISizeCustomizations): ISizeCustomizations | undefined {
		// This method would handle theme-specific size overrides similar to getThemeSpecificColors
		// For now, we'll return undefined to keep it simple
		// TODO: Implement theme-specific size handling similar to ColorThemeData
		return undefined;
	}
}
