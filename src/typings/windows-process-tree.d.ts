/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'windows-process-tree' {
	interface ProcessTreeNode {
		pid: number,
		name: string,
		children: ProcessTreeNode[]
	}
	function get(rootPid: number, callback: (tree: ProcessTreeNode) => void): void;
	export = get;
}