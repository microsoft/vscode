import * as vscode from 'vscode';

export const AUTH_TYPE = 'roboagent';
const AUTH_NAME = 'RoboAgent';
const SESSIONS_SECRET_KEY = `${AUTH_TYPE}.sessions`;

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	public handleUri(uri: vscode.Uri) {
		this.fire(uri);
	}
}

class RoboAgentAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private _disposable: vscode.Disposable;
	private _uriHandler = new UriEventHandler();

	constructor(private readonly context: vscode.ExtensionContext) {
		this._disposable = vscode.Disposable.from(
			vscode.authentication.registerAuthenticationProvider(AUTH_TYPE, AUTH_NAME, this, { supportsMultipleAccounts: false }),
			vscode.window.registerUriHandler(this._uriHandler)
		);
	}

	get onDidChangeSessions() {
		return this._sessionChangeEmitter.event;
	}

	async getSessions(scopes?: string[]): Promise<vscode.AuthenticationSession[]> {
		const allSessions = await this.readSessions();
		return allSessions;
	}

	async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
		const token = await this.login();
		if (!token) {
			throw new Error('RoboAgent login failed');
		}

		const session: vscode.AuthenticationSession = {
			id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
			accessToken: token,
			account: {
				label: 'RoboAgent User',
				id: 'roboagent_user'
			},
			scopes: scopes || []
		};

		await this.storeSession(session);
		
		this._sessionChangeEmitter.fire({
			added: [session],
			removed: [],
			changed: []
		});

		return session;
	}

	async removeSession(sessionId: string): Promise<void> {
		const allSessions = await this.readSessions();
		const sessionIndex = allSessions.findIndex(s => s.id === sessionId);
		if (sessionIndex > -1) {
			const session = allSessions[sessionIndex];
			allSessions.splice(sessionIndex, 1);
			await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(allSessions));
			this._sessionChangeEmitter.fire({
				added: [],
				removed: [session],
				changed: []
			});
		}
	}

	dispose() {
		this._disposable.dispose();
	}

	private async readSessions(): Promise<vscode.AuthenticationSession[]> {
		const storedSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
		if (storedSessions) {
			try {
				return JSON.parse(storedSessions) as vscode.AuthenticationSession[];
			} catch (e) {
				return [];
			}
		}
		return [];
	}

	private async storeSession(session: vscode.AuthenticationSession): Promise<void> {
		const allSessions = await this.readSessions();
		allSessions.push(session);
		await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(allSessions));
	}

	private async login(): Promise<string | undefined> {
		return await vscode.window.withProgress<string | undefined>({
			location: vscode.ProgressLocation.Notification,
			title: "Signing in to RoboAgent...",
			cancellable: true
		}, async (_, token) => {
			const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://vscode.roboagent-authentication`));
			const loginUri = vscode.Uri.parse(`https://www.roboticscorner.tech/roboagent/login?callbackUrl=${encodeURIComponent(callbackUri.toString())}`);
			
			await vscode.env.openExternal(loginUri);

			return new Promise<string | undefined>((resolve) => {
				const disposable = this._uriHandler.event(uri => {
					if (uri.path.includes('desktop-auth') || uri.path.includes('login') || uri.query) {
						const query = new URLSearchParams(uri.query);
						const token = query.get('token');
						if (token) {
							disposable.dispose();
							resolve(token);
						}
					}
				});
				
				token.onCancellationRequested(() => {
					disposable.dispose();
					resolve(undefined);
				});
			});
		});
	}
}

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(new RoboAgentAuthenticationProvider(context));
}

export function deactivate() {}
