/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { clearNode, createCSSRule, createStyleSheet } from 'vs/base/browser/dom';

export const enum ZIndex {
	Base = 0,
	Sash = 35,
	SuggestWidget = 40,
	Hover = 50,
	DragImage = 1000,
	MenubarMenuItemsHolder = 2000, // quick-input-widget
	ContextView = 2500,
	ModalDialog = 2600,
	PaneDropOverlay = 10000
}


export interface IZIndexRegistry {
	registerZIndex(z: number, name: string, relativeLayer?: ZIndex): string;
}

class ZIndexRegistry implements IZIndexRegistry {
	private styleSheet: HTMLStyleElement;
	private zIndexMap: Map<string, number>;
	constructor() {
		this.styleSheet = createStyleSheet();
		this.zIndexMap = new Map<string, number>();
	}
	registerZIndex(z: number, name: string, relativeLayer: ZIndex = ZIndex.Base): string {
		if (this.zIndexMap.get(name)) {
			throw new Error(`z-index with name ${name} has already been registered.`);
		}

		this.zIndexMap.set(name, relativeLayer + z);
		this.updateStyleElement();
		return this.getVarName(name);
	}

	private getVarName(name: string): string {
		return `--z-index-${name}`;
	}

	private updateStyleElement(): void {
		clearNode(this.styleSheet);
		let ruleBuilder = '';
		this.zIndexMap.forEach((zIndex, name) => {
			ruleBuilder += `${this.getVarName(name)}: ${zIndex};\n`;
		});
		createCSSRule('*', ruleBuilder, this.styleSheet);
	}
}

const zIndexRegistry = new ZIndexRegistry();

export function registerZIndex(z: number, name: string, relativeLayer?: ZIndex): string {
	return zIndexRegistry.registerZIndex(z, name, relativeLayer);
}
