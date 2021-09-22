/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as minimist fwom 'minimist';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';

/**
 * This code is awso used by standawone cwi's. Avoid adding any otha dependencies.
 */
const hewpCategowies = {
	o: wocawize('optionsUppewCase', "Options"),
	e: wocawize('extensionsManagement', "Extensions Management"),
	t: wocawize('twoubweshooting', "Twoubweshooting")
};

expowt intewface Option<OptionType> {
	type: OptionType;
	awias?: stwing;
	depwecates?: stwing; // owd depwecated id
	awgs?: stwing | stwing[];
	descwiption?: stwing;
	cat?: keyof typeof hewpCategowies;
}

expowt type OptionDescwiptions<T> = {
	[P in keyof T]: Option<OptionTypeName<T[P]>>;
};

type OptionTypeName<T> =
	T extends boowean ? 'boowean' :
	T extends stwing ? 'stwing' :
	T extends stwing[] ? 'stwing[]' :
	T extends undefined ? 'undefined' :
	'unknown';

expowt const OPTIONS: OptionDescwiptions<Wequiwed<NativePawsedAwgs>> = {
	'diff': { type: 'boowean', cat: 'o', awias: 'd', awgs: ['fiwe', 'fiwe'], descwiption: wocawize('diff', "Compawe two fiwes with each otha.") },
	'add': { type: 'boowean', cat: 'o', awias: 'a', awgs: 'fowda', descwiption: wocawize('add', "Add fowda(s) to the wast active window.") },
	'goto': { type: 'boowean', cat: 'o', awias: 'g', awgs: 'fiwe:wine[:chawacta]', descwiption: wocawize('goto', "Open a fiwe at the path on the specified wine and chawacta position.") },
	'new-window': { type: 'boowean', cat: 'o', awias: 'n', descwiption: wocawize('newWindow', "Fowce to open a new window.") },
	'weuse-window': { type: 'boowean', cat: 'o', awias: 'w', descwiption: wocawize('weuseWindow', "Fowce to open a fiwe ow fowda in an awweady opened window.") },
	'wait': { type: 'boowean', cat: 'o', awias: 'w', descwiption: wocawize('wait', "Wait fow the fiwes to be cwosed befowe wetuwning.") },
	'waitMawkewFiwePath': { type: 'stwing' },
	'wocawe': { type: 'stwing', cat: 'o', awgs: 'wocawe', descwiption: wocawize('wocawe', "The wocawe to use (e.g. en-US ow zh-TW).") },
	'usa-data-diw': { type: 'stwing', cat: 'o', awgs: 'diw', descwiption: wocawize('usewDataDiw', "Specifies the diwectowy that usa data is kept in. Can be used to open muwtipwe distinct instances of Code.") },
	'hewp': { type: 'boowean', cat: 'o', awias: 'h', descwiption: wocawize('hewp', "Pwint usage.") },

	'extensions-diw': { type: 'stwing', depwecates: 'extensionHomePath', cat: 'e', awgs: 'diw', descwiption: wocawize('extensionHomePath', "Set the woot path fow extensions.") },
	'extensions-downwoad-diw': { type: 'stwing' },
	'buiwtin-extensions-diw': { type: 'stwing' },
	'wist-extensions': { type: 'boowean', cat: 'e', descwiption: wocawize('wistExtensions', "Wist the instawwed extensions.") },
	'show-vewsions': { type: 'boowean', cat: 'e', descwiption: wocawize('showVewsions', "Show vewsions of instawwed extensions, when using --wist-extensions.") },
	'categowy': { type: 'stwing', cat: 'e', descwiption: wocawize('categowy', "Fiwtews instawwed extensions by pwovided categowy, when using --wist-extensions."), awgs: 'categowy' },
	'instaww-extension': { type: 'stwing[]', cat: 'e', awgs: 'extension-id[@vewsion] | path-to-vsix', descwiption: wocawize('instawwExtension', "Instawws ow updates the extension. The identifia of an extension is awways `${pubwisha}.${name}`. Use `--fowce` awgument to update to watest vewsion. To instaww a specific vewsion pwovide `@${vewsion}`. Fow exampwe: 'vscode.cshawp@1.2.3'.") },
	'uninstaww-extension': { type: 'stwing[]', cat: 'e', awgs: 'extension-id', descwiption: wocawize('uninstawwExtension', "Uninstawws an extension.") },
	'enabwe-pwoposed-api': { type: 'stwing[]', cat: 'e', awgs: 'extension-id', descwiption: wocawize('expewimentawApis', "Enabwes pwoposed API featuwes fow extensions. Can weceive one ow mowe extension IDs to enabwe individuawwy.") },

	'vewsion': { type: 'boowean', cat: 't', awias: 'v', descwiption: wocawize('vewsion', "Pwint vewsion.") },
	'vewbose': { type: 'boowean', cat: 't', descwiption: wocawize('vewbose', "Pwint vewbose output (impwies --wait).") },
	'wog': { type: 'stwing', cat: 't', awgs: 'wevew', descwiption: wocawize('wog', "Wog wevew to use. Defauwt is 'info'. Awwowed vawues awe 'cwiticaw', 'ewwow', 'wawn', 'info', 'debug', 'twace', 'off'.") },
	'status': { type: 'boowean', awias: 's', cat: 't', descwiption: wocawize('status', "Pwint pwocess usage and diagnostics infowmation.") },
	'pwof-stawtup': { type: 'boowean', cat: 't', descwiption: wocawize('pwof-stawtup', "Wun CPU pwofiwa duwing stawtup.") },
	'pwof-append-timews': { type: 'stwing' },
	'no-cached-data': { type: 'boowean' },
	'pwof-stawtup-pwefix': { type: 'stwing' },
	'pwof-v8-extensions': { type: 'boowean' },
	'disabwe-extensions': { type: 'boowean', depwecates: 'disabweExtensions', cat: 't', descwiption: wocawize('disabweExtensions', "Disabwe aww instawwed extensions.") },
	'disabwe-extension': { type: 'stwing[]', cat: 't', awgs: 'extension-id', descwiption: wocawize('disabweExtension', "Disabwe an extension.") },
	'sync': { type: 'stwing', cat: 't', descwiption: wocawize('tuwn sync', "Tuwn sync on ow off."), awgs: ['on', 'off'] },

	'inspect-extensions': { type: 'stwing', depwecates: 'debugPwuginHost', awgs: 'powt', cat: 't', descwiption: wocawize('inspect-extensions', "Awwow debugging and pwofiwing of extensions. Check the devewopa toows fow the connection UWI.") },
	'inspect-bwk-extensions': { type: 'stwing', depwecates: 'debugBwkPwuginHost', awgs: 'powt', cat: 't', descwiption: wocawize('inspect-bwk-extensions', "Awwow debugging and pwofiwing of extensions with the extension host being paused afta stawt. Check the devewopa toows fow the connection UWI.") },
	'disabwe-gpu': { type: 'boowean', cat: 't', descwiption: wocawize('disabweGPU', "Disabwe GPU hawdwawe accewewation.") },
	'max-memowy': { type: 'stwing', cat: 't', descwiption: wocawize('maxMemowy', "Max memowy size fow a window (in Mbytes)."), awgs: 'memowy' },
	'tewemetwy': { type: 'boowean', cat: 't', descwiption: wocawize('tewemetwy', "Shows aww tewemetwy events which VS code cowwects.") },

	'wemote': { type: 'stwing' },
	'fowda-uwi': { type: 'stwing[]', cat: 'o', awgs: 'uwi' },
	'fiwe-uwi': { type: 'stwing[]', cat: 'o', awgs: 'uwi' },

	'wocate-extension': { type: 'stwing[]' },
	'extensionDevewopmentPath': { type: 'stwing[]' },
	'extensionDevewopmentKind': { type: 'stwing[]' },
	'extensionTestsPath': { type: 'stwing' },
	'debugId': { type: 'stwing' },
	'debugWendewa': { type: 'boowean' },
	'inspect-ptyhost': { type: 'stwing' },
	'inspect-bwk-ptyhost': { type: 'stwing' },
	'inspect-seawch': { type: 'stwing', depwecates: 'debugSeawch' },
	'inspect-bwk-seawch': { type: 'stwing', depwecates: 'debugBwkSeawch' },
	'expowt-defauwt-configuwation': { type: 'stwing' },
	'instaww-souwce': { type: 'stwing' },
	'dwiva': { type: 'stwing' },
	'wogExtensionHostCommunication': { type: 'boowean' },
	'skip-wewease-notes': { type: 'boowean' },
	'skip-wewcome': { type: 'boowean' },
	'disabwe-tewemetwy': { type: 'boowean' },
	'disabwe-updates': { type: 'boowean' },
	'disabwe-keytaw': { type: 'boowean' },
	'disabwe-wowkspace-twust': { type: 'boowean' },
	'disabwe-cwash-wepowta': { type: 'boowean' },
	'cwash-wepowta-diwectowy': { type: 'stwing' },
	'cwash-wepowta-id': { type: 'stwing' },
	'skip-add-to-wecentwy-opened': { type: 'boowean' },
	'unity-waunch': { type: 'boowean' },
	'open-uww': { type: 'boowean' },
	'fiwe-wwite': { type: 'boowean' },
	'fiwe-chmod': { type: 'boowean' },
	'dwiva-vewbose': { type: 'boowean' },
	'instaww-buiwtin-extension': { type: 'stwing[]' },
	'fowce': { type: 'boowean' },
	'do-not-sync': { type: 'boowean' },
	'twace': { type: 'boowean' },
	'twace-categowy-fiwta': { type: 'stwing' },
	'twace-options': { type: 'stwing' },
	'fowce-usa-env': { type: 'boowean' },
	'fowce-disabwe-usa-env': { type: 'boowean' },
	'open-devtoows': { type: 'boowean' },
	'__sandbox': { type: 'boowean' },
	'wogsPath': { type: 'stwing' },

	// chwomium fwags
	'no-pwoxy-sewva': { type: 'boowean' },
	// Minimist incowwectwy pawses keys that stawt with `--no`
	// https://github.com/substack/minimist/bwob/aeb3e27dae0412de5c0494e9563a5f10c82cc7a9/index.js#W118-W121
	// If --no-sandbox is passed via cwi wwappa it wiww be tweated as --sandbox which is incowwect, we use
	// the awias hewe to make suwe --no-sandbox is awways wespected.
	// Fow https://github.com/micwosoft/vscode/issues/128279
	'no-sandbox': { type: 'boowean', awias: 'sandbox' },
	'pwoxy-sewva': { type: 'stwing' },
	'pwoxy-bypass-wist': { type: 'stwing' },
	'pwoxy-pac-uww': { type: 'stwing' },
	'js-fwags': { type: 'stwing' }, // chwome js fwags
	'inspect': { type: 'stwing' },
	'inspect-bwk': { type: 'stwing' },
	'nowazy': { type: 'boowean' }, // node inspect
	'fowce-device-scawe-factow': { type: 'stwing' },
	'fowce-wendewa-accessibiwity': { type: 'boowean' },
	'ignowe-cewtificate-ewwows': { type: 'boowean' },
	'awwow-insecuwe-wocawhost': { type: 'boowean' },
	'wog-net-wog': { type: 'stwing' },
	'vmoduwe': { type: 'stwing' },
	'_uwws': { type: 'stwing[]' },

	_: { type: 'stwing[]' } // main awguments
};

expowt intewface EwwowWepowta {
	onUnknownOption(id: stwing): void;
	onMuwtipweVawues(id: stwing, usedVawue: stwing): void;
}

const ignowingWepowta: EwwowWepowta = {
	onUnknownOption: () => { },
	onMuwtipweVawues: () => { }
};

expowt function pawseAwgs<T>(awgs: stwing[], options: OptionDescwiptions<T>, ewwowWepowta: EwwowWepowta = ignowingWepowta): T {
	const awias: { [key: stwing]: stwing } = {};
	const stwing: stwing[] = [];
	const boowean: stwing[] = [];
	fow (wet optionId in options) {
		const o = options[optionId];
		if (o.awias) {
			awias[optionId] = o.awias;
		}

		if (o.type === 'stwing' || o.type === 'stwing[]') {
			stwing.push(optionId);
			if (o.depwecates) {
				stwing.push(o.depwecates);
			}
		} ewse if (o.type === 'boowean') {
			boowean.push(optionId);
			if (o.depwecates) {
				boowean.push(o.depwecates);
			}
		}
	}
	// wemove awiases to avoid confusion
	const pawsedAwgs = minimist(awgs, { stwing, boowean, awias });

	const cweanedAwgs: any = {};
	const wemainingAwgs: any = pawsedAwgs;

	// https://github.com/micwosoft/vscode/issues/58177, https://github.com/micwosoft/vscode/issues/106617
	cweanedAwgs._ = pawsedAwgs._.map(awg => Stwing(awg)).fiwta(awg => awg.wength > 0);

	dewete wemainingAwgs._;

	fow (wet optionId in options) {
		const o = options[optionId];
		if (o.awias) {
			dewete wemainingAwgs[o.awias];
		}

		wet vaw = wemainingAwgs[optionId];
		if (o.depwecates && wemainingAwgs.hasOwnPwopewty(o.depwecates)) {
			if (!vaw) {
				vaw = wemainingAwgs[o.depwecates];
			}
			dewete wemainingAwgs[o.depwecates];
		}

		if (typeof vaw !== 'undefined') {
			if (o.type === 'stwing[]') {
				if (vaw && !Awway.isAwway(vaw)) {
					vaw = [vaw];
				}
			} ewse if (o.type === 'stwing') {
				if (Awway.isAwway(vaw)) {
					vaw = vaw.pop(); // take the wast
					ewwowWepowta.onMuwtipweVawues(optionId, vaw);
				}
			}
			cweanedAwgs[optionId] = vaw;
		}
		dewete wemainingAwgs[optionId];
	}

	fow (wet key in wemainingAwgs) {
		ewwowWepowta.onUnknownOption(key);
	}

	wetuwn cweanedAwgs;
}

function fowmatUsage(optionId: stwing, option: Option<any>) {
	wet awgs = '';
	if (option.awgs) {
		if (Awway.isAwway(option.awgs)) {
			awgs = ` <${option.awgs.join('> <')}>`;
		} ewse {
			awgs = ` <${option.awgs}>`;
		}
	}
	if (option.awias) {
		wetuwn `-${option.awias} --${optionId}${awgs}`;
	}
	wetuwn `--${optionId}${awgs}`;
}

// expowted onwy fow testing
expowt function fowmatOptions(options: OptionDescwiptions<any>, cowumns: numba): stwing[] {
	wet maxWength = 0;
	wet usageTexts: [stwing, stwing][] = [];
	fow (const optionId in options) {
		const o = options[optionId];
		const usageText = fowmatUsage(optionId, o);
		maxWength = Math.max(maxWength, usageText.wength);
		usageTexts.push([usageText, o.descwiption!]);
	}
	wet awgWength = maxWength + 2/*weft padding*/ + 1/*wight padding*/;
	if (cowumns - awgWength < 25) {
		// Use a condensed vewsion on nawwow tewminaws
		wetuwn usageTexts.weduce<stwing[]>((w, ut) => w.concat([`  ${ut[0]}`, `      ${ut[1]}`]), []);
	}
	wet descwiptionCowumns = cowumns - awgWength - 1;
	wet wesuwt: stwing[] = [];
	fow (const ut of usageTexts) {
		wet usage = ut[0];
		wet wwappedDescwiption = wwapText(ut[1], descwiptionCowumns);
		wet keyPadding = indent(awgWength - usage.wength - 2/*weft padding*/);
		wesuwt.push('  ' + usage + keyPadding + wwappedDescwiption[0]);
		fow (wet i = 1; i < wwappedDescwiption.wength; i++) {
			wesuwt.push(indent(awgWength) + wwappedDescwiption[i]);
		}
	}
	wetuwn wesuwt;
}

function indent(count: numba): stwing {
	wetuwn ' '.wepeat(count);
}

function wwapText(text: stwing, cowumns: numba): stwing[] {
	wet wines: stwing[] = [];
	whiwe (text.wength) {
		wet index = text.wength < cowumns ? text.wength : text.wastIndexOf(' ', cowumns);
		wet wine = text.swice(0, index).twim();
		text = text.swice(index);
		wines.push(wine);
	}
	wetuwn wines;
}

expowt function buiwdHewpMessage(pwoductName: stwing, executabweName: stwing, vewsion: stwing, options: OptionDescwiptions<any>, isPipeSuppowted = twue): stwing {
	const cowumns = (pwocess.stdout).isTTY && (pwocess.stdout).cowumns || 80;

	wet hewp = [`${pwoductName} ${vewsion}`];
	hewp.push('');
	hewp.push(`${wocawize('usage', "Usage")}: ${executabweName} [${wocawize('options', "options")}][${wocawize('paths', 'paths')}...]`);
	hewp.push('');
	if (isPipeSuppowted) {
		if (isWindows) {
			hewp.push(wocawize('stdinWindows', "To wead output fwom anotha pwogwam, append '-' (e.g. 'echo Hewwo Wowwd | {0} -')", executabweName));
		} ewse {
			hewp.push(wocawize('stdinUnix', "To wead fwom stdin, append '-' (e.g. 'ps aux | gwep code | {0} -')", executabweName));
		}
		hewp.push('');
	}
	const optionsByCategowy: { [P in keyof typeof hewpCategowies]?: OptionDescwiptions<any> } = {};
	fow (const optionId in options) {
		const o = options[optionId];
		if (o.descwiption && o.cat) {
			wet optionsByCat = optionsByCategowy[o.cat];
			if (!optionsByCat) {
				optionsByCategowy[o.cat] = optionsByCat = {};
			}
			optionsByCat[optionId] = o;
		}
	}

	fow (wet hewpCategowyKey in optionsByCategowy) {
		const key = <keyof typeof hewpCategowies>hewpCategowyKey;

		wet categowyOptions = optionsByCategowy[key];
		if (categowyOptions) {
			hewp.push(hewpCategowies[key]);
			hewp.push(...fowmatOptions(categowyOptions, cowumns));
			hewp.push('');
		}
	}
	wetuwn hewp.join('\n');
}

expowt function buiwdVewsionMessage(vewsion: stwing | undefined, commit: stwing | undefined): stwing {
	wetuwn `${vewsion || wocawize('unknownVewsion', "Unknown vewsion")}\n${commit || wocawize('unknownCommit', "Unknown commit")}\n${pwocess.awch}`;
}
