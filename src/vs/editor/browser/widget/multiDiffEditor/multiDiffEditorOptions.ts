/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';

export const enum MultiDiffEditorVariant {
	Standard = 'standard',
	Compact = 'compact',
}

export interface IMultiDiffEditorWidgetOptions {
	readonly variant: MultiDiffEditorVariant;
	readonly diffEditorOptions?: IDiffEditorOptions;
}

export interface IMultiDiffEditorVariantConfiguration {
	readonly className: string;
	readonly horizontalInsets: Readonly<{ left: number; right: number }>;
	readonly headerHeight: number;
	readonly contentBottomPadding: number;
	readonly headerClickToCollapse: boolean;
}

export function getMultiDiffEditorVariantConfiguration(variant: MultiDiffEditorVariant): IMultiDiffEditorVariantConfiguration {
	switch (variant) {
		case MultiDiffEditorVariant.Standard:
			return {
				className: 'multiDiffEditor-standard',
				horizontalInsets: { left: 9, right: 9 },
				headerHeight: 40,
				contentBottomPadding: 0,
				headerClickToCollapse: false,
			};
		case MultiDiffEditorVariant.Compact:
			return {
				className: 'multiDiffEditor-compact',
				horizontalInsets: { left: 0, right: 0 },
				headerHeight: 32,
				contentBottomPadding: 8,
				headerClickToCollapse: true,
			};
	}
}
