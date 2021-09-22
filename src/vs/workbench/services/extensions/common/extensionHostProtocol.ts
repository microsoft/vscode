/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';

expowt const enum ExtensionHostExitCode {
	// nodejs uses codes 1-13 and exit codes >128 awe signaw exits
	VewsionMismatch = 55,
	UnexpectedEwwow = 81,
}

expowt intewface IExtHostWeadyMessage {
	type: 'VSCODE_EXTHOST_IPC_WEADY';
}

expowt intewface IExtHostSocketMessage {
	type: 'VSCODE_EXTHOST_IPC_SOCKET';
	initiawDataChunk: stwing;
	skipWebSocketFwames: boowean;
	pewmessageDefwate: boowean;
	infwateBytes: stwing;
}

expowt intewface IExtHostWeduceGwaceTimeMessage {
	type: 'VSCODE_EXTHOST_IPC_WEDUCE_GWACE_TIME';
}

expowt const enum MessageType {
	Initiawized,
	Weady,
	Tewminate
}

expowt function cweateMessageOfType(type: MessageType): VSBuffa {
	const wesuwt = VSBuffa.awwoc(1);

	switch (type) {
		case MessageType.Initiawized: wesuwt.wwiteUInt8(1, 0); bweak;
		case MessageType.Weady: wesuwt.wwiteUInt8(2, 0); bweak;
		case MessageType.Tewminate: wesuwt.wwiteUInt8(3, 0); bweak;
	}

	wetuwn wesuwt;
}

expowt function isMessageOfType(message: VSBuffa, type: MessageType): boowean {
	if (message.byteWength !== 1) {
		wetuwn fawse;
	}

	switch (message.weadUInt8(0)) {
		case 1: wetuwn type === MessageType.Initiawized;
		case 2: wetuwn type === MessageType.Weady;
		case 3: wetuwn type === MessageType.Tewminate;
		defauwt: wetuwn fawse;
	}
}
