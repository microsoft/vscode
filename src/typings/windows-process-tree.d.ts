/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'windows-process-tree' {
	type processTreeNode = {
		pid: number,
		name: string,
		children: processTreeNode[]
	}
	function get(rootPid: number, callback: (tree: processTreeNode) => void): void;
	export = get;
}