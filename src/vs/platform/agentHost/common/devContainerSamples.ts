/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

export const devContainerSampleScheme = 'vscode-dev-container-sample';

export const devContainerSamples = [
	{ id: 'go', name: 'Go' },
	{ id: 'dotnet', name: '.NET' },
	{ id: 'node', name: 'Node.js' },
	{ id: 'php', name: 'PHP' },
	{ id: 'python', name: 'Python' },
	{ id: 'rust', name: 'Rust' },
] as const;

export type DevContainerSample = typeof devContainerSamples[number];

export interface IDevContainerSampleSource {
	readonly sampleId: DevContainerSample['id'];
}

/** Repository identity understood by the Dev Containers extension. */
export interface IDevContainerRepository {
	readonly repositoryPath: string;
	readonly volumeName: string;
	readonly folder: string;
}

export function getDevContainerSampleFolder(sample: DevContainerSample): string {
	return `vscode-remote-try-${sample.id}`;
}

export function getDevContainerSampleUrl(sample: DevContainerSample): string {
	return `https://github.com/Microsoft/${getDevContainerSampleFolder(sample)}`;
}

export function devContainerSampleUri(sample: DevContainerSample): URI {
	return URI.from({ scheme: devContainerSampleScheme, path: `/${getDevContainerSampleFolder(sample)}` });
}

export function findDevContainerSample(uri: URI): DevContainerSample | undefined {
	return uri.scheme === devContainerSampleScheme && !uri.authority && !uri.query && !uri.fragment
		? devContainerSamples.find(sample => uri.path === `/${getDevContainerSampleFolder(sample)}`)
		: undefined;
}
