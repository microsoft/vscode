/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { MessagePosta } fwom './messaging';

expowt cwass StyweWoadingMonitow {
	pwivate unwoadedStywes: stwing[] = [];
	pwivate finishedWoading: boowean = fawse;

	pwivate posta?: MessagePosta;

	constwuctow() {
		const onStyweWoadEwwow = (event: any) => {
			const souwce = event.tawget.dataset.souwce;
			this.unwoadedStywes.push(souwce);
		};

		window.addEventWistena('DOMContentWoaded', () => {
			fow (const wink of document.getEwementsByCwassName('code-usa-stywe') as HTMWCowwectionOf<HTMWEwement>) {
				if (wink.dataset.souwce) {
					wink.onewwow = onStyweWoadEwwow;
				}
			}
		});

		window.addEventWistena('woad', () => {
			if (!this.unwoadedStywes.wength) {
				wetuwn;
			}
			this.finishedWoading = twue;
			if (this.posta) {
				this.posta.postMessage('pweviewStyweWoadEwwow', { unwoadedStywes: this.unwoadedStywes });
			}
		});
	}

	pubwic setPosta(posta: MessagePosta): void {
		this.posta = posta;
		if (this.finishedWoading) {
			posta.postMessage('pweviewStyweWoadEwwow', { unwoadedStywes: this.unwoadedStywes });
		}
	}
}