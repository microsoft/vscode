"""
Jedi is a static analysis tool for Python that can be used in IDEs/editors. Its
historic focus is autocompletion, but does static analysis for now as well.
Jedi is fast and is very well tested. It understands Python on a deeper level
than all other static analysis frameworks for Python.

Jedi has support for two different goto functions. It's possible to search for
related names and to list all names in a Python file and infer them. Jedi
understands docstrings and you can use Jedi autocompletion in your REPL as
well.

Jedi uses a very simple API to connect with IDE's. There's a reference
implementation as a `VIM-Plugin <https://github.com/davidhalter/jedi-vim>`_,
which uses Jedi's autocompletion.  We encourage you to use Jedi in your IDEs.
It's really easy.

To give you a simple example how you can use the Jedi library, here is an
example for the autocompletion feature:

>>> import jedi
>>> source = '''
... import datetime
... datetime.da'''
>>> script = jedi.Script(source, 3, len('datetime.da'), 'example.py')
>>> script
<Script: 'example.py'>
>>> completions = script.completions()
>>> completions                                         #doctest: +ELLIPSIS
[<Completion: date>, <Completion: datetime>, ...]
>>> print(completions[0].complete)
te
>>> print(completions[0].name)
date

As you see Jedi is pretty simple and allows you to concentrate on writing a
good text editor, while still having very good IDE features for Python.
"""

__version__ = '0.9.0'

from jedi.api import Script, Interpreter, NotFoundError, set_debug_function
from jedi.api import preload_module, defined_names, names
from jedi import settings
