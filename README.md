# Python
Linting, Debugging (multi-threaded, web apps, remote), Intellisense, auto-completion, code formatting, snippets, unit testing, and more.

##[Wiki](https://github.com/DonJayamanne/pythonVSCode/wiki)
Once installed, do remember to [configure the path](https://github.com/DonJayamanne/pythonVSCode/wiki/Python-Path-and-Version) to the python executable.

##Features
* Linting (PyLint, Pep8, Flake8, pydocstyle with config files and plugins)
* Intellisense and autocompletion
* Auto indenting
* Code formatting (autopep8, yapf, with config files)
* Renaming, Viewing references, Going to definitions, Go to Symbols
* View signature and similar by hovering over a function or method
* Debugging with support for local variables, arguments, expressions, watch window, stack information, break points
* Debugging Multiple threads (Web Applications - Flask, etc) and expanding values (on Windows and Mac)
* Debugging remote processes (attaching to local and remote process)
* Debugging with support for shebang (windows)
* Debugging with custom environment variables
* Unit testing (unittests and nosetests, with config files)
* Sorting imports
* Snippets

##[Issues and Feature Requests](https://github.com/DonJayamanne/pythonVSCode/issues)
* Support for Virtual Environments (in development)

## Feature Details (with configuration)
* IDE Features
 + Auto indenting
 + Rename and navigate to symbols
 + Go to, Peek and hover definition
 + Find all references
 + View Signature
 + Sorting Import statements (use "Python: Sort Imports" command)
* [Intellisense and Autocomplete](https://github.com/DonJayamanne/pythonVSCode/wiki/Autocomplete-Intellisense)
 + Full intellisense
 + Support for docstring
 + Ability to include custom module paths (e.g. include paths for libraries like Google App Engine, etc)
 + Use the setting python.autoComplete.extraPaths = []
 + For instance getting autocomplete/intellisense for Google App Engine, add the following to your settings file:
```json
"python.autoComplete.extraPaths": [
    "C:/Program Files (x86)/Google/google_appengine",
    "C:/Program Files (x86)/Google/google_appengine/lib" ]
```
* [Code formatting](https://github.com/DonJayamanne/pythonVSCode/wiki/Formatting)
 + Auto formatting of code upon saving changes (default to 'Off')
 + Use either yapf or autopep8 for code formatting (defaults to autopep8)
 + auutopep8 configuration files supported
 + yapf configuration files supported
* [Linting](https://github.com/DonJayamanne/pythonVSCode/wiki/Linting)
 + It can be turned off (default is turn it on and use pylint)
 + pylint can be turned on/off (default is on), supports standard configuaration files
 + pep8 can be turned on/off (default is off), supports standard configuaration files
 + flake8 can be turned on/off (default is on), supports standard configuaration files
 + pydocstyle can be turned on/off (default is on), supports standard configuaration files
 + Different categories of errors reported by pylint can be configured as warnings, errors, information or hits
 + Path to pylint, pep8 and flake8 and pep8 can be configured
 + Custom plugins such as pylint plugin for Django can be easily used by modifying the settings as follows:
```json
"python.linting.pylintPath": "pylint --load-plugins pylint_django"
``` 
* [Debuggging](https://github.com/DonJayamanne/pythonVSCode/wiki/Debugging)
 + Watch window
 + Evaluate Expressions
 + Step through code (Step in, Step out, Continue)
 + Add/remove break points
 + Local variables and arguments
 + Multiple Threads and Web Applications (such as Flask) (Windows and Mac)
 + Expanding values (viewing children, properties, etc) (Windows and Mac)
 + Conditional breakpoints
 + Remote debugging
* Unit Testing
 + unittests (default is on)
 + nosetests (default is off)
 + Test resutls are displayed in the "Python" output window
 + Future release will display results in a more structured manner integrated into the IDE
* Snippets


![Image of Generate Features](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/general.gif)

![Image of Go To Definition](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/goToDef.gif)

![Image of Renaming and Find all References](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/rename.gif)

![Image of Debugging](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/standardDebugging.gif)

![Image of Multi Threaded Debugging](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/flaskDebugging.gif)

![Image of Pausing](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/break.gif)

## Requirements
* Python is installed on the current system
 + Path to python can be configured
* Pylint is installed for linting (optional)
 + pip install pylint
* Pep8 is installed for linting (optional)
 + pip install pep8
* Flake8 is installed for linting (optional)
 + pip install flake8
* pydocstyle is installed for linting (optional)
 + pip install pydocstyle
* Autopep8 is installed for code formatting (optional) 
 + pip install pep8
 + pip install --upgrade autopep8
* Yapf is installed for code formatting (optional)
 + pip install yapf
* nosetests for unit testing  (optional)
 + pip install nose

## Change Log

### Version 0.3.6
* Added support for auto indenting of some keywords [#83](https://github.com/DonJayamanne/pythonVSCode/issues/83)

### Version 0.3.6
* Added support for linting using pydocstyle [#56](https://github.com/DonJayamanne/pythonVSCode/issues/56)
* Added support for auto-formatting documents upon saving (turned off by default) [#27](https://github.com/DonJayamanne/pythonVSCode/issues/27)
* Added support to configure the output window for linting, formatting and unit test messages [#112](https://github.com/DonJayamanne/pythonVSCode/issues/112)

### Version 0.3.5
* Fixed printing of unicode characters when evaulating expressions [#73](https://github.com/DonJayamanne/pythonVSCode/issues/73)

### Version 0.3.4
* Updated snippets
* Fixes to remote debugging [#65](https://github.com/DonJayamanne/pythonVSCode/issues/65)
* Fixes related to code navigation [#58](https://github.com/DonJayamanne/pythonVSCode/issues/58) and [#78](https://github.com/DonJayamanne/pythonVSCode/pull/78)
* Changes to allow code navigation for methods

### Version 0.3.2
* Ability to control how debugger breaks into exceptions raised (always break, never break or only break if unhandled)
* Disabled displaying of errors, as there are a few instances when errors are displayed in the IDE when not required

### Version 0.3.1
* Remote debugging (updated documentation and fixed minor issues)
* Fixed issues with formatting of files when path contains spaces

### Version 0.3.0
* Remote debugging (attaching to local and remote processes)
* Debugging with support for shebang
* Support for passing environment variables to debug program
* Improved error handling in the extension

### Version 0.2.9
* Added support for debugging django applications
 + Debugging templates is not supported at this stage

### Version 0.2.8
* Added support for conditional break points
* Added ability to optionally display the shell window (Windows Only, Mac is coming soon)
  +  Allowing an interactive shell window, which isn't supported in VSCode.
* Added support for optionally breaking into python code as soon as debugger starts 
* Fixed debugging when current thread is busy processing.
* Updated documentation with samples and instructions

### Version 0.2.4
* Fixed issue where debugger would break into all exceptions
* Added support for breaking on all and uncaught exceptions   
* Added support for pausing (breaking) into a running program while debugging.

### Version 0.2.3
* Fixed termination of debugger

### Version 0.2.2
* Improved debugger for Mac, with support for Multi threading, Web Applications, expanding properties, etc
* (Debugging now works on both Windows and Mac)
* Debugging no longer uses PDB

### Version 0.2.1
* Improved debugger for Windows, with support for Multi threading, debugging Multi-threaded apps, Web Applications, expanding properties, etc
* Added support for relative paths for extra paths in additional libraries for Auto Complete
* Fixed a bug where paths to custom Python versions weren't respected by the previous (PDB) debugger
* NOTE: PDB Debugger is still supported

### Version 0.1.3
* Fixed linting when using pylint

### Version 0.1.2
* Fixed autoformatting of code (falling over when using yapf8)

### Version 0.1.1
* Added support for linting using flake8
* Added support for unit testing using unittest and nosetest
* Added support for custom module paths for improved intellisense and autocomplete
* Modifications to debugger to display console output (generated using 'print' and the like)
* Modifications to debugger to accept arguments

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
