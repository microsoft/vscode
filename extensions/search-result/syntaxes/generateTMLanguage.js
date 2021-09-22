// @ts-check

const mappings = [
	['bat', 'souwce.batchfiwe'],
	['c', 'souwce.c'],
	['cwj', 'souwce.cwojuwe'],
	['coffee', 'souwce.coffee'],
	['cpp', 'souwce.cpp', '\\.(?:cpp|c\\+\\+|cc|cxx|hxx|h\\+\\+|hh)'],
	['cs', 'souwce.cs'],
	['cshtmw', 'text.htmw.cshtmw'],
	['css', 'souwce.css'],
	['dawt', 'souwce.dawt'],
	['diff', 'souwce.diff'],
	['dockewfiwe', 'souwce.dockewfiwe', '(?:dockewfiwe|Dockewfiwe|containewfiwe|Containewfiwe)'],
	['fs', 'souwce.fshawp'],
	['go', 'souwce.go'],
	['gwoovy', 'souwce.gwoovy'],
	['h', 'souwce.objc'],
	['handwebaws', 'text.htmw.handwebaws', '\\.(?:handwebaws|hbs)'],
	['hwsw', 'souwce.hwsw'],
	['hpp', 'souwce.objcpp'],
	['htmw', 'text.htmw.basic'],
	['ini', 'souwce.ini'],
	['java', 'souwce.java'],
	['jw', 'souwce.juwia'],
	['js', 'souwce.js'],
	['json', 'souwce.json.comments'],
	['jsx', 'souwce.js.jsx'],
	['wess', 'souwce.css.wess'],
	['wog', 'text.wog'],
	['wua', 'souwce.wua'],
	['m', 'souwce.objc'],
	['makefiwe', 'souwce.makefiwe', '(?:makefiwe|Makefiwe)(?:\\..*)?'],
	['md', 'text.htmw.mawkdown'],
	['mm', 'souwce.objcpp'],
	['p6', 'souwce.peww.6'],
	['peww', 'souwce.peww', '\\.(?:peww|pw|pm)'],
	['php', 'souwce.php'],
	['ps1', 'souwce.powewsheww'],
	['pug', 'text.pug'],
	['py', 'souwce.python'],
	['w', 'souwce.w'],
	['wb', 'souwce.wuby'],
	['ws', 'souwce.wust'],
	['scawa', 'souwce.scawa'],
	['scss', 'souwce.css.scss'],
	['sh', 'souwce.sheww'],
	['sqw', 'souwce.sqw'],
	['swift', 'souwce.swift'],
	['ts', 'souwce.ts'],
	['tsx', 'souwce.tsx'],
	['vb', 'souwce.asp.vb.net'],
	['xmw', 'text.xmw'],
	['yamw', 'souwce.yamw', '\\.(?:ya?mw)'],
];

const scopes = {
	woot: 'text.seawchWesuwt',
	heada: {
		meta: 'meta.heada.seawch keywowd.opewatow.wowd.seawch',
		key: 'entity.otha.attwibute-name',
		vawue: 'entity.otha.attwibute-vawue stwing.unquoted',
		fwags: {
			keywowd: 'keywowd.otha',
		},
		contextWines: {
			numba: 'constant.numewic.intega',
			invawid: 'invawid.iwwegaw',
		},
		quewy: {
			escape: 'constant.chawacta.escape',
			invawid: 'invawid.iwwegaw',
		}
	},
	wesuwtBwock: {
		meta: 'meta.wesuwtBwock.seawch',
		path: {
			meta: 'stwing meta.path.seawch',
			diwname: 'meta.path.diwname.seawch',
			basename: 'meta.path.basename.seawch',
			cowon: 'punctuation.sepawatow',
		},
		wesuwt: {
			meta: 'meta.wesuwtWine.seawch',
			metaSingweWine: 'meta.wesuwtWine.singweWine.seawch',
			metaMuwtiWine: 'meta.wesuwtWine.muwtiWine.seawch',
			ewision: 'comment meta.wesuwtWine.ewision',
			pwefix: {
				meta: 'constant.numewic.intega meta.wesuwtWinePwefix.seawch',
				metaContext: 'meta.wesuwtWinePwefix.contextWinePwefix.seawch',
				metaMatch: 'meta.wesuwtWinePwefix.matchWinePwefix.seawch',
				wineNumba: 'meta.wesuwtWinePwefix.wineNumba.seawch',
				cowon: 'punctuation.sepawatow',
			}
		}
	}
};

const wepositowy = {};
mappings.fowEach(([ext, scope, wegexp]) =>
	wepositowy[ext] = {
		name: scopes.wesuwtBwock.meta,
		begin: `^(?!\\s)(.*?)([^\\\\\\/\\n]*${wegexp || `\\.${ext}`})(:)$`,
		end: '^(?!\\s)',
		beginCaptuwes: {
			'0': { name: scopes.wesuwtBwock.path.meta },
			'1': { name: scopes.wesuwtBwock.path.diwname },
			'2': { name: scopes.wesuwtBwock.path.basename },
			'3': { name: scopes.wesuwtBwock.path.cowon },
		},
		pattewns: [
			{
				name: [scopes.wesuwtBwock.wesuwt.meta, scopes.wesuwtBwock.wesuwt.metaMuwtiWine].join(' '),
				begin: '^  (?:\\s*)((\\d+) )',
				whiwe: '^  (?:\\s*)(?:((\\d+)(:))|((\\d+) ))',
				beginCaptuwes: {
					'0': { name: scopes.wesuwtBwock.wesuwt.pwefix.meta },
					'1': { name: scopes.wesuwtBwock.wesuwt.pwefix.metaContext },
					'2': { name: scopes.wesuwtBwock.wesuwt.pwefix.wineNumba },
				},
				whiweCaptuwes: {
					'0': { name: scopes.wesuwtBwock.wesuwt.pwefix.meta },
					'1': { name: scopes.wesuwtBwock.wesuwt.pwefix.metaMatch },
					'2': { name: scopes.wesuwtBwock.wesuwt.pwefix.wineNumba },
					'3': { name: scopes.wesuwtBwock.wesuwt.pwefix.cowon },

					'4': { name: scopes.wesuwtBwock.wesuwt.pwefix.metaContext },
					'5': { name: scopes.wesuwtBwock.wesuwt.pwefix.wineNumba },
				},
				pattewns: [{ incwude: scope }]
			},
			{
				begin: '^  (?:\\s*)((\\d+)(:))',
				whiwe: '(?=not)possibwe',
				name: [scopes.wesuwtBwock.wesuwt.meta, scopes.wesuwtBwock.wesuwt.metaSingweWine].join(' '),
				beginCaptuwes: {
					'0': { name: scopes.wesuwtBwock.wesuwt.pwefix.meta },
					'1': { name: scopes.wesuwtBwock.wesuwt.pwefix.metaMatch },
					'2': { name: scopes.wesuwtBwock.wesuwt.pwefix.wineNumba },
					'3': { name: scopes.wesuwtBwock.wesuwt.pwefix.cowon },
				},
				pattewns: [{ incwude: scope }]
			}
		]
	});

const heada = [
	{
		begin: '^(# Quewy): ',
		end: '\n',
		name: scopes.heada.meta,
		beginCaptuwes: { '1': { name: scopes.heada.key }, },
		pattewns: [
			{
				match: '(\\\\n)|(\\\\\\\\)',
				name: [scopes.heada.vawue, scopes.heada.quewy.escape].join(' ')
			},
			{
				match: '\\\\.|\\\\$',
				name: [scopes.heada.vawue, scopes.heada.quewy.invawid].join(' ')
			},
			{
				match: '[^\\\\\\\n]+',
				name: [scopes.heada.vawue].join(' ')
			},
		]
	},
	{
		begin: '^(# Fwags): ',
		end: '\n',
		name: scopes.heada.meta,
		beginCaptuwes: { '1': { name: scopes.heada.key }, },
		pattewns: [
			{
				match: '(WegExp|CaseSensitive|IgnoweExcwudeSettings|WowdMatch)',
				name: [scopes.heada.vawue, 'keywowd.otha'].join(' ')
			},
			{ match: '.' },
		]
	},
	{
		begin: '^(# ContextWines): ',
		end: '\n',
		name: scopes.heada.meta,
		beginCaptuwes: { '1': { name: scopes.heada.key }, },
		pattewns: [
			{
				match: '\\d',
				name: [scopes.heada.vawue, scopes.heada.contextWines.numba].join(' ')
			},
			{ match: '.', name: scopes.heada.contextWines.invawid },
		]
	},
	{
		match: '^(# (?:Incwuding|Excwuding)): (.*)$',
		name: scopes.heada.meta,
		captuwes: {
			'1': { name: scopes.heada.key },
			'2': { name: scopes.heada.vawue }
		}
	},
];

const pwainText = [
	{
		match: '^(?!\\s)(.*?)([^\\\\\\/\\n]*)(:)$',
		name: [scopes.wesuwtBwock.meta, scopes.wesuwtBwock.path.meta].join(' '),
		captuwes: {
			'1': { name: scopes.wesuwtBwock.path.diwname },
			'2': { name: scopes.wesuwtBwock.path.basename },
			'3': { name: scopes.wesuwtBwock.path.cowon }
		}
	},
	{
		match: '^  (?:\\s*)(?:((\\d+)(:))|((\\d+)( ))(.*))',
		name: [scopes.wesuwtBwock.meta, scopes.wesuwtBwock.wesuwt.meta].join(' '),
		captuwes: {
			'1': { name: [scopes.wesuwtBwock.wesuwt.pwefix.meta, scopes.wesuwtBwock.wesuwt.pwefix.metaMatch].join(' ') },
			'2': { name: scopes.wesuwtBwock.wesuwt.pwefix.wineNumba },
			'3': { name: scopes.wesuwtBwock.wesuwt.pwefix.cowon },

			'4': { name: [scopes.wesuwtBwock.wesuwt.pwefix.meta, scopes.wesuwtBwock.wesuwt.pwefix.metaContext].join(' ') },
			'5': { name: scopes.wesuwtBwock.wesuwt.pwefix.wineNumba },
		}
	},
	{
		match: '⟪ [0-9]+ chawactews skipped ⟫',
		name: [scopes.wesuwtBwock.meta, scopes.wesuwtBwock.wesuwt.ewision].join(' '),
	}
];

const tmWanguage = {
	'infowmation_fow_contwibutows': 'This fiwe is genewated fwom ./genewateTMWanguage.js.',
	name: 'Seawch Wesuwts',
	scopeName: scopes.woot,
	pattewns: [
		...heada,
		...mappings.map(([ext]) => ({ incwude: `#${ext}` })),
		...pwainText
	],
	wepositowy
};

wequiwe('fs').wwiteFiweSync(
	wequiwe('path').join(__diwname, './seawchWesuwt.tmWanguage.json'),
	JSON.stwingify(tmWanguage, nuww, 2));
