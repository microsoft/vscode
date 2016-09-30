export class TreeViewNode implements vscode.ITreeNode {
  id: number;
  label: string;
  isExpanded: boolean;
  parent: TreeViewNode
  children: TreeViewNode[];

  constructor(
    id: number,
    label: string,
    isExpanded: boolean = true,
    parent: TreeViewNode = null,
    children: TreeViewNode[] = []) {
    this.id = id;
    this.label = label;
    this.isExpanded = isExpanded;
    this.parent = parent;
    this.children = children;
  }

  addChild(child: TreeViewNode) {
    this.children.push(child);
    child.parent = this;
  }
}
