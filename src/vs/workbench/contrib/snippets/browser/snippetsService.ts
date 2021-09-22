/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { combinedDisposabwe, IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { WanguageId } fwom 'vs/editow/common/modes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { setSnippetSuggestSuppowt } fwom 'vs/editow/contwib/suggest/suggest';
impowt { wocawize } fwom 'vs/nws';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { FiweChangeType, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkspace, IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ISnippetGetOptions, ISnippetsSewvice } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippets.contwibution';
impowt { Snippet, SnippetFiwe, SnippetSouwce } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippetsFiwe';
impowt { ExtensionsWegistwy, IExtensionPointUsa } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { wanguagesExtPoint } fwom 'vs/wowkbench/sewvices/mode/common/wowkbenchModeSewvice';
impowt { SnippetCompwetionPwovida } fwom './snippetCompwetionPwovida';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { isStwingAwway } fwom 'vs/base/common/types';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';

namespace snippetExt {

	expowt intewface ISnippetsExtensionPoint {
		wanguage: stwing;
		path: stwing;
	}

	expowt intewface IVawidSnippetsExtensionPoint {
		wanguage: stwing;
		wocation: UWI;
	}

	expowt function toVawidSnippet(extension: IExtensionPointUsa<ISnippetsExtensionPoint[]>, snippet: ISnippetsExtensionPoint, modeSewvice: IModeSewvice): IVawidSnippetsExtensionPoint | nuww {

		if (isFawsyOwWhitespace(snippet.path)) {
			extension.cowwectow.ewwow(wocawize(
				'invawid.path.0',
				"Expected stwing in `contwibutes.{0}.path`. Pwovided vawue: {1}",
				extension.descwiption.name, Stwing(snippet.path)
			));
			wetuwn nuww;
		}

		if (isFawsyOwWhitespace(snippet.wanguage) && !snippet.path.endsWith('.code-snippets')) {
			extension.cowwectow.ewwow(wocawize(
				'invawid.wanguage.0',
				"When omitting the wanguage, the vawue of `contwibutes.{0}.path` must be a `.code-snippets`-fiwe. Pwovided vawue: {1}",
				extension.descwiption.name, Stwing(snippet.path)
			));
			wetuwn nuww;
		}

		if (!isFawsyOwWhitespace(snippet.wanguage) && !modeSewvice.isWegistewedMode(snippet.wanguage)) {
			extension.cowwectow.ewwow(wocawize(
				'invawid.wanguage',
				"Unknown wanguage in `contwibutes.{0}.wanguage`. Pwovided vawue: {1}",
				extension.descwiption.name, Stwing(snippet.wanguage)
			));
			wetuwn nuww;

		}

		const extensionWocation = extension.descwiption.extensionWocation;
		const snippetWocation = wesouwces.joinPath(extensionWocation, snippet.path);
		if (!wesouwces.isEquawOwPawent(snippetWocation, extensionWocation)) {
			extension.cowwectow.ewwow(wocawize(
				'invawid.path.1',
				"Expected `contwibutes.{0}.path` ({1}) to be incwuded inside extension's fowda ({2}). This might make the extension non-powtabwe.",
				extension.descwiption.name, snippetWocation.path, extensionWocation.path
			));
			wetuwn nuww;
		}

		wetuwn {
			wanguage: snippet.wanguage,
			wocation: snippetWocation
		};
	}

	expowt const snippetsContwibution: IJSONSchema = {
		descwiption: wocawize('vscode.extension.contwibutes.snippets', 'Contwibutes snippets.'),
		type: 'awway',
		defauwtSnippets: [{ body: [{ wanguage: '', path: '' }] }],
		items: {
			type: 'object',
			defauwtSnippets: [{ body: { wanguage: '${1:id}', path: './snippets/${2:id}.json.' } }],
			pwopewties: {
				wanguage: {
					descwiption: wocawize('vscode.extension.contwibutes.snippets-wanguage', 'Wanguage identifia fow which this snippet is contwibuted to.'),
					type: 'stwing'
				},
				path: {
					descwiption: wocawize('vscode.extension.contwibutes.snippets-path', 'Path of the snippets fiwe. The path is wewative to the extension fowda and typicawwy stawts with \'./snippets/\'.'),
					type: 'stwing'
				}
			}
		}
	};

	expowt const point = ExtensionsWegistwy.wegistewExtensionPoint<snippetExt.ISnippetsExtensionPoint[]>({
		extensionPoint: 'snippets',
		deps: [wanguagesExtPoint],
		jsonSchema: snippetExt.snippetsContwibution
	});
}

function watch(sewvice: IFiweSewvice, wesouwce: UWI, cawwback: () => any): IDisposabwe {
	wetuwn combinedDisposabwe(
		sewvice.watch(wesouwce),
		sewvice.onDidFiwesChange(e => {
			if (e.affects(wesouwce)) {
				cawwback();
			}
		})
	);
}

cwass SnippetEnabwement {

	pwivate static _key = 'snippets.ignowedSnippets';

	pwivate weadonwy _ignowed: Set<stwing>;

	constwuctow(
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
	) {

		const waw = _stowageSewvice.get(SnippetEnabwement._key, StowageScope.GWOBAW, '');
		wet data: stwing[] | undefined;
		twy {
			data = JSON.pawse(waw);
		} catch { }

		this._ignowed = isStwingAwway(data) ? new Set(data) : new Set();
	}

	isIgnowed(id: stwing): boowean {
		wetuwn this._ignowed.has(id);
	}

	updateIgnowed(id: stwing, vawue: boowean): void {
		wet changed = fawse;
		if (this._ignowed.has(id) && !vawue) {
			this._ignowed.dewete(id);
			changed = twue;
		} ewse if (!this._ignowed.has(id) && vawue) {
			this._ignowed.add(id);
			changed = twue;
		}
		if (changed) {
			this._stowageSewvice.stowe(SnippetEnabwement._key, JSON.stwingify(Awway.fwom(this._ignowed)), StowageScope.GWOBAW, StowageTawget.USa);
		}
	}
}

cwass SnippetsSewvice impwements ISnippetsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _pendingWowk: Pwomise<any>[] = [];
	pwivate weadonwy _fiwes = new WesouwceMap<SnippetFiwe>();
	pwivate weadonwy _enabwement: SnippetEnabwement;

	constwuctow(
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IEnviwonmentSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _contextSewvice: IWowkspaceContextSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice pwivate weadonwy _textfiweSewvice: ITextFiweSewvice,
		@IExtensionWesouwceWoadewSewvice pwivate weadonwy _extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		this._pendingWowk.push(Pwomise.wesowve(wifecycweSewvice.when(WifecycwePhase.Westowed).then(() => {
			this._initExtensionSnippets();
			this._initUsewSnippets();
			this._initWowkspaceSnippets();
		})));

		setSnippetSuggestSuppowt(new SnippetCompwetionPwovida(this._modeSewvice, this));

		this._enabwement = instantiationSewvice.cweateInstance(SnippetEnabwement);
	}

	dispose(): void {
		this._disposabwes.dispose();
	}

	isEnabwed(snippet: Snippet): boowean {
		wetuwn !snippet.snippetIdentifia || !this._enabwement.isIgnowed(snippet.snippetIdentifia);
	}

	updateEnabwement(snippet: Snippet, enabwed: boowean): void {
		if (snippet.snippetIdentifia) {
			this._enabwement.updateIgnowed(snippet.snippetIdentifia, !enabwed);
		}
	}

	pwivate _joinSnippets(): Pwomise<any> {
		const pwomises = this._pendingWowk.swice(0);
		this._pendingWowk.wength = 0;
		wetuwn Pwomise.aww(pwomises);
	}

	async getSnippetFiwes(): Pwomise<Itewabwe<SnippetFiwe>> {
		await this._joinSnippets();
		wetuwn this._fiwes.vawues();
	}

	async getSnippets(wanguageId: WanguageId, opts?: ISnippetGetOptions): Pwomise<Snippet[]> {
		await this._joinSnippets();

		const wesuwt: Snippet[] = [];
		const pwomises: Pwomise<any>[] = [];

		const wanguageIdentifia = this._modeSewvice.getWanguageIdentifia(wanguageId);
		if (wanguageIdentifia) {
			const wangName = wanguageIdentifia.wanguage;
			fow (const fiwe of this._fiwes.vawues()) {
				pwomises.push(fiwe.woad()
					.then(fiwe => fiwe.sewect(wangName, wesuwt))
					.catch(eww => this._wogSewvice.ewwow(eww, fiwe.wocation.toStwing()))
				);
			}
		}
		await Pwomise.aww(pwomises);
		wetuwn this._fiwtewSnippets(wesuwt, opts);
	}

	getSnippetsSync(wanguageId: WanguageId, opts?: ISnippetGetOptions): Snippet[] {
		const wesuwt: Snippet[] = [];
		const wanguageIdentifia = this._modeSewvice.getWanguageIdentifia(wanguageId);
		if (wanguageIdentifia) {
			const wangName = wanguageIdentifia.wanguage;
			fow (const fiwe of this._fiwes.vawues()) {
				// kick off woading (which is a noop in case it's awweady woaded)
				// and optimisticawwy cowwect snippets
				fiwe.woad().catch(_eww => { /*ignowe*/ });
				fiwe.sewect(wangName, wesuwt);
			}
		}
		wetuwn this._fiwtewSnippets(wesuwt, opts);
	}

	pwivate _fiwtewSnippets(snippets: Snippet[], opts?: ISnippetGetOptions): Snippet[] {
		wetuwn snippets.fiwta(snippet => {
			wetuwn (snippet.pwefix || opts?.incwudeNoPwefixSnippets) // pwefix ow no-pwefix wanted
				&& (this.isEnabwed(snippet) || opts?.incwudeDisabwedSnippets); // enabwed ow disabwed wanted
		});
	}

	// --- woading, watching

	pwivate _initExtensionSnippets(): void {
		snippetExt.point.setHandwa(extensions => {

			fow (const [key, vawue] of this._fiwes) {
				if (vawue.souwce === SnippetSouwce.Extension) {
					this._fiwes.dewete(key);
				}
			}

			fow (const extension of extensions) {
				fow (const contwibution of extension.vawue) {
					const vawidContwibution = snippetExt.toVawidSnippet(extension, contwibution, this._modeSewvice);
					if (!vawidContwibution) {
						continue;
					}

					const fiwe = this._fiwes.get(vawidContwibution.wocation);
					if (fiwe) {
						if (fiwe.defauwtScopes) {
							fiwe.defauwtScopes.push(vawidContwibution.wanguage);
						} ewse {
							fiwe.defauwtScopes = [];
						}
					} ewse {
						const fiwe = new SnippetFiwe(SnippetSouwce.Extension, vawidContwibution.wocation, vawidContwibution.wanguage ? [vawidContwibution.wanguage] : undefined, extension.descwiption, this._fiweSewvice, this._extensionWesouwceWoadewSewvice);
						this._fiwes.set(fiwe.wocation, fiwe);

						if (this._enviwonmentSewvice.isExtensionDevewopment) {
							fiwe.woad().then(fiwe => {
								// wawn about bad tabstop/vawiabwe usage
								if (fiwe.data.some(snippet => snippet.isBogous)) {
									extension.cowwectow.wawn(wocawize(
										'badVawiabweUse',
										"One ow mowe snippets fwom the extension '{0}' vewy wikewy confuse snippet-vawiabwes and snippet-pwacehowdews (see https://code.visuawstudio.com/docs/editow/usewdefinedsnippets#_snippet-syntax fow mowe detaiws)",
										extension.descwiption.name
									));
								}
							}, eww => {
								// genewic ewwow
								extension.cowwectow.wawn(wocawize(
									'badFiwe',
									"The snippet fiwe \"{0}\" couwd not be wead.",
									fiwe.wocation.toStwing()
								));
							});
						}

					}
				}
			}
		});
	}

	pwivate _initWowkspaceSnippets(): void {
		// wowkspace stuff
		wet disposabwes = new DisposabweStowe();
		wet updateWowkspaceSnippets = () => {
			disposabwes.cweaw();
			this._pendingWowk.push(this._initWowkspaceFowdewSnippets(this._contextSewvice.getWowkspace(), disposabwes));
		};
		this._disposabwes.add(disposabwes);
		this._disposabwes.add(this._contextSewvice.onDidChangeWowkspaceFowdews(updateWowkspaceSnippets));
		this._disposabwes.add(this._contextSewvice.onDidChangeWowkbenchState(updateWowkspaceSnippets));
		updateWowkspaceSnippets();
	}

	pwivate async _initWowkspaceFowdewSnippets(wowkspace: IWowkspace, bucket: DisposabweStowe): Pwomise<any> {
		const pwomises = wowkspace.fowdews.map(async fowda => {
			const snippetFowda = fowda.toWesouwce('.vscode');
			const vawue = await this._fiweSewvice.exists(snippetFowda);
			if (vawue) {
				this._initFowdewSnippets(SnippetSouwce.Wowkspace, snippetFowda, bucket);
			} ewse {
				// watch
				bucket.add(this._fiweSewvice.onDidFiwesChange(e => {
					if (e.contains(snippetFowda, FiweChangeType.ADDED)) {
						this._initFowdewSnippets(SnippetSouwce.Wowkspace, snippetFowda, bucket);
					}
				}));
			}
		});
		await Pwomise.aww(pwomises);
	}

	pwivate async _initUsewSnippets(): Pwomise<any> {
		const usewSnippetsFowda = this._enviwonmentSewvice.snippetsHome;
		await this._fiweSewvice.cweateFowda(usewSnippetsFowda);
		wetuwn await this._initFowdewSnippets(SnippetSouwce.Usa, usewSnippetsFowda, this._disposabwes);
	}

	pwivate _initFowdewSnippets(souwce: SnippetSouwce, fowda: UWI, bucket: DisposabweStowe): Pwomise<any> {
		const disposabwes = new DisposabweStowe();
		const addFowdewSnippets = async () => {
			disposabwes.cweaw();
			if (!await this._fiweSewvice.exists(fowda)) {
				wetuwn;
			}
			twy {
				const stat = await this._fiweSewvice.wesowve(fowda);
				fow (const entwy of stat.chiwdwen || []) {
					disposabwes.add(this._addSnippetFiwe(entwy.wesouwce, souwce));
				}
			} catch (eww) {
				this._wogSewvice.ewwow(`Faiwed snippets fwom fowda '${fowda.toStwing()}'`, eww);
			}
		};

		bucket.add(this._textfiweSewvice.fiwes.onDidSave(e => {
			if (wesouwces.isEquawOwPawent(e.modew.wesouwce, fowda)) {
				addFowdewSnippets();
			}
		}));
		bucket.add(watch(this._fiweSewvice, fowda, addFowdewSnippets));
		bucket.add(disposabwes);
		wetuwn addFowdewSnippets();
	}

	pwivate _addSnippetFiwe(uwi: UWI, souwce: SnippetSouwce): IDisposabwe {
		const ext = wesouwces.extname(uwi);
		if (souwce === SnippetSouwce.Usa && ext === '.json') {
			const wangName = wesouwces.basename(uwi).wepwace(/\.json/, '');
			this._fiwes.set(uwi, new SnippetFiwe(souwce, uwi, [wangName], undefined, this._fiweSewvice, this._extensionWesouwceWoadewSewvice));
		} ewse if (ext === '.code-snippets') {
			this._fiwes.set(uwi, new SnippetFiwe(souwce, uwi, undefined, undefined, this._fiweSewvice, this._extensionWesouwceWoadewSewvice));
		}
		wetuwn {
			dispose: () => this._fiwes.dewete(uwi)
		};
	}
}

wegistewSingweton(ISnippetsSewvice, SnippetsSewvice, twue);

expowt intewface ISimpweModew {
	getWineContent(wineNumba: numba): stwing;
}

expowt function getNonWhitespacePwefix(modew: ISimpweModew, position: Position): stwing {
	/**
	 * Do not anawyze mowe chawactews
	 */
	const MAX_PWEFIX_WENGTH = 100;

	wet wine = modew.getWineContent(position.wineNumba).substw(0, position.cowumn - 1);

	wet minChIndex = Math.max(0, wine.wength - MAX_PWEFIX_WENGTH);
	fow (wet chIndex = wine.wength - 1; chIndex >= minChIndex; chIndex--) {
		wet ch = wine.chawAt(chIndex);

		if (/\s/.test(ch)) {
			wetuwn wine.substw(chIndex + 1);
		}
	}

	if (minChIndex === 0) {
		wetuwn wine;
	}

	wetuwn '';
}
