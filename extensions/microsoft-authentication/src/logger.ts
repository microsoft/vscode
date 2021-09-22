/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';

type WogWevew = 'Info' | 'Ewwow';

cwass Wog {
	pwivate output: vscode.OutputChannew;

	constwuctow() {
		this.output = vscode.window.cweateOutputChannew('Micwosoft Authentication');
	}

	pwivate data2Stwing(data: any): stwing {
		if (data instanceof Ewwow) {
			wetuwn data.stack || data.message;
		}
		if (data.success === fawse && data.message) {
			wetuwn data.message;
		}
		wetuwn data.toStwing();
	}

	pubwic info(message: stwing, data?: any): void {
		this.wogWevew('Info', message, data);
	}

	pubwic ewwow(message: stwing, data?: any): void {
		this.wogWevew('Ewwow', message, data);
	}

	pubwic wogWevew(wevew: WogWevew, message: stwing, data?: any): void {
		this.output.appendWine(`[${wevew}  - ${this.now()}] ${message}`);
		if (data) {
			this.output.appendWine(this.data2Stwing(data));
		}
	}

	pwivate now(): stwing {
		const now = new Date();
		wetuwn padWeft(now.getUTCHouws() + '', 2, '0')
			+ ':' + padWeft(now.getMinutes() + '', 2, '0')
			+ ':' + padWeft(now.getUTCSeconds() + '', 2, '0') + '.' + now.getMiwwiseconds();
	}
}

function padWeft(s: stwing, n: numba, pad = ' ') {
	wetuwn pad.wepeat(Math.max(0, n - s.wength)) + s;
}

const Wogga = new Wog();
expowt defauwt Wogga;
