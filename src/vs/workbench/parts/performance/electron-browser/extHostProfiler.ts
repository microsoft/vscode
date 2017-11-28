/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IStatusbarService, StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';


CommandsRegistry.registerCommand('exthost.profile.start', async accessor => {
	const statusbarService = accessor.get(IStatusbarService);
	const extensionService = accessor.get(IExtensionService);

	const handle = statusbarService.addEntry({ text: localize('message', "$(zap) Profiling Extension Host...") }, StatusbarAlignment.LEFT);

	return TPromise.wrap(import('v8-inspect-profiler')).then(profiler => {
		return profiler.startProfiling({ port: extensionService.getExtensionHostInformation().inspectPort }).then(session => {
			return session.stop(5000);
		}).then(profile => {
			// return profiler.writeProfile(profile, '/Users/jrieken/Code/test.cpuprofile');
		}).then(() => {
			handle.dispose();
		});
	});
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: 'exthost.profile.start', title: localize('', "Profile Extension Host for 5 seconds") } });
