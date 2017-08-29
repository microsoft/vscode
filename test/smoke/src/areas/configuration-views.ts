/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export enum ActivityBarPosition {
	LEFT = 0,
	RIGHT = 1
};

export class ConfigurationView {
	// Stores key binding defined for the toggle of activity bar position
	private keybinding: string[];

	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async hasLineNumbers(): Promise<boolean> {
		const lineNumbers = await this.spectron.client.elements('.line-numbers');
		return !!lineNumbers.value.length;
	}

	public enterKeybindingsView(): any {
		return this.spectron.command('workbench.action.openGlobalKeybindings');
	}

	public async selectFirstKeybindingsMatch(): Promise<any> {
		await this.spectron.client.click('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item');
		return this.spectron.client.element('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item.focused.selected');
	}

	public async openDefineKeybindingDialog(): Promise<any> {
		await this.spectron.client.click('div[aria-label="Keybindings"] .monaco-list-row.keybinding-item .action-item .icon.add');
		console.log('opening define keybindings');
		return this.spectron.client.element('.defineKeybindingWidget .monaco-inputbox.synthetic-focus');
	}

	public enterBinding(keys: string[]): Promise<any> {
		this.keybinding = keys;
		return this.spectron.client.keys(keys);
	}

	public toggleActivityBarPosition(): Promise<any> {
		return this.spectron.client.keys(this.keybinding);
	}

	public async getActivityBar(position: ActivityBarPosition) {
		let positionClass: string;

		if (position === ActivityBarPosition.LEFT) {
			positionClass = 'left';
		} else if (position === ActivityBarPosition.RIGHT) {
			positionClass = 'right';
		} else {
			throw new Error('No such position for activity bar defined.');
		}
		try {
			return this.spectron.client.getHTML(`.part.activitybar.${positionClass}`);
		} catch (e) {
			return undefined;
		};
	}
}