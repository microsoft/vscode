### Multi-Cursor Editing

Use <span class="shortcut mac-only">⇧⌥</span><span class="shortcut windows-only linux-only">Shift+Alt</span> while selecting text with the mouse to select a rectangular area and change multiple lines at once.

```css
.global-message-list.transition {
    -webkit-transition: top 200ms linear;
    -ms-transition:     top 200ms linear;
    -moz-transition:    top 200ms linear;
    -khtml-transition:  top 200ms linear;
    -o-transition:      top 200ms linear;
    transition:         top 200ms linear;
}
```

### IntelliSense

Visual Studio Code comes with powerful IntelliSense for JavaScript and TypeScript preinstalled. Other languages can be upgraded with better IntelliSense through one of the many [extensions](command:workbench.extensions.action.showPopularExtensions).

In the below example, position the text cursor in front of the error underline, right after the dot and press <span class="shortcut" data-command="editor.action.triggerSuggest"></span> to invoke IntelliSense.

```js
var express = require('express');
var app = express();

app.get('/', function (req, res) {
    res.send(`Hello ${req.}`);
});

app.listen(3000);
```