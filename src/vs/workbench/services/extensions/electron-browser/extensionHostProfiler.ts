/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { IExtensionHostProfile, IExtensionService, ProfileSegmentId, ProfileSession } from '../common/extensions.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IV8InspectProfilingService, IV8Profile, IV8ProfileNode } from '../../../../platform/profiling/common/profiling.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

export class ExtensionHostProfiler {

	constructor(
		private readonly _host: string,
		private readonly _port: number,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IV8InspectProfilingService private readonly _profilingService: IV8InspectProfilingService,
		@IFileService private readonly _fileService: IFileService
	) {
	}

	public async start(): Promise<ProfileSession> {

		const id = await this._profilingService.startProfiling({ host: this._host, port: this._port });

		return {
			stop: createSingleCallFunction(async () => {
				const profile = await this._profilingService.stopProfiling(id);
				await this._extensionService.whenInstalledExtensionsRegistered();
				const extensions = this._extensionService.extensions;
				return this._distill(profile, extensions);
			})
		};
	}

	public async takeHeapSnapshot(saveTo: URI, progress: IProgress<IProgressStep>): Promise<void> {
		const stream = newWriteableStream<VSBuffer>(data => VSBuffer.concat(data));

		let pending: string = '';

		await Promise.all([
			this._fileService.createFile(saveTo, stream, { overwrite: true }),
			this._profilingService.takeHeapSnapshot(
				{ host: this._host, port: this._port },
				chunk => {
					pending = pending ? pending + chunk : chunk;

					let index: number;
					while ((index = pending.indexOf('\n')) !== -1) {
						let line = pending.slice(0, index + 1);
						if (line.length > 5 && line.startsWith('"')) {
							const terminal = line.slice(line.lastIndexOf('"'));
							const contentLen = line.length - terminal.length - 1;
							line = `"len=${contentLen}`.padEnd(contentLen, '~').slice(0, contentLen) + terminal;
						}
						stream.write(VSBuffer.fromString(line));
						pending = pending.slice(index + 1);
					}
				},
				progress,
			).finally(() => {
				stream.end(VSBuffer.fromString(pending));
			})
		]);

	}

	private _distill(profile: IV8Profile, extensions: readonly IExtensionDescription[]): IExtensionHostProfile {
		const searchTree = TernarySearchTree.forUris<IExtensionDescription>();
		for (const extension of extensions) {
			if (extension.extensionLocation.scheme === Schemas.file) {
				searchTree.set(URI.file(extension.extensionLocation.fsPath), extension);
			}
		}

		const nodes = profile.nodes;
		const idsToNodes = new Map<number, IV8ProfileNode>();
		const idsToSegmentId = new Map<number, ProfileSegmentId | null>();
		for (const node of nodes) {
			idsToNodes.set(node.id, node);
		}

		function visit(node: IV8ProfileNode, segmentId: ProfileSegmentId | null) {
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
				let extension: IExtensionDescription | undefined;
				try {
					extension = searchTree.findSubstr(URI.parse(node.callFrame.url));
				} catch {
					// ignore
				}
				if (extension) {
					segmentId = extension.identifier.value;
				}
			}
			idsToSegmentId.set(node.id, segmentId);

			if (node.children) {
				for (const child of node.children) {
					const childNode = idsToNodes.get(child);
					if (childNode) {
						visit(childNode, segmentId);
					}
				}
			}
		}
		visit(nodes[0], null);

		const samples = profile.samples || [];
		const timeDeltas = profile.timeDeltas || [];
		const distilledDeltas: number[] = [];
		const distilledIds: ProfileSegmentId[] = [];

		let currSegmentTime = 0;
		let currSegmentId: string | undefined;
		for (let i = 0; i < samples.length; i++) {
			const id = samples[i];
			const segmentId = idsToSegmentId.get(id);
			if (segmentId !== currSegmentId) {
				if (currSegmentId) {
					distilledIds.push(currSegmentId);
					distilledDeltas.push(currSegmentTime);
				}
				currSegmentId = segmentId ?? undefined;
				currSegmentTime = 0;
			}
			currSegmentTime += timeDeltas[i];
		}
		if (currSegmentId) {
			distilledIds.push(currSegmentId);
			distilledDeltas.push(currSegmentTime);
		}

		return {
			startTime: profile.startTime,
			endTime: profile.endTime,
			deltas: distilledDeltas,
			ids: distilledIds,
			data: profile,
			getAggregatedTimes: () => {
				const segmentsToTime = new Map<ProfileSegmentId, number>();
				for (let i = 0; i < distilledIds.length; i++) {
					const id = distilledIds[i];
					segmentsToTime.set(id, (segmentsToTime.get(id) || 0) + distilledDeltas[i]);
				}
				return segmentsToTime;
			}
		};
	}
}
