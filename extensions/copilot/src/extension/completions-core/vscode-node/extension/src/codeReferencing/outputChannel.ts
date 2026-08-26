/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, type OutputChannel } from 'vscode';
import { IAuthenticationService } from '../../../../../../platform/authentication/common/authentication';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotToken } from '../../../lib/src/auth/copilotTokenManager';
import { onCopilotToken } from '../../../lib/src/auth/copilotTokenNotifier';

interface GitHubLogger extends Disposable {
	info(...messages: string[]): void;
	forceShow(): void;
}

export const citationsChannelName = 'GitHub Copilot Log (Code References)';

// Literally taken from VS Code
function getCurrentTimestamp() {
	const toTwoDigits = (v: number) => (v < 10 ? `0${v}` : v);
	const toThreeDigits = (v: number) => (v < 10 ? `00${v}` : v < 100 ? `0${v}` : v);
	const currentTime = new Date();
	return `${currentTime.getFullYear()}-${toTwoDigits(currentTime.getMonth() + 1)}-${toTwoDigits(
		currentTime.getDate()
	)} ${toTwoDigits(currentTime.getHours())}:${toTwoDigits(currentTime.getMinutes())}:${toTwoDigits(
		currentTime.getSeconds()
	)}.${toThreeDigits(currentTime.getMilliseconds())}`;
}

class CodeReferenceOutputChannel implements IDisposable {
	constructor(private output: OutputChannel) { }

	info(...messages: string[]) {
		this.output.appendLine(`${getCurrentTimestamp()} [info] ${messages.join(' ')}`);
	}

	show(preserveFocus: boolean) {
		this.output.show(preserveFocus);
	}

	dispose() {
		this.output.dispose();
	}
}

export class GitHubCopilotLogger extends Disposable implements GitHubLogger {

	private output = this._register(new MutableDisposable<CodeReferenceOutputChannel>());

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IAuthenticationService authenticationService: IAuthenticationService
	) {
		super();
		this._register(onCopilotToken(authenticationService, t => this.checkCopilotToken(t)));

		this.createChannel();
	}

	private checkCopilotToken = (token: Omit<CopilotToken, 'token'>) => {
		if (token.codeQuoteEnabled) {
			this.createChannel();
		} else {
			this.removeChannel();
		}
	};

	private log(type: 'info', ...messages: string[]) {
		const output = this.createChannel();

		const [base, ...rest] = messages;
		output[type](base, ...rest);
	}

	info(...messages: string[]) {
		this.log('info', ...messages);
	}

	forceShow() {
		// Preserve focus in the editor
		this.getChannel()?.show(true);
	}

	private createChannel(): CodeReferenceOutputChannel {
		if (this.output.value) {
			return this.output.value;
		}

		this.output.value = new CodeReferenceOutputChannel(window.createOutputChannel(citationsChannelName, 'code-referencing'));
		return this.output.value;
	}

	private getChannel(): CodeReferenceOutputChannel | undefined {
		return this.output.value;
	}

	private removeChannel() {
		this.output.value = undefined;
	}
}
