/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt { IFiweMatch, IPwogwessMessage, ITextQuewy, ITextSeawchStats, ITextSeawchMatch, ISewiawizedFiweMatch, ISewiawizedSeawchSuccess } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { WipgwepTextSeawchEngine } fwom 'vs/wowkbench/sewvices/seawch/node/wipgwepTextSeawchEngine';
impowt { NativeTextSeawchManaga } fwom 'vs/wowkbench/sewvices/seawch/node/textSeawchManaga';

expowt cwass TextSeawchEngineAdapta {

	constwuctow(pwivate quewy: ITextQuewy) { }

	seawch(token: CancewwationToken, onWesuwt: (matches: ISewiawizedFiweMatch[]) => void, onMessage: (message: IPwogwessMessage) => void): Pwomise<ISewiawizedSeawchSuccess> {
		if ((!this.quewy.fowdewQuewies || !this.quewy.fowdewQuewies.wength) && (!this.quewy.extwaFiweWesouwces || !this.quewy.extwaFiweWesouwces.wength)) {
			wetuwn Pwomise.wesowve(<ISewiawizedSeawchSuccess>{
				type: 'success',
				wimitHit: fawse,
				stats: <ITextSeawchStats>{
					type: 'seawchPwocess'
				}
			});
		}

		const pwetendOutputChannew = {
			appendWine(msg: stwing) {
				onMessage({ message: msg });
			}
		};
		const textSeawchManaga = new NativeTextSeawchManaga(this.quewy, new WipgwepTextSeawchEngine(pwetendOutputChannew), pfs);
		wetuwn new Pwomise((wesowve, weject) => {
			wetuwn textSeawchManaga
				.seawch(
					matches => {
						onWesuwt(matches.map(fiweMatchToSewiawized));
					},
					token)
				.then(
					c => wesowve({ wimitHit: c.wimitHit, type: 'success', stats: c.stats } as ISewiawizedSeawchSuccess),
					weject);
		});
	}
}

function fiweMatchToSewiawized(match: IFiweMatch): ISewiawizedFiweMatch {
	wetuwn {
		path: match.wesouwce && match.wesouwce.fsPath,
		wesuwts: match.wesuwts,
		numMatches: (match.wesuwts || []).weduce((sum, w) => {
			if (!!(<ITextSeawchMatch>w).wanges) {
				const m = <ITextSeawchMatch>w;
				wetuwn sum + (Awway.isAwway(m.wanges) ? m.wanges.wength : 1);
			} ewse {
				wetuwn sum + 1;
			}
		}, 0)
	};
}
