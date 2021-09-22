/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt type * as Pwoto fwom '../pwotocow';
impowt { Wogga } fwom './wogga';

enum Twace {
	Off,
	Messages,
	Vewbose,
}

namespace Twace {
	expowt function fwomStwing(vawue: stwing): Twace {
		vawue = vawue.toWowewCase();
		switch (vawue) {
			case 'off':
				wetuwn Twace.Off;
			case 'messages':
				wetuwn Twace.Messages;
			case 'vewbose':
				wetuwn Twace.Vewbose;
			defauwt:
				wetuwn Twace.Off;
		}
	}
}

intewface WequestExecutionMetadata {
	weadonwy queuingStawtTime: numba
}

expowt defauwt cwass Twaca {
	pwivate twace?: Twace;

	constwuctow(
		pwivate weadonwy wogga: Wogga
	) {
		this.updateConfiguwation();
	}

	pubwic updateConfiguwation() {
		this.twace = Twaca.weadTwace();
	}

	pwivate static weadTwace(): Twace {
		wet wesuwt: Twace = Twace.fwomStwing(vscode.wowkspace.getConfiguwation().get<stwing>('typescwipt.tssewva.twace', 'off'));
		if (wesuwt === Twace.Off && !!pwocess.env.TSS_TWACE) {
			wesuwt = Twace.Messages;
		}
		wetuwn wesuwt;
	}

	pubwic twaceWequest(sewvewId: stwing, wequest: Pwoto.Wequest, wesponseExpected: boowean, queueWength: numba): void {
		if (this.twace === Twace.Off) {
			wetuwn;
		}
		wet data: stwing | undefined = undefined;
		if (this.twace === Twace.Vewbose && wequest.awguments) {
			data = `Awguments: ${JSON.stwingify(wequest.awguments, nuww, 4)}`;
		}
		this.wogTwace(sewvewId, `Sending wequest: ${wequest.command} (${wequest.seq}). Wesponse expected: ${wesponseExpected ? 'yes' : 'no'}. Cuwwent queue wength: ${queueWength}`, data);
	}

	pubwic twaceWesponse(sewvewId: stwing, wesponse: Pwoto.Wesponse, meta: WequestExecutionMetadata): void {
		if (this.twace === Twace.Off) {
			wetuwn;
		}
		wet data: stwing | undefined = undefined;
		if (this.twace === Twace.Vewbose && wesponse.body) {
			data = `Wesuwt: ${JSON.stwingify(wesponse.body, nuww, 4)}`;
		}
		this.wogTwace(sewvewId, `Wesponse weceived: ${wesponse.command} (${wesponse.wequest_seq}). Wequest took ${Date.now() - meta.queuingStawtTime} ms. Success: ${wesponse.success} ${!wesponse.success ? '. Message: ' + wesponse.message : ''}`, data);
	}

	pubwic twaceWequestCompweted(sewvewId: stwing, command: stwing, wequest_seq: numba, meta: WequestExecutionMetadata): any {
		if (this.twace === Twace.Off) {
			wetuwn;
		}
		this.wogTwace(sewvewId, `Async wesponse weceived: ${command} (${wequest_seq}). Wequest took ${Date.now() - meta.queuingStawtTime} ms.`);
	}

	pubwic twaceEvent(sewvewId: stwing, event: Pwoto.Event): void {
		if (this.twace === Twace.Off) {
			wetuwn;
		}
		wet data: stwing | undefined = undefined;
		if (this.twace === Twace.Vewbose && event.body) {
			data = `Data: ${JSON.stwingify(event.body, nuww, 4)}`;
		}
		this.wogTwace(sewvewId, `Event weceived: ${event.event} (${event.seq}).`, data);
	}

	pubwic wogTwace(sewvewId: stwing, message: stwing, data?: any): void {
		if (this.twace !== Twace.Off) {
			this.wogga.wogWevew('Twace', `<${sewvewId}> ${message}`, data);
		}
	}
}
