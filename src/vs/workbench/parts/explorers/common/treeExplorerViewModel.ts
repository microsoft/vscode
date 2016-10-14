import { TPromise } from 'vs/base/common/winjs.base';
import { TreeExplorerNodeProvider } from 'vscode';

export class InternalTreeExplorerNode implements TreeExplorerNodeContent {
	static idCounter = 1;

	id: number;

	label: string = 'label';
	hasChildren: boolean = true;
	shouldInitiallyExpand: boolean = false;
	clickCommand: string = null;

	constructor(node: any, provider: TreeExplorerNodeProvider<any>) {
		this.id = InternalTreeExplorerNode.idCounter++;

		if (provider.getLabel) {
			this.label = provider.getLabel(node);
		}
		if (provider.getHasChildren) {
			this.hasChildren = provider.getHasChildren(node);
		}
		if (provider.getShouldInitiallyExpand) {
			this.shouldInitiallyExpand = provider.getShouldInitiallyExpand(node);
		}
		if (provider.getClickCommand) {
			this.clickCommand = provider.getClickCommand(node);
		}
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