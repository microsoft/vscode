/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Color } from 'vs/base/common/color';
import { IDisposable } from 'vs/base/common/lifecycle';
import platform = require('vs/platform/platform');
import { ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import Event, { Emitter } from 'vs/base/common/event';

export let IThemeService = createDecorator<IThemeService>('themeService');

// base themes
export const DARK = 'dark';
export const LIGHT = 'light';
export const HIGH_CONTRAST = 'hc';
export type ThemeType = 'light' | 'dark' | 'hc';

export interface ITheme {
	readonly selector: string;
	readonly type: ThemeType;

	/**
	 * Resolves the color of the given color identifer. If the theme does not
	 * specify the color, the default color is returned unless <code>useDefault</code> is set to false.
	 * @param color the id of the color
	 * @param useDefault specifies if the default color should be used. If not set, the default is used.
	 */
	getColor(color: ColorIdentifier, useDefault?: boolean): Color;

	/**
	 * Returns wheter the current color matches the default color
	 */
	isDefault(color: ColorIdentifier): boolean;
}

export interface ICssStyleCollector {
	addRule(rule: string): void;
}

export interface IThemingParticipant {
	(theme: ITheme, collector: ICssStyleCollector): void;
}

export interface IThemeService {
	_serviceBrand: any;

	getTheme(): ITheme;

	/**
	 * Register a theming participant that is invoked after every theme change.
	 */
	onThemeChange: Event<ITheme>;

}

// static theming participant
export const Extensions = {
	ThemingContribution: 'base.contributions.theming'
};

export interface IThemingRegistry {

	/**
	 * Register a theming participant that is invoked on every theme change.
	 */
	onThemeChange(participant: IThemingParticipant): IDisposable;

	getThemingParticipants(): IThemingParticipant[];

	readonly onThemingParticipantAdded: Event<IThemingParticipant>;
}

class ThemingRegistry implements IThemingRegistry {
	private themingParticipants: IThemingParticipant[] = [];
	private onThemingParticipantAddedEmitter: Emitter<IThemingParticipant>;

	constructor() {
		this.themingParticipants = [];
		this.onThemingParticipantAddedEmitter = new Emitter<IThemingParticipant>();
	}

	public onThemeChange(participant: IThemingParticipant): IDisposable {
		this.themingParticipants.push(participant);
		this.onThemingParticipantAddedEmitter.fire(participant);
		return {
			dispose: () => {
				const idx = this.themingParticipants.indexOf(participant);
				this.themingParticipants.splice(idx, 1);
			}
		};
	}

	public get onThemingParticipantAdded(): Event<IThemingParticipant> {
		return this.onThemingParticipantAddedEmitter.event;
	}

	public getThemingParticipants(): IThemingParticipant[] {
		return this.themingParticipants;
	}
}

let themingRegistry = new ThemingRegistry();
platform.Registry.add(Extensions.ThemingContribution, themingRegistry);

export function registerThemingParticipant(participant: IThemingParticipant): IDisposable {
	return themingRegistry.onThemeChange(participant);
}

/**
 * Tag function for strings containing css rules
 */
export function cssRule(literals, ...placeholders) {
	let result = '';
	for (let i = 0; i < placeholders.length; i++) {
		result += literals[i];
		let placeholder = placeholders[i];
		if (placeholder === null) {
			result += 'transparent';
		} else {
			result += placeholder.toString();
		}
	}
	result += literals[literals.length - 1];
	return result;
}