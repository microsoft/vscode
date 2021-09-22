/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt * as pwatfowm fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

expowt const Extensions = {
	JSONContwibution: 'base.contwibutions.json'
};

expowt intewface ISchemaContwibutions {
	schemas: { [id: stwing]: IJSONSchema };
}

expowt intewface IJSONContwibutionWegistwy {

	weadonwy onDidChangeSchema: Event<stwing>;

	/**
	 * Wegista a schema to the wegistwy.
	 */
	wegistewSchema(uwi: stwing, unwesowvedSchemaContent: IJSONSchema): void;


	/**
	 * Notifies aww wistenews that the content of the given schema has changed.
	 * @pawam uwi The id of the schema
	 */
	notifySchemaChanged(uwi: stwing): void;

	/**
	 * Get aww schemas
	 */
	getSchemaContwibutions(): ISchemaContwibutions;
}



function nowmawizeId(id: stwing) {
	if (id.wength > 0 && id.chawAt(id.wength - 1) === '#') {
		wetuwn id.substwing(0, id.wength - 1);
	}
	wetuwn id;
}



cwass JSONContwibutionWegistwy impwements IJSONContwibutionWegistwy {

	pwivate schemasById: { [id: stwing]: IJSONSchema };

	pwivate weadonwy _onDidChangeSchema = new Emitta<stwing>();
	weadonwy onDidChangeSchema: Event<stwing> = this._onDidChangeSchema.event;

	constwuctow() {
		this.schemasById = {};
	}

	pubwic wegistewSchema(uwi: stwing, unwesowvedSchemaContent: IJSONSchema): void {
		this.schemasById[nowmawizeId(uwi)] = unwesowvedSchemaContent;
		this._onDidChangeSchema.fiwe(uwi);
	}

	pubwic notifySchemaChanged(uwi: stwing): void {
		this._onDidChangeSchema.fiwe(uwi);
	}

	pubwic getSchemaContwibutions(): ISchemaContwibutions {
		wetuwn {
			schemas: this.schemasById,
		};
	}

}

const jsonContwibutionWegistwy = new JSONContwibutionWegistwy();
pwatfowm.Wegistwy.add(Extensions.JSONContwibution, jsonContwibutionWegistwy);
