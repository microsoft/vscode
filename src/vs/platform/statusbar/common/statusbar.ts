/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ThemeColor } from 'vs/platform/theme/common/themeService';

export const IStatusbarService = createDecorator<IStatusbarService>('statusbarService');

export enum StatusbarAlignment {
	LEFT, RIGHT
}

/**
 * A declarative way of describing a status bar entry
 */
export interface IStatusbarEntry {

	/**
	 * The text to show for the entry. You can embed icons in the text by leveraging the syntax:
	 *
	 * `My text ${icon name} contains icons like ${icon name} this one.`
	 */
	text: string;

	/**
	 * An optional tooltip text to show when you hover over the entry
	 */
	tooltip?: string;

	/**
	 * An optional color to use for the entry
	 */
	color?: string | ThemeColor;

	/**
	 * An optional id of a command that is known to the workbench to execute on click
	 */
	command?: string;

	/**
	 * Optional arguments for the command.
	 */
	arguments?: any[];

	/**
	 * An optional extension ID if this entry is provided from an extension.
	 */
	extensionId?: string;
}

export interface IStatusbarService {

	_serviceBrand: any;

	/**
	 * Adds an entry to the statusbar with the given alignment and priority. Use the returned IDisposable
	 * to remove the statusbar entry.
	 */
	addEntry(entry: IStatusbarEntry, alignment: StatusbarAlignment, priority?: number): IDisposable;

	/**
	 * Prints something to the status bar area with optional auto dispose and delay.
	 */
	setStatusMessage(message: string, autoDisposeAfter?: number, delayBy?: number): IDisposable;
}