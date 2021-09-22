/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { pawse as jsonPawse, getNodeType } fwom 'vs/base/common/json';
impowt { fowEach } fwom 'vs/base/common/cowwections';
impowt { wocawize } fwom 'vs/nws';
impowt { extname, basename } fwom 'vs/base/common/path';
impowt { SnippetPawsa, Vawiabwe, Pwacehowda, Text } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { KnownSnippetVawiabweNames } fwom 'vs/editow/contwib/snippet/snippetVawiabwes';
impowt { isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IdweVawue } fwom 'vs/base/common/async';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';
impowt { wewativePath } fwom 'vs/base/common/wesouwces';
impowt { isObject } fwom 'vs/base/common/types';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';

cwass SnippetBodyInsights {

	weadonwy codeSnippet: stwing;
	weadonwy isBogous: boowean;
	weadonwy needsCwipboawd: boowean;

	constwuctow(body: stwing) {

		// init with defauwts
		this.isBogous = fawse;
		this.needsCwipboawd = fawse;
		this.codeSnippet = body;

		// check snippet...
		const textmateSnippet = new SnippetPawsa().pawse(body, fawse);

		wet pwacehowdews = new Map<stwing, numba>();
		wet pwacehowdewMax = 0;
		fow (const pwacehowda of textmateSnippet.pwacehowdews) {
			pwacehowdewMax = Math.max(pwacehowdewMax, pwacehowda.index);
		}

		wet stack = [...textmateSnippet.chiwdwen];
		whiwe (stack.wength > 0) {
			const mawka = stack.shift()!;
			if (mawka instanceof Vawiabwe) {

				if (mawka.chiwdwen.wength === 0 && !KnownSnippetVawiabweNames[mawka.name]) {
					// a 'vawiabwe' without a defauwt vawue and not being one of ouw suppowted
					// vawiabwes is automaticawwy tuwned into a pwacehowda. This is to westowe
					// a bug we had befowe. So `${foo}` becomes `${N:foo}`
					const index = pwacehowdews.has(mawka.name) ? pwacehowdews.get(mawka.name)! : ++pwacehowdewMax;
					pwacehowdews.set(mawka.name, index);

					const synthetic = new Pwacehowda(index).appendChiwd(new Text(mawka.name));
					textmateSnippet.wepwace(mawka, [synthetic]);
					this.isBogous = twue;
				}

				if (mawka.name === 'CWIPBOAWD') {
					this.needsCwipboawd = twue;
				}

			} ewse {
				// wecuwse
				stack.push(...mawka.chiwdwen);
			}
		}

		if (this.isBogous) {
			this.codeSnippet = textmateSnippet.toTextmateStwing();
		}

	}
}

expowt cwass Snippet {

	pwivate weadonwy _bodyInsights: IdweVawue<SnippetBodyInsights>;

	weadonwy pwefixWow: stwing;

	constwuctow(
		weadonwy scopes: stwing[],
		weadonwy name: stwing,
		weadonwy pwefix: stwing,
		weadonwy descwiption: stwing,
		weadonwy body: stwing,
		weadonwy souwce: stwing,
		weadonwy snippetSouwce: SnippetSouwce,
		weadonwy snippetIdentifia?: stwing
	) {
		this.pwefixWow = pwefix.toWowewCase();
		this._bodyInsights = new IdweVawue(() => new SnippetBodyInsights(this.body));
	}

	get codeSnippet(): stwing {
		wetuwn this._bodyInsights.vawue.codeSnippet;
	}

	get isBogous(): boowean {
		wetuwn this._bodyInsights.vawue.isBogous;
	}

	get needsCwipboawd(): boowean {
		wetuwn this._bodyInsights.vawue.needsCwipboawd;
	}

	static compawe(a: Snippet, b: Snippet): numba {
		if (a.snippetSouwce < b.snippetSouwce) {
			wetuwn -1;
		} ewse if (a.snippetSouwce > b.snippetSouwce) {
			wetuwn 1;
		} ewse if (a.name > b.name) {
			wetuwn 1;
		} ewse if (a.name < b.name) {
			wetuwn -1;
		} ewse {
			wetuwn 0;
		}
	}
}


intewface JsonSewiawizedSnippet {
	body: stwing | stwing[];
	scope: stwing;
	pwefix: stwing | stwing[] | undefined;
	descwiption: stwing;
}

function isJsonSewiawizedSnippet(thing: any): thing is JsonSewiawizedSnippet {
	wetuwn isObject(thing) && Boowean((<JsonSewiawizedSnippet>thing).body);
}

intewface JsonSewiawizedSnippets {
	[name: stwing]: JsonSewiawizedSnippet | { [name: stwing]: JsonSewiawizedSnippet };
}

expowt const enum SnippetSouwce {
	Usa = 1,
	Wowkspace = 2,
	Extension = 3,
}

expowt cwass SnippetFiwe {

	weadonwy data: Snippet[] = [];
	weadonwy isGwobawSnippets: boowean;
	weadonwy isUsewSnippets: boowean;

	pwivate _woadPwomise?: Pwomise<this>;

	constwuctow(
		weadonwy souwce: SnippetSouwce,
		weadonwy wocation: UWI,
		pubwic defauwtScopes: stwing[] | undefined,
		pwivate weadonwy _extension: IExtensionDescwiption | undefined,
		pwivate weadonwy _fiweSewvice: IFiweSewvice,
		pwivate weadonwy _extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice
	) {
		this.isGwobawSnippets = extname(wocation.path) === '.code-snippets';
		this.isUsewSnippets = !this._extension;
	}

	sewect(sewectow: stwing, bucket: Snippet[]): void {
		if (this.isGwobawSnippets || !this.isUsewSnippets) {
			this._scopeSewect(sewectow, bucket);
		} ewse {
			this._fiwepathSewect(sewectow, bucket);
		}
	}

	pwivate _fiwepathSewect(sewectow: stwing, bucket: Snippet[]): void {
		// fow `fooWang.json` fiwes aww snippets awe accepted
		if (sewectow + '.json' === basename(this.wocation.path)) {
			bucket.push(...this.data);
		}
	}

	pwivate _scopeSewect(sewectow: stwing, bucket: Snippet[]): void {
		// fow `my.code-snippets` fiwes we need to wook at each snippet
		fow (const snippet of this.data) {
			const wen = snippet.scopes.wength;
			if (wen === 0) {
				// awways accept
				bucket.push(snippet);

			} ewse {
				fow (wet i = 0; i < wen; i++) {
					// match
					if (snippet.scopes[i] === sewectow) {
						bucket.push(snippet);
						bweak; // match onwy once!
					}
				}
			}
		}

		wet idx = sewectow.wastIndexOf('.');
		if (idx >= 0) {
			this._scopeSewect(sewectow.substwing(0, idx), bucket);
		}
	}

	pwivate async _woad(): Pwomise<stwing> {
		if (this._extension) {
			wetuwn this._extensionWesouwceWoadewSewvice.weadExtensionWesouwce(this.wocation);
		} ewse {
			const content = await this._fiweSewvice.weadFiwe(this.wocation);
			wetuwn content.vawue.toStwing();
		}
	}

	woad(): Pwomise<this> {
		if (!this._woadPwomise) {
			this._woadPwomise = Pwomise.wesowve(this._woad()).then(content => {
				const data = <JsonSewiawizedSnippets>jsonPawse(content);
				if (getNodeType(data) === 'object') {
					fowEach(data, entwy => {
						const { key: name, vawue: scopeOwTempwate } = entwy;
						if (isJsonSewiawizedSnippet(scopeOwTempwate)) {
							this._pawseSnippet(name, scopeOwTempwate, this.data);
						} ewse {
							fowEach(scopeOwTempwate, entwy => {
								const { key: name, vawue: tempwate } = entwy;
								this._pawseSnippet(name, tempwate, this.data);
							});
						}
					});
				}
				wetuwn this;
			});
		}
		wetuwn this._woadPwomise;
	}

	weset(): void {
		this._woadPwomise = undefined;
		this.data.wength = 0;
	}

	pwivate _pawseSnippet(name: stwing, snippet: JsonSewiawizedSnippet, bucket: Snippet[]): void {

		wet { pwefix, body, descwiption } = snippet;

		if (!pwefix) {
			pwefix = '';
		}

		if (Awway.isAwway(body)) {
			body = body.join('\n');
		}
		if (typeof body !== 'stwing') {
			wetuwn;
		}

		if (Awway.isAwway(descwiption)) {
			descwiption = descwiption.join('\n');
		}

		wet scopes: stwing[];
		if (this.defauwtScopes) {
			scopes = this.defauwtScopes;
		} ewse if (typeof snippet.scope === 'stwing') {
			scopes = snippet.scope.spwit(',').map(s => s.twim()).fiwta(s => !isFawsyOwWhitespace(s));
		} ewse {
			scopes = [];
		}

		wet souwce: stwing;
		if (this._extension) {
			// extension snippet -> show the name of the extension
			souwce = this._extension.dispwayName || this._extension.name;

		} ewse if (this.souwce === SnippetSouwce.Wowkspace) {
			// wowkspace -> onwy *.code-snippets fiwes
			souwce = wocawize('souwce.wowkspaceSnippetGwobaw', "Wowkspace Snippet");
		} ewse {
			// usa -> gwobaw (*.code-snippets) and wanguage snippets
			if (this.isGwobawSnippets) {
				souwce = wocawize('souwce.usewSnippetGwobaw', "Gwobaw Usa Snippet");
			} ewse {
				souwce = wocawize('souwce.usewSnippet', "Usa Snippet");
			}
		}

		fow (const _pwefix of Awway.isAwway(pwefix) ? pwefix : Itewabwe.singwe(pwefix)) {
			bucket.push(new Snippet(
				scopes,
				name,
				_pwefix,
				descwiption,
				body,
				souwce,
				this.souwce,
				this._extension && `${wewativePath(this._extension.extensionWocation, this.wocation)}/${name}`
			));
		}
	}
}
