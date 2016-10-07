import { TreeContentNode } from 'vscode';

export class TreeViewNode implements TreeContentNode {
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

  public static create(node: TreeContentNode): TreeViewNode {
    const children = node.children.map(TreeViewNode.create);
    return new TreeViewNode(node.label, node.shouldInitiallyExpand, children)
  }
}
