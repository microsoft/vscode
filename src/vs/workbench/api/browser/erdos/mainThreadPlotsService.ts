import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ExtHostPlotsServiceShape, ExtHostErdosContext, MainErdosContext, MainThreadPlotsServiceShape } from '../../common/erdos/extHost.erdos.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { IErdosPlotsService, PlotRenderSettings } from '../../../services/erdosPlots/common/erdosPlots.js';

@extHostNamedCustomer(MainErdosContext.MainThreadPlotsService)
export class MainThreadPlotsService implements MainThreadPlotsServiceShape {

	private readonly _disposables = new DisposableStore();
	private readonly _proxy: ExtHostPlotsServiceShape;

	constructor(
		extHostContext: IExtHostContext,
		@IErdosPlotsService private readonly _erdosPlotsService: IErdosPlotsService
	) {
		this._proxy = extHostContext.getProxy(ExtHostErdosContext.ExtHostPlotsService);

		this._disposables.add(
			this._erdosPlotsService.onDidChangePlotsRenderSettings((settings) => {
				this._proxy.$onDidChangePlotsRenderSettings(settings);
			}));
	}

	dispose(): void {
		this._disposables.dispose();
	}

	async $getPlotsRenderSettings(): Promise<PlotRenderSettings> {
		return this._erdosPlotsService.getPlotsRenderSettings();
	}
}

