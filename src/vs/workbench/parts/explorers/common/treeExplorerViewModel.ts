import { TPromise } from 'vs/base/common/winjs.base';
import { TreeExplorerNodeProvider } from 'vscode';

export class InternalTreeExplorerNode implements TreeExplorerNodeContent {
	static idCounter = 1;

	id: number;

	label: string;
	hasChildren: boolean;
	shouldInitiallyExpand: boolean;
	clickCommand: string;

	constructor(node: any, provider: TreeExplorerNodeProvider<any>) {
		this.id = InternalTreeExplorerNode.idCounter++;

		this.label = provider.getLabel(node);
		this.hasChildren = provider.getHasChildren(node);
		this.shouldInitiallyExpand = provider.getShouldInitiallyExpand(node);
		this.clickCommand = provider.getClickCommand(node);
	}
}

export interface InternalTreeExplorerNodeProvider {
	resolveCommand(node: TreeExplorerNodeContent): TPromise<void>;
	provideRootNode(): Thenable<InternalTreeExplorerNode>;
	resolveChildren(node: InternalTreeExplorerNode): Thenable<InternalTreeExplorerNode[]>;
}

export interface TreeExplorerNodeContent {
	label: string;
	hasChildren: boolean;
	shouldInitiallyExpand: boolean;
	clickCommand: string;
}