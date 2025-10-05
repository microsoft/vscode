import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { MainErdosContext, MainThreadPlotsServiceShape } from '../../common/erdos/extHost.erdos.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';

@extHostNamedCustomer(MainErdosContext.MainThreadPlotsService)
export class MainThreadPlotsService implements MainThreadPlotsServiceShape {

	private readonly _disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext
	) {
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

