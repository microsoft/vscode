import { AuthenticationForceNewSessionOptions, AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession, Event, EventEmitter } from "vscode";

export class TestAuthProvider implements AuthenticationProvider {
    private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
    onDidChangeSessions: Event<AuthenticationProviderAuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

    private _sessions: AuthenticationSession[] = [
        {
            id: "session1",
            accessToken: "dummyToken1",
            scopes: ["scope"],
            account: { label: "Dummy Account 1", id: "dummyAccount1" }
        },
        {
            id: "session2",
            accessToken: "dummyToken2",
            scopes: ["scope"],
            account: { label: "Dummy Account 2", id: "dummyAccount2" }
        }
    ];

    getSessions(scopes?: readonly string[] | undefined): Thenable<readonly AuthenticationSession[]> {
        return Promise.resolve(this._sessions.filter(session => !scopes || scopes.every(scope => session.scopes.indexOf(scope) !== -1)));
    }
    createSession(scopes: readonly string[], options?: AuthenticationForceNewSessionOptions): Thenable<AuthenticationSession> {

    }
    removeSession(sessionId: string): Thenable<void> {
        
    }
}
