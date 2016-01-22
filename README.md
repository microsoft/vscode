# Python
Linting, Debugging, Intellisense, auto-completion, code formatting, rename references, view references, go to definition, and the like

##Features
* Linting (using PyLint)
* Intellisense and auto completion
* Code formatting (using AutoPep8)
* Renaming
* Viewing references
* Going to definitins
* View signature and similar by hovering over a function or method
* Debugging using PDB (work in progress, please remove any and all issues)
* Debugging with support for local variables, expressions, watch window, stack information, break points
*   (currently you cannot removed any added breakpoints, this will be fixed in a future release)
* Sorting imports

## Issues, Feedback and Suggestions
[Gitbub Issues](https://github.com/DonJayamanne/pythonVSCode/issues)

## Requirements
* Python is installed on the current system
* Path to Python is assumed to be in the current environment path.
* Pylint is installed for linting
* - Install Pylint as follows:
* - pip install pylint
* AutoPep8 is installed for code formatting 
* - Install AutoPep8 as follows (ensure pep8 is installed):
* - pip install pep8
* - pip install --upgrade autopep8

![Image of Generate Features](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/general.gif)

![Image of Go To Definition](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/goToDef.gif)

![Image of Renaming and Find all References](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/images/rename.gif)


## Chang Log
### Version 0.0.4
* Added support for linting using Pylint (configuring pylint is coming soon)
* Added support for sorting Imports
* Added support for code formatting using Autopep8 (configuring autopep8 is coming soon)
### Version 0.0.3
* Added support for debugging using PDB (currently you cannot delete a breakpoint, this will be fixed soon)


## Debugging Instructions
* Use the Python debugger, set the name of the startup program


## Source

[Github](https://github.com/DonJayamanne/pythonVSCode)

                
## License

[MIT](https://raw.githubusercontent.com/DonJayamanne/pythonVSCode/master/LICENSE)
