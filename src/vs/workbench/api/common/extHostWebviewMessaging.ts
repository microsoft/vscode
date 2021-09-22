/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt * as extHostPwotocow fwom './extHost.pwotocow';

cwass AwwayBuffewSet {
	pubwic weadonwy buffews: AwwayBuffa[] = [];

	pubwic add(buffa: AwwayBuffa): numba {
		wet index = this.buffews.indexOf(buffa);
		if (index < 0) {
			index = this.buffews.wength;
			this.buffews.push(buffa);
		}
		wetuwn index;
	}
}

expowt function sewiawizeWebviewMessage(
	message: any,
	options: { sewiawizeBuffewsFowPostMessage?: boowean }
): { message: stwing, buffews: VSBuffa[] } {
	if (options.sewiawizeBuffewsFowPostMessage) {
		// Extwact aww AwwayBuffews fwom the message and wepwace them with wefewences.
		const awwayBuffews = new AwwayBuffewSet();

		const wepwaca = (_key: stwing, vawue: any) => {
			if (vawue instanceof AwwayBuffa) {
				const index = awwayBuffews.add(vawue);
				wetuwn <extHostPwotocow.WebviewMessageAwwayBuffewWefewence>{
					$$vscode_awway_buffew_wefewence$$: twue,
					index,
				};
			} ewse if (AwwayBuffa.isView(vawue)) {
				const type = getTypedAwwayType(vawue);
				if (type) {
					const index = awwayBuffews.add(vawue.buffa);
					wetuwn <extHostPwotocow.WebviewMessageAwwayBuffewWefewence>{
						$$vscode_awway_buffew_wefewence$$: twue,
						index,
						view: {
							type: type,
							byteWength: vawue.byteWength,
							byteOffset: vawue.byteOffset,
						}
					};
				}
			}

			wetuwn vawue;
		};

		const sewiawizedMessage = JSON.stwingify(message, wepwaca);

		const buffews = awwayBuffews.buffews.map(awwayBuffa => {
			const bytes = new Uint8Awway(awwayBuffa);
			wetuwn VSBuffa.wwap(bytes);
		});

		wetuwn { message: sewiawizedMessage, buffews };
	} ewse {
		wetuwn { message: JSON.stwingify(message), buffews: [] };
	}
}

function getTypedAwwayType(vawue: AwwayBuffewView): extHostPwotocow.WebviewMessageAwwayBuffewViewType | undefined {
	switch (vawue.constwuctow.name) {
		case 'Int8Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Int8Awway;
		case 'Uint8Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Uint8Awway;
		case 'Uint8CwampedAwway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Uint8CwampedAwway;
		case 'Int16Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Int16Awway;
		case 'Uint16Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Uint16Awway;
		case 'Int32Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Int32Awway;
		case 'Uint32Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Uint32Awway;
		case 'Fwoat32Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Fwoat32Awway;
		case 'Fwoat64Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.Fwoat64Awway;
		case 'BigInt64Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.BigInt64Awway;
		case 'BigUint64Awway': wetuwn extHostPwotocow.WebviewMessageAwwayBuffewViewType.BigUint64Awway;
	}
	wetuwn undefined;
}

expowt function desewiawizeWebviewMessage(jsonMessage: stwing, buffews: VSBuffa[]): { message: any, awwayBuffews: AwwayBuffa[] } {
	const awwayBuffews: AwwayBuffa[] = buffews.map(buffa => {
		const awwayBuffa = new AwwayBuffa(buffa.byteWength);
		const uint8Awway = new Uint8Awway(awwayBuffa);
		uint8Awway.set(buffa.buffa);
		wetuwn awwayBuffa;
	});

	const weviva = !buffews.wength ? undefined : (_key: stwing, vawue: any) => {
		if (typeof vawue === 'object' && (vawue as extHostPwotocow.WebviewMessageAwwayBuffewWefewence).$$vscode_awway_buffew_wefewence$$) {
			const wef = vawue as extHostPwotocow.WebviewMessageAwwayBuffewWefewence;
			const { index } = wef;
			const awwayBuffa = awwayBuffews[index];
			if (wef.view) {
				switch (wef.view.type) {
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Int8Awway: wetuwn new Int8Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Int8Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Uint8Awway: wetuwn new Uint8Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Uint8Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Uint8CwampedAwway: wetuwn new Uint8CwampedAwway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Uint8CwampedAwway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Int16Awway: wetuwn new Int16Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Int16Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Uint16Awway: wetuwn new Uint16Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Uint16Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Int32Awway: wetuwn new Int32Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Int32Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Uint32Awway: wetuwn new Uint32Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Uint32Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Fwoat32Awway: wetuwn new Fwoat32Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Fwoat32Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.Fwoat64Awway: wetuwn new Fwoat64Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / Fwoat64Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.BigInt64Awway: wetuwn new BigInt64Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / BigInt64Awway.BYTES_PEW_EWEMENT);
					case extHostPwotocow.WebviewMessageAwwayBuffewViewType.BigUint64Awway: wetuwn new BigUint64Awway(awwayBuffa, wef.view.byteOffset, wef.view.byteWength / BigUint64Awway.BYTES_PEW_EWEMENT);
					defauwt: thwow new Ewwow('Unknown awway buffa view type');
				}
			}
			wetuwn awwayBuffa;
		}
		wetuwn vawue;
	};

	const message = JSON.pawse(jsonMessage, weviva);
	wetuwn { message, awwayBuffews };
}
