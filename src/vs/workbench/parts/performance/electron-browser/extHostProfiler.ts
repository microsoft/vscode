/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IExtensionService, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IStatusbarService, StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { TernarySearchTree } from 'vs/base/common/map';
import { realpathSync } from 'vs/base/node/extfs';


CommandsRegistry.registerCommand('exthost.profile.start', async accessor => {
	const statusbarService = accessor.get(IStatusbarService);
	const extensionService = accessor.get(IExtensionService);

	const searchTree = TernarySearchTree.forPaths<IExtensionDescription>();
	for (let extension of await extensionService.getExtensions()) {
		searchTree.set(realpathSync(extension.extensionFolderPath), extension);
	}

	const handle = statusbarService.addEntry({ text: localize('message', "$(zap) Profiling Extension Host...") }, StatusbarAlignment.LEFT);

	return TPromise.wrap(import('v8-inspect-profiler')).then(profiler => {
		return profiler.startProfiling({ port: extensionService.getExtensionHostInformation().inspectPort }).then(session => {
			return session.stop(5000);
		}).then(profile => {
			distill(profile);
			// return profiler.writeProfile(profile, '/Users/jrieken/Code/test.cpuprofile');
		}).then(() => {
			handle.dispose();
		});
	});


	function distill(profile) {
		let nodes = <Node[]>profile.profile.nodes;
		let idsToNodes = new Map<number, Node>();
		let idsToExt = new Map<number, IExtensionDescription>();
		for (let node of nodes) {
			idsToNodes.set(node.id, node);
		}

		function visit(node: Node, extension?: IExtensionDescription) {
			if (!extension) {
				extension = evaluateExtension(node.callFrame.url);
			}
			if (extension) {
				idsToExt.set(node.id, extension);
			}
			if (node.children) {
				for (let child of node.children) {
					visit(idsToNodes.get(child), extension);
				}
			}
		}
		visit(nodes[0]);

		let extTimes = new Map<IExtensionDescription, number>();


		let samples = <number[]>profile.profile.samples;
		let timeDeltas = <number[]>profile.profile.timeDeltas;
		for (let i = 0; i < samples.length; i++) {
			let id = samples[i];
			let extension = idsToExt.get(id);
			if (extension) {
				let time = timeDeltas[i];
				extTimes.set(extension, (extTimes.get(extension) || 0) + time);
			}
		}
		extTimes.forEach((val, index) => {
			console.log(index.id + ': ' + val + 'm');
		});
	}

	function evaluateExtension(url: string): IExtensionDescription {
		if (url) {
			return searchTree.findSubstr(url);
		}
		return null;
	}
});

interface Node {
	id: number;
	children: number[];
	callFrame: { url: string };
}



MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: 'exthost.profile.start', title: localize('', "Profile Extension Host for 5 seconds") } });
