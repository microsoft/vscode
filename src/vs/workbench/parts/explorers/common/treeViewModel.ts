
export class TreeViewNode implements vscode.ITreeNode {
  id: number;
  label: string;
  isExpanded: boolean;
  parent: vscode.ITreeNode;
  children: vscode.ITreeNode[];

  constructor(
    id: number,
    label: string,
    isExpanded: boolean = true,
    parent: vscode.ITreeNode = null,
    children: vscode.ITreeNode[] = []) {
    this.id = id;
    this.label = label;
    this.isExpanded = isExpanded;
    this.parent = parent;
    this.children = children;
  }

  addChild(child: vscode.ITreeNode) {
    this.children.push(child);
    child.parent = this;
  }
}
