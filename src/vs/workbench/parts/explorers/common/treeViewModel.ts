export class TreeViewNode implements vscode.ITreeNode {
  constructor(
    public id: number,
    public label: string,
    public isExpanded: boolean = true,
    public parent: TreeViewNode = null,
    public children: TreeViewNode[] = []) {
  }

  addChild(child: TreeViewNode) {
    this.children.push(child);
    child.parent = this;
  }
}
