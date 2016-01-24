# Python
Linting, Debugging, Intellisense, auto-completion, code formatting, snippets, and more.
Works on both Windows and Mac.

##Features
* Linting (PyLint, Pep8 with support for config files)
* Intellisense and autocompletion
* Code formatting (autopep8, yapf, with support for config files)
* Renaming, Viewing references, Going to definitions, Go to Symbols
* View signature and similar by hovering over a function or method
* Debugging with support for local & global variables, arguments, expressions, watch window, stack information, break points
* Sorting imports
* Snippets

## Issues, Feedback and Suggestions
[Gitbub Issues](https://github.com/DonJayamanne/pythonVSCode/issues)

## Feature Details (with confiuration)
* IDE Features
* - Rename and navigate to symbols
* - Go to, Peek and hover definition
* - Find all references
* - View Signature
* - Sorting Import statements (use "Python: Sort Imports" command)
* Intellisense and Autocomplete
* - Full intellisense
* - Support for docstring
* Code formatting
* - Use either yapf or autopep8 for code formatting (defaults to autopep8)
* - auutopep8 configuration files supported
* - yapf configuration files supported
* Linting
* - It can be turned off (default is turn it on and use pylint)
* - pylint can be turned off
* - pyliny configuaration files supported
* - pep8 can be turned off
* - pep8 configuaration files supported
* - Different categories of errors reported by pylint can be configured as warnings, errors, information or hits
* - Path to pylint and pep8 can be configured
* - Path to pep8 can be configured through config
* Debuggging
* - Local and Global variables
* - Arguments
* - Watch window
* - Evaluate Expressions
* - Step through code (Step in, Step out, Continue)
* - Add/remove break points
* Snippets


![Image of Generate Features](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/general.gif)

![Image of Go To Definition](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/goToDef.gif)

![Image of Renaming and Find all References](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/rename.gif)

## Requirements
* Python is installed on the current system
* Pylint is installed for linting (optional, this can be turned off)
* - Install Pylint as follows:
* - pip install pylint
* Pep8 is installed for linting (optional, this can be turned off)
* - pip install pep8
* Autopep8 is installed for code formatting 
* - Install AutoPep8 as follows (ensure pep8 is installed):
* - pip install pep8
* - pip install --upgrade autopep8


## Change Log

### Version 0.1.0
* Fixed linting of files on Mac
* Added support for linting using pep8
* Added configuration support for pep8 and pylint
* Added support for configuring paths for pep8, pylint and autopep8
* Added snippets
* Added support for formatting using yapf
* Added a number of configuration settings

### Version 0.0.4
* Added support for linting using Pylint (configuring pylint is coming soon)
* Added support for sorting Imports (Using the command "Pythong: Sort Imports")
* Added support for code formatting using Autopep8 (configuring autopep8 is coming soon)
* Added ability to view global variables, arguments, add and remove break points

### Version 0.0.3
* Added support for debugging using PDB


## Debugging Instructions
* Use the Python debugger, set the name of the startup program


## Source

[Github](https://github.com/DonJayamanne/pythonVSCode)

                
## License

[MIT](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/LICENSE)
