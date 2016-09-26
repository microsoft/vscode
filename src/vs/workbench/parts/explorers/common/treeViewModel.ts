export class TreeViewNode {
	public label: string;
	public type: string;
	public start: number;
	public end: number;
	public children: TreeViewNode[];

	constructor(label: string, type: string, start: number, end: number, children: TreeViewNode[]) {
		this.label = label;
		this.type = type;
		this.start = start;
		this.end = end;
		this.children = children;
	}
}
