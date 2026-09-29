/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type SnapBase = 'core22' | 'core24' | 'core26';

export function getSnapBase(value: string | undefined): SnapBase {
	switch (value ?? 'core24') {
		case 'core22': return 'core22';
		case 'core24': return 'core24';
		case 'core26': return 'core26';
		default: throw new Error(`Unsupported Snap base: ${value}`);
	}
}

export function getSnapcraftConfig(arch: string, base: SnapBase) {
	let snapArchitecture: string;
	let multiarch: string;
	switch (arch) {
		case 'x64':
			snapArchitecture = 'amd64';
			multiarch = 'x86_64-linux-gnu';
			break;
		case 'arm64':
			snapArchitecture = 'arm64';
			multiarch = 'aarch64-linux-gnu';
			break;
		case 'armhf':
			snapArchitecture = 'armhf';
			multiarch = 'arm-linux-gnueabihf';
			break;
		default:
			throw new Error(`Unsupported Snap architecture: ${arch}`);
	}

	const architectures = base === 'core22'
		? `architectures:\n  - ${snapArchitecture}`
		: `platforms:\n  ${snapArchitecture}:\n    build-on: [${snapArchitecture}]\n    build-for: [${snapArchitecture}]`;
	const usesTime64Packages = base !== 'core22';
	return {
		base,
		architectures,
		multiarch,
		asound: usesTime64Packages ? 'libasound2t64' : 'libasound2',
		atkBridge: usesTime64Packages ? 'libatk-bridge2.0-0t64' : 'libatk-bridge2.0-0',
		atk: usesTime64Packages ? 'libatk1.0-0t64' : 'libatk1.0-0',
		atspi: usesTime64Packages ? 'libatspi2.0-0t64' : 'libatspi2.0-0',
		curl: usesTime64Packages ? 'libcurl4t64' : 'libcurl4',
		glib: usesTime64Packages ? 'libglib2.0-0t64' : 'libglib2.0-0',
		gtk: usesTime64Packages ? 'libgtk-3-0t64' : 'libgtk-3-0',
	};
}
