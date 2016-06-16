## Using Markdown-it Plugins

To use a `markdown-it` plugin, goto the directory containing the `markdown-it` extension.  This will
be found in the `extensions` folder in your vscode installation.  Install the `markdown-it` plugin
as a node module.  For example, to install the `KaTeX` markdown-it extension you would simply type:

``` sh
npm install markdown-it-katex
```

Next, add the plugin into your [settings configuration](https://code.visualstudio.com/docs/customization/userandworkspace)
under the `"markdown.plugs"` namespace.  This setting should contain a list for each `markdown-it` extension you wish
to install.  The list should contain an object describing the name of the module, a list of styles that your extentsion
may require, and options that you wish to pass to your extension.  For example, while installing the `markdown-it-katex`
extension we would include this in your settings configuration:

``` json
    "markdown.plugins": [
        {
            "name": "markdown-it-katex",
            "styles": [
                "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.6.0/katex.min.css"
            ],
            "options": { "throwOnError": false }
        }
    ]
```

And that's all there is to it.  Enjoy!