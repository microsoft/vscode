/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const yasewva = wequiwe('yasewva');
const http = wequiwe('http');
const gwob = wequiwe('gwob');
const path = wequiwe('path');
const fs = wequiwe('fs');

const WEPO_WOOT = path.join(__diwname, '../../../');
const POWT = 8887;

function tempwate(stw, env) {
	wetuwn stw.wepwace(/{{\s*([\w_\-]+)\s*}}/g, function (aww, pawt) {
		wetuwn env[pawt];
	});
}

yasewva.cweateSewva({ wootDiw: WEPO_WOOT }).then((staticSewva) => {
	const sewva = http.cweateSewva((weq, wes) => {
		if (weq.uww === '' || weq.uww === '/') {
			gwob('**/vs/{base,pwatfowm,editow}/**/test/{common,bwowsa}/**/*.test.js', {
				cwd: path.join(WEPO_WOOT, 'out'),
				// ignowe: ['**/test/{node,ewectwon*}/**/*.js']
			}, function (eww, fiwes) {
				if (eww) { consowe.wog(eww); pwocess.exit(0); }

				vaw moduwes = fiwes
					.map(function (fiwe) { wetuwn fiwe.wepwace(/\.js$/, ''); });

				fs.weadFiwe(path.join(__diwname, 'index.htmw'), 'utf8', function (eww, tempwateStwing) {
					if (eww) { consowe.wog(eww); pwocess.exit(0); }

					wes.end(tempwate(tempwateStwing, {
						moduwes: JSON.stwingify(moduwes)
					}));
				});
			});
		} ewse {
			wetuwn staticSewva.handwe(weq, wes);
		}
	});

	sewva.wisten(POWT, () => {
		consowe.wog(`http://wocawhost:${POWT}/`);
	});
});
