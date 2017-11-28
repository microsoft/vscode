/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IProgressService2, ProgressLocation } from 'vs/platform/progress/common/progress';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

CommandsRegistry.registerCommand('exthost.profile.start', async accessor => {
	const progressService = accessor.get(IProgressService2);
	const { inspectPort } = accessor.get(IExtensionService).getExtensionHostInformation();

	progressService.withProgress({
		location: ProgressLocation.Window,
		title: localize('message', "Profiling Extension Host")
	}, progress => {
		return TPromise.wrap(import('v8-inspect-profiler')).then(profiler => {
			return profiler.startProfiling({ port: inspectPort }).then(session => {
				return session.stop(5000);
			}).then(profile => {
				profiler.writeProfile(profile, '/Users/jrieken/Code/test.cpuprofile');
			});
		});
	});
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: 'exthost.profile.start', title: localize('', "Profile Extension Host for 5 seconds") } });
