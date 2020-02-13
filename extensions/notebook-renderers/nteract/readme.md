# external renderers

## Proposal 

Current proposal for how an extension contributes custom output rendering, the workflow is like

* User open a notebook file, a notebook document provider parses the file and resovle it as `vscode.NotebookDocument`
* Notebook document is opened in VS Code core renderer process
* When the core renderer sees an output in a code cell, and there is a matched custom output renderer, we will ask the extension to provide the customed rendering result
* The matched custom renderer extension converts `vscode.CellOutput` to a form which the core can understand and render. For example, an HTML fragment with scripts.
* The HTML fragment is rendered in the webview and its inner scripts are evaluated.

The key is how would the custom renderer converts `vscode.CellOutput` to a self explanatory HTML fragment, which can be rendered properly.

## nteract

Say we have a document which contains a plot output, which is usually stored in a notebook document as below

```json
{
  "cells": [
    {
      "cell_type": "code",
      "outputs": [
        {
          "data": {
            "application/vnd.plotly.v1+json": {
              "data": [
                  { "x": [1999, 2000, 2001, 2002], "y": [10, 15, 13, 17], "type": "scatter" },
                  { "x": [1999, 2000, 2001, 2002], "y": [16, 5, 11, 9], "type": "scatter" }
              ],
              "layout": {
                  "title": "Super Stuff",
                  "xaxis": { "title": "Year", "showgrid": false, "zeroline": false },
                  "yaxis": { "title": "Percent", "showline": false },
                  "height": "100px"
              }
            }
          },
          "metadata": {},
          "output_type": "display_data"
        }
      ],
      "source": [
        "# render application/vnd.plotly.v1+json \n"
      ]
    }
  ]
}
```

After the document is loaded from Notebook Document providers, we will ask Notebook Output renderers to convert the output to outputs which the core understands.

For example, an nteract output renderer extension can convert above output cell to 

```json
{
    "data": {
        "text/html": [
            "<div>\n",
            "<script type=\"application/vnd.nteract.view+json\">\n",
            "{ \"application/vnd.plotly.v1+json\": {\n",
            "    \"data\": [\n",
            "        { \"x\": [1999, 2000, 2001, 2002], \"y\": [10, 15, 13, 17], \"type\": \"scatter\" },\n",
            "        { \"x\": [1999, 2000, 2001, 2002], \"y\": [16, 5, 11, 9], \"type\": \"scatter\" }\n",
            "    ],\n",
            "    \"layout\": {\n",
            "        \"title\": \"Super Stuff\",\n",
            "        \"xaxis\": { \"title\": \"Year\", \"showgrid\": false, \"zeroline\": false },\n",
            "        \"yaxis\": { \"title\": \"Percent\", \"showline\": false },\n",
            "        \"height\": \"100px\"\n",
            "    }\n",
            "}}\n",
            "</script>\n",
            "<script>if (window.nteract) { window.nteract.renderTags(); } </script>\n",
            "</div>\n"
        ]
    },
    "output_type": "display_data"
}
```

The output after convertion contains 

* Output raw data, stored in a custom script tag `<script type="application/vnd.nteract.view+json"></script>` (inspired by ipywidgets)
* A javascript script tag which attempts to use `window.nteract` to render the output

`window.nteract` is a global object initialized by a preloaded javascript file, contributed by the nteract renderer extension too. The nteract extension can archive this by inserting one additional plain HTML output 

```json
outputs": [
    {
        "data": {
            "text/html": [
                "<script type="mimetype-dep...-nteract" src=\"vscode-resource://file///Users/penlv/code/vscode/extensions/notebook-test/dist/nteract.js\"></script>"
            ]
        },
        "output_type": "display_data"
    }
]
```

Once loaded/evaluated, `nteract.js` will expose a global object `nteract`, with which we can render outputs in different mimetypes. `nteract.js` is a React application based on nteract transformers.

After the `window.nteract` is initialized, the following outputs can call `window.nteract.renderTags()` to render newly inserted outputs.

## ?

* how does the output renderer/extension inject js dependencies? If it's through `text/html` output, how does it know if it's loaded or not?
  * after a file is opened, it injects the js dependencies the first time an output will be rendered.
* active/passive output rendering transform
  * we can transform the outputs in the exthost in advance when a file is loaed from the notebook provider
    * how will mimetype switcher work?
  * we can do that only when we need to render an output which a mimetype registered by a notebook output rendering extension.
    * perf?
* how to decide what mimetype to render
  * say an output contains three mimetypes, A, B and plaintext
  * Extension C and handle A
  * Extension D can handle A & B
  * The core can render plaintext
  - does kernel care?
* perf. initial loading is usually slow as it needs to load/evaluate/build the dependencies
  * for example, a small notebook file with a markdown output and a plot output.
    * 165ms compiling script
    * 45ms initialization
    * 160ms load/evaluate plot.js
    * 100ms render the plot
  * It's not noticeable slower than running the scripts in a normal browser
  * It's fast on ADS as there is no penalty for compiling scripts, evaluating plot scripts
    * Howev


next

- update feature list ...


- initialization scripts registration
  - low running script loading
- priority list from notebook provider
- renderer switcher ? 


- mimetype switcher 
