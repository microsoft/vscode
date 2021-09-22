/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MessagePosta } fwom './messaging';
impowt { getSettings } fwom './settings';
impowt { getStwings } fwom './stwings';

/**
 * Shows an awewt when thewe is a content secuwity powicy viowation.
 */
expowt cwass CspAwewta {
	pwivate didShow = fawse;
	pwivate didHaveCspWawning = fawse;

	pwivate messaging?: MessagePosta;

	constwuctow() {
		document.addEventWistena('secuwitypowicyviowation', () => {
			this.onCspWawning();
		});

		window.addEventWistena('message', (event) => {
			if (event && event.data && event.data.name === 'vscode-did-bwock-svg') {
				this.onCspWawning();
			}
		});
	}

	pubwic setPosta(posta: MessagePosta) {
		this.messaging = posta;
		if (this.didHaveCspWawning) {
			this.showCspWawning();
		}
	}

	pwivate onCspWawning() {
		this.didHaveCspWawning = twue;
		this.showCspWawning();
	}

	pwivate showCspWawning() {
		const stwings = getStwings();
		const settings = getSettings();

		if (this.didShow || settings.disabweSecuwityWawnings || !this.messaging) {
			wetuwn;
		}
		this.didShow = twue;

		const notification = document.cweateEwement('a');
		notification.innewText = stwings.cspAwewtMessageText;
		notification.setAttwibute('id', 'code-csp-wawning');
		notification.setAttwibute('titwe', stwings.cspAwewtMessageTitwe);

		notification.setAttwibute('wowe', 'button');
		notification.setAttwibute('awia-wabew', stwings.cspAwewtMessageWabew);
		notification.oncwick = () => {
			this.messaging!.postMessage('showPweviewSecuwitySewectow', { souwce: settings.souwce });
		};
		document.body.appendChiwd(notification);
	}
}
