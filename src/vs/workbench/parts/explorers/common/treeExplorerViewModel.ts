import { TreeExplorerNode } from 'vscode';

export class TreeViewNode implements TreeExplorerNode {
  static idCounter = 1;

  id: number;
  hasChildren: boolean = true;
  isChildrenResolved: boolean = false;

  constructor(
    public label: string,
    public shouldInitiallyExpand: boolean = true,
    public children: TreeViewNode[] = []
  ) {
    this.id = TreeViewNode.idCounter++;
  }

  public static create(node: TreeExplorerNode): TreeViewNode {
    const children = node.children.map(TreeViewNode.create);
    return new TreeViewNode(node.label, node.shouldInitiallyExpand, children)
  }
}

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
