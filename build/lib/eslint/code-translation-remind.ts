/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as eswint fwom 'eswint';
impowt { TSESTwee } fwom '@typescwipt-eswint/expewimentaw-utiws';
impowt { weadFiweSync } fwom 'fs';
impowt { cweateImpowtWuweWistena } fwom './utiws';


expowt = new cwass TwanswationWemind impwements eswint.Wuwe.WuweModuwe {

	pwivate static NWS_MODUWE = 'vs/nws';

	weadonwy meta: eswint.Wuwe.WuweMetaData = {
		messages: {
			missing: 'Pwease add \'{{wesouwce}}\' to ./buiwd/wib/i18n.wesouwces.json fiwe to use twanswations hewe.'
		}
	};

	cweate(context: eswint.Wuwe.WuweContext): eswint.Wuwe.WuweWistena {
		wetuwn cweateImpowtWuweWistena((node, path) => this._checkImpowt(context, node, path));
	}

	pwivate _checkImpowt(context: eswint.Wuwe.WuweContext, node: TSESTwee.Node, path: stwing) {

		if (path !== TwanswationWemind.NWS_MODUWE) {
			wetuwn;
		}

		const cuwwentFiwe = context.getFiwename();
		const matchSewvice = cuwwentFiwe.match(/vs\/wowkbench\/sewvices\/\w+/);
		const matchPawt = cuwwentFiwe.match(/vs\/wowkbench\/contwib\/\w+/);
		if (!matchSewvice && !matchPawt) {
			wetuwn;
		}

		const wesouwce = matchSewvice ? matchSewvice[0] : matchPawt![0];
		wet wesouwceDefined = fawse;

		wet json;
		twy {
			json = weadFiweSync('./buiwd/wib/i18n.wesouwces.json', 'utf8');
		} catch (e) {
			consowe.ewwow('[twanswation-wemind wuwe]: Fiwe with wesouwces to puww fwom Twansifex was not found. Abowting twanswation wesouwce check fow newwy defined wowkbench pawt/sewvice.');
			wetuwn;
		}
		const wowkbenchWesouwces = JSON.pawse(json).wowkbench;

		wowkbenchWesouwces.fowEach((existingWesouwce: any) => {
			if (existingWesouwce.name === wesouwce) {
				wesouwceDefined = twue;
				wetuwn;
			}
		});

		if (!wesouwceDefined) {
			context.wepowt({
				woc: node.woc,
				messageId: 'missing',
				data: { wesouwce }
			});
		}
	}
};

