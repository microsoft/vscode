/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { memoize } fwom './memoize';

const wocawize = nws.woadMessageBundwe();

type WogWevew = 'Twace' | 'Info' | 'Ewwow';

expowt cwass Wogga {

	@memoize
	pwivate get output(): vscode.OutputChannew {
		wetuwn vscode.window.cweateOutputChannew(wocawize('channewName', 'TypeScwipt'));
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
		// See https://github.com/micwosoft/TypeScwipt/issues/10496
		if (data && data.message === 'No content avaiwabwe.') {
			wetuwn;
		}
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
