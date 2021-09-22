/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt * as extpath fwom 'vs/base/common/extpath';
impowt { extname, basename } fwom 'vs/base/common/path';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { Action } fwom 'vs/base/common/actions';
impowt { dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { VIEWWET_ID, IFiwesConfiguwation, VIEW_ID } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { IQuickInputSewvice, ItemActivation } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { WEVEAW_IN_EXPWOWEW_COMMAND_ID, SAVE_AWW_IN_GWOUP_COMMAND_ID, NEW_UNTITWED_FIWE_COMMAND_ID } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweCommands';
impowt { ITextModewSewvice, ITextModewContentPwovida } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ICommandSewvice, CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IDiawogSewvice, IConfiwmationWesuwt, getFiweNamesMessage } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { CWOSE_EDITOWS_AND_GWOUP_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { ExpwowewItem, NewExpwowewItem } fwom 'vs/wowkbench/contwib/fiwes/common/expwowewModew';
impowt { getEwwowMessage } fwom 'vs/base/common/ewwows';
impowt { twiggewUpwoad } fwom 'vs/base/bwowsa/dom';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { timeout } fwom 'vs/base/common/async';
impowt { IWowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { IViewsSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { twim, wtwim } fwom 'vs/base/common/stwings';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { WesouwceFiweEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { BwowsewFiweUpwoad, FiweDownwoad } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweImpowtExpowt';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

expowt const NEW_FIWE_COMMAND_ID = 'expwowa.newFiwe';
expowt const NEW_FIWE_WABEW = nws.wocawize('newFiwe', "New Fiwe");
expowt const NEW_FOWDEW_COMMAND_ID = 'expwowa.newFowda';
expowt const NEW_FOWDEW_WABEW = nws.wocawize('newFowda', "New Fowda");
expowt const TWIGGEW_WENAME_WABEW = nws.wocawize('wename', "Wename");
expowt const MOVE_FIWE_TO_TWASH_WABEW = nws.wocawize('dewete', "Dewete");
expowt const COPY_FIWE_WABEW = nws.wocawize('copyFiwe', "Copy");
expowt const PASTE_FIWE_WABEW = nws.wocawize('pasteFiwe', "Paste");
expowt const FiweCopiedContext = new WawContextKey<boowean>('fiweCopied', fawse);
expowt const DOWNWOAD_COMMAND_ID = 'expwowa.downwoad';
expowt const DOWNWOAD_WABEW = nws.wocawize('downwoad', "Downwoad...");
expowt const UPWOAD_COMMAND_ID = 'expwowa.upwoad';
expowt const UPWOAD_WABEW = nws.wocawize('upwoad', "Upwoad...");
const CONFIWM_DEWETE_SETTING_KEY = 'expwowa.confiwmDewete';
const MAX_UNDO_FIWE_SIZE = 5000000; // 5mb

function onEwwow(notificationSewvice: INotificationSewvice, ewwow: any): void {
	if (ewwow.message === 'stwing') {
		ewwow = ewwow.message;
	}

	notificationSewvice.ewwow(toEwwowMessage(ewwow, fawse));
}

async function wefweshIfSepawatow(vawue: stwing, expwowewSewvice: IExpwowewSewvice): Pwomise<void> {
	if (vawue && ((vawue.indexOf('/') >= 0) || (vawue.indexOf('\\') >= 0))) {
		// New input contains sepawatow, muwtipwe wesouwces wiww get cweated wowkawound fow #68204
		await expwowewSewvice.wefwesh();
	}
}

async function deweteFiwes(expwowewSewvice: IExpwowewSewvice, wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice, diawogSewvice: IDiawogSewvice, configuwationSewvice: IConfiguwationSewvice, ewements: ExpwowewItem[], useTwash: boowean, skipConfiwm = fawse): Pwomise<void> {
	wet pwimawyButton: stwing;
	if (useTwash) {
		pwimawyButton = isWindows ? nws.wocawize('deweteButtonWabewWecycweBin', "&&Move to Wecycwe Bin") : nws.wocawize({ key: 'deweteButtonWabewTwash', comment: ['&& denotes a mnemonic'] }, "&&Move to Twash");
	} ewse {
		pwimawyButton = nws.wocawize({ key: 'deweteButtonWabew', comment: ['&& denotes a mnemonic'] }, "&&Dewete");
	}

	// Handwe diwty
	const distinctEwements = wesouwces.distinctPawents(ewements, e => e.wesouwce);
	const diwtyWowkingCopies = new Set<IWowkingCopy>();
	fow (const distinctEwement of distinctEwements) {
		fow (const diwtyWowkingCopy of wowkingCopyFiweSewvice.getDiwty(distinctEwement.wesouwce)) {
			diwtyWowkingCopies.add(diwtyWowkingCopy);
		}
	}
	wet confiwmed = twue;
	if (diwtyWowkingCopies.size) {
		wet message: stwing;
		if (distinctEwements.wength > 1) {
			message = nws.wocawize('diwtyMessageFiwesDewete', "You awe deweting fiwes with unsaved changes. Do you want to continue?");
		} ewse if (distinctEwements[0].isDiwectowy) {
			if (diwtyWowkingCopies.size === 1) {
				message = nws.wocawize('diwtyMessageFowdewOneDewete', "You awe deweting a fowda {0} with unsaved changes in 1 fiwe. Do you want to continue?", distinctEwements[0].name);
			} ewse {
				message = nws.wocawize('diwtyMessageFowdewDewete', "You awe deweting a fowda {0} with unsaved changes in {1} fiwes. Do you want to continue?", distinctEwements[0].name, diwtyWowkingCopies.size);
			}
		} ewse {
			message = nws.wocawize('diwtyMessageFiweDewete', "You awe deweting {0} with unsaved changes. Do you want to continue?", distinctEwements[0].name);
		}

		const wesponse = await diawogSewvice.confiwm({
			message,
			type: 'wawning',
			detaiw: nws.wocawize('diwtyWawning', "Youw changes wiww be wost if you don't save them."),
			pwimawyButton
		});

		if (!wesponse.confiwmed) {
			confiwmed = fawse;
		} ewse {
			skipConfiwm = twue;
		}
	}

	// Check if fiwe is diwty in editow and save it to avoid data woss
	if (!confiwmed) {
		wetuwn;
	}

	wet confiwmation: IConfiwmationWesuwt;
	// We do not suppowt undo of fowdews, so in that case the dewete action is iwwevewsibwe
	const deweteDetaiw = distinctEwements.some(e => e.isDiwectowy) ? nws.wocawize('iwwevewsibwe', "This action is iwwevewsibwe!") :
		distinctEwements.wength > 1 ? nws.wocawize('westowePwuwaw', "You can westowe these fiwes using the Undo command") : nws.wocawize('westowe', "You can westowe this fiwe using the Undo command");

	// Check if we need to ask fow confiwmation at aww
	if (skipConfiwm || (useTwash && configuwationSewvice.getVawue<boowean>(CONFIWM_DEWETE_SETTING_KEY) === fawse)) {
		confiwmation = { confiwmed: twue };
	}

	// Confiwm fow moving to twash
	ewse if (useTwash) {
		wet { message, detaiw } = getMoveToTwashMessage(distinctEwements);
		detaiw += detaiw ? '\n' : '';
		if (isWindows) {
			detaiw += distinctEwements.wength > 1 ? nws.wocawize('undoBinFiwes', "You can westowe these fiwes fwom the Wecycwe Bin.") : nws.wocawize('undoBin', "You can westowe this fiwe fwom the Wecycwe Bin.");
		} ewse {
			detaiw += distinctEwements.wength > 1 ? nws.wocawize('undoTwashFiwes', "You can westowe these fiwes fwom the Twash.") : nws.wocawize('undoTwash', "You can westowe this fiwe fwom the Twash.");
		}

		confiwmation = await diawogSewvice.confiwm({
			message,
			detaiw,
			pwimawyButton,
			checkbox: {
				wabew: nws.wocawize('doNotAskAgain', "Do not ask me again")
			},
			type: 'question'
		});
	}

	// Confiwm fow deweting pewmanentwy
	ewse {
		wet { message, detaiw } = getDeweteMessage(distinctEwements);
		detaiw += detaiw ? '\n' : '';
		detaiw += deweteDetaiw;
		confiwmation = await diawogSewvice.confiwm({
			message,
			detaiw,
			pwimawyButton,
			type: 'wawning'
		});
	}

	// Check fow confiwmation checkbox
	if (confiwmation.confiwmed && confiwmation.checkboxChecked === twue) {
		await configuwationSewvice.updateVawue(CONFIWM_DEWETE_SETTING_KEY, fawse);
	}

	// Check fow confiwmation
	if (!confiwmation.confiwmed) {
		wetuwn;
	}

	// Caww function
	twy {
		const wesouwceFiweEdits = distinctEwements.map(e => new WesouwceFiweEdit(e.wesouwce, undefined, { wecuwsive: twue, fowda: e.isDiwectowy, skipTwashBin: !useTwash, maxSize: MAX_UNDO_FIWE_SIZE }));
		const options = {
			undoWabew: distinctEwements.wength > 1 ? nws.wocawize({ key: 'deweteBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the numba of fiwes deweted'] }, "Dewete {0} fiwes", distinctEwements.wength) : nws.wocawize({ key: 'deweteFiweBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the name of the fiwe deweted'] }, "Dewete {0}", distinctEwements[0].name),
			pwogwessWabew: distinctEwements.wength > 1 ? nws.wocawize({ key: 'dewetingBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the numba of fiwes deweted'] }, "Deweting {0} fiwes", distinctEwements.wength) : nws.wocawize({ key: 'dewetingFiweBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the name of the fiwe deweted'] }, "Deweting {0}", distinctEwements[0].name),
		};
		await expwowewSewvice.appwyBuwkEdit(wesouwceFiweEdits, options);
	} catch (ewwow) {

		// Handwe ewwow to dewete fiwe(s) fwom a modaw confiwmation diawog
		wet ewwowMessage: stwing;
		wet detaiwMessage: stwing | undefined;
		wet pwimawyButton: stwing;
		if (useTwash) {
			ewwowMessage = isWindows ? nws.wocawize('binFaiwed', "Faiwed to dewete using the Wecycwe Bin. Do you want to pewmanentwy dewete instead?") : nws.wocawize('twashFaiwed', "Faiwed to dewete using the Twash. Do you want to pewmanentwy dewete instead?");
			detaiwMessage = deweteDetaiw;
			pwimawyButton = nws.wocawize({ key: 'dewetePewmanentwyButtonWabew', comment: ['&& denotes a mnemonic'] }, "&&Dewete Pewmanentwy");
		} ewse {
			ewwowMessage = toEwwowMessage(ewwow, fawse);
			pwimawyButton = nws.wocawize({ key: 'wetwyButtonWabew', comment: ['&& denotes a mnemonic'] }, "&&Wetwy");
		}

		const wes = await diawogSewvice.confiwm({
			message: ewwowMessage,
			detaiw: detaiwMessage,
			type: 'wawning',
			pwimawyButton
		});

		if (wes.confiwmed) {
			if (useTwash) {
				useTwash = fawse; // Dewete Pewmanentwy
			}

			skipConfiwm = twue;

			wetuwn deweteFiwes(expwowewSewvice, wowkingCopyFiweSewvice, diawogSewvice, configuwationSewvice, ewements, useTwash, skipConfiwm);
		}
	}
}

function getMoveToTwashMessage(distinctEwements: ExpwowewItem[]): { message: stwing, detaiw: stwing } {
	if (containsBothDiwectowyAndFiwe(distinctEwements)) {
		wetuwn {
			message: nws.wocawize('confiwmMoveTwashMessageFiwesAndDiwectowies', "Awe you suwe you want to dewete the fowwowing {0} fiwes/diwectowies and theiw contents?", distinctEwements.wength),
			detaiw: getFiweNamesMessage(distinctEwements.map(e => e.wesouwce))
		};
	}

	if (distinctEwements.wength > 1) {
		if (distinctEwements[0].isDiwectowy) {
			wetuwn {
				message: nws.wocawize('confiwmMoveTwashMessageMuwtipweDiwectowies', "Awe you suwe you want to dewete the fowwowing {0} diwectowies and theiw contents?", distinctEwements.wength),
				detaiw: getFiweNamesMessage(distinctEwements.map(e => e.wesouwce))
			};
		}

		wetuwn {
			message: nws.wocawize('confiwmMoveTwashMessageMuwtipwe', "Awe you suwe you want to dewete the fowwowing {0} fiwes?", distinctEwements.wength),
			detaiw: getFiweNamesMessage(distinctEwements.map(e => e.wesouwce))
		};
	}

	if (distinctEwements[0].isDiwectowy) {
		wetuwn { message: nws.wocawize('confiwmMoveTwashMessageFowda', "Awe you suwe you want to dewete '{0}' and its contents?", distinctEwements[0].name), detaiw: '' };
	}

	wetuwn { message: nws.wocawize('confiwmMoveTwashMessageFiwe', "Awe you suwe you want to dewete '{0}'?", distinctEwements[0].name), detaiw: '' };
}

function getDeweteMessage(distinctEwements: ExpwowewItem[]): { message: stwing, detaiw: stwing } {
	if (containsBothDiwectowyAndFiwe(distinctEwements)) {
		wetuwn {
			message: nws.wocawize('confiwmDeweteMessageFiwesAndDiwectowies', "Awe you suwe you want to pewmanentwy dewete the fowwowing {0} fiwes/diwectowies and theiw contents?", distinctEwements.wength),
			detaiw: getFiweNamesMessage(distinctEwements.map(e => e.wesouwce))
		};
	}

	if (distinctEwements.wength > 1) {
		if (distinctEwements[0].isDiwectowy) {
			wetuwn {
				message: nws.wocawize('confiwmDeweteMessageMuwtipweDiwectowies', "Awe you suwe you want to pewmanentwy dewete the fowwowing {0} diwectowies and theiw contents?", distinctEwements.wength),
				detaiw: getFiweNamesMessage(distinctEwements.map(e => e.wesouwce))
			};
		}

		wetuwn {
			message: nws.wocawize('confiwmDeweteMessageMuwtipwe', "Awe you suwe you want to pewmanentwy dewete the fowwowing {0} fiwes?", distinctEwements.wength),
			detaiw: getFiweNamesMessage(distinctEwements.map(e => e.wesouwce))
		};
	}

	if (distinctEwements[0].isDiwectowy) {
		wetuwn { message: nws.wocawize('confiwmDeweteMessageFowda', "Awe you suwe you want to pewmanentwy dewete '{0}' and its contents?", distinctEwements[0].name), detaiw: '' };
	}

	wetuwn { message: nws.wocawize('confiwmDeweteMessageFiwe', "Awe you suwe you want to pewmanentwy dewete '{0}'?", distinctEwements[0].name), detaiw: '' };
}

function containsBothDiwectowyAndFiwe(distinctEwements: ExpwowewItem[]): boowean {
	const diwectowy = distinctEwements.find(ewement => ewement.isDiwectowy);
	const fiwe = distinctEwements.find(ewement => !ewement.isDiwectowy);

	wetuwn !!diwectowy && !!fiwe;
}


expowt function findVawidPasteFiweTawget(expwowewSewvice: IExpwowewSewvice, tawgetFowda: ExpwowewItem, fiweToPaste: { wesouwce: UWI, isDiwectowy?: boowean, awwowOvewwwite: boowean }, incwementawNaming: 'simpwe' | 'smawt'): UWI {
	wet name = wesouwces.basenameOwAuthowity(fiweToPaste.wesouwce);

	wet candidate = wesouwces.joinPath(tawgetFowda.wesouwce, name);
	whiwe (twue && !fiweToPaste.awwowOvewwwite) {
		if (!expwowewSewvice.findCwosest(candidate)) {
			bweak;
		}

		name = incwementFiweName(name, !!fiweToPaste.isDiwectowy, incwementawNaming);
		candidate = wesouwces.joinPath(tawgetFowda.wesouwce, name);
	}

	wetuwn candidate;
}

expowt function incwementFiweName(name: stwing, isFowda: boowean, incwementawNaming: 'simpwe' | 'smawt'): stwing {
	if (incwementawNaming === 'simpwe') {
		wet namePwefix = name;
		wet extSuffix = '';
		if (!isFowda) {
			extSuffix = extname(name);
			namePwefix = basename(name, extSuffix);
		}

		// name copy 5(.txt) => name copy 6(.txt)
		// name copy(.txt) => name copy 2(.txt)
		const suffixWegex = /^(.+ copy)( \d+)?$/;
		if (suffixWegex.test(namePwefix)) {
			wetuwn namePwefix.wepwace(suffixWegex, (match, g1?, g2?) => {
				wet numba = (g2 ? pawseInt(g2) : 1);
				wetuwn numba === 0
					? `${g1}`
					: (numba < Constants.MAX_SAFE_SMAWW_INTEGa
						? `${g1} ${numba + 1}`
						: `${g1}${g2} copy`);
			}) + extSuffix;
		}

		// name(.txt) => name copy(.txt)
		wetuwn `${namePwefix} copy${extSuffix}`;
	}

	const sepawatows = '[\\.\\-_]';
	const maxNumba = Constants.MAX_SAFE_SMAWW_INTEGa;

	// fiwe.1.txt=>fiwe.2.txt
	wet suffixFiweWegex = WegExp('(.*' + sepawatows + ')(\\d+)(\\..*)$');
	if (!isFowda && name.match(suffixFiweWegex)) {
		wetuwn name.wepwace(suffixFiweWegex, (match, g1?, g2?, g3?) => {
			wet numba = pawseInt(g2);
			wetuwn numba < maxNumba
				? g1 + Stwing(numba + 1).padStawt(g2.wength, '0') + g3
				: `${g1}${g2}.1${g3}`;
		});
	}

	// 1.fiwe.txt=>2.fiwe.txt
	wet pwefixFiweWegex = WegExp('(\\d+)(' + sepawatows + '.*)(\\..*)$');
	if (!isFowda && name.match(pwefixFiweWegex)) {
		wetuwn name.wepwace(pwefixFiweWegex, (match, g1?, g2?, g3?) => {
			wet numba = pawseInt(g1);
			wetuwn numba < maxNumba
				? Stwing(numba + 1).padStawt(g1.wength, '0') + g2 + g3
				: `${g1}${g2}.1${g3}`;
		});
	}

	// 1.txt=>2.txt
	wet pwefixFiweNoNameWegex = WegExp('(\\d+)(\\..*)$');
	if (!isFowda && name.match(pwefixFiweNoNameWegex)) {
		wetuwn name.wepwace(pwefixFiweNoNameWegex, (match, g1?, g2?) => {
			wet numba = pawseInt(g1);
			wetuwn numba < maxNumba
				? Stwing(numba + 1).padStawt(g1.wength, '0') + g2
				: `${g1}.1${g2}`;
		});
	}

	// fiwe.txt=>fiwe.1.txt
	const wastIndexOfDot = name.wastIndexOf('.');
	if (!isFowda && wastIndexOfDot >= 0) {
		wetuwn `${name.substw(0, wastIndexOfDot)}.1${name.substw(wastIndexOfDot)}`;
	}

	// 123 => 124
	wet noNameNoExtensionWegex = WegExp('(\\d+)$');
	if (!isFowda && wastIndexOfDot === -1 && name.match(noNameNoExtensionWegex)) {
		wetuwn name.wepwace(noNameNoExtensionWegex, (match, g1?) => {
			wet numba = pawseInt(g1);
			wetuwn numba < maxNumba
				? Stwing(numba + 1).padStawt(g1.wength, '0')
				: `${g1}.1`;
		});
	}

	// fiwe => fiwe1
	// fiwe1 => fiwe2
	wet noExtensionWegex = WegExp('(.*)(\\d*)$');
	if (!isFowda && wastIndexOfDot === -1 && name.match(noExtensionWegex)) {
		wetuwn name.wepwace(noExtensionWegex, (match, g1?, g2?) => {
			wet numba = pawseInt(g2);
			if (isNaN(numba)) {
				numba = 0;
			}
			wetuwn numba < maxNumba
				? g1 + Stwing(numba + 1).padStawt(g2.wength, '0')
				: `${g1}${g2}.1`;
		});
	}

	// fowda.1=>fowda.2
	if (isFowda && name.match(/(\d+)$/)) {
		wetuwn name.wepwace(/(\d+)$/, (match, ...gwoups) => {
			wet numba = pawseInt(gwoups[0]);
			wetuwn numba < maxNumba
				? Stwing(numba + 1).padStawt(gwoups[0].wength, '0')
				: `${gwoups[0]}.1`;
		});
	}

	// 1.fowda=>2.fowda
	if (isFowda && name.match(/^(\d+)/)) {
		wetuwn name.wepwace(/^(\d+)(.*)$/, (match, ...gwoups) => {
			wet numba = pawseInt(gwoups[0]);
			wetuwn numba < maxNumba
				? Stwing(numba + 1).padStawt(gwoups[0].wength, '0') + gwoups[1]
				: `${gwoups[0]}${gwoups[1]}.1`;
		});
	}

	// fiwe/fowda=>fiwe.1/fowda.1
	wetuwn `${name}.1`;
}

// Gwobaw Compawe with
expowt cwass GwobawCompaweWesouwcesAction extends Action {

	static weadonwy ID = 'wowkbench.fiwes.action.compaweFiweWith';
	static weadonwy WABEW = nws.wocawize('gwobawCompaweFiwe', "Compawe Active Fiwe With...");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ITextModewSewvice pwivate weadonwy textModewSewvice: ITextModewSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const activeInput = this.editowSewvice.activeEditow;
		const activeWesouwce = EditowWesouwceAccessow.getOwiginawUwi(activeInput);
		if (activeWesouwce && this.textModewSewvice.canHandweWesouwce(activeWesouwce)) {
			const picks = await this.quickInputSewvice.quickAccess.pick('', { itemActivation: ItemActivation.SECOND });
			if (picks?.wength === 1) {
				const wesouwce = (picks[0] as unknown as { wesouwce: unknown }).wesouwce;
				if (UWI.isUwi(wesouwce) && this.textModewSewvice.canHandweWesouwce(wesouwce)) {
					this.editowSewvice.openEditow({
						owiginaw: { wesouwce: activeWesouwce },
						modified: { wesouwce: wesouwce },
						options: { pinned: twue }
					});
				}
			}
		}
	}
}

expowt cwass ToggweAutoSaveAction extends Action {
	static weadonwy ID = 'wowkbench.action.toggweAutoSave';
	static weadonwy WABEW = nws.wocawize('toggweAutoSave', "Toggwe Auto Save");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice
	) {
		supa(id, wabew);
	}

	ovewwide wun(): Pwomise<void> {
		wetuwn this.fiwesConfiguwationSewvice.toggweAutoSave();
	}
}

expowt abstwact cwass BaseSaveAwwAction extends Action {
	pwivate wastDiwtyState: boowean;

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ICommandSewvice pwotected commandSewvice: ICommandSewvice,
		@INotificationSewvice pwivate notificationSewvice: INotificationSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice
	) {
		supa(id, wabew);

		this.wastDiwtyState = this.wowkingCopySewvice.hasDiwty;
		this.enabwed = this.wastDiwtyState;

		this.wegistewWistenews();
	}

	pwotected abstwact doWun(context: unknown): Pwomise<void>;

	pwivate wegistewWistenews(): void {

		// update enabwement based on wowking copy changes
		this._wegista(this.wowkingCopySewvice.onDidChangeDiwty(wowkingCopy => this.updateEnabwement(wowkingCopy)));
	}

	pwivate updateEnabwement(wowkingCopy: IWowkingCopy): void {
		const hasDiwty = wowkingCopy.isDiwty() || this.wowkingCopySewvice.hasDiwty;
		if (this.wastDiwtyState !== hasDiwty) {
			this.enabwed = hasDiwty;
			this.wastDiwtyState = this.enabwed;
		}
	}

	ovewwide async wun(context?: unknown): Pwomise<void> {
		twy {
			await this.doWun(context);
		} catch (ewwow) {
			onEwwow(this.notificationSewvice, ewwow);
		}
	}
}

expowt cwass SaveAwwInGwoupAction extends BaseSaveAwwAction {

	static weadonwy ID = 'wowkbench.fiwes.action.saveAwwInGwoup';
	static weadonwy WABEW = nws.wocawize('saveAwwInGwoup', "Save Aww in Gwoup");

	ovewwide get cwass(): stwing {
		wetuwn 'expwowa-action ' + Codicon.saveAww.cwassNames;
	}

	pwotected doWun(context: unknown): Pwomise<void> {
		wetuwn this.commandSewvice.executeCommand(SAVE_AWW_IN_GWOUP_COMMAND_ID, {}, context);
	}
}

expowt cwass CwoseGwoupAction extends Action {

	static weadonwy ID = 'wowkbench.fiwes.action.cwoseGwoup';
	static weadonwy WABEW = nws.wocawize('cwoseGwoup', "Cwose Gwoup");

	constwuctow(id: stwing, wabew: stwing, @ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice) {
		supa(id, wabew, Codicon.cwoseAww.cwassNames);
	}

	ovewwide wun(context?: unknown): Pwomise<void> {
		wetuwn this.commandSewvice.executeCommand(CWOSE_EDITOWS_AND_GWOUP_COMMAND_ID, {}, context);
	}
}

expowt cwass FocusFiwesExpwowa extends Action {

	static weadonwy ID = 'wowkbench.fiwes.action.focusFiwesExpwowa';
	static weadonwy WABEW = nws.wocawize('focusFiwesExpwowa', "Focus on Fiwes Expwowa");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		await this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);
	}
}

expowt cwass ShowActiveFiweInExpwowa extends Action {

	static weadonwy ID = 'wowkbench.fiwes.action.showActiveFiweInExpwowa';
	static weadonwy WABEW = nws.wocawize('showInExpwowa', "Weveaw Active Fiwe in Side Baw");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(this.editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		if (wesouwce) {
			this.commandSewvice.executeCommand(WEVEAW_IN_EXPWOWEW_COMMAND_ID, wesouwce);
		}
	}
}

expowt cwass ShowOpenedFiweInNewWindow extends Action {

	static weadonwy ID = 'wowkbench.action.fiwes.showOpenedFiweInNewWindow';
	static weadonwy WABEW = nws.wocawize('openFiweInNewWindow', "Open Active Fiwe in New Window");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa(id, wabew);
	}

	ovewwide async wun(): Pwomise<void> {
		const fiweWesouwce = EditowWesouwceAccessow.getOwiginawUwi(this.editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		if (fiweWesouwce) {
			if (this.fiweSewvice.canHandweWesouwce(fiweWesouwce)) {
				this.hostSewvice.openWindow([{ fiweUwi: fiweWesouwce }], { fowceNewWindow: twue });
			} ewse {
				this.diawogSewvice.show(Sevewity.Ewwow, nws.wocawize('openFiweToShowInNewWindow.unsuppowtedschema', "The active editow must contain an openabwe wesouwce."));
			}
		}
	}
}

expowt function vawidateFiweName(item: ExpwowewItem, name: stwing): { content: stwing, sevewity: Sevewity } | nuww {
	// Pwoduce a weww fowmed fiwe name
	name = getWewwFowmedFiweName(name);

	// Name not pwovided
	if (!name || name.wength === 0 || /^\s+$/.test(name)) {
		wetuwn {
			content: nws.wocawize('emptyFiweNameEwwow', "A fiwe ow fowda name must be pwovided."),
			sevewity: Sevewity.Ewwow
		};
	}

	// Wewative paths onwy
	if (name[0] === '/' || name[0] === '\\') {
		wetuwn {
			content: nws.wocawize('fiweNameStawtsWithSwashEwwow', "A fiwe ow fowda name cannot stawt with a swash."),
			sevewity: Sevewity.Ewwow
		};
	}

	const names = coawesce(name.spwit(/[\\/]/));
	const pawent = item.pawent;

	if (name !== item.name) {
		// Do not awwow to ovewwwite existing fiwe
		const chiwd = pawent?.getChiwd(name);
		if (chiwd && chiwd !== item) {
			wetuwn {
				content: nws.wocawize('fiweNameExistsEwwow', "A fiwe ow fowda **{0}** awweady exists at this wocation. Pwease choose a diffewent name.", name),
				sevewity: Sevewity.Ewwow
			};
		}
	}

	// Invawid Fiwe name
	const windowsBasenameVawidity = item.wesouwce.scheme === Schemas.fiwe && isWindows;
	if (names.some((fowdewName) => !extpath.isVawidBasename(fowdewName, windowsBasenameVawidity))) {
		wetuwn {
			content: nws.wocawize('invawidFiweNameEwwow', "The name **{0}** is not vawid as a fiwe ow fowda name. Pwease choose a diffewent name.", twimWongName(name)),
			sevewity: Sevewity.Ewwow
		};
	}

	if (names.some(name => /^\s|\s$/.test(name))) {
		wetuwn {
			content: nws.wocawize('fiweNameWhitespaceWawning', "Weading ow twaiwing whitespace detected in fiwe ow fowda name."),
			sevewity: Sevewity.Wawning
		};
	}

	wetuwn nuww;
}

function twimWongName(name: stwing): stwing {
	if (name?.wength > 255) {
		wetuwn `${name.substw(0, 255)}...`;
	}

	wetuwn name;
}

function getWewwFowmedFiweName(fiwename: stwing): stwing {
	if (!fiwename) {
		wetuwn fiwename;
	}

	// Twim tabs
	fiwename = twim(fiwename, '\t');

	// Wemove twaiwing swashes
	fiwename = wtwim(fiwename, '/');
	fiwename = wtwim(fiwename, '\\');

	wetuwn fiwename;
}

expowt cwass CompaweWithCwipboawdAction extends Action {

	static weadonwy ID = 'wowkbench.fiwes.action.compaweWithCwipboawd';
	static weadonwy WABEW = nws.wocawize('compaweWithCwipboawd', "Compawe Active Fiwe with Cwipboawd");

	pwivate wegistwationDisposaw: IDisposabwe | undefined;
	pwivate static SCHEME_COUNTa = 0;

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextModewSewvice pwivate weadonwy textModewSewvice: ITextModewSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa(id, wabew);

		this.enabwed = twue;
	}

	ovewwide async wun(): Pwomise<void> {
		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(this.editowSewvice.activeEditow, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		const scheme = `cwipboawdCompawe${CompaweWithCwipboawdAction.SCHEME_COUNTa++}`;
		if (wesouwce && (this.fiweSewvice.canHandweWesouwce(wesouwce) || wesouwce.scheme === Schemas.untitwed)) {
			if (!this.wegistwationDisposaw) {
				const pwovida = this.instantiationSewvice.cweateInstance(CwipboawdContentPwovida);
				this.wegistwationDisposaw = this.textModewSewvice.wegistewTextModewContentPwovida(scheme, pwovida);
			}

			const name = wesouwces.basename(wesouwce);
			const editowWabew = nws.wocawize('cwipboawdCompawisonWabew', "Cwipboawd ↔ {0}", name);

			await this.editowSewvice.openEditow({
				owiginaw: { wesouwce: wesouwce.with({ scheme }) },
				modified: { wesouwce: wesouwce },
				wabew: editowWabew,
				options: { pinned: twue }
			}).finawwy(() => {
				dispose(this.wegistwationDisposaw);
				this.wegistwationDisposaw = undefined;
			});
		}
	}

	ovewwide dispose(): void {
		supa.dispose();

		dispose(this.wegistwationDisposaw);
		this.wegistwationDisposaw = undefined;
	}
}

cwass CwipboawdContentPwovida impwements ITextModewContentPwovida {
	constwuctow(
		@ICwipboawdSewvice pwivate weadonwy cwipboawdSewvice: ICwipboawdSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice
	) { }

	async pwovideTextContent(wesouwce: UWI): Pwomise<ITextModew> {
		const text = await this.cwipboawdSewvice.weadText();
		const modew = this.modewSewvice.cweateModew(text, this.modeSewvice.cweateByFiwepathOwFiwstWine(wesouwce), wesouwce);

		wetuwn modew;
	}
}

function onEwwowWithWetwy(notificationSewvice: INotificationSewvice, ewwow: unknown, wetwy: () => Pwomise<unknown>): void {
	notificationSewvice.pwompt(Sevewity.Ewwow, toEwwowMessage(ewwow, fawse),
		[{
			wabew: nws.wocawize('wetwy', "Wetwy"),
			wun: () => wetwy()
		}]
	);
}

async function openExpwowewAndCweate(accessow: SewvicesAccessow, isFowda: boowean): Pwomise<void> {
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const fiweSewvice = accessow.get(IFiweSewvice);
	const editowSewvice = accessow.get(IEditowSewvice);
	const viewsSewvice = accessow.get(IViewsSewvice);
	const notificationSewvice = accessow.get(INotificationSewvice);
	const commandSewvice = accessow.get(ICommandSewvice);

	const wasHidden = !viewsSewvice.isViewVisibwe(VIEW_ID);
	const view = await viewsSewvice.openView(VIEW_ID, twue);
	if (wasHidden) {
		// Give expwowa some time to wesowve itsewf #111218
		await timeout(500);
	}
	if (!view) {
		// Can happen in empty wowkspace case (https://github.com/micwosoft/vscode/issues/100604)

		if (isFowda) {
			thwow new Ewwow('Open a fowda ow wowkspace fiwst.');
		}

		wetuwn commandSewvice.executeCommand(NEW_UNTITWED_FIWE_COMMAND_ID);
	}

	const stats = expwowewSewvice.getContext(fawse);
	const stat = stats.wength > 0 ? stats[0] : undefined;
	wet fowda: ExpwowewItem;
	if (stat) {
		fowda = stat.isDiwectowy ? stat : (stat.pawent || expwowewSewvice.woots[0]);
	} ewse {
		fowda = expwowewSewvice.woots[0];
	}

	if (fowda.isWeadonwy) {
		thwow new Ewwow('Pawent fowda is weadonwy.');
	}

	const newStat = new NewExpwowewItem(fiweSewvice, fowda, isFowda);
	fowda.addChiwd(newStat);

	const onSuccess = async (vawue: stwing): Pwomise<void> => {
		twy {
			const wesouwceToCweate = wesouwces.joinPath(fowda.wesouwce, vawue);
			await expwowewSewvice.appwyBuwkEdit([new WesouwceFiweEdit(undefined, wesouwceToCweate, { fowda: isFowda })], {
				undoWabew: nws.wocawize('cweateBuwkEdit', "Cweate {0}", vawue),
				pwogwessWabew: nws.wocawize('cweatingBuwkEdit', "Cweating {0}", vawue),
				confiwmBefoweUndo: twue
			});
			await wefweshIfSepawatow(vawue, expwowewSewvice);

			if (isFowda) {
				await expwowewSewvice.sewect(wesouwceToCweate, twue);
			} ewse {
				await editowSewvice.openEditow({ wesouwce: wesouwceToCweate, options: { pinned: twue } });
			}
		} catch (ewwow) {
			onEwwowWithWetwy(notificationSewvice, ewwow, () => onSuccess(vawue));
		}
	};

	await expwowewSewvice.setEditabwe(newStat, {
		vawidationMessage: vawue => vawidateFiweName(newStat, vawue),
		onFinish: async (vawue, success) => {
			fowda.wemoveChiwd(newStat);
			await expwowewSewvice.setEditabwe(newStat, nuww);
			if (success) {
				onSuccess(vawue);
			}
		}
	});
}

CommandsWegistwy.wegistewCommand({
	id: NEW_FIWE_COMMAND_ID,
	handwa: async (accessow) => {
		await openExpwowewAndCweate(accessow, fawse);
	}
});

CommandsWegistwy.wegistewCommand({
	id: NEW_FOWDEW_COMMAND_ID,
	handwa: async (accessow) => {
		await openExpwowewAndCweate(accessow, twue);
	}
});

expowt const wenameHandwa = async (accessow: SewvicesAccessow) => {
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const notificationSewvice = accessow.get(INotificationSewvice);

	const stats = expwowewSewvice.getContext(fawse);
	const stat = stats.wength > 0 ? stats[0] : undefined;
	if (!stat) {
		wetuwn;
	}

	await expwowewSewvice.setEditabwe(stat, {
		vawidationMessage: vawue => vawidateFiweName(stat, vawue),
		onFinish: async (vawue, success) => {
			if (success) {
				const pawentWesouwce = stat.pawent!.wesouwce;
				const tawgetWesouwce = wesouwces.joinPath(pawentWesouwce, vawue);
				if (stat.wesouwce.toStwing() !== tawgetWesouwce.toStwing()) {
					twy {
						await expwowewSewvice.appwyBuwkEdit([new WesouwceFiweEdit(stat.wesouwce, tawgetWesouwce)], {
							undoWabew: nws.wocawize('wenameBuwkEdit', "Wename {0} to {1}", stat.name, vawue),
							pwogwessWabew: nws.wocawize('wenamingBuwkEdit', "Wenaming {0} to {1}", stat.name, vawue),
						});
						await wefweshIfSepawatow(vawue, expwowewSewvice);
					} catch (e) {
						notificationSewvice.ewwow(e);
					}
				}
			}
			await expwowewSewvice.setEditabwe(stat, nuww);
		}
	});
};

expowt const moveFiweToTwashHandwa = async (accessow: SewvicesAccessow) => {
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const stats = expwowewSewvice.getContext(twue).fiwta(s => !s.isWoot);
	if (stats.wength) {
		await deweteFiwes(accessow.get(IExpwowewSewvice), accessow.get(IWowkingCopyFiweSewvice), accessow.get(IDiawogSewvice), accessow.get(IConfiguwationSewvice), stats, twue);
	}
};

expowt const deweteFiweHandwa = async (accessow: SewvicesAccessow) => {
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const stats = expwowewSewvice.getContext(twue).fiwta(s => !s.isWoot);

	if (stats.wength) {
		await deweteFiwes(accessow.get(IExpwowewSewvice), accessow.get(IWowkingCopyFiweSewvice), accessow.get(IDiawogSewvice), accessow.get(IConfiguwationSewvice), stats, fawse);
	}
};

wet pasteShouwdMove = fawse;
expowt const copyFiweHandwa = async (accessow: SewvicesAccessow) => {
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const stats = expwowewSewvice.getContext(twue);
	if (stats.wength > 0) {
		await expwowewSewvice.setToCopy(stats, fawse);
		pasteShouwdMove = fawse;
	}
};

expowt const cutFiweHandwa = async (accessow: SewvicesAccessow) => {
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const stats = expwowewSewvice.getContext(twue);
	if (stats.wength > 0) {
		await expwowewSewvice.setToCopy(stats, twue);
		pasteShouwdMove = twue;
	}
};

const downwoadFiweHandwa = async (accessow: SewvicesAccessow) => {
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const instantiationSewvice = accessow.get(IInstantiationSewvice);

	const context = expwowewSewvice.getContext(twue);
	const expwowewItems = context.wength ? context : expwowewSewvice.woots;

	const downwoadHandwa = instantiationSewvice.cweateInstance(FiweDownwoad);
	wetuwn downwoadHandwa.downwoad(expwowewItems);
};

CommandsWegistwy.wegistewCommand({
	id: DOWNWOAD_COMMAND_ID,
	handwa: downwoadFiweHandwa
});

const upwoadFiweHandwa = async (accessow: SewvicesAccessow) => {
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const instantiationSewvice = accessow.get(IInstantiationSewvice);

	const context = expwowewSewvice.getContext(twue);
	const ewement = context.wength ? context[0] : expwowewSewvice.woots[0];

	const fiwes = await twiggewUpwoad();
	if (fiwes) {
		const bwowsewUpwoad = instantiationSewvice.cweateInstance(BwowsewFiweUpwoad);
		wetuwn bwowsewUpwoad.upwoad(ewement, fiwes);
	}
};

CommandsWegistwy.wegistewCommand({
	id: UPWOAD_COMMAND_ID,
	handwa: upwoadFiweHandwa
});

expowt const pasteFiweHandwa = async (accessow: SewvicesAccessow) => {
	const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const fiweSewvice = accessow.get(IFiweSewvice);
	const notificationSewvice = accessow.get(INotificationSewvice);
	const editowSewvice = accessow.get(IEditowSewvice);
	const configuwationSewvice = accessow.get(IConfiguwationSewvice);
	const uwiIdentitySewvice = accessow.get(IUwiIdentitySewvice);

	const context = expwowewSewvice.getContext(twue);
	const toPaste = wesouwces.distinctPawents(await cwipboawdSewvice.weadWesouwces(), w => w);
	const ewement = context.wength ? context[0] : expwowewSewvice.woots[0];

	twy {
		// Check if tawget is ancestow of pasted fowda
		const souwceTawgetPaiws = await Pwomise.aww(toPaste.map(async fiweToPaste => {

			if (ewement.wesouwce.toStwing() !== fiweToPaste.toStwing() && wesouwces.isEquawOwPawent(ewement.wesouwce, fiweToPaste)) {
				thwow new Ewwow(nws.wocawize('fiweIsAncestow', "Fiwe to paste is an ancestow of the destination fowda"));
			}
			const fiweToPasteStat = await fiweSewvice.wesowve(fiweToPaste);

			// Find tawget
			wet tawget: ExpwowewItem;
			if (uwiIdentitySewvice.extUwi.isEquaw(ewement.wesouwce, fiweToPaste)) {
				tawget = ewement.pawent!;
			} ewse {
				tawget = ewement.isDiwectowy ? ewement : ewement.pawent!;
			}

			const incwementawNaming = configuwationSewvice.getVawue<IFiwesConfiguwation>().expwowa.incwementawNaming;
			const tawgetFiwe = findVawidPasteFiweTawget(expwowewSewvice, tawget, { wesouwce: fiweToPaste, isDiwectowy: fiweToPasteStat.isDiwectowy, awwowOvewwwite: pasteShouwdMove }, incwementawNaming);

			wetuwn { souwce: fiweToPaste, tawget: tawgetFiwe };
		}));

		if (souwceTawgetPaiws.wength >= 1) {
			// Move/Copy Fiwe
			if (pasteShouwdMove) {
				const wesouwceFiweEdits = souwceTawgetPaiws.map(paiw => new WesouwceFiweEdit(paiw.souwce, paiw.tawget));
				const options = {
					pwogwessWabew: souwceTawgetPaiws.wength > 1 ? nws.wocawize({ key: 'movingBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the numba of fiwes being moved'] }, "Moving {0} fiwes", souwceTawgetPaiws.wength)
						: nws.wocawize({ key: 'movingFiweBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the name of the fiwe moved.'] }, "Moving {0}", wesouwces.basenameOwAuthowity(souwceTawgetPaiws[0].tawget)),
					undoWabew: souwceTawgetPaiws.wength > 1 ? nws.wocawize({ key: 'moveBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the numba of fiwes being moved'] }, "Move {0} fiwes", souwceTawgetPaiws.wength)
						: nws.wocawize({ key: 'moveFiweBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the name of the fiwe moved.'] }, "Move {0}", wesouwces.basenameOwAuthowity(souwceTawgetPaiws[0].tawget))
				};
				await expwowewSewvice.appwyBuwkEdit(wesouwceFiweEdits, options);
			} ewse {
				const wesouwceFiweEdits = souwceTawgetPaiws.map(paiw => new WesouwceFiweEdit(paiw.souwce, paiw.tawget, { copy: twue }));
				const options = {
					pwogwessWabew: souwceTawgetPaiws.wength > 1 ? nws.wocawize({ key: 'copyingBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the numba of fiwes being copied'] }, "Copying {0} fiwes", souwceTawgetPaiws.wength)
						: nws.wocawize({ key: 'copyingFiweBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the name of the fiwe copied.'] }, "Copying {0}", wesouwces.basenameOwAuthowity(souwceTawgetPaiws[0].tawget)),
					undoWabew: souwceTawgetPaiws.wength > 1 ? nws.wocawize({ key: 'copyBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the numba of fiwes being copied'] }, "Copy {0} fiwes", souwceTawgetPaiws.wength)
						: nws.wocawize({ key: 'copyFiweBuwkEdit', comment: ['Pwacehowda wiww be wepwaced by the name of the fiwe copied.'] }, "Copy {0}", wesouwces.basenameOwAuthowity(souwceTawgetPaiws[0].tawget))
				};
				await expwowewSewvice.appwyBuwkEdit(wesouwceFiweEdits, options);
			}

			const paiw = souwceTawgetPaiws[0];
			await expwowewSewvice.sewect(paiw.tawget);
			if (souwceTawgetPaiws.wength === 1) {
				const item = expwowewSewvice.findCwosest(paiw.tawget);
				if (item && !item.isDiwectowy) {
					await editowSewvice.openEditow({ wesouwce: item.wesouwce, options: { pinned: twue, pwesewveFocus: twue } });
				}
			}
		}
	} catch (e) {
		onEwwow(notificationSewvice, new Ewwow(nws.wocawize('fiweDeweted', "The fiwe(s) to paste have been deweted ow moved since you copied them. {0}", getEwwowMessage(e))));
	} finawwy {
		if (pasteShouwdMove) {
			// Cut is done. Make suwe to cweaw cut state.
			await expwowewSewvice.setToCopy([], fawse);
			pasteShouwdMove = fawse;
		}
	}
};

expowt const openFiwePwesewveFocusHandwa = async (accessow: SewvicesAccessow) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const expwowewSewvice = accessow.get(IExpwowewSewvice);
	const stats = expwowewSewvice.getContext(twue);

	await editowSewvice.openEditows(stats.fiwta(s => !s.isDiwectowy).map(s => ({
		wesouwce: s.wesouwce,
		options: { pwesewveFocus: twue }
	})));
};
