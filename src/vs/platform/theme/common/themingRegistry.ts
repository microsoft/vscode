/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import platform = require('vs/platform/platform');
import { IJSONSchema } from 'vs/base/common/jsonSchema';

import nls = require('vs/nls');

export const Extensions = {
	ThemingContribution: 'base.contributions.theming'
};

export interface IColorContribution {
	readonly id: string;
	readonly description: string;
}

export interface IThemingRegistry {

	/**
	 * Register a color to the registry.
	 */
	registerColor(id: string, description: string): IColorContribution;

	/**
	 * Get all color contributions
	 */
	getColors(): IColorContribution[];

	/**
	 * JSON schema of all colors
	 */
	getColorSchema(): IJSONSchema;

}


class ThemingRegistry implements IThemingRegistry {
	private colorsById: { [key: string]: IColorContribution };
	private colorSchema: IJSONSchema = { type: 'object', description: nls.localize('schema.colors', 'Colors used in the workbench.'), properties: {} };

	constructor() {
		this.colorsById = {};
	}

	public registerColor(id: string, description: string): IColorContribution {
		let colorContribution: IColorContribution = { id, description };
		this.colorsById[id] = colorContribution;
		this.colorSchema.properties[id] = { type: 'string', description };
		return colorContribution;
	}

	public getColors(): IColorContribution[] {
		return Object.keys(this.colorsById).map(id => this.colorsById[id]);
	}

	public getColorSchema(): IJSONSchema {
		return this.colorSchema;
	}

}

const themingRegistry = new ThemingRegistry();
platform.Registry.add(Extensions.ThemingContribution, themingRegistry);