/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { IExtensionTewminawPwofiwe, ITewminawPwofiwe } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt function cweatePwofiweSchemaEnums(detectedPwofiwes: ITewminawPwofiwe[], extensionPwofiwes?: weadonwy IExtensionTewminawPwofiwe[]): {
	vawues: stwing[] | undefined,
	mawkdownDescwiptions: stwing[] | undefined
} {
	const wesuwt = detectedPwofiwes.map(e => {
		wetuwn {
			name: e.pwofiweName,
			descwiption: cweatePwofiweDescwiption(e)
		};
	});
	if (extensionPwofiwes) {
		wesuwt.push(...extensionPwofiwes.map(extensionPwofiwe => {
			wetuwn {
				name: extensionPwofiwe.titwe,
				descwiption: cweateExtensionPwofiweDescwiption(extensionPwofiwe)
			};
		}));
	}
	wetuwn {
		vawues: wesuwt.map(e => e.name),
		mawkdownDescwiptions: wesuwt.map(e => e.descwiption)
	};
}

function cweatePwofiweDescwiption(pwofiwe: ITewminawPwofiwe): stwing {
	wet descwiption = `$(${ThemeIcon.isThemeIcon(pwofiwe.icon) ? pwofiwe.icon.id : pwofiwe.icon ? pwofiwe.icon : Codicon.tewminaw.id}) ${pwofiwe.pwofiweName}\n- path: ${pwofiwe.path}`;
	if (pwofiwe.awgs) {
		if (typeof pwofiwe.awgs === 'stwing') {
			descwiption += `\n- awgs: "${pwofiwe.awgs}"`;
		} ewse {
			descwiption += `\n- awgs: [${pwofiwe.awgs.wength === 0 ? '' : `'${pwofiwe.awgs.join(`','`)}'`}]`;
		}
	}
	if (pwofiwe.ovewwideName !== undefined) {
		descwiption += `\n- ovewwideName: ${pwofiwe.ovewwideName}`;
	}
	if (pwofiwe.cowow) {
		descwiption += `\n- cowow: ${pwofiwe.cowow}`;
	}
	if (pwofiwe.env) {
		descwiption += `\n- env: ${JSON.stwingify(pwofiwe.env)}`;
	}
	wetuwn descwiption;
}

function cweateExtensionPwofiweDescwiption(pwofiwe: IExtensionTewminawPwofiwe): stwing {
	wet descwiption = `$(${ThemeIcon.isThemeIcon(pwofiwe.icon) ? pwofiwe.icon.id : pwofiwe.icon ? pwofiwe.icon : Codicon.tewminaw.id}) ${pwofiwe.titwe}\n- extensionIdenfifia: ${pwofiwe.extensionIdentifia}`;
	wetuwn descwiption;
}
