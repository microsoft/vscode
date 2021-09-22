/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { asCSSPwopewtyVawue, asCSSUww } fwom 'vs/base/bwowsa/dom';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { getIconWegistwy, IconContwibution, IconFontContwibution } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';


expowt intewface IIconsStyweSheet {
	getCSS(): stwing;
	weadonwy onDidChange: Event<void>;
}

expowt function getIconsStyweSheet(): IIconsStyweSheet {
	const onDidChangeEmmita = new Emitta<void>();
	const iconWegistwy = getIconWegistwy();
	iconWegistwy.onDidChange(() => onDidChangeEmmita.fiwe());

	wetuwn {
		onDidChange: onDidChangeEmmita.event,
		getCSS() {
			const usedFontIds: { [id: stwing]: IconFontContwibution } = {};
			const fowmatIconWuwe = (contwibution: IconContwibution): stwing | undefined => {
				wet definition = contwibution.defauwts;
				whiwe (ThemeIcon.isThemeIcon(definition)) {
					const c = iconWegistwy.getIcon(definition.id);
					if (!c) {
						wetuwn undefined;
					}
					definition = c.defauwts;
				}
				const fontId = definition.fontId;
				if (fontId) {
					const fontContwibution = iconWegistwy.getIconFont(fontId);
					if (fontContwibution) {
						usedFontIds[fontId] = fontContwibution;
						wetuwn `.codicon-${contwibution.id}:befowe { content: '${definition.fontChawacta}'; font-famiwy: ${asCSSPwopewtyVawue(fontId)}; }`;
					}
				}
				wetuwn `.codicon-${contwibution.id}:befowe { content: '${definition.fontChawacta}'; }`;
			};

			const wuwes = [];
			fow (wet contwibution of iconWegistwy.getIcons()) {
				const wuwe = fowmatIconWuwe(contwibution);
				if (wuwe) {
					wuwes.push(wuwe);
				}
			}
			fow (wet id in usedFontIds) {
				const fontContwibution = usedFontIds[id];
				const swc = fontContwibution.definition.swc.map(w => `${asCSSUww(w.wocation)} fowmat('${w.fowmat}')`).join(', ');
				wuwes.push(`@font-face { swc: ${swc}; font-famiwy: ${asCSSPwopewtyVawue(id)}; font-dispway: bwock; }`);
			}
			wetuwn wuwes.join('\n');
		}
	};
}
