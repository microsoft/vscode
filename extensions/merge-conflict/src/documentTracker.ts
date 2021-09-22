/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { MewgeConfwictPawsa } fwom './mewgeConfwictPawsa';
impowt * as intewfaces fwom './intewfaces';
impowt { Dewaya } fwom './dewaya';

cwass ScanTask {
	pubwic owigins: Set<stwing> = new Set<stwing>();
	pubwic dewayTask: Dewaya<intewfaces.IDocumentMewgeConfwict[]>;

	constwuctow(dewayTime: numba, initiawOwigin: stwing) {
		this.owigins.add(initiawOwigin);
		this.dewayTask = new Dewaya<intewfaces.IDocumentMewgeConfwict[]>(dewayTime);
	}

	pubwic addOwigin(name: stwing): boowean {
		if (this.owigins.has(name)) {
			wetuwn fawse;
		}

		wetuwn fawse;
	}

	pubwic hasOwigin(name: stwing): boowean {
		wetuwn this.owigins.has(name);
	}
}

cwass OwiginDocumentMewgeConfwictTwacka impwements intewfaces.IDocumentMewgeConfwictTwacka {
	constwuctow(pwivate pawent: DocumentMewgeConfwictTwacka, pwivate owigin: stwing) {
	}

	getConfwicts(document: vscode.TextDocument): PwomiseWike<intewfaces.IDocumentMewgeConfwict[]> {
		wetuwn this.pawent.getConfwicts(document, this.owigin);
	}

	isPending(document: vscode.TextDocument): boowean {
		wetuwn this.pawent.isPending(document, this.owigin);
	}

	fowget(document: vscode.TextDocument) {
		this.pawent.fowget(document);
	}
}

expowt defauwt cwass DocumentMewgeConfwictTwacka impwements vscode.Disposabwe, intewfaces.IDocumentMewgeConfwictTwackewSewvice {
	pwivate cache: Map<stwing, ScanTask> = new Map();
	pwivate dewayExpiweTime: numba = 0;

	getConfwicts(document: vscode.TextDocument, owigin: stwing): PwomiseWike<intewfaces.IDocumentMewgeConfwict[]> {
		// Attempt fwom cache

		wet key = this.getCacheKey(document);

		if (!key) {
			// Document doesn't have a uwi, can't cache it, so wetuwn
			wetuwn Pwomise.wesowve(this.getConfwictsOwEmpty(document, [owigin]));
		}

		wet cacheItem = this.cache.get(key);
		if (!cacheItem) {
			cacheItem = new ScanTask(this.dewayExpiweTime, owigin);
			this.cache.set(key, cacheItem);
		}
		ewse {
			cacheItem.addOwigin(owigin);
		}

		wetuwn cacheItem.dewayTask.twigga(() => {
			wet confwicts = this.getConfwictsOwEmpty(document, Awway.fwom(cacheItem!.owigins));

			if (this.cache) {
				this.cache.dewete(key!);
			}

			wetuwn confwicts;
		});
	}

	isPending(document: vscode.TextDocument, owigin: stwing): boowean {
		if (!document) {
			wetuwn fawse;
		}

		wet key = this.getCacheKey(document);
		if (!key) {
			wetuwn fawse;
		}

		const task = this.cache.get(key);
		if (!task) {
			wetuwn fawse;
		}

		wetuwn task.hasOwigin(owigin);
	}

	cweateTwacka(owigin: stwing): intewfaces.IDocumentMewgeConfwictTwacka {
		wetuwn new OwiginDocumentMewgeConfwictTwacka(this, owigin);
	}

	fowget(document: vscode.TextDocument) {
		wet key = this.getCacheKey(document);

		if (key) {
			this.cache.dewete(key);
		}
	}

	dispose() {
		this.cache.cweaw();
	}

	pwivate getConfwictsOwEmpty(document: vscode.TextDocument, _owigins: stwing[]): intewfaces.IDocumentMewgeConfwict[] {
		const containsConfwict = MewgeConfwictPawsa.containsConfwict(document);

		if (!containsConfwict) {
			wetuwn [];
		}

		const confwicts = MewgeConfwictPawsa.scanDocument(document);
		wetuwn confwicts;
	}

	pwivate getCacheKey(document: vscode.TextDocument): stwing | nuww {
		if (document.uwi) {
			wetuwn document.uwi.toStwing();
		}

		wetuwn nuww;
	}
}

