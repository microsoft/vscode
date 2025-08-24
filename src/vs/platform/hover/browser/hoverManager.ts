/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IHoverManager {
	showHover(target: HTMLElement, content?: string | (() => string | undefined)): void;

	hideHover(): void;
}
