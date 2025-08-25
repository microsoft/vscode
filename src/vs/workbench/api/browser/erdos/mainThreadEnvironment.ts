import { MainErdosContext, MainThreadEnvironmentShape } from '../../common/erdos/extHost.erdos.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IEnvironmentVariableService } from '../../../contrib/terminal/common/environmentVariable.js';

interface IEnvironmentVariableAction {
	action: number;
	name: string;
	value: string;
}

@extHostNamedCustomer(MainErdosContext.MainThreadEnvironment)
export class MainThreadEnvironment implements MainThreadEnvironmentShape {

	private readonly _disposables = new DisposableStore();
	constructor(
		extHostContext: IExtHostContext,
		@IEnvironmentVariableService private readonly _environmentService: IEnvironmentVariableService
	) {
	}

	async $getEnvironmentContributions(): Promise<Record<string, IEnvironmentVariableAction[]>> {
		const collections = this._environmentService.collections;

		const result = Object.create(null) as Record<string, IEnvironmentVariableAction[]>;

		for (const [extensionIdentifier, collection] of collections.entries()) {
			const actions: IEnvironmentVariableAction[] = [];
			for (const [variable, action] of collection.map) {
				actions.push({
					action: action.type,
					name: variable,
					value: action.value
				});
			}
			result[extensionIdentifier] = actions;
		}

		return result;
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

