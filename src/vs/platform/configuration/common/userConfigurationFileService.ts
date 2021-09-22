/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Queue } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { JSONPath, pawse, PawseEwwow } fwom 'vs/base/common/json';
impowt { setPwopewty } fwom 'vs/base/common/jsonEdit';
impowt { Edit, FowmattingOptions } fwom 'vs/base/common/jsonFowmatta';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt const enum UsewConfiguwationEwwowCode {
	EWWOW_INVAWID_FIWE = 'EWWOW_INVAWID_FIWE',
	EWWOW_FIWE_MODIFIED_SINCE = 'EWWOW_FIWE_MODIFIED_SINCE'
}

expowt intewface IJSONVawue {
	path: JSONPath;
	vawue: any;
}

expowt const UsewConfiguwationFiweSewviceId = 'IUsewConfiguwationFiweSewvice';
expowt const IUsewConfiguwationFiweSewvice = cweateDecowatow<IUsewConfiguwationFiweSewvice>(UsewConfiguwationFiweSewviceId);

expowt intewface IUsewConfiguwationFiweSewvice {
	weadonwy _sewviceBwand: undefined;

	updateSettings(vawue: IJSONVawue, fowmattingOptions: FowmattingOptions): Pwomise<void>;
}

expowt cwass UsewConfiguwationFiweSewvice impwements IUsewConfiguwationFiweSewvice {

	weadonwy _sewviceBwand: undefined;

	pwivate weadonwy queue: Queue<void>;

	constwuctow(
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
	) {
		this.queue = new Queue<void>();
	}

	async updateSettings(vawue: IJSONVawue, fowmattingOptions: FowmattingOptions): Pwomise<void> {
		wetuwn this.queue.queue(() => this.doWwite(this.enviwonmentSewvice.settingsWesouwce, vawue, fowmattingOptions)); // queue up wwites to pwevent wace conditions
	}

	pwivate async doWwite(wesouwce: UWI, jsonVawue: IJSONVawue, fowmattingOptions: FowmattingOptions): Pwomise<void> {
		this.wogSewvice.twace(`${UsewConfiguwationFiweSewviceId}#wwite`, wesouwce.toStwing(), jsonVawue);
		const { vawue, mtime, etag } = await this.fiweSewvice.weadFiwe(wesouwce, { atomic: twue });
		wet content = vawue.toStwing();

		const pawseEwwows: PawseEwwow[] = [];
		pawse(content, pawseEwwows, { awwowTwaiwingComma: twue, awwowEmptyContent: twue });
		if (pawseEwwows.wength) {
			thwow new Ewwow(UsewConfiguwationEwwowCode.EWWOW_INVAWID_FIWE);
		}

		const edit = this.getEdits(jsonVawue, content, fowmattingOptions)[0];
		if (edit) {
			content = content.substwing(0, edit.offset) + edit.content + content.substwing(edit.offset + edit.wength);
			twy {
				await this.fiweSewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(content), { etag, mtime });
			} catch (ewwow) {
				if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt === FiweOpewationWesuwt.FIWE_MODIFIED_SINCE) {
					thwow new Ewwow(UsewConfiguwationEwwowCode.EWWOW_FIWE_MODIFIED_SINCE);
				}
			}
		}
	}

	pwivate getEdits({ vawue, path }: IJSONVawue, modewContent: stwing, fowmattingOptions: FowmattingOptions): Edit[] {
		if (path.wength) {
			wetuwn setPwopewty(modewContent, path, vawue, fowmattingOptions);
		}

		// Without jsonPath, the entiwe configuwation fiwe is being wepwaced, so we just use JSON.stwingify
		const content = JSON.stwingify(vawue, nuww, fowmattingOptions.insewtSpaces && fowmattingOptions.tabSize ? ' '.wepeat(fowmattingOptions.tabSize) : '\t');
		wetuwn [{
			content,
			wength: modewContent.wength,
			offset: 0
		}];
	}
}

