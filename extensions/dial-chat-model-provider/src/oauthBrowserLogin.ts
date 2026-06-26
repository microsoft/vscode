import { closeOAuthBrowser, openOAuthBrowser } from './oauthBrowserProcess';
import { startOAuthLoopbackSession } from './oauthLocalServer';
import { type Nullable, type OAuthBrowserProfileMode } from './types';

export interface OAuthBrowserSignInOptions {
	readonly port: number;
	readonly expectedState: string;
	readonly authorizationUrl: string;
	readonly profileMode?: OAuthBrowserProfileMode;
	readonly timeoutMs?: number;
	readonly signal?: AbortSignal;
}

/** Loopback OAuth in a native browser window; extension closes the browser after login. */
export async function runOAuthBrowserSignIn(options: OAuthBrowserSignInOptions): Promise<string> {
	const session = await startOAuthLoopbackSession({
		port: options.port,
		expectedState: options.expectedState,
		...(options.signal !== undefined && { signal: options.signal }),
		...(options.timeoutMs !== undefined && { timeoutMs: options.timeoutMs }),
	});

	let browser: Nullable<ReturnType<typeof openOAuthBrowser>>;
	try {
		browser = openOAuthBrowser(
			options.authorizationUrl,
			options.port,
			options.profileMode ?? 'auto',
		);
		return await session.waitForAuthorizationCode();
	} finally {
		await closeOAuthBrowser(browser);
		session.dispose();
	}
}
