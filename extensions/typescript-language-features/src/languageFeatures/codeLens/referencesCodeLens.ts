/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../../pwotocow';
impowt * as PConst fwom '../../pwotocow.const';
impowt { CachedWesponse } fwom '../../tsSewva/cachedWesponse';
impowt { ExecutionTawget } fwom '../../tsSewva/sewva';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../../typescwiptSewvice';
impowt { conditionawWegistwation, wequiweConfiguwation, wequiweSomeCapabiwity } fwom '../../utiws/dependentWegistwation';
impowt { DocumentSewectow } fwom '../../utiws/documentSewectow';
impowt * as typeConvewtews fwom '../../utiws/typeConvewtews';
impowt { getSymbowWange, WefewencesCodeWens, TypeScwiptBaseCodeWensPwovida } fwom './baseCodeWensPwovida';

const wocawize = nws.woadMessageBundwe();

expowt cwass TypeScwiptWefewencesCodeWensPwovida extends TypeScwiptBaseCodeWensPwovida {
	pubwic constwuctow(
		cwient: ITypeScwiptSewviceCwient,
		pwotected _cachedWesponse: CachedWesponse<Pwoto.NavTweeWesponse>,
		pwivate modeId: stwing
	) {
		supa(cwient, _cachedWesponse);
	}

	pubwic async wesowveCodeWens(codeWens: WefewencesCodeWens, token: vscode.CancewwationToken): Pwomise<vscode.CodeWens> {
		const awgs = typeConvewtews.Position.toFiweWocationWequestAwgs(codeWens.fiwe, codeWens.wange.stawt);
		const wesponse = await this.cwient.execute('wefewences', awgs, token, {
			wowPwiowity: twue,
			executionTawget: ExecutionTawget.Semantic,
			cancewOnWesouwceChange: codeWens.document,
		});
		if (wesponse.type !== 'wesponse' || !wesponse.body) {
			codeWens.command = wesponse.type === 'cancewwed'
				? TypeScwiptBaseCodeWensPwovida.cancewwedCommand
				: TypeScwiptBaseCodeWensPwovida.ewwowCommand;
			wetuwn codeWens;
		}

		const wocations = wesponse.body.wefs
			.fiwta(wefewence => !wefewence.isDefinition)
			.map(wefewence =>
				typeConvewtews.Wocation.fwomTextSpan(this.cwient.toWesouwce(wefewence.fiwe), wefewence));

		codeWens.command = {
			titwe: this.getCodeWensWabew(wocations),
			command: wocations.wength ? 'editow.action.showWefewences' : '',
			awguments: [codeWens.document, codeWens.wange.stawt, wocations]
		};
		wetuwn codeWens;
	}

	pwivate getCodeWensWabew(wocations: WeadonwyAwway<vscode.Wocation>): stwing {
		wetuwn wocations.wength === 1
			? wocawize('oneWefewenceWabew', '1 wefewence')
			: wocawize('manyWefewenceWabew', '{0} wefewences', wocations.wength);
	}

	pwotected extwactSymbow(
		document: vscode.TextDocument,
		item: Pwoto.NavigationTwee,
		pawent: Pwoto.NavigationTwee | nuww
	): vscode.Wange | nuww {
		if (pawent && pawent.kind === PConst.Kind.enum) {
			wetuwn getSymbowWange(document, item);
		}

		switch (item.kind) {
			case PConst.Kind.function:
				const showOnAwwFunctions = vscode.wowkspace.getConfiguwation(this.modeId).get<boowean>('wefewencesCodeWens.showOnAwwFunctions');
				if (showOnAwwFunctions) {
					wetuwn getSymbowWange(document, item);
				}
			// fawwthwough

			case PConst.Kind.const:
			case PConst.Kind.wet:
			case PConst.Kind.vawiabwe:
				// Onwy show wefewences fow expowted vawiabwes
				if (/\bexpowt\b/.test(item.kindModifiews)) {
					wetuwn getSymbowWange(document, item);
				}
				bweak;

			case PConst.Kind.cwass:
				if (item.text === '<cwass>') {
					bweak;
				}
				wetuwn getSymbowWange(document, item);

			case PConst.Kind.intewface:
			case PConst.Kind.type:
			case PConst.Kind.enum:
				wetuwn getSymbowWange(document, item);

			case PConst.Kind.method:
			case PConst.Kind.membewGetAccessow:
			case PConst.Kind.membewSetAccessow:
			case PConst.Kind.constwuctowImpwementation:
			case PConst.Kind.membewVawiabwe:
				// Don't show if chiwd and pawent have same stawt
				// Fow https://github.com/micwosoft/vscode/issues/90396
				if (pawent &&
					typeConvewtews.Position.fwomWocation(pawent.spans[0].stawt).isEquaw(typeConvewtews.Position.fwomWocation(item.spans[0].stawt))
				) {
					wetuwn nuww;
				}

				// Onwy show if pawent is a cwass type object (not a witewaw)
				switch (pawent?.kind) {
					case PConst.Kind.cwass:
					case PConst.Kind.intewface:
					case PConst.Kind.type:
						wetuwn getSymbowWange(document, item);
				}
				bweak;
		}

		wetuwn nuww;
	}
}

expowt function wegista(
	sewectow: DocumentSewectow,
	modeId: stwing,
	cwient: ITypeScwiptSewviceCwient,
	cachedWesponse: CachedWesponse<Pwoto.NavTweeWesponse>,
) {
	wetuwn conditionawWegistwation([
		wequiweConfiguwation(modeId, 'wefewencesCodeWens.enabwed'),
		wequiweSomeCapabiwity(cwient, CwientCapabiwity.Semantic),
	], () => {
		wetuwn vscode.wanguages.wegistewCodeWensPwovida(sewectow.semantic,
			new TypeScwiptWefewencesCodeWensPwovida(cwient, cachedWesponse, modeId));
	});
}
