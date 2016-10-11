import { TreeExplorerNode } from 'vscode';

export class InternalTreeExplorerNode implements TreeExplorerNode {
	static idCounter = 1;

	id: number;

	// Property on TreeContentNode
	label: string;
	shouldInitiallyExpand: boolean;

	constructor(node: TreeExplorerNode) {
		this.id = InternalTreeExplorerNode.idCounter++;

		this.label = node.label;
		this.shouldInitiallyExpand = node.shouldInitiallyExpand;
	}
}
