/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

export type KnownErdosLayoutParts = 'workbench.parts.panel' | 'workbench.parts.sidebar' | 'workbench.parts.auxiliarybar';

type LayoutPixelSize = number;
type LayoutPercentSize = `${number}%`;

export type PartLayoutDescription = {
	size?: LayoutPercentSize;
	minSize?: LayoutPixelSize;
	maxSize?: LayoutPixelSize;
	hideIfBelowMinSize?: boolean;
	hidden: boolean;
	alignment?: 'left' | 'center' | 'right' | 'justify';
	viewContainers?: ViewContainerLayoutDescription[];
};

type ViewContainerLayoutDescription = {
	id: string;
	opened?: boolean;
	views?: ViewLayoutDescription[];
};

type ViewLayoutDescription = {
	id: string;
	relativeSize?: number;
	collapsed?: boolean;
};

export type CustomErdosLayoutDescription = Record<
	KnownErdosLayoutParts,
	PartLayoutDescription
>;
