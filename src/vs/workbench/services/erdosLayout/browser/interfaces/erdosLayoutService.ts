/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomErdosLayoutDescription } from '../../common/erdosCustomViews.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISerializableView, IViewSize } from '../../../../../base/browser/ui/grid/gridview.js';
import { PanelAlignment } from '../../../layout/browser/layoutService.js';

export const IErdosLayoutService = createDecorator<IErdosLayoutService>('erdosLayoutService');

export interface IErdosLayoutService {
	readonly _serviceBrand: undefined;

	initialize(): void;

	setLayout(layout: CustomErdosLayoutDescription): void;

}

export type PartViewInfo = {
	partView: ISerializableView;
	currentSize: IViewSize;
	alignment?: PanelAlignment;
	hidden: boolean;
	hideFn: (hidden: boolean, skipLayout?: boolean | undefined) => void;
};
