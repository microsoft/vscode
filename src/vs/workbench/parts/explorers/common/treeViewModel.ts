import { ITreeNode } from 'vscode';

export class TreeViewNode implements ITreeNode {
  static idCounter = 1;

  id: number;
  hasChildren: boolean = true;
  isChildrenResolved: boolean = false;

  constructor(
    public label: string,
    public isExpanded: boolean = true,
    public children: TreeViewNode[] = []
  ) {
    this.id = TreeViewNode.idCounter++;
  }

  public static create(node: ITreeNode): TreeViewNode {
    const children = node.children.map(TreeViewNode.create);
    return new TreeViewNode(node.label, node.isExpanded, children)
  }
}
