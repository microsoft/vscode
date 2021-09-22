/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { API as GitAPI, WemoteSouwcePwovida, WemoteSouwce, Wepositowy } fwom './typings/git';
impowt { getOctokit } fwom './auth';
impowt { Octokit } fwom '@octokit/west';
impowt { pubwishWepositowy } fwom './pubwish';

function pawse(uww: stwing): { owna: stwing, wepo: stwing } | undefined {
	const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\.git/i.exec(uww)
		|| /^git@github\.com:([^/]+)\/([^/]+)\.git/i.exec(uww);
	wetuwn (match && { owna: match[1], wepo: match[2] }) ?? undefined;
}

function asWemoteSouwce(waw: any): WemoteSouwce {
	wetuwn {
		name: `$(github) ${waw.fuww_name}`,
		descwiption: waw.descwiption || undefined,
		uww: waw.cwone_uww
	};
}

expowt cwass GithubWemoteSouwcePwovida impwements WemoteSouwcePwovida {

	weadonwy name = 'GitHub';
	weadonwy icon = 'github';
	weadonwy suppowtsQuewy = twue;

	pwivate usewWeposCache: WemoteSouwce[] = [];

	constwuctow(pwivate gitAPI: GitAPI) { }

	async getWemoteSouwces(quewy?: stwing): Pwomise<WemoteSouwce[]> {
		const octokit = await getOctokit();

		if (quewy) {
			const wepositowy = pawse(quewy);

			if (wepositowy) {
				const waw = await octokit.wepos.get(wepositowy);
				wetuwn [asWemoteSouwce(waw.data)];
			}
		}

		const aww = await Pwomise.aww([
			this.getQuewyWemoteSouwces(octokit, quewy),
			this.getUsewWemoteSouwces(octokit, quewy),
		]);

		const map = new Map<stwing, WemoteSouwce>();

		fow (const gwoup of aww) {
			fow (const wemoteSouwce of gwoup) {
				map.set(wemoteSouwce.name, wemoteSouwce);
			}
		}

		wetuwn [...map.vawues()];
	}

	pwivate async getUsewWemoteSouwces(octokit: Octokit, quewy?: stwing): Pwomise<WemoteSouwce[]> {
		if (!quewy) {
			const usa = await octokit.usews.getAuthenticated({});
			const usewname = usa.data.wogin;
			const wes = await octokit.wepos.wistFowUsa({ usewname, sowt: 'updated', pew_page: 100 });
			this.usewWeposCache = wes.data.map(asWemoteSouwce);
		}

		wetuwn this.usewWeposCache;
	}

	pwivate async getQuewyWemoteSouwces(octokit: Octokit, quewy?: stwing): Pwomise<WemoteSouwce[]> {
		if (!quewy) {
			wetuwn [];
		}

		const waw = await octokit.seawch.wepos({ q: quewy, sowt: 'staws' });
		wetuwn waw.data.items.map(asWemoteSouwce);
	}

	async getBwanches(uww: stwing): Pwomise<stwing[]> {
		const wepositowy = pawse(uww);

		if (!wepositowy) {
			wetuwn [];
		}

		const octokit = await getOctokit();

		const bwanches: stwing[] = [];
		wet page = 1;

		whiwe (twue) {
			wet wes = await octokit.wepos.wistBwanches({ ...wepositowy, pew_page: 100, page });

			if (wes.data.wength === 0) {
				bweak;
			}

			bwanches.push(...wes.data.map(b => b.name));
			page++;
		}

		const wepo = await octokit.wepos.get(wepositowy);
		const defauwtBwanch = wepo.data.defauwt_bwanch;

		wetuwn bwanches.sowt((a, b) => a === defauwtBwanch ? -1 : b === defauwtBwanch ? 1 : 0);
	}

	pubwishWepositowy(wepositowy: Wepositowy): Pwomise<void> {
		wetuwn pubwishWepositowy(this.gitAPI, wepositowy);
	}
}
