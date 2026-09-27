/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Log } from './logger';

/**
 * One remembered mapping: the Microsoft account on one side, the GitHub account it resolved to on
 * the other.
 */
export interface IAccountLink {
	readonly microsoftAccountLabel: string;
	readonly gitHubAccountLabel: string;
	/**
	 * The GitHub user id, which is only ever compared with one GitHub has just reported.
	 *
	 * Never use it to work out whether two sessions are the same account. That question is the
	 * product's, and the product answers it with the label: `getAccounts` collapses sessions by
	 * label, the account picker offers labels, and a session read back from the Keychain may carry
	 * a placeholder id, an old numeric one, or an id from a lookup that failed. The id answers a
	 * different question, "did GitHub just hand us a token for somebody else?", which the label
	 * cannot, because a login can be renamed and a freed login can be taken by another person.
	 */
	readonly gitHubAccountId: string;
}

/**
 * Which Microsoft account each GitHub account was reached through, for every mapping the user has
 * agreed to sign in as.
 *
 * A row is only written once the user has confirmed the GitHub identity discovery resolved, so a
 * row means "this person said yes to being this account". That is what lets a fresh window mint a
 * session again silently after a reload: the consent is what survived, not the token.
 *
 * It stays a hint rather than an authority about *which* account, though. The Entra to GitHub
 * mapping lives on GitHub's side and can move, so every use of a row re-checks where it points and
 * rewrites or drops it rather than trusting it.
 *
 * Rows are keyed by GitHub account label, the same thing VS Code itself keys an account by, and are
 * kept here rather than on each session so that two sessions for the same account share one row and
 * the row outlives them. A token running out is not the user saying they are done with that
 * identity, and neither is signing out of the Microsoft account: that takes away the way to act on
 * the row, not the agreement the row records, and signing back in makes it work again. Only signing
 * out of the GitHub account clears a row, along with discovery proving the row points at somebody
 * else.
 *
 * Nothing here is ever written from an observation that the Microsoft account list does not mention
 * an account. That list is a per-window cache which legitimately reads empty for a moment while it
 * repopulates, and this table is global state that every window shares, so acting on a blink of it
 * in one window would sign the user out of all of them for good.
 *
 * The table holds two account labels and a user id, and no secrets, so it lives in global state
 * rather than in the Keychain.
 */
export class AccountLinks {

	/**
	 * The GitHub accounts whose row could not be deleted, so that a failed write cannot leave a
	 * signed-out account signed in.
	 *
	 * Signing out drops the token and then deletes the row. If only the first half lands, the row
	 * still authorizes minting a fresh token with nothing shown, so the very next read would sign
	 * the user back in and there would be no way for them to stop it. Holding the deletion in memory
	 * makes sign out stick for this window, which is the window the user did it in, and the next
	 * successful write of any kind takes the row with it for good.
	 */
	private readonly _unlinkedButStillStored = new Set<string>();

	constructor(
		private readonly memento: vscode.Memento,
		private readonly storageKey: string,
		private readonly logger: Log
	) { }

	private get links(): readonly IAccountLink[] {
		const stored = this.memento.get<IAccountLink[]>(this.storageKey, []);
		return this._unlinkedButStillStored.size
			? stored.filter(link => !this._unlinkedButStillStored.has(link.gitHubAccountLabel))
			: stored;
	}

	/** Every mapping the user has agreed to, in the order they were agreed to. */
	linkedAccounts(): readonly IAccountLink[] {
		return this.links;
	}

	/**
	 * The Microsoft account a GitHub account was last reached through. Looked up by label because
	 * that is all a caller asking to sign in to a particular account gives us.
	 */
	microsoftAccountFor(gitHubAccountLabel: string): string | undefined {
		return this.links.find(link => link.gitHubAccountLabel === gitHubAccountLabel)?.microsoftAccountLabel;
	}

	/**
	 * Records a mapping the user has just agreed to, replacing whatever was remembered for either
	 * side. Both sides are matched by label, so a GitHub account that has been renamed leaves its old
	 * row behind rather than overwriting it; the Microsoft half of the row is what clears that up.
	 */
	async link(microsoftAccountLabel: string, gitHubAccount: vscode.AuthenticationSessionAccountInformation): Promise<void> {
		const kept = this.links.filter(link =>
			link.gitHubAccountLabel !== gitHubAccount.label && link.microsoftAccountLabel !== microsoftAccountLabel);
		// The user has just agreed to this account again, which is the one thing that undoes an
		// earlier sign out of it.
		this._unlinkedButStillStored.delete(gitHubAccount.label);
		await this.write([...kept, {
			microsoftAccountLabel,
			gitHubAccountLabel: gitHubAccount.label,
			gitHubAccountId: gitHubAccount.id
		}]);
	}

	/** Forgets the row for a GitHub account the user has signed out of. */
	async unlinkGitHubAccount(gitHubAccountLabel: string): Promise<void> {
		const kept = this.links.filter(link => link.gitHubAccountLabel !== gitHubAccountLabel);
		if (kept.length === this.links.length) {
			return;
		}
		// Recorded before the write, and only cleared by it, so that the deletion holds whether or
		// not the write does.
		this._unlinkedButStillStored.add(gitHubAccountLabel);
		if (await this.write(kept)) {
			this._unlinkedButStillStored.delete(gitHubAccountLabel);
		}
	}

	/** Whether the links reached storage, so a caller can tell a lost hint from a lost deletion. */
	private async write(links: readonly IAccountLink[]): Promise<boolean> {
		try {
			await this.memento.update(this.storageKey, links);
			return true;
		} catch (e) {
			// A lost hint costs the user an account picker, so it is never worth failing a sign in
			// or a sign out over.
			this.logger.error(`Could not update the Microsoft account links: ${e}`);
			return false;
		}
	}
}
