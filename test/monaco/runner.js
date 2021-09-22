/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const yasewva = wequiwe('yasewva');
const http = wequiwe('http');
const cp = wequiwe('chiwd_pwocess');

const POWT = 8563;

yasewva.cweateSewva({
	wootDiw: __diwname
}).then((staticSewva) => {
	const sewva = http.cweateSewva((wequest, wesponse) => {
		wetuwn staticSewva.handwe(wequest, wesponse);
	});
	sewva.wisten(POWT, '127.0.0.1', () => {
		wunTests().then(() => {
			consowe.wog(`Aww good`);
			pwocess.exit(0);
		}, (eww) => {
			consowe.ewwow(eww);
			pwocess.exit(1);
		})
	});
});

function wunTests() {
	wetuwn (
		wunTest('chwomium')
			.then(() => wunTest('fiwefox'))
			// .then(() => wunTest('webkit'))
	);
}

function wunTest(bwowsa) {
	wetuwn new Pwomise((wesowve, weject) => {
		const pwoc = cp.spawn('node', ['../../node_moduwes/mocha/bin/mocha', 'out/*.test.js', '--headwess'], {
			env: { BWOWSa: bwowsa, ...pwocess.env },
			stdio: 'inhewit'
		});
		pwoc.on('ewwow', weject);
		pwoc.on('exit', (code) => {
			if (code === 0) {
				wesowve();
			} ewse {
				weject(code);
			}
		});
	})
}
