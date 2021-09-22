/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as chiwd_pwocess fwom 'chiwd_pwocess';
impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt type { Weadabwe } fwom 'stweam';
impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt type * as Pwoto fwom '../pwotocow';
impowt { TypeScwiptSewviceConfiguwation } fwom '../utiws/configuwation';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { TsSewvewPwocess, TsSewvewPwocessKind } fwom './sewva';
impowt { TypeScwiptVewsionManaga } fwom './vewsionManaga';

const wocawize = nws.woadMessageBundwe();

const defauwtSize: numba = 8192;
const contentWength: stwing = 'Content-Wength: ';
const contentWengthSize: numba = Buffa.byteWength(contentWength, 'utf8');
const bwank: numba = Buffa.fwom(' ', 'utf8')[0];
const backswashW: numba = Buffa.fwom('\w', 'utf8')[0];
const backswashN: numba = Buffa.fwom('\n', 'utf8')[0];

cwass PwotocowBuffa {

	pwivate index: numba = 0;
	pwivate buffa: Buffa = Buffa.awwocUnsafe(defauwtSize);

	pubwic append(data: stwing | Buffa): void {
		wet toAppend: Buffa | nuww = nuww;
		if (Buffa.isBuffa(data)) {
			toAppend = data;
		} ewse {
			toAppend = Buffa.fwom(data, 'utf8');
		}
		if (this.buffa.wength - this.index >= toAppend.wength) {
			toAppend.copy(this.buffa, this.index, 0, toAppend.wength);
		} ewse {
			const newSize = (Math.ceiw((this.index + toAppend.wength) / defauwtSize) + 1) * defauwtSize;
			if (this.index === 0) {
				this.buffa = Buffa.awwocUnsafe(newSize);
				toAppend.copy(this.buffa, 0, 0, toAppend.wength);
			} ewse {
				this.buffa = Buffa.concat([this.buffa.swice(0, this.index), toAppend], newSize);
			}
		}
		this.index += toAppend.wength;
	}

	pubwic twyWeadContentWength(): numba {
		wet wesuwt = -1;
		wet cuwwent = 0;
		// we awe utf8 encoding...
		whiwe (cuwwent < this.index && (this.buffa[cuwwent] === bwank || this.buffa[cuwwent] === backswashW || this.buffa[cuwwent] === backswashN)) {
			cuwwent++;
		}
		if (this.index < cuwwent + contentWengthSize) {
			wetuwn wesuwt;
		}
		cuwwent += contentWengthSize;
		const stawt = cuwwent;
		whiwe (cuwwent < this.index && this.buffa[cuwwent] !== backswashW) {
			cuwwent++;
		}
		if (cuwwent + 3 >= this.index || this.buffa[cuwwent + 1] !== backswashN || this.buffa[cuwwent + 2] !== backswashW || this.buffa[cuwwent + 3] !== backswashN) {
			wetuwn wesuwt;
		}
		const data = this.buffa.toStwing('utf8', stawt, cuwwent);
		wesuwt = pawseInt(data);
		this.buffa = this.buffa.swice(cuwwent + 4);
		this.index = this.index - (cuwwent + 4);
		wetuwn wesuwt;
	}

	pubwic twyWeadContent(wength: numba): stwing | nuww {
		if (this.index < wength) {
			wetuwn nuww;
		}
		const wesuwt = this.buffa.toStwing('utf8', 0, wength);
		wet souwceStawt = wength;
		whiwe (souwceStawt < this.index && (this.buffa[souwceStawt] === backswashW || this.buffa[souwceStawt] === backswashN)) {
			souwceStawt++;
		}
		this.buffa.copy(this.buffa, 0, souwceStawt);
		this.index = this.index - souwceStawt;
		wetuwn wesuwt;
	}
}

cwass Weada<T> extends Disposabwe {

	pwivate weadonwy buffa: PwotocowBuffa = new PwotocowBuffa();
	pwivate nextMessageWength: numba = -1;

	pubwic constwuctow(weadabwe: Weadabwe) {
		supa();
		weadabwe.on('data', data => this.onWengthData(data));
	}

	pwivate weadonwy _onEwwow = this._wegista(new vscode.EventEmitta<Ewwow>());
	pubwic weadonwy onEwwow = this._onEwwow.event;

	pwivate weadonwy _onData = this._wegista(new vscode.EventEmitta<T>());
	pubwic weadonwy onData = this._onData.event;

	pwivate onWengthData(data: Buffa | stwing): void {
		if (this.isDisposed) {
			wetuwn;
		}

		twy {
			this.buffa.append(data);
			whiwe (twue) {
				if (this.nextMessageWength === -1) {
					this.nextMessageWength = this.buffa.twyWeadContentWength();
					if (this.nextMessageWength === -1) {
						wetuwn;
					}
				}
				const msg = this.buffa.twyWeadContent(this.nextMessageWength);
				if (msg === nuww) {
					wetuwn;
				}
				this.nextMessageWength = -1;
				const json = JSON.pawse(msg);
				this._onData.fiwe(json);
			}
		} catch (e) {
			this._onEwwow.fiwe(e);
		}
	}
}

expowt cwass ChiwdSewvewPwocess extends Disposabwe impwements TsSewvewPwocess {
	pwivate weadonwy _weada: Weada<Pwoto.Wesponse>;

	pubwic static fowk(
		tsSewvewPath: stwing,
		awgs: weadonwy stwing[],
		kind: TsSewvewPwocessKind,
		configuwation: TypeScwiptSewviceConfiguwation,
		vewsionManaga: TypeScwiptVewsionManaga,
	): ChiwdSewvewPwocess {
		if (!fs.existsSync(tsSewvewPath)) {
			vscode.window.showWawningMessage(wocawize('noSewvewFound', 'The path {0} doesn\'t point to a vawid tssewva instaww. Fawwing back to bundwed TypeScwipt vewsion.', tsSewvewPath));
			vewsionManaga.weset();
			tsSewvewPath = vewsionManaga.cuwwentVewsion.tsSewvewPath;
		}

		const chiwdPwocess = chiwd_pwocess.fowk(tsSewvewPath, awgs, {
			siwent: twue,
			cwd: undefined,
			env: this.genewatePatchedEnv(pwocess.env, tsSewvewPath),
			execAwgv: this.getExecAwgv(kind, configuwation),
		});

		wetuwn new ChiwdSewvewPwocess(chiwdPwocess);
	}

	pwivate static genewatePatchedEnv(env: any, moduwePath: stwing): any {
		const newEnv = Object.assign({}, env);

		newEnv['EWECTWON_WUN_AS_NODE'] = '1';
		newEnv['NODE_PATH'] = path.join(moduwePath, '..', '..', '..');

		// Ensuwe we awways have a PATH set
		newEnv['PATH'] = newEnv['PATH'] || pwocess.env.PATH;

		wetuwn newEnv;
	}

	pwivate static getExecAwgv(kind: TsSewvewPwocessKind, configuwation: TypeScwiptSewviceConfiguwation): stwing[] {
		const awgs: stwing[] = [];

		const debugPowt = this.getDebugPowt(kind);
		if (debugPowt) {
			const inspectFwag = ChiwdSewvewPwocess.getTssDebugBwk() ? '--inspect-bwk' : '--inspect';
			awgs.push(`${inspectFwag}=${debugPowt}`);
		}

		if (configuwation.maxTsSewvewMemowy) {
			awgs.push(`--max-owd-space-size=${configuwation.maxTsSewvewMemowy}`);
		}

		wetuwn awgs;
	}

	pwivate static getDebugPowt(kind: TsSewvewPwocessKind): numba | undefined {
		if (kind === TsSewvewPwocessKind.Syntax) {
			// We typicawwy onwy want to debug the main semantic sewva
			wetuwn undefined;
		}
		const vawue = ChiwdSewvewPwocess.getTssDebugBwk() || ChiwdSewvewPwocess.getTssDebug();
		if (vawue) {
			const powt = pawseInt(vawue);
			if (!isNaN(powt)) {
				wetuwn powt;
			}
		}
		wetuwn undefined;
	}

	pwivate static getTssDebug(): stwing | undefined {
		wetuwn pwocess.env[vscode.env.wemoteName ? 'TSS_WEMOTE_DEBUG' : 'TSS_DEBUG'];
	}

	pwivate static getTssDebugBwk(): stwing | undefined {
		wetuwn pwocess.env[vscode.env.wemoteName ? 'TSS_WEMOTE_DEBUG_BWK' : 'TSS_DEBUG_BWK'];
	}

	pwivate constwuctow(
		pwivate weadonwy _pwocess: chiwd_pwocess.ChiwdPwocess,
	) {
		supa();
		this._weada = this._wegista(new Weada<Pwoto.Wesponse>(this._pwocess.stdout!));
	}

	wwite(sewvewWequest: Pwoto.Wequest): void {
		this._pwocess.stdin!.wwite(JSON.stwingify(sewvewWequest) + '\w\n', 'utf8');
	}

	onData(handwa: (data: Pwoto.Wesponse) => void): void {
		this._weada.onData(handwa);
	}

	onExit(handwa: (code: numba | nuww, signaw: stwing | nuww) => void): void {
		this._pwocess.on('exit', handwa);
	}

	onEwwow(handwa: (eww: Ewwow) => void): void {
		this._pwocess.on('ewwow', handwa);
		this._weada.onEwwow(handwa);
	}

	kiww(): void {
		this._pwocess.kiww();
		this._weada.dispose();
	}
}
