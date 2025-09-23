// @ts-check

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const plist = require("plist");

const languages = [
  {
    name: "css",
    language: "css",
    identifiers: ["css", "css.erb"],
    source: "source.css",
  },
  {
    name: "basic",
    language: "html",
    identifiers: ["html", "htm", "shtml", "xhtml", "inc", "tmpl", "tpl"],
    source: "text.html.basic",
  },
  {
    name: "ini",
    language: "ini",
    identifiers: ["ini", "conf"],
    source: "source.ini",
  },
  {
    name: "java",
    language: "java",
    identifiers: ["java", "bsh"],
    source: "source.java",
  },
  { name: "lua", language: "lua", identifiers: ["lua"], source: "source.lua" },
  {
    name: "makefile",
    language: "makefile",
    identifiers: ["Makefile", "makefile", "GNUmakefile", "OCamlMakefile"],
    source: "source.makefile",
  },
  {
    name: "perl",
    language: "perl",
    identifiers: ["perl", "pl", "pm", "pod", "t", "PL", "psgi", "vcl"],
    source: "source.perl",
  },
  {
    name: "prql",
    language: "prql",
    identifiers: ["prql", "PRQL"],
    source: "source.prql"
  },
  {
    name: "r",
    language: "r",
    identifiers: ["R", "r", "s", "S", "Rprofile", "\\{\\.r.+?\\}", ".+\\-r"],
    source: "source.r",
  },
  {
    name: "julia",
    language: "julia",
    identifiers: ["julia", "jl", ".+\\-julia"],
    source: "source.julia",
  },
  {
    name: "matlab",
    language: "matlab",
    identifiers: ["matlab"],
    source: "source.matlab",
  },
  {
    name: "stata",
    language: "stata",
    identifiers: ["stata"],
    source: "source.stata",
  },
  {
    name: "dot",
    language: "dot",
    identifiers: ["dot"],
    source: "source.dot",
  },
  {
    name: "mermaid",
    language: "mermaid",
    identifiers: ["mermaid"],
    source: "source.mmd",
  },
  {
    name: "plantuml",
    language: "plantuml",
    identifiers: ["plantuml"],
    source: "source.wsd"
  },
  {
    name: "ruby",
    language: "ruby",
    identifiers: [
      "ruby",
      "rb",
      "rbx",
      "rjs",
      "Rakefile",
      "rake",
      "cgi",
      "fcgi",
      "gemspec",
      "irbrc",
      "Capfile",
      "ru",
      "prawn",
      "Cheffile",
      "Gemfile",
      "Guardfile",
      "Hobofile",
      "Vagrantfile",
      "Appraisals",
      "Rantfile",
      "Berksfile",
      "Berksfile.lock",
      "Thorfile",
      "Puppetfile",
    ],
    source: "source.ruby",
  },
  // 	Left to its own devices, the PHP grammar will match HTML as a combination of operators
  // and constants. Therefore, HTML must take precedence over PHP in order to get proper
  // syntax highlighting.
  {
    name: "php",
    language: "php",
    identifiers: ["php", "php3", "php4", "php5", "phpt", "phtml", "aw", "ctp"],
    source: ["text.html.basic", "source.php"],
  },
  {
    name: "sql",
    language: "sql",
    identifiers: ["sql", "ddl", "dml"],
    source: "source.sql",
  },
  {
    name: "vs_net",
    language: "vs_net",
    identifiers: ["vb"],
    source: "source.asp.vb.net",
  },
  {
    name: "xml",
    language: "xml",
    identifiers: [
      "xml",
      "xsd",
      "tld",
      "jsp",
      "pt",
      "cpt",
      "dtml",
      "rss",
      "opml",
    ],
    source: "text.xml",
  },
  {
    name: "xsl",
    language: "xsl",
    identifiers: ["xsl", "xslt"],
    source: "text.xml.xsl",
  },
  {
    name: "yaml",
    language: "yaml",
    identifiers: ["yaml", "yml"],
    source: "source.yaml",
  },
  {
    name: "dosbatch",
    language: "dosbatch",
    identifiers: ["bat", "batch"],
    source: "source.batchfile",
  },
  {
    name: "clojure",
    language: "clojure",
    identifiers: ["clj", "cljs", "clojure"],
    source: "source.clojure",
  },
  {
    name: "coffee",
    language: "coffee",
    identifiers: ["coffee", "Cakefile", "coffee.erb"],
    source: "source.coffee",
  },
  { name: "c", language: "c", identifiers: ["c", "h"], source: "source.c" },
  {
    name: "cpp",
    language: "cpp",
    identifiers: ["cpp", "c\\+\\+", "cxx"],
    source: "source.cpp",
    additionalContentName: ["source.cpp"],
  },
  {
    name: "diff",
    language: "diff",
    identifiers: ["patch", "diff", "rej"],
    source: "source.diff",
  },
  {
    name: "dockerfile",
    language: "dockerfile",
    identifiers: ["dockerfile", "Dockerfile"],
    source: "source.dockerfile",
  },
  {
    name: "git_commit",
    identifiers: ["COMMIT_EDITMSG", "MERGE_MSG"],
    source: "text.git-commit",
  },
  {
    name: "git_rebase",
    identifiers: ["git-rebase-todo"],
    source: "text.git-rebase",
  },
  {
    name: "go",
    language: "go",
    identifiers: ["go", "golang"],
    source: "source.go",
  },
  {
    name: "groovy",
    language: "groovy",
    identifiers: ["groovy", "gvy"],
    source: "source.groovy",
  },
  {
    name: "pug",
    language: "pug",
    identifiers: ["jade", "pug"],
    source: "text.pug",
  },

  {
    name: "js",
    language: "javascript",
    identifiers: [
      "js",
      "jsx",
      "mdx",
      "javascript",
      "es6",
      "mjs",
      "cjs",
      "ojs"
    ],
    source: "source.js",
  },
  { name: "js_regexp", identifiers: ["regexp"], source: "source.js.regexp" },
  {
    name: "json",
    language: "json",
    identifiers: [
      "json",
      "json5",
      "sublime-settings",
      "sublime-menu",
      "sublime-keymap",
      "sublime-mousemap",
      "sublime-theme",
      "sublime-build",
      "sublime-project",
      "sublime-completions",
    ],
    source: "source.json",
  },
  {
    name: "jsonc",
    language: "jsonc",
    identifiers: ["jsonc"],
    source: "source.json.comments",
  },
  {
    name: "less",
    language: "less",
    identifiers: ["less"],
    source: "source.css.less",
  },
  {
    name: "objc",
    language: "objc",
    identifiers: ["objectivec", "objective-c", "mm", "objc", "obj-c", "m", "h"],
    source: "source.objc",
  },
  {
    name: "swift",
    language: "swift",
    identifiers: ["swift"],
    source: "source.swift",
  },
  {
    name: "scss",
    language: "scss",
    identifiers: ["scss"],
    source: "source.css.scss",
  },

  {
    name: "perl6",
    language: "perl6",
    identifiers: ["perl6", "p6", "pl6", "pm6", "nqp"],
    source: "source.perl.6",
  },
  {
    name: "powershell",
    language: "powershell",
    identifiers: ["powershell", "ps1", "psm1", "psd1"],
    source: "source.powershell",
  },
  {
    name: "stan",
    language: "stan",
    identifiers: ["stan"],
    source: "source.stan",
  },
  {
    name: "python",
    language: "python",
    identifiers: [
      "python",
      "py",
      "py3",
      "rpy",
      "pyw",
      "cpy",
      "SConstruct",
      "Sconstruct",
      "sconstruct",
      "SConscript",
      "gyp",
      "gypi",
      ".+\\-python",
    ],
    source: "source.python",
  },
  {
    name: "regexp_python",
    identifiers: ["re"],
    source: "source.regexp.python",
  },
  {
    name: "rust",
    language: "rust",
    identifiers: ["rust", "rs", "\\{\\.rust.+?\\}"],
    source: "source.rust",
  },
  {
    name: "scala",
    language: "scala",
    identifiers: ["scala", "sbt"],
    source: "source.scala",
  },
  {
    name: "shell",
    language: "shellscript",
    identifiers: [
      "shell",
      "sh",
      "bash",
      "zsh",
      "bashrc",
      "bash_profile",
      "bash_login",
      "profile",
      "bash_logout",
      ".textmate_init"
    ],
    source: "source.shell",
  },
  {
    name: "ts",
    language: "typescript",
    identifiers: ["typescript", "ts"],
    source: "source.ts",
  },
  {
    name: "tsx",
    language: "typescriptreact",
    identifiers: ["tsx"],
    source: "source.tsx",
  },
  {
    name: "typst",
    language: "typst",
    identifiers: ["typ", "typst"],
    source: "source.typst",
  },
  {
    name: "csharp",
    language: "csharp",
    identifiers: ["cs", "csharp", "c#"],
    source: "source.cs",
  },
  {
    name: "fsharp",
    language: "fsharp",
    identifiers: ["fs", "fsharp", "f#"],
    source: "source.fsharp",
  },
  {
    name: "dart",
    language: "dart",
    identifiers: ["dart"],
    source: "source.dart",
  },
  {
    name: "handlebars",
    language: "handlebars",
    identifiers: ["handlebars", "hbs"],
    source: "text.html.handlebars",
  },
  {
    name: "markdown",
    language: "markdown",
    identifiers: ["markdown", "md"],
    source: "text.html.markdown",
  },
  { name: "log", language: "log", identifiers: ["log"], source: "text.log" },
  {
    name: "erlang",
    language: "erlang",
    identifiers: ["erlang"],
    source: "source.erlang",
  },
  {
    name: "elixir",
    language: "elixir",
    identifiers: ["elixir"],
    source: "source.elixir",
  },
  {
    name: "latex",
    language: "latex",
    identifiers: ["latex", "tex"],
    source: "text.tex.latex",
  },
  {
    name: "bibtex",
    language: "bibtex",
    identifiers: ["bibtex"],
    source: "text.bibtex",
  },
];

const fencedCodeBlockDefinition = (
  name,
  identifiers,
  sourceScope,
  language,
  additionalContentName
) => {
  if (!Array.isArray(sourceScope)) {
    sourceScope = [sourceScope];
  }

  language = language || name;

  const scopes = sourceScope
    .map((scope) => `- { include: '${scope}' }`)
    .join("\n");

  let contentName = `meta.embedded.block.${language}`;
  if (additionalContentName) {
    contentName += ` ${additionalContentName.join(" ")}`;
  }

  return `fenced_code_block_${name}:
  begin:
    (^|\\G)(\\s*)(\`{3,}|~{3,})\\s*(?:\\{(?:#[\\w-]+\\s+)?[\\{\\.=]?)?(?i:(${identifiers.join(
    "|"
  )})(?:\\}{1,2})?((\\s+|:|,|\\{|\\?)[^\`~]*)?$)
  name:
    markup.fenced_code.block.markdown
  end:
    (^|\\G)(\\2|\\s{0,3})(\\3)\\s*$
  beginCaptures:
    '3': {name: 'punctuation.definition.markdown'}
    '4': {name: 'fenced_code.block.language.markdown'}
    '5': {name: 'fenced_code.block.language.attributes.markdown'}
  endCaptures:
    '3': {name: 'punctuation.definition.markdown'}
  patterns:
    - begin: (^|\\G)(\\s*)(.*)
      while: (^|\\G)(?!\\s*([\`~]{3,})\\s*$)
      contentName: ${contentName}
      patterns:
${indent(4, scopes)}
`;
};

const indent = (count, text) => {
  const indent = new Array(count + 1).join("  ");
  return text.replace(/^/gm, indent);
};

const fencedCodeBlockInclude = (name) =>
  `- { include: '#fenced_code_block_${name}' }`;

const fencedCodeBlockDefinitions = () =>
  languages
    .map((language) =>
      fencedCodeBlockDefinition(
        language.name,
        language.identifiers,
        language.source,
        language.language,
        language.additionalContentName
      )
    )
    .join("\n");

const fencedCodeBlockIncludes = () =>
  languages.map((language) => fencedCodeBlockInclude(language.name)).join("\n");

const buildGrammar = () => {
  let text = fs.readFileSync(
    path.join(__dirname, "quarto.tmLanguage.yaml"),
    "utf8"
  );
  text = text.replace(
    /\s*\{\{languageIncludes\}\}/,
    "\n" + indent(2, fencedCodeBlockIncludes())
  );
  text = text.replace(
    /\s*\{\{languageDefinitions\}\}/,
    "\n" + indent(1, fencedCodeBlockDefinitions())
  );

  const grammar = yaml.load(text);
  // @ts-ignore
  const out = plist.build(grammar);
  fs.writeFileSync(path.join(__dirname, "quarto.tmLanguage"), out);
};

buildGrammar();
