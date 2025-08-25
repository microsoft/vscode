import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ExtHostConsoleServiceShape, ExtHostErdosContext, MainErdosContext, MainThreadConsoleServiceShape } from '../../common/erdos/extHost.erdos.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { IErdosConsoleInstance, IErdosConsoleService } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { MainThreadConsole } from './mainThreadConsole.js';

@extHostNamedCustomer(MainErdosContext.MainThreadConsoleService)
export class MainThreadConsoleService implements MainThreadConsoleServiceShape {

	private readonly _disposables = new DisposableStore();

	private readonly _mainThreadConsolesBySessionId = new Map<string, MainThreadConsole>();

	private readonly _proxy: ExtHostConsoleServiceShape;

	constructor(
		extHostContext: IExtHostContext,
		@IErdosConsoleService private readonly _erdosConsoleService: IErdosConsoleService
	) {
		this._proxy = extHostContext.getProxy(ExtHostErdosContext.ExtHostConsoleService);

		this._disposables.add(
			this._erdosConsoleService.onDidChangeConsoleWidth((newWidth) => {
				this._proxy.$onDidChangeConsoleWidth(newWidth);
			}));

		this._disposables.add(
			this._erdosConsoleService.onDidStartErdosConsoleInstance((console) => {
				const sessionId = console.sessionMetadata.sessionId;

				this._proxy.$addConsole(sessionId);

				this.addConsole(sessionId, console);
			})
		);
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private addConsole(sessionId: string, console: IErdosConsoleInstance) {
		const mainThreadConsole = new MainThreadConsole(console);
		this._mainThreadConsolesBySessionId.set(sessionId, mainThreadConsole);
	}

	$getConsoleWidth(): Promise<number> {
		return Promise.resolve(this._erdosConsoleService.getConsoleWidth());
	}

	$getSessionIdForLanguage(languageId: string): Promise<string | undefined> {
		for (let [sessionId, console] of this._mainThreadConsolesBySessionId.entries()) {
			if (console.getLanguageId() === languageId) {
				return Promise.resolve(sessionId);
			}
		}

		return Promise.resolve(undefined);
	}

	$tryPasteText(sessionId: string, text: string): void {
		const mainThreadConsole = this._mainThreadConsolesBySessionId.get(sessionId);

		if (!mainThreadConsole) {
			return;
		}

		mainThreadConsole.pasteText(text);
	}
}

