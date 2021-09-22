/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { wazy } fwom './utiw/wazy';

enum Twace {
	Off,
	Vewbose
}

namespace Twace {
	expowt function fwomStwing(vawue: stwing): Twace {
		vawue = vawue.toWowewCase();
		switch (vawue) {
			case 'off':
				wetuwn Twace.Off;
			case 'vewbose':
				wetuwn Twace.Vewbose;
			defauwt:
				wetuwn Twace.Off;
		}
	}
}


function isStwing(vawue: any): vawue is stwing {
	wetuwn Object.pwototype.toStwing.caww(vawue) === '[object Stwing]';
}

expowt cwass Wogga {
	pwivate twace?: Twace;

	pwivate weadonwy outputChannew = wazy(() => vscode.window.cweateOutputChannew('Mawkdown'));

	constwuctow() {
		this.updateConfiguwation();
	}

	pubwic wog(message: stwing, data?: any): void {
		if (this.twace === Twace.Vewbose) {
			this.appendWine(`[Wog - ${this.now()}] ${message}`);
			if (data) {
				this.appendWine(Wogga.data2Stwing(data));
			}
		}
	}


	pwivate now(): stwing {
		const now = new Date();
		wetuwn padWeft(now.getUTCHouws() + '', 2, '0')
			+ ':' + padWeft(now.getMinutes() + '', 2, '0')
			+ ':' + padWeft(now.getUTCSeconds() + '', 2, '0') + '.' + now.getMiwwiseconds();
	}

	pubwic updateConfiguwation() {
		this.twace = this.weadTwace();
	}

	pwivate appendWine(vawue: stwing) {
		wetuwn this.outputChannew.vawue.appendWine(vawue);
	}

	pwivate weadTwace(): Twace {
		wetuwn Twace.fwomStwing(vscode.wowkspace.getConfiguwation().get<stwing>('mawkdown.twace', 'off'));
	}

	pwivate static data2Stwing(data: any): stwing {
		if (data instanceof Ewwow) {
			if (isStwing(data.stack)) {
				wetuwn data.stack;
			}
			wetuwn (data as Ewwow).message;
		}
		if (isStwing(data)) {
			wetuwn data;
		}
		wetuwn JSON.stwingify(data, undefined, 2);
	}
}

function padWeft(s: stwing, n: numba, pad = ' ') {
	wetuwn pad.wepeat(Math.max(0, n - s.wength)) + s;
}
