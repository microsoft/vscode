import { TPromise } from 'vs/base/common/winjs.base';
import { TreeExplorerNodeContent, TreeExplorerNodeProvider } from 'vscode';

export class InternalTreeExplorerNode implements TreeExplorerNodeContent {
	static idCounter = 1;

	id: number;

	label: string;
	shouldInitiallyExpand: boolean;
	clickCommand: string;

	constructor(node: TreeExplorerNodeContent) {
		this.id = InternalTreeExplorerNode.idCounter++;

		this.label = node.label;
		this.shouldInitiallyExpand = node.shouldInitiallyExpand;
		this.clickCommand = node.clickCommand;
	}
}

export interface InternalTreeExplorerNodeProvider {
	resolveCommand(node: TreeExplorerNodeContent): TPromise<void>;
	provideRootNode(): Thenable<InternalTreeExplorerNode>;
	resolveChildren(node: InternalTreeExplorerNode): Thenable<InternalTreeExplorerNode[]>;
}