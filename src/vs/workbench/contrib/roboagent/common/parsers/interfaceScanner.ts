/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Ros2InterfaceKind } from '../ros2WorkspaceModel.js';

const EXT_TO_KIND: ReadonlyMap<string, Ros2InterfaceKind> = new Map([
	['.msg', 'msg'],
	['.srv', 'srv'],
	['.action', 'action']
]);

export interface ScannedInterface {
	readonly kind: Ros2InterfaceKind;
	/** Bare interface name without extension, e.g. `Point32`. */
	readonly name: string;
	/** The file name as found, e.g. `Point32.msg`. */
	readonly fileName: string;
}

/** Classify a single file name (e.g. `Twist.msg`) as an interface, or `undefined`. */
export function classifyInterfaceFile(fileName: string): ScannedInterface | undefined {
	const dot = fileName.lastIndexOf('.');
	if (dot === -1) {
		return undefined;
	}
	const ext = fileName.slice(dot).toLowerCase();
	const kind = EXT_TO_KIND.get(ext);
	if (!kind) {
		return undefined;
	}
	return { kind, name: fileName.slice(0, dot), fileName };
}

/** Classify a list of file names (e.g. the contents of a package's msg/ srv/ action/ folders). */
export function classifyInterfaceFiles(fileNames: readonly string[]): ScannedInterface[] {
	const out: ScannedInterface[] = [];
	for (const fileName of fileNames) {
		const scanned = classifyInterfaceFile(fileName);
		if (scanned) {
			out.push(scanned);
		}
	}
	return out;
}
