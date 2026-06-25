/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StateType } from '../../../../platform/update/common/update.js';

export const UPDATE_ICON_BUTTON_EXPERIMENT = 'updateIconButtonExperiment';

export type UpdateIndicatorVariant = 'text' | 'icon';

export function getUpdateIndicatorVariant(treatment: string | boolean | undefined): UpdateIndicatorVariant {
	if (treatment === true || treatment === 'enabled' || treatment === 'icon') {
		return 'icon';
	}
	return 'text';
}

export function shouldRenderIconUpdateIndicator(variant: UpdateIndicatorVariant, state: StateType): boolean {
	return variant === 'icon' && (
		state === StateType.AvailableForDownload ||
		state === StateType.Downloaded ||
		state === StateType.Ready
	);
}
