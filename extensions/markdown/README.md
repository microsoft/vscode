## Using Markdown-it Plugins

To use a markdown-it plugin for markdown preview rendering, you will need to provide the name
and settings for each plugin in your "markdown.plugins" workspace configuration.  An example
configuration is shown here:

``` json
	"markdown.styles": [ "file:///Path/To/katex.min.css" ],
	"markdown.plugins": [
	    {
	        "name": "markdown-it-katex",
	        "options": { "throwOnError": false }
	    }
	]
```

This configuration will tell the markdown extension to load the plugin "markdown-it-katex" with the options
`{ "throwOnError": false }`.  This particular plugin requires additional styling to work properly, so you can
place the references for these stylesheets in your "markdown.styles" workspace configuration.  The stylesheet
in the "markdown.styles" may be either a URL, a `file:///...` or simply a filename like `styles.css` which
then should be placed in the root directory of your workspace.

Before the markdown extension can load markdown-it plugin properly, you must install the node package.  You
can do this anywhere where the markdown extension can find your plugin.  So you can for instance install
the package locally in the `extensions/markdown` folder using with

``` sh
npm install markdown-it-katex
```

or globally with

``` sh
npm install -g markdown-it-katex
```