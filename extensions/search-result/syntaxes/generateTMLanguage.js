// @ts-check

const languages = [
	['bat', 'source.batchfile'],
	['c', 'source.c'],
	['clj', 'source.clojure'],
	['coffee', 'source.coffee'],
	['cpp', 'source.cpp'],
	['cs', 'source.cs'],
	['css', 'source.css'],
	['dart', 'source.dart'],
	['diff', 'source.diff'],
	['dockerfile', 'source.dockerfile'],
	['fs', 'source.fsharp'],
	['go', 'source.go'],
	['groovy', 'source.groovy'],
	['h', 'source.objc'],
	['hpp', 'source.objcpp'],
	['html', 'source.html'],
	['java', 'source.java'],
	['js', 'source.js'],
	['json', 'source.json.comments'],
	['jsx', 'source.js.jsx'],
	['less', 'source.css.less'],
	['lua', 'source.lua'],
	['m', 'source.objc'],
	['make', 'source.makefile'],
	['mm', 'source.objcpp'],
	['p6', 'source.perl.6'],
	['perl', 'source.perl'],
	['php', 'source.php'],
	['pl', 'source.perl'],
	['ps1', 'source.powershell'],
	['py', 'source.python'],
	['r', 'source.r'],
	['rb', 'source.ruby'],
	['rs', 'source.rust'],
	['scala', 'source.scala'],
	['scss', 'source.css.scss'],
	['sh', 'source.shell'],
	['sql', 'source.sql'],
	['swift', 'source.swift'],
	['ts', 'source.ts'],
	['tsx', 'source.tsx'],
	['yaml', 'source.yaml'],
];

const repository = {};
languages.forEach(([ext, scope]) =>
	repository[ext] = {
		begin: `^(?!\\s)(.*?)([^\\\\\\/\\n]*.${ext})(:)$`,
		end: "^(?!\\s)",
		name: `searchResult.block.${ext}`,
		beginCaptures: {
			"0": {
				name: "string path.searchResult"
			},
			"1": {
				name: "dirname.path.searchResult"
			},
			"2": {
				name: "basename.path.searchResult"
			},
			"3": {
				name: "endingColon.path.searchResult"
			}
		},
		patterns: [
			{
				begin: "^  (\\d+)( )",
				while: "^  (\\d+)(:| )",
				beginCaptures: {
					"1": {
						name: "constant.numeric lineNumber.searchResult resultPrefix.searchResult"
					},
					"2": {
						name: "resultPrefixSeparator.searchResult resultPrefix.searchResult"
					}
				},
				whileCaptures: {
					"1": {
						name: "constant.numeric lineNumber.searchResult resultPrefix.searchResult"
					},
					"2": {
						name: "resultPrefixSeparator.searchResult resultPrefix.searchResult"
					}
				},
				name: `searchResult.resultLine.${ext} searchResult.multiline`,
				patterns: [
					{
						include: scope
					}
				]
			},
			{
				match: "^  (\\d+)(:)(.*)",
				name: `searchResult.resultLine.${ext} searchResult.singleline`,
				captures: {
					"1": {
						name: "constant.numeric lineNumber.searchResult resultPrefix.searchResult"
					},
					"2": {
						name: "resultPrefixSeparator.searchResult resultPrefix.searchResult"
					},
					"3": {
						patterns: [
							{
								include: scope
							}
						]
					}
				}
			}
		]
	});

const header = {
	"match": "^# (Query|Flags|Including|Excluding|ContextLines): .*$",
	"name": "comment"
};

const plainText = [{
	match: "^(?!\\s)(.*?)([^\\\\\\/\\n]*)(:)$",
	name: "string path.searchResult",
	captures: {
		"1": {
			name: "dirname.path.searchResult"
		},
		"2": {
			name: "basename.path.searchResult"
		},
		"3": {
			name: "endingColon.path.searchResult"
		}
	}
},
{
	match: "^  (\\d+)(:| )",
	captures: {
		"1": {
			name: "constant.numeric lineNumber.searchResult resultPrefix.searchResult"
		},
		"2": {
			name: "resultPrefixSeparator.searchResult resultPrefix.searchResult"
		}
	}
}];

const tmLanguage = {
	"information_for_contributors": "This file is generated from ./generateTMLanguage.js.",
	name: "Search Results",
	scopeName: "text.searchResult",
	patterns: [
		header,
		...languages.map(([ext]) => ({ include: `#${ext}` })),
		...plainText
	],
	repository
};


require('fs')
	.writeFileSync('./searchResult.tmLanguage.json', JSON.stringify(tmLanguage, null, 2));
