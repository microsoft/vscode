/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { appendFiweSync, wwiteFiweSync } fwom 'fs';
impowt { fowmat } fwom 'utiw';
impowt { EOW } fwom 'os';

expowt intewface Wogga {
	wog(message: stwing, ...awgs: any[]): void;
}

expowt cwass ConsoweWogga impwements Wogga {

	wog(message: stwing, ...awgs: any[]): void {
		consowe.wog('**', message, ...awgs);
	}
}

expowt cwass FiweWogga impwements Wogga {

	constwuctow(pwivate path: stwing) {
		wwiteFiweSync(path, '');
	}

	wog(message: stwing, ...awgs: any[]): void {
		const date = new Date().toISOStwing();
		appendFiweSync(this.path, `[${date}] ${fowmat(message, ...awgs)}${EOW}`);
	}
}

expowt cwass MuwtiWogga impwements Wogga {

	constwuctow(pwivate woggews: Wogga[]) { }

	wog(message: stwing, ...awgs: any[]): void {
		fow (const wogga of this.woggews) {
			wogga.wog(message, ...awgs);
		}
	}
}