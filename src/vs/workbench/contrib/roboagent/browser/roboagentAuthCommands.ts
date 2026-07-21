/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IRoboAgentAuthMainService } from '../../../../platform/roboagentAuth/common/roboagentAuthService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';

import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';

export class SignInAction extends Action2 {
	public static readonly ID = 'roboagent.signIn';

	constructor() {
		super({
			id: SignInAction.ID,
			title: localize2('roboagent.signInTitle', "Log In to RoboAgent"),
			category: localize2('roboagent.category', "RoboAgent"),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const mainProcessService = accessor.get(IMainProcessService);
		const notificationService = accessor.get(INotificationService);

		const authService = ProxyChannel.toService<IRoboAgentAuthMainService>(mainProcessService.getChannel('roboagentAuth'));

		const session = await authService.getSession();
		if (session.isSignedIn) {
			notificationService.info('You are already signed in.');
			return;
		}

		notificationService.prompt(
			Severity.Info,
			'Opening Robotics Corner in your browser — sign in there to continue...',
			[{
				label: 'Cancel',
				run: () => {
					// Rely on the main service's 5 min timeout.
				}
			}]
		);

		try {
			await authService.signIn();
			notificationService.info('Successfully signed in to RoboAgent!');
		} catch (e: any) {
			if (e.message !== 'Sign in aborted') {
				notificationService.error(`Sign in failed: ${e.message}`);
			}
		}
	}
}

export class SignUpAction extends Action2 {
	public static readonly ID = 'roboagent.signUp';

	constructor() {
		super({
			id: SignUpAction.ID,
			title: localize2('roboagent.signUpTitle', "Sign Up for RoboAgent"),
			category: localize2('roboagent.category', "RoboAgent"),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const mainProcessService = accessor.get(IMainProcessService);
		const notificationService = accessor.get(INotificationService);

		const authService = ProxyChannel.toService<IRoboAgentAuthMainService>(mainProcessService.getChannel('roboagentAuth'));

		const session = await authService.getSession();
		if (session.isSignedIn) {
			notificationService.info('You are already signed in.');
			return;
		}

		notificationService.prompt(
			Severity.Info,
			'Opening Robotics Corner in your browser — create your account there to continue...',
			[{
				label: 'Cancel',
				run: () => {
					// Rely on the main service's 5 min timeout.
				}
			}]
		);

		try {
			await authService.signIn();
			notificationService.info('Successfully signed in to RoboAgent!');
		} catch (e: any) {
			if (e.message !== 'Sign in aborted') {
				notificationService.error(`Sign up failed: ${e.message}`);
			}
		}
	}
}

export class SignOutAction extends Action2 {
	public static readonly ID = 'roboagent.signOut';

	constructor() {
		super({
			id: SignOutAction.ID,
			title: localize2('roboagent.signOutTitle', "Sign Out of RoboAgent"),
			category: localize2('roboagent.category', "RoboAgent"),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const mainProcessService = accessor.get(IMainProcessService);
		const notificationService = accessor.get(INotificationService);

		const authService = ProxyChannel.toService<IRoboAgentAuthMainService>(mainProcessService.getChannel('roboagentAuth'));

		const session = await authService.getSession();
		if (!session.isSignedIn) {
			notificationService.info('You are not signed in.');
			return;
		}

		try {
			await authService.signOut();
			notificationService.info('Successfully signed out of RoboAgent (your browser session is unaffected).');
		} catch (e: any) {
			notificationService.error(`Sign out failed: ${e.message}`);
		}
	}
}

export class OpenDashboardAction extends Action2 {
	public static readonly ID = 'roboagent.openDashboard';

	constructor() {
		super({
			id: OpenDashboardAction.ID,
			title: localize2('roboagent.openDashboardTitle', "Go to RoboAgent Dashboard"),
			category: localize2('roboagent.category', "RoboAgent"),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		await openerService.open(URI.parse('https://www.roboticscorner.tech/roboagent/dashboard'));
	}
}

export function registerAuthActions() {
	registerAction2(SignInAction);
	registerAction2(SignUpAction);
	registerAction2(SignOutAction);
	registerAction2(OpenDashboardAction);
}
