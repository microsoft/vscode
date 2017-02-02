## Interactive Editor Playground
The core editor in VS Code is packed with features.  This page highlights a number of them and lets you interactively try them out through the use of a number of embedded editors.  For full details on the editor features for VS Code and more head over to our [documentation](command:workbench.action.openDocumentationUrl).

* [Multi-cursor Editing](#multi-cursor-editing) - block selection, select all occurrences, add additional cursors and more
* [IntelliSense](#intellisense) - get code assistance and parameter suggestions for your code and external modules.
* [Line Actions](#line-actions) - quickly move lines around to re-order your code.
* [Rename Refactoring](#rename-refactoring) - Quickly rename symbols across your code base.
* [Formatting](#formatting) - keep your code looking great with inbuilt document & selection formatting.
* [Code Folding](#code-folding) - focus on the most relevant parts of your code by folding other areas.
* [Errors and Warnings](#errors-and-warnings) - see errors and warning as you type.
* [Snippets](#snippets) - spend less time typing with snippets.
* [Emmet](#emmet) - integrated Emmet support takes HTML and CSS editing to the next level.



### Multi-Cursor Editing
Using multiple cursors allows you to edit multiple parts of the document at once, greatly improving your productivity.  Try the following actions in the code block below:
1. Box Selection - press <span class="mac-only windows-only">any combination of kb(cursorColumnSelectDown), kb(cursorColumnSelectRight), kb(cursorColumnSelectUp), kb(cursorColumnSelectLeft) to select a block of text, you can also press</span> <span class="shortcut mac-only">`⇧⌥`</span><span class="shortcut windows-only linux-only">`Shift+Alt`</span> while selecting text with the mouse.
2. Add a cursor - press kb(editor.action.insertCursorAbove) or kb(editor.action.insertCursorBelow) to add a new cursor above or below, you can also use your mouse with <span class="shortcut mac-only">`⌥+Click`</span><span class="shortcut windows-only linux-only">`Alt+Click`</span> to add a cursor anywhere.
3. Create cursors on all occurrences of a string - select one instance of a string e.g. `background-color` and press kb(editor.action.selectHighlights).  Now you can replace all instances by simply typing.

That is the tip of the iceberg for multi-cursor editing have a look at the `selection menu` and our handy [keyboard reference guide](command:workbench.action.keybindingsReference) for additional actions.

```css
#p1 {background-color: #ff0000;}   /* red */
#p2 {background-color: #00ff00;}   /* green */
#p3 {background-color: #0000ff;}   /* blue */
```

> **CSS Tip:** you may have noticed in the example above for CSS we also provide color swatches inline, additionally if you hover over an element such as `#p1` we will show how this is represented in HTML.  A simple example of some language specific editor features.

### IntelliSense

Visual Studio Code comes with powerful IntelliSense for JavaScript and TypeScript pre-installed. In the below example, position the text cursor in front of the error underline, right after the dot and press kb(editor.action.triggerSuggest) to invoke IntelliSense.  Notice how the suggestion comes from the Request API.

```js
var express = require('express');
var app = express();

app.get('/', function (req, res) {
    res.send(`Hello ${req.}`);
});

app.listen(3000);
```

>**Tip:** while we ship JavaScript and TypeScript support out of the box other languages can be upgraded with better IntelliSense through one of the many [extensions](command:workbench.extensions.action.showPopularExtensions).


### Line Actions
Since it's very common to want to work with the entire text in a line we provide a set of useful shortcuts to help with this.
1. Copy a line and insert it above or below the current position with kb(editor.action.copyLinesDownAction) or kb(editor.action.copyLinesUpAction) respectively.
2. Move an entire line or selection of lines up or down with kb(editor.action.moveLinesUpAction) and kb(editor.action.moveLinesDownAction) respectively.
3. Delete the entire line with kb(editor.action.deleteLines).

```json
{
    "name": "John",
    "age": 31,
    "city": "New York"
}
```

>**Tip:** Another very common task is to comment out a block of code - you can toggle commenting by pressing kb(editor.action.commentLine).



### Rename Refactoring
It's easy to rename a symbol such as a function name or variable name.  Hit kb(editor.action.rename) while in the symbol `Book` to rename all instances - this will occur across all files in a project.  You can also see refactoring in the right click context menu.

```js
// Reference the function
new Book("War of the Worlds", "H G Wells");
new Book("The Martian", "Andy Weir");

/**
 * Represents a book.
 */
function Book(title, author) {
	this.title = title;
	this.author = author;
}
```

> **JSDoc Tip:** The example above also showcased another way to get IntelliSense hints by using `JSDoc` comments.  You can try this out by invoking the `Book` function and seeing the enhanced context in the IntelliSense Experience for the function as well as parameters.


### Formatting
Keeping your code looking great is hard without a good formatter.  Luckily it's easy to format content either the entire document with kb(editor.action.formatDocument) or formatting can be applied to the current selection with kb(editor.action.formatSelection).  Both of these options are also available through the right click context menu.

```js
var cars = ["Saab", "Volvo", "BMW"];

for (var i=0; i < cars.length; i++) {
// Drive the car
console.log(`This is the manufacturer [${cars[i]}])`);
    }
```

>**Tip:** Additional formatters are available in the [extension gallery](command:workbench.extensions.action.showPopularExtensions).  Formatting support can also be configured via [settings](command:workbench.action.openGlobalSettings) e.g. enabling `editor.formatOnSave`.


### Code Folding
In a large file it can often be useful to collapse sections of code to increase readability.  To do this you can simply press kb(editor.fold) to `fold` the code - press kb(editor.unfold) to `unfold`.  Folding can also be done with the +/- icons in the left gutter.  To fold all sections kb(editor.foldAll) or to unfold all kb(editor.unfoldAll).

```html
<div>
    <header>
        <ul>
            <li><a href=""></a></li>
            <li><a href=""></a></li>
        </ul>
    </header>
    <footer>
        <p></p>
    </footer>
</div>
```

>**Tip:** Folding is based on indentation and as a result can apply to all languages.  Simply indent your code to create a foldable section you can fold a certain number of levels with shortcuts like kb(editor.foldLevel1) through to kb(editor.foldLevel5).

### Errors and Warnings
Errors and warnings are highlighted as you edit your code with `squiggles`.  In the sample below you can see a number of syntax errors.  By pressing kb(editor.action.marker.next) you can navigate across them in sequence and see the detailed error message.  As you correct them the `squiggles` and `scrollbar indicators` will update.

```js
// This code has a few syntax errors
Console.log(add(1, 1.5));


function Add(a : Number, b : Number) : Int {
    return a + b;
}
```


###  Snippets
You can greatly accelerate your editing through the use of snippets.  Simply start typing `try` and select `trycatch` from the suggestion list and press kb(insertSnippet) to create a `try`->`catch` block.  Your cursor will be placed on the text `error` for easy editing.  If more than one parameter exists then press kb(jumpToNextSnippetPlaceholder) to jump to it.

```js

```

>**Tip:** the extension gallery includes snippets for almost every framework and language imaginable [extensions](command:workbench.extensions.action.showPopularExtensions).  You can also create your own [user defined snippets](command:workbench.action.openSnippets).


### Emmet
Emmet takes the snippets idea to a whole new level: you can type CSS-like expressions that can be dynamically parsed, and produce output depending on what you type in the abbreviation.  To use Emmet simply press tab after a valid piece for Emmet syntax and the expansion will occur.  Try it by pressing tab after `ul>li.item$*5` to see Emmet in action.

```html
ul>li.item$*5
```

>**Tip:** The [Emmet cheat sheet](http://docs.emmet.io/cheat-sheet/) is a great source of Emmet syntax suggestions.  Emmet can also be enabled for additional languages via the `emmet.syntaxProfiles` [setting](command:workbench.action.openGlobalSettings).



## Thanks!
Well if you have got this far then you will have touched on some of the editing features in Visual Studio Code.  But don't stop now :)  We have lots of additional [documentation](https://code.visualstudio.com/docs) and [introductory videos](https://code.visualstudio.com/docs/introvideos/overview) for the product that will help you learn how to use it.  And while you are here, here are a few additional things you can try:
- Open the Integrated Terminal by pressing kb(workbench.action.terminal.toggleTerminal) then see what's possible by [reviewing the terminal documentation](https://code.visualstudio.com/docs/editor/integrated-terminal)
- Work with version control by pressing <span class="git-only">kb(workbench.view.git)</span><span class="scm-only">kb(workbench.view.scm)</span> understand how to stage, commit, change branches, and view diffs and more by reviewing the [version control documentation](https://code.visualstudio.com/docs/editor/versioncontrol)
- Browse thousands of extensions in our integrated gallery by pressing with kb(workbench.view.extensions) the [documentation](https://code.visualstudio.com/docs/editor/extension-gallery) will show you how to see the most popular extensions, disable installed ones and more.

OK that's all for now,

Happy Coding!