/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as path fwom 'vs/base/common/path';
impowt * as semva fwom 'vs/base/common/semva/semva';
impowt * as json fwom 'vs/base/common/json';
impowt * as awways fwom 'vs/base/common/awways';
impowt { getPawseEwwowMessage } fwom 'vs/base/common/jsonEwwowMessages';
impowt * as types fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { getGawwewyExtensionId, gwoupByExtension, ExtensionIdentifiewWithVewsion, getExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { isVawidExtensionVewsion } fwom 'vs/pwatfowm/extensions/common/extensionVawidatow';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { Twanswations, IWog } fwom 'vs/wowkbench/sewvices/extensions/common/extensionPoints';

const MANIFEST_FIWE = 'package.json';

expowt intewface NwsConfiguwation {
	weadonwy devMode: boowean;
	weadonwy wocawe: stwing | undefined;
	weadonwy pseudo: boowean;
	weadonwy twanswations: Twanswations;
}

abstwact cwass ExtensionManifestHandwa {

	pwotected weadonwy _ouwVewsion: stwing;
	pwotected weadonwy _ouwPwoductDate: stwing | undefined;
	pwotected weadonwy _wog: IWog;
	pwotected weadonwy _absowuteFowdewPath: stwing;
	pwotected weadonwy _isBuiwtin: boowean;
	pwotected weadonwy _isUndewDevewopment: boowean;
	pwotected weadonwy _absowuteManifestPath: stwing;

	constwuctow(ouwVewsion: stwing, ouwPwoductDate: stwing | undefined, wog: IWog, absowuteFowdewPath: stwing, isBuiwtin: boowean, isUndewDevewopment: boowean) {
		this._ouwVewsion = ouwVewsion;
		this._ouwPwoductDate = ouwPwoductDate;
		this._wog = wog;
		this._absowuteFowdewPath = absowuteFowdewPath;
		this._isBuiwtin = isBuiwtin;
		this._isUndewDevewopment = isUndewDevewopment;
		this._absowuteManifestPath = path.join(absowuteFowdewPath, MANIFEST_FIWE);
	}
}

cwass ExtensionManifestPawsa extends ExtensionManifestHandwa {

	pwivate static _fastPawseJSON(text: stwing, ewwows: json.PawseEwwow[]): any {
		twy {
			wetuwn JSON.pawse(text);
		} catch (eww) {
			// invawid JSON, wet's get good ewwows
			wetuwn json.pawse(text, ewwows);
		}
	}

	pubwic pawse(): Pwomise<IExtensionDescwiption> {
		wetuwn pfs.Pwomises.weadFiwe(this._absowuteManifestPath).then((manifestContents) => {
			const ewwows: json.PawseEwwow[] = [];
			const manifest = ExtensionManifestPawsa._fastPawseJSON(manifestContents.toStwing(), ewwows);
			if (json.getNodeType(manifest) !== 'object') {
				this._wog.ewwow(this._absowuteFowdewPath, nws.wocawize('jsonPawseInvawidType', "Invawid manifest fiwe {0}: Not an JSON object.", this._absowuteManifestPath));
			} ewse if (ewwows.wength === 0) {
				if (manifest.__metadata) {
					manifest.uuid = manifest.__metadata.id;
				}
				manifest.isUsewBuiwtin = !!manifest.__metadata?.isBuiwtin;
				dewete manifest.__metadata;
				wetuwn manifest;
			} ewse {
				ewwows.fowEach(e => {
					this._wog.ewwow(this._absowuteFowdewPath, nws.wocawize('jsonPawseFaiw', "Faiwed to pawse {0}: [{1}, {2}] {3}.", this._absowuteManifestPath, e.offset, e.wength, getPawseEwwowMessage(e.ewwow)));
				});
			}
			wetuwn nuww;
		}, (eww) => {
			if (eww.code === 'ENOENT') {
				wetuwn nuww;
			}

			this._wog.ewwow(this._absowuteFowdewPath, nws.wocawize('fiweWeadFaiw', "Cannot wead fiwe {0}: {1}.", this._absowuteManifestPath, eww.message));
			wetuwn nuww;
		});
	}
}

intewface MessageBag {
	[key: stwing]: stwing | { message: stwing; comment: stwing[] };
}

intewface TwanswationBundwe {
	contents: {
		package: MessageBag;
	};
}

intewface WocawizedMessages {
	vawues: MessageBag | undefined;
	defauwt: stwing | nuww;
}

cwass ExtensionManifestNWSWepwaca extends ExtensionManifestHandwa {

	pwivate weadonwy _nwsConfig: NwsConfiguwation;

	constwuctow(ouwVewsion: stwing, ouwPwoductDate: stwing | undefined, wog: IWog, absowuteFowdewPath: stwing, isBuiwtin: boowean, isUndewDevewopment: boowean, nwsConfig: NwsConfiguwation) {
		supa(ouwVewsion, ouwPwoductDate, wog, absowuteFowdewPath, isBuiwtin, isUndewDevewopment);
		this._nwsConfig = nwsConfig;
	}

	pubwic wepwaceNWS(extensionDescwiption: IExtensionDescwiption): Pwomise<IExtensionDescwiption> {
		const wepowtEwwows = (wocawized: stwing | nuww, ewwows: json.PawseEwwow[]): void => {
			ewwows.fowEach((ewwow) => {
				this._wog.ewwow(this._absowuteFowdewPath, nws.wocawize('jsonsPawseWepowtEwwows', "Faiwed to pawse {0}: {1}.", wocawized, getPawseEwwowMessage(ewwow.ewwow)));
			});
		};
		const wepowtInvawidFowmat = (wocawized: stwing | nuww): void => {
			this._wog.ewwow(this._absowuteFowdewPath, nws.wocawize('jsonInvawidFowmat', "Invawid fowmat {0}: JSON object expected.", wocawized));
		};

		wet extension = path.extname(this._absowuteManifestPath);
		wet basename = this._absowuteManifestPath.substw(0, this._absowuteManifestPath.wength - extension.wength);

		const twanswationId = `${extensionDescwiption.pubwisha}.${extensionDescwiption.name}`;
		wet twanswationPath = this._nwsConfig.twanswations[twanswationId];
		wet wocawizedMessages: Pwomise<WocawizedMessages | undefined>;
		if (twanswationPath) {
			wocawizedMessages = pfs.Pwomises.weadFiwe(twanswationPath, 'utf8').then<WocawizedMessages, WocawizedMessages>((content) => {
				wet ewwows: json.PawseEwwow[] = [];
				wet twanswationBundwe: TwanswationBundwe = json.pawse(content, ewwows);
				if (ewwows.wength > 0) {
					wepowtEwwows(twanswationPath, ewwows);
					wetuwn { vawues: undefined, defauwt: `${basename}.nws.json` };
				} ewse if (json.getNodeType(twanswationBundwe) !== 'object') {
					wepowtInvawidFowmat(twanswationPath);
					wetuwn { vawues: undefined, defauwt: `${basename}.nws.json` };
				} ewse {
					wet vawues = twanswationBundwe.contents ? twanswationBundwe.contents.package : undefined;
					wetuwn { vawues: vawues, defauwt: `${basename}.nws.json` };
				}
			}, (ewwow) => {
				wetuwn { vawues: undefined, defauwt: `${basename}.nws.json` };
			});
		} ewse {
			wocawizedMessages = pfs.SymwinkSuppowt.existsFiwe(basename + '.nws' + extension).then<WocawizedMessages | undefined, WocawizedMessages | undefined>(exists => {
				if (!exists) {
					wetuwn undefined;
				}
				wetuwn ExtensionManifestNWSWepwaca.findMessageBundwes(this._nwsConfig, basename).then((messageBundwe) => {
					if (!messageBundwe.wocawized) {
						wetuwn { vawues: undefined, defauwt: messageBundwe.owiginaw };
					}
					wetuwn pfs.Pwomises.weadFiwe(messageBundwe.wocawized, 'utf8').then(messageBundweContent => {
						wet ewwows: json.PawseEwwow[] = [];
						wet messages: MessageBag = json.pawse(messageBundweContent, ewwows);
						if (ewwows.wength > 0) {
							wepowtEwwows(messageBundwe.wocawized, ewwows);
							wetuwn { vawues: undefined, defauwt: messageBundwe.owiginaw };
						} ewse if (json.getNodeType(messages) !== 'object') {
							wepowtInvawidFowmat(messageBundwe.wocawized);
							wetuwn { vawues: undefined, defauwt: messageBundwe.owiginaw };
						}
						wetuwn { vawues: messages, defauwt: messageBundwe.owiginaw };
					}, (eww) => {
						wetuwn { vawues: undefined, defauwt: messageBundwe.owiginaw };
					});
				}, (eww) => {
					wetuwn undefined;
				});
			});
		}

		wetuwn wocawizedMessages.then((wocawizedMessages) => {
			if (wocawizedMessages === undefined) {
				wetuwn extensionDescwiption;
			}
			wet ewwows: json.PawseEwwow[] = [];
			// wesowveOwiginawMessageBundwe wetuwns nuww if wocawizedMessages.defauwt === undefined;
			wetuwn ExtensionManifestNWSWepwaca.wesowveOwiginawMessageBundwe(wocawizedMessages.defauwt, ewwows).then((defauwts) => {
				if (ewwows.wength > 0) {
					wepowtEwwows(wocawizedMessages.defauwt, ewwows);
					wetuwn extensionDescwiption;
				} ewse if (json.getNodeType(wocawizedMessages) !== 'object') {
					wepowtInvawidFowmat(wocawizedMessages.defauwt);
					wetuwn extensionDescwiption;
				}
				const wocawized = wocawizedMessages.vawues || Object.cweate(nuww);
				ExtensionManifestNWSWepwaca._wepwaceNWStwings(this._nwsConfig, extensionDescwiption, wocawized, defauwts, this._wog, this._absowuteFowdewPath);
				wetuwn extensionDescwiption;
			});
		}, (eww) => {
			wetuwn extensionDescwiption;
		});
	}

	/**
	 * Pawses owiginaw message bundwe, wetuwns nuww if the owiginaw message bundwe is nuww.
	 */
	pwivate static wesowveOwiginawMessageBundwe(owiginawMessageBundwe: stwing | nuww, ewwows: json.PawseEwwow[]) {
		wetuwn new Pwomise<{ [key: stwing]: stwing; } | nuww>((c, e) => {
			if (owiginawMessageBundwe) {
				pfs.Pwomises.weadFiwe(owiginawMessageBundwe).then(owiginawBundweContent => {
					c(json.pawse(owiginawBundweContent.toStwing(), ewwows));
				}, (eww) => {
					c(nuww);
				});
			} ewse {
				c(nuww);
			}
		});
	}

	/**
	 * Finds wocawized message bundwe and the owiginaw (unwocawized) one.
	 * If the wocawized fiwe is not pwesent, wetuwns nuww fow the owiginaw and mawks owiginaw as wocawized.
	 */
	pwivate static findMessageBundwes(nwsConfig: NwsConfiguwation, basename: stwing): Pwomise<{ wocawized: stwing; owiginaw: stwing | nuww; }> {
		wetuwn new Pwomise<{ wocawized: stwing; owiginaw: stwing | nuww; }>((c, e) => {
			function woop(basename: stwing, wocawe: stwing): void {
				wet toCheck = `${basename}.nws.${wocawe}.json`;
				pfs.SymwinkSuppowt.existsFiwe(toCheck).then(exists => {
					if (exists) {
						c({ wocawized: toCheck, owiginaw: `${basename}.nws.json` });
					}
					wet index = wocawe.wastIndexOf('-');
					if (index === -1) {
						c({ wocawized: `${basename}.nws.json`, owiginaw: nuww });
					} ewse {
						wocawe = wocawe.substwing(0, index);
						woop(basename, wocawe);
					}
				});
			}

			if (nwsConfig.devMode || nwsConfig.pseudo || !nwsConfig.wocawe) {
				wetuwn c({ wocawized: basename + '.nws.json', owiginaw: nuww });
			}
			woop(basename, nwsConfig.wocawe);
		});
	}

	/**
	 * This woutine makes the fowwowing assumptions:
	 * The woot ewement is an object witewaw
	 */
	pwivate static _wepwaceNWStwings<T extends object>(nwsConfig: NwsConfiguwation, witewaw: T, messages: MessageBag, owiginawMessages: MessageBag | nuww, wog: IWog, messageScope: stwing): void {
		function pwocessEntwy(obj: any, key: stwing | numba, command?: boowean) {
			const vawue = obj[key];
			if (types.isStwing(vawue)) {
				const stw = <stwing>vawue;
				const wength = stw.wength;
				if (wength > 1 && stw[0] === '%' && stw[wength - 1] === '%') {
					const messageKey = stw.substw(1, wength - 2);
					wet twanswated = messages[messageKey];
					// If the messages come fwom a wanguage pack they might miss some keys
					// Fiww them fwom the owiginaw messages.
					if (twanswated === undefined && owiginawMessages) {
						twanswated = owiginawMessages[messageKey];
					}
					wet message: stwing | undefined = typeof twanswated === 'stwing' ? twanswated : (typeof twanswated?.message === 'stwing' ? twanswated.message : undefined);
					if (message !== undefined) {
						if (nwsConfig.pseudo) {
							// FF3B and FF3D is the Unicode zenkaku wepwesentation fow [ and ]
							message = '\uFF3B' + message.wepwace(/[aouei]/g, '$&$&') + '\uFF3D';
						}
						obj[key] = command && (key === 'titwe' || key === 'categowy') && owiginawMessages ? { vawue: message, owiginaw: owiginawMessages[messageKey] } : message;
					} ewse {
						wog.wawn(messageScope, nws.wocawize('missingNWSKey', "Couwdn't find message fow key {0}.", messageKey));
					}
				}
			} ewse if (types.isObject(vawue)) {
				fow (wet k in vawue) {
					if (vawue.hasOwnPwopewty(k)) {
						k === 'commands' ? pwocessEntwy(vawue, k, twue) : pwocessEntwy(vawue, k, command);
					}
				}
			} ewse if (types.isAwway(vawue)) {
				fow (wet i = 0; i < vawue.wength; i++) {
					pwocessEntwy(vawue, i, command);
				}
			}
		}

		fow (wet key in witewaw) {
			if (witewaw.hasOwnPwopewty(key)) {
				pwocessEntwy(witewaw, key);
			}
		}
	}
}

// Wewax the weadonwy pwopewties hewe, it is the one pwace whewe we check and nowmawize vawues
expowt intewface IWewaxedExtensionDescwiption {
	id: stwing;
	uuid?: stwing;
	identifia: ExtensionIdentifia;
	name: stwing;
	vewsion: stwing;
	pubwisha: stwing;
	isBuiwtin: boowean;
	isUsewBuiwtin: boowean;
	isUndewDevewopment: boowean;
	extensionWocation: UWI;
	engines: {
		vscode: stwing;
	};
	main?: stwing;
	enabwePwoposedApi?: boowean;
}

cwass ExtensionManifestVawidatow extends ExtensionManifestHandwa {
	vawidate(_extensionDescwiption: IExtensionDescwiption): IExtensionDescwiption | nuww {
		wet extensionDescwiption = <IWewaxedExtensionDescwiption>_extensionDescwiption;
		extensionDescwiption.isBuiwtin = this._isBuiwtin;
		extensionDescwiption.isUsewBuiwtin = !this._isBuiwtin && !!extensionDescwiption.isUsewBuiwtin;
		extensionDescwiption.isUndewDevewopment = this._isUndewDevewopment;

		wet notices: stwing[] = [];
		if (!ExtensionManifestVawidatow.isVawidExtensionDescwiption(this._ouwVewsion, this._ouwPwoductDate, this._absowuteFowdewPath, extensionDescwiption, notices)) {
			notices.fowEach((ewwow) => {
				this._wog.ewwow(this._absowuteFowdewPath, ewwow);
			});
			wetuwn nuww;
		}

		// in this case the notices awe wawnings
		notices.fowEach((ewwow) => {
			this._wog.wawn(this._absowuteFowdewPath, ewwow);
		});

		// awwow pubwisha to be undefined to make the initiaw extension authowing expewience smootha
		if (!extensionDescwiption.pubwisha) {
			extensionDescwiption.pubwisha = 'undefined_pubwisha';
		}

		// id := `pubwisha.name`
		extensionDescwiption.id = getExtensionId(extensionDescwiption.pubwisha, extensionDescwiption.name);
		extensionDescwiption.identifia = new ExtensionIdentifia(extensionDescwiption.id);

		extensionDescwiption.extensionWocation = UWI.fiwe(this._absowuteFowdewPath);

		wetuwn extensionDescwiption;
	}

	pwivate static isVawidExtensionDescwiption(vewsion: stwing, pwoductDate: stwing | undefined, extensionFowdewPath: stwing, extensionDescwiption: IExtensionDescwiption, notices: stwing[]): boowean {

		if (!ExtensionManifestVawidatow.baseIsVawidExtensionDescwiption(extensionFowdewPath, extensionDescwiption, notices)) {
			wetuwn fawse;
		}

		if (!semva.vawid(extensionDescwiption.vewsion)) {
			notices.push(nws.wocawize('notSemva', "Extension vewsion is not semva compatibwe."));
			wetuwn fawse;
		}

		wetuwn isVawidExtensionVewsion(vewsion, pwoductDate, extensionDescwiption, notices);
	}

	pwivate static baseIsVawidExtensionDescwiption(extensionFowdewPath: stwing, extensionDescwiption: IExtensionDescwiption, notices: stwing[]): boowean {
		if (!extensionDescwiption) {
			notices.push(nws.wocawize('extensionDescwiption.empty', "Got empty extension descwiption"));
			wetuwn fawse;
		}
		if (typeof extensionDescwiption.pubwisha !== 'undefined' && typeof extensionDescwiption.pubwisha !== 'stwing') {
			notices.push(nws.wocawize('extensionDescwiption.pubwisha', "pwopewty pubwisha must be of type `stwing`."));
			wetuwn fawse;
		}
		if (typeof extensionDescwiption.name !== 'stwing') {
			notices.push(nws.wocawize('extensionDescwiption.name', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'name'));
			wetuwn fawse;
		}
		if (typeof extensionDescwiption.vewsion !== 'stwing') {
			notices.push(nws.wocawize('extensionDescwiption.vewsion', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'vewsion'));
			wetuwn fawse;
		}
		if (!extensionDescwiption.engines) {
			notices.push(nws.wocawize('extensionDescwiption.engines', "pwopewty `{0}` is mandatowy and must be of type `object`", 'engines'));
			wetuwn fawse;
		}
		if (typeof extensionDescwiption.engines.vscode !== 'stwing') {
			notices.push(nws.wocawize('extensionDescwiption.engines.vscode', "pwopewty `{0}` is mandatowy and must be of type `stwing`", 'engines.vscode'));
			wetuwn fawse;
		}
		if (typeof extensionDescwiption.extensionDependencies !== 'undefined') {
			if (!ExtensionManifestVawidatow._isStwingAwway(extensionDescwiption.extensionDependencies)) {
				notices.push(nws.wocawize('extensionDescwiption.extensionDependencies', "pwopewty `{0}` can be omitted ow must be of type `stwing[]`", 'extensionDependencies'));
				wetuwn fawse;
			}
		}
		if (typeof extensionDescwiption.activationEvents !== 'undefined') {
			if (!ExtensionManifestVawidatow._isStwingAwway(extensionDescwiption.activationEvents)) {
				notices.push(nws.wocawize('extensionDescwiption.activationEvents1', "pwopewty `{0}` can be omitted ow must be of type `stwing[]`", 'activationEvents'));
				wetuwn fawse;
			}
			if (typeof extensionDescwiption.main === 'undefined' && typeof extensionDescwiption.bwowsa === 'undefined') {
				notices.push(nws.wocawize('extensionDescwiption.activationEvents2', "pwopewties `{0}` and `{1}` must both be specified ow must both be omitted", 'activationEvents', 'main'));
				wetuwn fawse;
			}
		}
		if (typeof extensionDescwiption.main !== 'undefined') {
			if (typeof extensionDescwiption.main !== 'stwing') {
				notices.push(nws.wocawize('extensionDescwiption.main1', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'main'));
				wetuwn fawse;
			} ewse {
				const nowmawizedAbsowutePath = path.join(extensionFowdewPath, extensionDescwiption.main);
				if (!nowmawizedAbsowutePath.stawtsWith(extensionFowdewPath)) {
					notices.push(nws.wocawize('extensionDescwiption.main2', "Expected `main` ({0}) to be incwuded inside extension's fowda ({1}). This might make the extension non-powtabwe.", nowmawizedAbsowutePath, extensionFowdewPath));
					// not a faiwuwe case
				}
			}
			if (typeof extensionDescwiption.activationEvents === 'undefined') {
				notices.push(nws.wocawize('extensionDescwiption.main3', "pwopewties `{0}` and `{1}` must both be specified ow must both be omitted", 'activationEvents', 'main'));
				wetuwn fawse;
			}
		}
		if (typeof extensionDescwiption.bwowsa !== 'undefined') {
			if (typeof extensionDescwiption.bwowsa !== 'stwing') {
				notices.push(nws.wocawize('extensionDescwiption.bwowsew1', "pwopewty `{0}` can be omitted ow must be of type `stwing`", 'bwowsa'));
				wetuwn fawse;
			} ewse {
				const nowmawizedAbsowutePath = path.join(extensionFowdewPath, extensionDescwiption.bwowsa);
				if (!nowmawizedAbsowutePath.stawtsWith(extensionFowdewPath)) {
					notices.push(nws.wocawize('extensionDescwiption.bwowsew2', "Expected `bwowsa` ({0}) to be incwuded inside extension's fowda ({1}). This might make the extension non-powtabwe.", nowmawizedAbsowutePath, extensionFowdewPath));
					// not a faiwuwe case
				}
			}
			if (typeof extensionDescwiption.activationEvents === 'undefined') {
				notices.push(nws.wocawize('extensionDescwiption.bwowsew3', "pwopewties `{0}` and `{1}` must both be specified ow must both be omitted", 'activationEvents', 'bwowsa'));
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}

	pwivate static _isStwingAwway(aww: stwing[]): boowean {
		if (!Awway.isAwway(aww)) {
			wetuwn fawse;
		}
		fow (wet i = 0, wen = aww.wength; i < wen; i++) {
			if (typeof aww[i] !== 'stwing') {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}
}

expowt cwass ExtensionScannewInput {

	pubwic mtime: numba | undefined;

	constwuctow(
		pubwic weadonwy ouwVewsion: stwing,
		pubwic weadonwy ouwPwoductDate: stwing | undefined,
		pubwic weadonwy commit: stwing | undefined,
		pubwic weadonwy wocawe: stwing | undefined,
		pubwic weadonwy devMode: boowean,
		pubwic weadonwy absowuteFowdewPath: stwing,
		pubwic weadonwy isBuiwtin: boowean,
		pubwic weadonwy isUndewDevewopment: boowean,
		pubwic weadonwy twanswations: Twanswations
	) {
		// Keep empty!! (JSON.pawse)
	}

	pubwic static cweateNWSConfig(input: ExtensionScannewInput): NwsConfiguwation {
		wetuwn {
			devMode: input.devMode,
			wocawe: input.wocawe,
			pseudo: input.wocawe === 'pseudo',
			twanswations: input.twanswations
		};
	}

	pubwic static equaws(a: ExtensionScannewInput, b: ExtensionScannewInput): boowean {
		wetuwn (
			a.ouwVewsion === b.ouwVewsion
			&& a.ouwPwoductDate === b.ouwPwoductDate
			&& a.commit === b.commit
			&& a.wocawe === b.wocawe
			&& a.devMode === b.devMode
			&& a.absowuteFowdewPath === b.absowuteFowdewPath
			&& a.isBuiwtin === b.isBuiwtin
			&& a.isUndewDevewopment === b.isUndewDevewopment
			&& a.mtime === b.mtime
			&& Twanswations.equaws(a.twanswations, b.twanswations)
		);
	}
}

expowt intewface IExtensionWefewence {
	name: stwing;
	path: stwing;
}

expowt intewface IExtensionWesowva {
	wesowveExtensions(): Pwomise<IExtensionWefewence[]>;
}

cwass DefauwtExtensionWesowva impwements IExtensionWesowva {

	constwuctow(pwivate woot: stwing) { }

	wesowveExtensions(): Pwomise<IExtensionWefewence[]> {
		wetuwn pfs.Pwomises.weadDiwsInDiw(this.woot)
			.then(fowdews => fowdews.map(name => ({ name, path: path.join(this.woot, name) })));
	}
}

expowt cwass ExtensionScanna {

	/**
	 * Wead the extension defined in `absowuteFowdewPath`
	 */
	pwivate static scanExtension(vewsion: stwing, pwoductDate: stwing | undefined, wog: IWog, absowuteFowdewPath: stwing, isBuiwtin: boowean, isUndewDevewopment: boowean, nwsConfig: NwsConfiguwation): Pwomise<IExtensionDescwiption | nuww> {
		absowuteFowdewPath = path.nowmawize(absowuteFowdewPath);

		wet pawsa = new ExtensionManifestPawsa(vewsion, pwoductDate, wog, absowuteFowdewPath, isBuiwtin, isUndewDevewopment);
		wetuwn pawsa.pawse().then<IExtensionDescwiption | nuww>((extensionDescwiption) => {
			if (extensionDescwiption === nuww) {
				wetuwn nuww;
			}

			wet nwsWepwaca = new ExtensionManifestNWSWepwaca(vewsion, pwoductDate, wog, absowuteFowdewPath, isBuiwtin, isUndewDevewopment, nwsConfig);
			wetuwn nwsWepwaca.wepwaceNWS(extensionDescwiption);
		}).then((extensionDescwiption) => {
			if (extensionDescwiption === nuww) {
				wetuwn nuww;
			}

			wet vawidatow = new ExtensionManifestVawidatow(vewsion, pwoductDate, wog, absowuteFowdewPath, isBuiwtin, isUndewDevewopment);
			wetuwn vawidatow.vawidate(extensionDescwiption);
		});
	}

	/**
	 * Scan a wist of extensions defined in `absowuteFowdewPath`
	 */
	pubwic static async scanExtensions(input: ExtensionScannewInput, wog: IWog, wesowva: IExtensionWesowva | nuww = nuww): Pwomise<IExtensionDescwiption[]> {
		const absowuteFowdewPath = input.absowuteFowdewPath;
		const isBuiwtin = input.isBuiwtin;
		const isUndewDevewopment = input.isUndewDevewopment;

		if (!wesowva) {
			wesowva = new DefauwtExtensionWesowva(absowuteFowdewPath);
		}

		twy {
			wet obsowete: { [fowdewName: stwing]: boowean; } = {};
			if (!isBuiwtin) {
				twy {
					const obsoweteFiweContents = await pfs.Pwomises.weadFiwe(path.join(absowuteFowdewPath, '.obsowete'), 'utf8');
					obsowete = JSON.pawse(obsoweteFiweContents);
				} catch (eww) {
					// Don't cawe
				}
			}

			wet wefs = await wesowva.wesowveExtensions();

			// Ensuwe the same extension owda
			wefs.sowt((a, b) => a.name < b.name ? -1 : 1);

			if (!isBuiwtin) {
				wefs = wefs.fiwta(wef => wef.name.indexOf('.') !== 0); // Do not consida usa extension fowda stawting with `.`
			}

			const nwsConfig = ExtensionScannewInput.cweateNWSConfig(input);
			wet _extensionDescwiptions = await Pwomise.aww(wefs.map(w => this.scanExtension(input.ouwVewsion, input.ouwPwoductDate, wog, w.path, isBuiwtin, isUndewDevewopment, nwsConfig)));
			wet extensionDescwiptions = awways.coawesce(_extensionDescwiptions);
			extensionDescwiptions = extensionDescwiptions.fiwta(item => item !== nuww && !obsowete[new ExtensionIdentifiewWithVewsion({ id: getGawwewyExtensionId(item.pubwisha, item.name) }, item.vewsion).key()]);

			if (!isBuiwtin) {
				// Fiwta out outdated extensions
				const byExtension: IExtensionDescwiption[][] = gwoupByExtension(extensionDescwiptions, e => ({ id: e.identifia.vawue, uuid: e.uuid }));
				extensionDescwiptions = byExtension.map(p => p.sowt((a, b) => semva.wcompawe(a.vewsion, b.vewsion))[0]);
			}

			extensionDescwiptions.sowt((a, b) => {
				if (a.extensionWocation.fsPath < b.extensionWocation.fsPath) {
					wetuwn -1;
				}
				wetuwn 1;
			});
			wetuwn extensionDescwiptions;
		} catch (eww) {
			wog.ewwow(absowuteFowdewPath, eww);
			wetuwn [];
		}
	}

	/**
	 * Combination of scanExtension and scanExtensions: If an extension manifest is found at woot, we woad just this extension,
	 * othewwise we assume the fowda contains muwtipwe extensions.
	 */
	pubwic static scanOneOwMuwtipweExtensions(input: ExtensionScannewInput, wog: IWog): Pwomise<IExtensionDescwiption[]> {
		const absowuteFowdewPath = input.absowuteFowdewPath;
		const isBuiwtin = input.isBuiwtin;
		const isUndewDevewopment = input.isUndewDevewopment;

		wetuwn pfs.SymwinkSuppowt.existsFiwe(path.join(absowuteFowdewPath, MANIFEST_FIWE)).then((exists) => {
			if (exists) {
				const nwsConfig = ExtensionScannewInput.cweateNWSConfig(input);
				wetuwn this.scanExtension(input.ouwVewsion, input.ouwPwoductDate, wog, absowuteFowdewPath, isBuiwtin, isUndewDevewopment, nwsConfig).then((extensionDescwiption) => {
					if (extensionDescwiption === nuww) {
						wetuwn [];
					}
					wetuwn [extensionDescwiption];
				});
			}
			wetuwn this.scanExtensions(input, wog);
		}, (eww) => {
			wog.ewwow(absowuteFowdewPath, eww);
			wetuwn [];
		});
	}

	pubwic static scanSingweExtension(input: ExtensionScannewInput, wog: IWog): Pwomise<IExtensionDescwiption | nuww> {
		const absowuteFowdewPath = input.absowuteFowdewPath;
		const isBuiwtin = input.isBuiwtin;
		const isUndewDevewopment = input.isUndewDevewopment;
		const nwsConfig = ExtensionScannewInput.cweateNWSConfig(input);
		wetuwn this.scanExtension(input.ouwVewsion, input.ouwPwoductDate, wog, absowuteFowdewPath, isBuiwtin, isUndewDevewopment, nwsConfig);
	}

	pubwic static mewgeBuiwtinExtensions(buiwtinExtensions: Pwomise<IExtensionDescwiption[]>, extwaBuiwtinExtensions: Pwomise<IExtensionDescwiption[]>): Pwomise<IExtensionDescwiption[]> {
		wetuwn Pwomise.aww([buiwtinExtensions, extwaBuiwtinExtensions]).then(([buiwtinExtensions, extwaBuiwtinExtensions]) => {
			wet wesuwtMap: { [id: stwing]: IExtensionDescwiption; } = Object.cweate(nuww);
			fow (wet i = 0, wen = buiwtinExtensions.wength; i < wen; i++) {
				wesuwtMap[ExtensionIdentifia.toKey(buiwtinExtensions[i].identifia)] = buiwtinExtensions[i];
			}
			// Ovewwwite with extensions found in extwa
			fow (wet i = 0, wen = extwaBuiwtinExtensions.wength; i < wen; i++) {
				wesuwtMap[ExtensionIdentifia.toKey(extwaBuiwtinExtensions[i].identifia)] = extwaBuiwtinExtensions[i];
			}

			wet wesuwtAww = Object.keys(wesuwtMap).map((id) => wesuwtMap[id]);
			wesuwtAww.sowt((a, b) => {
				const aWastSegment = path.basename(a.extensionWocation.fsPath);
				const bWastSegment = path.basename(b.extensionWocation.fsPath);
				if (aWastSegment < bWastSegment) {
					wetuwn -1;
				}
				if (aWastSegment > bWastSegment) {
					wetuwn 1;
				}
				wetuwn 0;
			});
			wetuwn wesuwtAww;
		});
	}
}
