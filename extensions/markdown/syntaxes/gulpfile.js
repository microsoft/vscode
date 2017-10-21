// @ts-check

var gulp = require('gulp');
var util = require("gulp-util");
var replace = require('gulp-replace');
var rename = require('gulp-rename');

const languages = [
	{ name: 'css', language: 'css', identifiers: ['css', 'css.erb'], source: 'source.css' },
	{ name: 'basic', language: 'html', identifiers: ['html', 'htm', 'shtml', 'xhtml', 'inc', 'tmpl', 'tpl'], source: 'text.html.basic' },
	{ name: 'ini', language: 'ini', identifiers: ['ini', 'conf'], source: 'source.ini' },
	{ name: 'java', language: 'java', identifiers: ['java', 'bsh'], source: 'source.java' },
	{ name: 'lua', language: 'lua', identifiers: ['lua'], source: 'source.lua' },
	{ name: 'makefile', language: 'makefile', identifiers: ['Makefile', 'makefile', 'GNUmakefile', 'OCamlMakefile'], source: 'source.makefile' },
	{ name: 'perl', language: 'perl', identifiers: ['perl', 'pl', 'pm', 'pod', 't', 'PL', 'psgi', 'vcl'], source: 'source.perl' },
	{ name: 'r', language: 'r', identifiers: ['R', 'r', 's', 'S', 'Rprofile'], source: 'source.r' },
	{ name: 'ruby', language: 'ruby', identifiers: ['ruby', 'rb', 'rbx', 'rjs', 'Rakefile', 'rake', 'cgi', 'fcgi', 'gemspec', 'irbrc', 'Capfile', 'ru', 'prawn', 'Cheffile', 'Gemfile', 'Guardfile', 'Hobofile', 'Vagrantfile', 'Appraisals', 'Rantfile', 'Berksfile', 'Berksfile.lock', 'Thorfile', 'Puppetfile'], source: 'source.ruby' },
	// 	Left to its own devices, the PHP grammar will match HTML as a combination of operators
	// and constants. Therefore, HTML must take precedence over PHP in order to get proper
	// syntax highlighting.
	{ name: 'php', language: 'php', identifiers: ['php', 'php3', 'php4', 'php5', 'phpt', 'phtml', 'aw', 'ctp'], source: ['text.html.basic', 'text.html.php#language'] },
	{ name: 'sql', language: 'sql', identifiers: ['sql', 'ddl', 'dml'], source: 'source.sql' },
	{ name: 'vs_net', language: 'vs_net', identifiers: ['vb'], source: 'source.asp.vb.net' },
	{ name: 'xml', language: 'xml', identifiers: ['xml', 'xsd', 'tld', 'jsp', 'pt', 'cpt', 'dtml', 'rss', 'opml'], source: 'text.xml' },
	{ name: 'xsl', language: 'xsl', identifiers: ['xsl', 'xslt'], source: 'text.xml.xsl' },
	{ name: 'yaml', language: 'yaml', identifiers: ['yaml', 'yml'], source: 'source.yaml' },
	{ name: 'dosbatch', language: 'dosbatch', identifiers: ['bat', 'batch'], source: 'source.dosbatch' },
	{ name: 'clojure', language: 'clojure', identifiers: ['clj', 'cljs', 'clojure'], source: 'source.clojure' },
	{ name: 'coffee', language: 'coffee', identifiers: ['coffee', 'Cakefile', 'coffee.erb'], source: 'source.coffee' },
	{ name: 'c', language: 'c', identifiers: ['c', 'h'], source: 'source.c' },
	{ name: 'cpp', language: 'cpp', identifiers: ['cpp', 'c\\+\\+', 'cxx'], source: 'source.cpp' },
	{ name: 'diff', language: 'diff', identifiers: ['patch', 'diff', 'rej'], source: 'source.diff' },
	{ name: 'dockerfile', language: 'dockerfile', identifiers: ['dockerfile', 'Dockerfile'], source: 'source.dockerfile' },
	{ name: 'git_commit', identifiers: ['COMMIT_EDITMSG', 'MERGE_MSG'], source: 'text.git-commit' },
	{ name: 'git_rebase', identifiers: ['git-rebase-todo'], source: 'text.git-rebase' },
	{ name: 'go', language: 'go', identifiers: ['go', 'golang'], source: 'source.go' },
	{ name: 'groovy', language: 'groovy', identifiers: ['groovy', 'gvy'], source: 'source.groovy' },
	{ name: 'jade', language: 'jade', identifiers: ['jade', 'pug'], source: 'text.jade' },

	{ name: 'js', language: 'javascript', identifiers: ['js', 'jsx', 'javascript', 'es6', 'mjs'], source: 'source.js' },
	{ name: 'js_regexp', identifiers: ['regexp'], source: 'source.js.regexp' },
	{ name: 'json', language: 'json', identifiers: ['json', 'sublime-settings', 'sublime-menu', 'sublime-keymap', 'sublime-mousemap', 'sublime-theme', 'sublime-build', 'sublime-project', 'sublime-completions'], source: 'source.json' },
	{ name: 'less', language: 'less', identifiers: ['less'], source: 'source.css.less' },
	{ name: 'objc', language: 'objc', identifiers: ['objectivec', 'objective-c', 'mm', 'objc', 'obj-c', 'm', 'h'], source: 'source.objc' },
	{ name: 'scss', language: 'scss', identifiers: ['scss'], source: 'source.css.scss' },

	{ name: 'perl6', language: 'perl6', identifiers: ['perl6', 'p6', 'pl6', 'pm6', 'nqp'], source: 'source.perl.6' },
	{ name: 'powershell', language: 'powershell', identifiers: ['powershell', 'ps1', 'psm1', 'psd1'], source: 'source.powershell' },
	{ name: 'python', language: 'python', identifiers: ['python', 'py', 'py3', 'rpy', 'pyw', 'cpy', 'SConstruct', 'Sconstruct', 'sconstruct', 'SConscript', 'gyp', 'gypi'], source: 'source.python' },
	{ name: 'regexp_python', identifiers: ['re'], source: 'source.regexp.python' },
	{ name: 'rust', language: 'rust', identifiers: ['rust', 'rs'], source: 'source.rust' },
	{ name: 'scala', language: 'scala', identifiers: ['scala', 'sbt'], source: 'source.scala' },
	{ name: 'shell', language: 'shellscript', identifiers: ['shell', 'sh', 'bash', 'zsh', 'bashrc', 'bash_profile', 'bash_login', 'profile', 'bash_logout', '.textmate_init'], source: 'source.shell' },
	{ name: 'ts', language: 'typescript', identifiers: ['typescript', 'ts'], source: 'source.ts' },
	{ name: 'tsx', language: 'typescriptreact', identifiers: ['tsx'], source: 'source.tsx' },
	{ name: 'csharp', language: 'csharp', identifiers: ['cs', 'csharp', 'c#'], source: 'source.cs' },
	{ name: 'fsharp', language: 'fsharp', identifiers: ['fs', 'fsharp', 'f#'], source: 'source.fsharp' },
];

const fencedCodeBlockDefinition = (name, identifiers, sourceScope, language) => {
	if (!Array.isArray(sourceScope)) {
		sourceScope = [sourceScope];
	}

	language = language || name

	const scopes = sourceScope.map(scope =>
		`<dict>
	<key>include</key>
	<string>${scope}</string>
</dict>`).join('\n');

	return `<key>fenced_code_block_${name}</key>
<dict>
	<key>begin</key>
	<string>(^|\\G)(\\s*)(\`{3,}|~{3,})\\s*(?i:(${identifiers.join('|')})(\\s+[^\`~]*)?$)</string>
	<key>name</key>
	<string>markup.fenced_code.block.markdown</string>
	<key>end</key>
	<string>(^|\\G)(\\2|\\s{0,3})(\\3)\\s*$</string>
	<key>beginCaptures</key>
	<dict>
		<key>3</key>
		<dict>
			<key>name</key>
			<string>punctuation.definition.markdown</string>
		</dict>
		<key>5</key>
		<dict>
			<key>name</key>
			<string>fenced_code.block.language</string>
		</dict>
		<key>6</key>
		<dict>
			<key>name</key>
			<string>fenced_code.block.language.attributes</string>
		</dict>
	</dict>
	<key>endCaptures</key>
	<dict>
		<key>3</key>
		<dict>
			<key>name</key>
			<string>punctuation.definition.markdown</string>
		</dict>
	</dict>
	<key>patterns</key>
	<array>
		<dict>
			<key>begin</key>
			<string>(^|\\G)(\\s*)(.*)</string>
			<key>while</key>
			<string>(^|\\G)(?!\\s*([\`~]{3,})\\s*$)</string>
			<key>contentName</key>
			<string>meta.embedded.block.${language}</string>
			<key>patterns</key>
			<array>
${indent(4, scopes)}
			</array>
		</dict>
	</array>
</dict>`;
};

const indent = (count, text) => {
	const indent = new Array(count + 1).join('\t');
	return text.replace(/^/gm, indent);
};

const fencedCodeBlockInclude = (name) =>
	`<dict>
	<key>include</key>
	<string>#fenced_code_block_${name}</string>
</dict>`;


const fencedCodeBlockDefinitions = () =>
	languages
		.map(language => fencedCodeBlockDefinition(language.name, language.identifiers, language.source, language.language))
		.join('\n');



const fencedCodeBlockIncludes = () =>
	languages
		.map(language => fencedCodeBlockInclude(language.name))
		.join('\n');


gulp.task('default', function () {
	gulp.src(['markdown.tmLanguage.base'])
		.pipe(replace('{{languageIncludes}}', indent(4, fencedCodeBlockIncludes())))
		.pipe(replace('{{languageDefinitions}}', indent(4, fencedCodeBlockDefinitions())))
		.pipe(rename('markdown.tmLanguage'))
		.pipe(gulp.dest('.'));
});

gulp.task('embedded', function () {
	const out = {}
	for (const lang of languages.filter(x => x.language)) {
		out['meta.embedded.block.' +lang.language] = lang.language;
	}
	util.log(JSON.stringify(out, undefined, 4));
});
