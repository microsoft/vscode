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

## Wed

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


## Thu

- [x] update feature list ...
- [x] preload scripts registration
  - when a notebook file is opened
    - we will create webview first, inject preload scripts 
      - it's an known issue that loading/evaluting plot renderer is slow https://github.com/jupyter/notebook/issues/181
    - start list view initialization
    - `ipywidgets` still works through `text/html` output
  - slow running script loading
    - *?* `console.log` slow down the UI (webview will send out `console-message` even if you don't have a listener for it) @deepak
    - *?* `ERR_UNKNOWN_URL_SCHEME` sometimes. Timing issue with custom protocol handler for Webview  @mjb
    - *?* Webview seems slow when idle for a while? @deepak


- priority list from notebook provider
  - no communication betwen client and kernel about mimetype support in classic Jupyter
  - *?* who decides? (low to high)
    - Core (text, png, svg, html)
    - NBDocument provider 
    - Custom mime type renderer
    - User



- mimetype renderer/switcher (for the same output)
  - jupyter notebook's prototype https://github.com/jupyter/notebook/pull/2769 
- renderer switcher (for the same mimetype)
  - *?* If the Renderer is a Picker+Transformer, then there can only be one active Renderer
  - Otherwise, there are multiple transformers avaible for the same mimetype


### What's a renderer #1: mimetype picker + transformer

A typical output usually contains multiple mime types (mimetype bundle)


```js
  CellOutput: {
    text/plain
    image/svg
    application/vnd.plotly.v1+json
  }
```

VS Code chooses `image/svg` to render by default, users can switch to `text/plain`

--- install nteract extension

```js
  Transformed CellOutput {
    text/html
  }
```

User changes the priority list to `[svg, html]`, then nteract returns 

```js
  Transformed CellOutput {
    image/svg
  }
```

The only active Renderer generates the best output based on the output data and user defined priority list.

### What's an output renderer #2: mimetype transformer


```js
  CellOutput: {
    text/plain
    application/vnd.plotly.v1+json
    image/svg
  }
```

Richest supported mimetype --> image/svg

```js
  Transformed CellOutput {
    text/plain
    application/vnd.plotly.v1+json (show warning/renderer suggestion)
    *image/svg (default rendered output)
  }
```

(question? should the core receive `application/vnd*` as it will never understand this mimetype?)

--- install nteract extension

Richest supported mimetype --> application/vnd.ploty.v1+json

```js
  Transformed CellOutput {
    text/plain
    *text/html (default rendered output, name is still 'application/vnd.plotly.v1+json')
    image/svg
  }
```

### Mixed priority list and picker

The display order is concatenated from order lists from core, providers, renderers and users. The mimetype registered later has higher priority. Similar to the keybindings

(the configuration exposed to users don't need to be the same as below, it can still be `order` and `mimeTypeRendererMapping`).

```json
[
  // user has the highest priority

  // contribtued by nteract renderer extension
  { "type": "application/vnd-plot", "renderer": "nteract" },
  { "type": "application/json", "renderer": "nteract" }, // interactive json viewer
  { "type": "text/markdown", "renderer": "nteract" }, // for example, nteract supports latex so users may want to use it instead of the markdown engine in core

  // contribtued by the document provider
  { "type": "text/html", "renderer": "core" }
  { "type": "application/json", "renderer": "core" }
  { "type": "application/javascript", "renderer": "core" }
  { "type": "image/svg+xml", "renderer": "core" }
  { "type": "text/markdown", "renderer": "core" }
  { "type": "text/latex" }  // core doesn't have renderer for this, so skip
  { "type": "image/svg+xml", "renderer": "core" }
  { "type": "image/gif" }  // core doesn't have renderer for this, so skip
  { "type": "image/png", "renderer": "core" }
  { "type": "image/jpeg", "renderer": "core" } 
  { "type": "application/pdf", "renderer": "" }  // core doesn't have renderer for this, so skip
  { "type": "text/plain", "renderer": "core" }


  // builtin order
  { "type": "application/json", "renderer": "core" }
  { "type": "application/javascript", "renderer": "core" }
  { "type": "text/html", "renderer": "core" }
  { "type": "image/svg+xml", "renderer": "core" }
  { "type": "text/markdown", "renderer": "core" }
  { "type": "image/svg+xml", "renderer": "core" }
  { "type": "image/png", "renderer": "core" }
  { "type": "image/jpeg", "renderer": "core" } 
  { "type": "text/plain", "renderer": "core" }
]
```

With above list 

```json
{
  "text/markdown": {},  // render by nteract, picked by nteract
  "text/plain": {}
}
```

```json
{
  "text/latex": {},  
  "text/plain": {} // render by core
}
```

```json
{
  "text/html": {}, // render by core, picked by NBDocument provider
  "application/json": {} 
}
```

---


- priority list 
- renders for custom mimetypes  --> primitives
  - *!* strongly typed output. Currently output is `any`, but we can define a fixed list of mimetypes which can be rendered in the core

- renders for primitives (initially provided by the core)



# MISC

- preload resources types: (script, css, font?)
- kernel adapter -- local/remote runtime
- perf
  - forced reflow in `CodeEditorWidget.ContentWidget` https://github.com/microsoft/vscode/blob/20f4cbf4b6e585a15751effe59ab40e180d11b43/src/vs/editor/browser/viewParts/contentWidgets/contentWidgets.ts#L437-L441
    - *!* Render 20 monaco editors, each one contains two lines of code. `SuggestWidget` stands out.
  - *?* can iframe be faster than webview? Google Colab seems speedy
- security model
  - protect the webview from ruined by a misbehaving output