import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {ExtHostContext, MainThreadExplorersShape, ExtHostExplorersShape} from './extHost.protocol';

export class MainThreadExplorers extends MainThreadExplorersShape {
	private _proxy: ExtHostExplorersShape;

	constructor(
		@IThreadService threadService: IThreadService
	) {
		super();

		this._proxy = threadService.get(ExtHostContext.ExtHostExplorers);
	}

	$registerTreeContentProvider(treeContentProviderId: string): void {
		const tree = this._proxy.$provideTextDocumentContent(treeContentProviderId);
	}

	$unregisterTreeContentProvider(treeContentProviderId: string): void {

	}
}