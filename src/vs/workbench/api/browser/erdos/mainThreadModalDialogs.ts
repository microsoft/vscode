import { MainThreadModalDialogsShape, MainErdosContext } from '../../common/erdos/extHost.erdos.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IErdosModalDialogsService } from '../../../services/erdosModalDialogs/common/erdosModalDialogs.js';

@extHostNamedCustomer(MainErdosContext.MainThreadModalDialogs)
export class MainThreadModalDialogs implements MainThreadModalDialogsShape {

	private readonly _disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@IErdosModalDialogsService private readonly _erdosModalDialogsService: IErdosModalDialogsService
	) { }

	$showSimpleModalDialogPrompt(title: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string): Promise<boolean> {
		return this._erdosModalDialogsService.showSimpleModalDialogPrompt(title, message, okButtonTitle, cancelButtonTitle);
	}

	$showSimpleModalDialogMessage(title: string, message: string, okButtonTitle?: string): Promise<null> {
		return this._erdosModalDialogsService.showSimpleModalDialogMessage(title, message, okButtonTitle);
	}

	public dispose(): void {
		this._disposables.dispose();
	}
}

