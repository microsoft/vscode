"""
Jedi is a static analysis tool for Python that is typically used in
IDEs/editors plugins. Jedi has a focus on autocompletion and goto
functionality. Other features include refactoring, code search and finding
references.

Jedi has a simple API to work with. There is a reference implementation as a
`VIM-Plugin <https://github.com/davidhalter/jedi-vim>`_. Autocompletion in your
REPL is also possible, IPython uses it natively and for the CPython REPL you
can install it. Jedi is well tested and bugs should be rare.

Here's a simple example of the autocompletion feature:

>>> import jedi
>>> source = '''
... import json
... json.lo'''
>>> script = jedi.Script(source, path='example.py')
>>> script
<Script: 'example.py' ...>
>>> completions = script.complete(3, len('json.lo'))
>>> completions
[<Completion: load>, <Completion: loads>]
>>> print(completions[0].complete)
ad
>>> print(completions[0].name)
load
"""

__version__ = '0.19.2'

from erdos._vendor.jedi.api import Script, Interpreter, set_debug_function, preload_module
from jedi import settings
from erdos._vendor.jedi.api.environment import find_virtualenvs, find_system_environments, \
    get_default_environment, InvalidPythonEnvironment, create_environment, \
    get_system_environment, InterpreterEnvironment
from erdos._vendor.jedi.api.project import Project, get_default_project
from erdos._vendor.jedi.api.exceptions import InternalError, RefactoringError

# Finally load the internal plugins. This is only internal.
from erdos._vendor.jedi.plugins import registry
del registry
