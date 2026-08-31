/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SubmenuAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu } from '../../../../../platform/actions/common/actions.js';
import { IExtensionTerminalProfile, ITerminalProfile, TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ICreateTerminalOptions, ITerminalInstance, ITerminalLocationOptions, ITerminalService } from '../../browser/terminal.js';
import { getTerminalActionBarArgs } from '../../browser/terminalMenus.js';
import { TerminalCommandId } from '../../common/terminal.js';

class TestTerminalInstance extends mock<ITerminalInstance>() { }

class TestTerminalService extends mock<ITerminalService>() {
	readonly createOptions: (ICreateTerminalOptions | undefined)[] = [];

	constructor(private readonly _instance: ITerminalInstance) {
		super();
	}

	override async createAndFocusTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance> {
		this.createOptions.push(options);
		return this._instance;
	}

	override async resolveLocation(location?: ITerminalLocationOptions): Promise<TerminalLocation | undefined> {
		return location === TerminalLocation.Editor ? TerminalLocation.Editor : TerminalLocation.Panel;
	}
}

const emptyMenu: IMenu = {
	onDidChange: Event.None,
	getActions: () => [],
	dispose: () => { }
};

suite('Terminal Menus', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('split actions resolve the current originating terminal when run', async () => {
		const firstInstance = new TestTerminalInstance();
		const secondInstance = new TestTerminalInstance();
		const terminalService = new TestTerminalService(secondInstance);
		const profile: ITerminalProfile = {
			profileName: 'profile',
			path: 'profile',
			isDefault: true
		};
		const contributedProfile: IExtensionTerminalProfile = {
			extensionIdentifier: 'test.extension',
			id: 'test',
			title: 'Contributed Profile'
		};
		let splitInstance = firstInstance;
		const actionBar = getTerminalActionBarArgs(
			TerminalLocation.Editor,
			[profile],
			profile.profileName,
			[contributedProfile],
			terminalService,
			emptyMenu,
			store.add(new DisposableStore()),
			() => splitInstance
		);
		splitInstance = secondInstance;

		const splitAction = actionBar.dropdownMenuActions.find(action => action.id === TerminalCommandId.Split);
		const splitProfileAction = actionBar.dropdownMenuActions.find((action): action is SubmenuAction => action instanceof SubmenuAction);
		assert.ok(splitAction);
		assert.ok(splitProfileAction);
		await splitAction.run();
		await splitProfileAction.actions[0].run();
		await splitProfileAction.actions[1].run();

		assert.deepStrictEqual(terminalService.createOptions, [
			{ location: { parentTerminal: secondInstance } },
			{ config: profile, location: { parentTerminal: secondInstance } },
			{
				config: {
					extensionIdentifier: contributedProfile.extensionIdentifier,
					id: contributedProfile.id,
					title: contributedProfile.title
				},
				location: { parentTerminal: secondInstance }
			}
		]);
	});

	test('split actions retain the location fallback without an originating terminal', async () => {
		const instance = new TestTerminalInstance();
		const terminalService = new TestTerminalService(instance);
		const actionBar = getTerminalActionBarArgs(
			TerminalLocation.Panel,
			[],
			'',
			[],
			terminalService,
			emptyMenu,
			store.add(new DisposableStore())
		);

		const splitAction = actionBar.dropdownMenuActions.find(action => action.id === TerminalCommandId.Split);
		assert.ok(splitAction);
		await splitAction.run();

		assert.deepStrictEqual(terminalService.createOptions, [
			{ location: { splitActiveTerminal: true } }
		]);
	});
});
