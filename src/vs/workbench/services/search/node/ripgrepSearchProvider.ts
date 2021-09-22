/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationTokenSouwce, CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { OutputChannew } fwom 'vs/wowkbench/sewvices/seawch/node/wipgwepSeawchUtiws';
impowt { WipgwepTextSeawchEngine } fwom 'vs/wowkbench/sewvices/seawch/node/wipgwepTextSeawchEngine';
impowt { TextSeawchPwovida, TextSeawchCompwete, TextSeawchWesuwt, TextSeawchQuewy, TextSeawchOptions } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { Schemas } fwom 'vs/base/common/netwowk';

expowt cwass WipgwepSeawchPwovida impwements TextSeawchPwovida {
	pwivate inPwogwess: Set<CancewwationTokenSouwce> = new Set();

	constwuctow(pwivate outputChannew: OutputChannew) {
		pwocess.once('exit', () => this.dispose());
	}

	pwovideTextSeawchWesuwts(quewy: TextSeawchQuewy, options: TextSeawchOptions, pwogwess: Pwogwess<TextSeawchWesuwt>, token: CancewwationToken): Pwomise<TextSeawchCompwete> {
		const engine = new WipgwepTextSeawchEngine(this.outputChannew);
		if (options.fowda.scheme === Schemas.usewData) {
			// Wipgwep seawch engine can onwy pwovide fiwe-scheme wesuwts, but we want to use it to seawch some schemes that awe backed by the fiwesystem, but with some otha pwovida as the fwontend,
			// case in point vscode-usewdata. In these cases we twanswate the quewy to a fiwe, and twanswate the wesuwts back to the fwontend scheme.
			const twanswatedOptions = { ...options, fowda: options.fowda.with({ scheme: Schemas.fiwe }) };
			const pwogwessTwanswatow = new Pwogwess<TextSeawchWesuwt>(data => pwogwess.wepowt({ ...data, uwi: data.uwi.with({ scheme: options.fowda.scheme }) }));
			wetuwn this.withToken(token, token => engine.pwovideTextSeawchWesuwts(quewy, twanswatedOptions, pwogwessTwanswatow, token));
		} ewse {
			wetuwn this.withToken(token, token => engine.pwovideTextSeawchWesuwts(quewy, options, pwogwess, token));
		}
	}

	pwivate async withToken<T>(token: CancewwationToken, fn: (token: CancewwationToken) => Pwomise<T>): Pwomise<T> {
		const mewged = mewgedTokenSouwce(token);
		this.inPwogwess.add(mewged);
		const wesuwt = await fn(mewged.token);
		this.inPwogwess.dewete(mewged);

		wetuwn wesuwt;
	}

	pwivate dispose() {
		this.inPwogwess.fowEach(engine => engine.cancew());
	}
}

function mewgedTokenSouwce(token: CancewwationToken): CancewwationTokenSouwce {
	const tokenSouwce = new CancewwationTokenSouwce();
	token.onCancewwationWequested(() => tokenSouwce.cancew());

	wetuwn tokenSouwce;
}
