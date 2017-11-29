/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IExtensionService, IExtensionDescription, ProfileSession, IExtensionHostProfile, ProfileSegmentId } from 'vs/platform/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { TernarySearchTree } from 'vs/base/common/map';
import { realpathSync } from 'vs/base/node/extfs';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IStatusbarService, StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { writeFile } from 'vs/base/node/pfs';
import * as path from 'path';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { setTimeout } from 'timers';
import { Profile, ProfileNode } from 'v8-inspect-profiler';

export class ExtensionHostProfiler {

	constructor(private readonly _port: number, @IExtensionService private readonly _extensionService: IExtensionService) {
	}

	public start(): TPromise<ProfileSession> {
		return TPromise.wrap(import('v8-inspect-profiler')).then(profiler => {
			return profiler.startProfiling({ port: this._port }).then(session => {
				return {
					stop: () => {
						return TPromise.wrap(session.stop()).then(profile => {
							return this._extensionService.getExtensions().then(extensions => {
								return this.distill(profile.profile, extensions);
							});
						});
					}
				};
			});
		});
	}

	private distill(profile: Profile, extensions: IExtensionDescription[]): IExtensionHostProfile {
		let searchTree = TernarySearchTree.forPaths<IExtensionDescription>();
		for (let extension of extensions) {
			searchTree.set(realpathSync(extension.extensionFolderPath), extension);
		}

		let nodes = profile.nodes;
		let idsToNodes = new Map<number, ProfileNode>();
		let idsToSegmentId = new Map<number, ProfileSegmentId>();
		for (let node of nodes) {
			idsToNodes.set(node.id, node);
		}

		function visit(node: ProfileNode, segmentId: ProfileSegmentId) {
			if (!segmentId) {
				switch (node.callFrame.functionName) {
					case '(root)':
						break;
					case '(program)':
						segmentId = 'program';
						break;
					case '(garbage collector)':
						segmentId = 'gc';
						break;
					default:
						segmentId = 'self';
						break;
				}
			} else if (segmentId === 'self' && node.callFrame.url) {
				let extension = searchTree.findSubstr(node.callFrame.url);
				if (extension) {
					segmentId = extension.id;
				}
			}
			idsToSegmentId.set(node.id, segmentId);

			if (node.children) {
				for (let child of node.children) {
					visit(idsToNodes.get(child), segmentId);
				}
			}
		}
		visit(nodes[0], null);

		let samples = profile.samples;
		let timeDeltas = profile.timeDeltas;
		let distilledDeltas: number[] = [];
		let distilledIds: ProfileSegmentId[] = [];

		let currSegmentTime = 0;
		let currSegmentId = void 0;
		for (let i = 0; i < samples.length; i++) {
			let id = samples[i];
			let segmentId = idsToSegmentId.get(id);
			if (segmentId !== currSegmentId) {
				if (currSegmentId) {
					distilledIds.push(currSegmentId);
					distilledDeltas.push(currSegmentTime);
				}
				currSegmentId = segmentId;
				currSegmentTime = 0;
			}
			currSegmentTime += timeDeltas[i];
		}
		if (currSegmentId) {
			distilledIds.push(currSegmentId);
			distilledDeltas.push(currSegmentTime);
		}
		idsToNodes = null;
		idsToSegmentId = null;
		searchTree = null;

		return {
			startTime: profile.startTime,
			endTime: profile.endTime,
			deltas: distilledDeltas,
			ids: distilledIds,
			data: profile,
			getAggregatedTimes: () => {
				let segmentsToTime = new Map<ProfileSegmentId, number>();
				for (let i = 0; i < distilledIds.length; i++) {
					let id = distilledIds[i];
					segmentsToTime.set(id, (segmentsToTime.get(id) || 0) + distilledDeltas[i]);
				}
				return segmentsToTime;
			}
		};
	}
}


CommandsRegistry.registerCommand('exthost.profile.start', async accessor => {
	const statusbarService = accessor.get(IStatusbarService);
	const extensionService = accessor.get(IExtensionService);
	const environmentService = accessor.get(IEnvironmentService);

	const handle = statusbarService.addEntry({ text: localize('message', "$(zap) Profiling Extension Host...") }, StatusbarAlignment.LEFT);

	extensionService.startExtensionHostProfile().then(session => {
		setTimeout(() => {
			session.stop().then(result => {
				result.getAggregatedTimes().forEach((val, index) => {
					console.log(`${index} : ${Math.round(val / 1000)} ms`);
				});
				let profilePath = path.join(environmentService.userHome, 'extHostProfile.cpuprofile');
				console.log(`Saving profile at ${profilePath}`);
				return writeFile(profilePath, JSON.stringify(result.data));
			}).then(() => {
				handle.dispose();
			});
		}, 5000);
	});
});
