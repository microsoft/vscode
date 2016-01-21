"""
To use Jedi completion in Python interpreter, add the following in your shell
setup (e.g., ``.bashrc``)::

    export PYTHONSTARTUP="$(python -m jedi repl)"

Then you will be able to use Jedi completer in your Python interpreter::

    $ python
    Python 2.7.2+ (default, Jul 20 2012, 22:15:08)
    [GCC 4.6.1] on linux2
    Type "help", "copyright", "credits" or "license" for more information.
    >>> import os
    >>> os.path.join().split().in<TAB>                     # doctest: +SKIP
    os.path.join().split().index   os.path.join().split().insert

"""
import jedi.utils
from jedi import __version__ as __jedi_version__

print('REPL completion using Jedi %s' % __jedi_version__)
jedi.utils.setup_readline()

del jedi

# Note: try not to do many things here, as it will contaminate global
# namespace of the interpreter.
