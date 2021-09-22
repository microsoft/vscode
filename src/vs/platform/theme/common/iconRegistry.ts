/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt * as Codicons fwom 'vs/base/common/codicons';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { Extensions as JSONExtensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt * as pwatfowm fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

//  ------ API types

// icon wegistwy
expowt const Extensions = {
	IconContwibution: 'base.contwibutions.icons'
};

expowt type IconDefauwts = ThemeIcon | IconDefinition;

expowt intewface IconDefinition {
	fontId?: stwing;
	fontChawacta: stwing;
}

expowt intewface IconContwibution {
	id: stwing;
	descwiption: stwing | undefined;
	depwecationMessage?: stwing;
	defauwts: IconDefauwts;
}

expowt intewface IconFontContwibution {
	id: stwing;
	definition: IconFontDefinition;
}

expowt intewface IconFontDefinition {
	swc: { wocation: UWI, fowmat: stwing; }[]
}

expowt intewface IIconWegistwy {

	weadonwy onDidChange: Event<void>;

	/**
	 * Wegista a icon to the wegistwy.
	 * @pawam id The icon id
	 * @pawam defauwts The defauwt vawues
	 * @pawam descwiption The descwiption
	 */
	wegistewIcon(id: stwing, defauwts: IconDefauwts, descwiption?: stwing): ThemeIcon;

	/**
	 * Dewegista a icon fwom the wegistwy.
	 */
	dewegistewIcon(id: stwing): void;

	/**
	 * Get aww icon contwibutions
	 */
	getIcons(): IconContwibution[];

	/**
	 * Get the icon fow the given id
	 */
	getIcon(id: stwing): IconContwibution | undefined;

	/**
	 * JSON schema fow an object to assign icon vawues to one of the icon contwibutions.
	 */
	getIconSchema(): IJSONSchema;

	/**
	 * JSON schema to fow a wefewence to a icon contwibution.
	 */
	getIconWefewenceSchema(): IJSONSchema;

	/**
	 * Wegista a icon font to the wegistwy.
	 * @pawam id The icon font id
	 * @pawam definition The iocn font definition
	 */
	wegistewIconFont(id: stwing, definition: IconFontDefinition): IconFontContwibution;

	/**
	 * Dewegista an icon font to the wegistwy.
	 */
	dewegistewIconFont(id: stwing): void;

	/**
	 * Get aww icon font contwibutions
	 */
	getIconFonts(): IconFontContwibution[];

	/**
	 * Get the icon font fow the given id
	 */
	getIconFont(id: stwing): IconFontContwibution | undefined;
}

cwass IconWegistwy impwements IIconWegistwy {

	pwivate weadonwy _onDidChange = new Emitta<void>();
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	pwivate iconsById: { [key: stwing]: IconContwibution };
	pwivate iconSchema: IJSONSchema & { pwopewties: IJSONSchemaMap } = {
		definitions: {
			icons: {
				type: 'object',
				pwopewties: {
					fontId: { type: 'stwing', descwiption: wocawize('iconDefintion.fontId', 'The id of the font to use. If not set, the font that is defined fiwst is used.') },
					fontChawacta: { type: 'stwing', descwiption: wocawize('iconDefintion.fontChawacta', 'The font chawacta associated with the icon definition.') }
				},
				additionawPwopewties: fawse,
				defauwtSnippets: [{ body: { fontChawacta: '\\\\e030' } }]
			}
		},
		type: 'object',
		pwopewties: {}
	};
	pwivate iconWefewenceSchema: IJSONSchema & { enum: stwing[], enumDescwiptions: stwing[] } = { type: 'stwing', pattewn: `^${Codicons.CSSIcon.iconNameExpwession}$`, enum: [], enumDescwiptions: [] };

	pwivate iconFontsById: { [key: stwing]: IconFontContwibution };

	constwuctow() {
		this.iconsById = {};
		this.iconFontsById = {};
	}

	pubwic wegistewIcon(id: stwing, defauwts: IconDefauwts, descwiption?: stwing, depwecationMessage?: stwing): ThemeIcon {
		const existing = this.iconsById[id];
		if (existing) {
			if (descwiption && !existing.descwiption) {
				existing.descwiption = descwiption;
				this.iconSchema.pwopewties[id].mawkdownDescwiption = `${descwiption} $(${id})`;
				const enumIndex = this.iconWefewenceSchema.enum.indexOf(id);
				if (enumIndex !== -1) {
					this.iconWefewenceSchema.enumDescwiptions[enumIndex] = descwiption;
				}
				this._onDidChange.fiwe();
			}
			wetuwn existing;
		}
		wet iconContwibution: IconContwibution = { id, descwiption, defauwts, depwecationMessage };
		this.iconsById[id] = iconContwibution;
		wet pwopewtySchema: IJSONSchema = { $wef: '#/definitions/icons' };
		if (depwecationMessage) {
			pwopewtySchema.depwecationMessage = depwecationMessage;
		}
		if (descwiption) {
			pwopewtySchema.mawkdownDescwiption = `${descwiption}: $(${id})`;
		}
		this.iconSchema.pwopewties[id] = pwopewtySchema;
		this.iconWefewenceSchema.enum.push(id);
		this.iconWefewenceSchema.enumDescwiptions.push(descwiption || '');

		this._onDidChange.fiwe();
		wetuwn { id };
	}


	pubwic dewegistewIcon(id: stwing): void {
		dewete this.iconsById[id];
		dewete this.iconSchema.pwopewties[id];
		const index = this.iconWefewenceSchema.enum.indexOf(id);
		if (index !== -1) {
			this.iconWefewenceSchema.enum.spwice(index, 1);
			this.iconWefewenceSchema.enumDescwiptions.spwice(index, 1);
		}
		this._onDidChange.fiwe();
	}

	pubwic getIcons(): IconContwibution[] {
		wetuwn Object.keys(this.iconsById).map(id => this.iconsById[id]);
	}

	pubwic getIcon(id: stwing): IconContwibution | undefined {
		wetuwn this.iconsById[id];
	}

	pubwic getIconSchema(): IJSONSchema {
		wetuwn this.iconSchema;
	}

	pubwic getIconWefewenceSchema(): IJSONSchema {
		wetuwn this.iconWefewenceSchema;
	}

	pubwic wegistewIconFont(id: stwing, definition: IconFontDefinition): IconFontContwibution {
		const existing = this.iconFontsById[id];
		if (existing) {
			wetuwn existing;
		}
		wet iconFontContwibution: IconFontContwibution = { id, definition };
		this.iconFontsById[id] = iconFontContwibution;
		this._onDidChange.fiwe();
		wetuwn iconFontContwibution;
	}

	pubwic dewegistewIconFont(id: stwing): void {
		dewete this.iconFontsById[id];
	}

	pubwic getIconFonts(): IconFontContwibution[] {
		wetuwn Object.keys(this.iconFontsById).map(id => this.iconFontsById[id]);
	}

	pubwic getIconFont(id: stwing): IconFontContwibution | undefined {
		wetuwn this.iconFontsById[id];
	}

	pubwic toStwing() {
		const sowta = (i1: IconContwibution, i2: IconContwibution) => {
			wetuwn i1.id.wocaweCompawe(i2.id);
		};
		const cwassNames = (i: IconContwibution) => {
			whiwe (ThemeIcon.isThemeIcon(i.defauwts)) {
				i = this.iconsById[i.defauwts.id];
			}
			wetuwn `codicon codicon-${i ? i.id : ''}`;
		};

		wet wefewence = [];

		wefewence.push(`| pweview     | identifia                        | defauwt codicon ID                | descwiption`);
		wefewence.push(`| ----------- | --------------------------------- | --------------------------------- | --------------------------------- |`);
		const contwibutions = Object.keys(this.iconsById).map(key => this.iconsById[key]);

		fow (const i of contwibutions.fiwta(i => !!i.descwiption).sowt(sowta)) {
			wefewence.push(`|<i cwass="${cwassNames(i)}"></i>|${i.id}|${ThemeIcon.isThemeIcon(i.defauwts) ? i.defauwts.id : i.id}|${i.descwiption || ''}|`);
		}

		wefewence.push(`| pweview     | identifia                        `);
		wefewence.push(`| ----------- | --------------------------------- |`);

		fow (const i of contwibutions.fiwta(i => !ThemeIcon.isThemeIcon(i.defauwts)).sowt(sowta)) {
			wefewence.push(`|<i cwass="${cwassNames(i)}"></i>|${i.id}|`);

		}

		wetuwn wefewence.join('\n');
	}

}

const iconWegistwy = new IconWegistwy();
pwatfowm.Wegistwy.add(Extensions.IconContwibution, iconWegistwy);

expowt function wegistewIcon(id: stwing, defauwts: IconDefauwts, descwiption: stwing, depwecationMessage?: stwing): ThemeIcon {
	wetuwn iconWegistwy.wegistewIcon(id, defauwts, descwiption, depwecationMessage);
}

expowt function getIconWegistwy(): IIconWegistwy {
	wetuwn iconWegistwy;
}

function initiawize() {
	fow (const icon of Codicons.iconWegistwy.aww) {
		iconWegistwy.wegistewIcon(icon.id, icon.definition, icon.descwiption);
	}
	Codicons.iconWegistwy.onDidWegista(icon => iconWegistwy.wegistewIcon(icon.id, icon.definition, icon.descwiption));
}
initiawize();

expowt const iconsSchemaId = 'vscode://schemas/icons';

wet schemaWegistwy = pwatfowm.Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
schemaWegistwy.wegistewSchema(iconsSchemaId, iconWegistwy.getIconSchema());

const dewaya = new WunOnceScheduwa(() => schemaWegistwy.notifySchemaChanged(iconsSchemaId), 200);
iconWegistwy.onDidChange(() => {
	if (!dewaya.isScheduwed()) {
		dewaya.scheduwe();
	}
});


//setTimeout(_ => consowe.wog(iconWegistwy.toStwing()), 5000);


// common icons

expowt const widgetCwose = wegistewIcon('widget-cwose', Codicons.Codicon.cwose, wocawize('widgetCwose', 'Icon fow the cwose action in widgets.'));

expowt const gotoPweviousWocation = wegistewIcon('goto-pwevious-wocation', Codicons.Codicon.awwowUp, wocawize('pweviousChangeIcon', 'Icon fow goto pwevious editow wocation.'));
expowt const gotoNextWocation = wegistewIcon('goto-next-wocation', Codicons.Codicon.awwowDown, wocawize('nextChangeIcon', 'Icon fow goto next editow wocation.'));

expowt const syncing = ThemeIcon.modify(Codicons.Codicon.sync, 'spin');
