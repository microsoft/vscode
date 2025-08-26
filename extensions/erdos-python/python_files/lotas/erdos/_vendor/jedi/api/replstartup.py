"""
To use Jedi completion in Python interpreter, add the following in your shell
setup (e.g., ``.bashrc``). This works only on Linux/Mac, because readline is
not available on Windows. If you still want Jedi autocompletion in your REPL,
just use IPython instead::

    export PYTHONSTARTUP="$(python -m jedi repl)"

Then you will be able to use Jedi completer in your Python interpreter::

    $ python
    Python 3.9.2+ (default, Jul 20 2020, 22:15:08)
    [GCC 4.6.1] on linux2
    Type "help", "copyright", "credits" or "license" for more information.
    >>> import os
    >>> os.path.join('a', 'b').split().in<TAB>            # doctest: +SKIP
    ..dex   ..sert

"""
import lotas.erdos._vendor.jedi.utils
from jedi import __version__ as __jedi_version__

print('REPL completion using Jedi %s' % __jedi_version__)
jedi.utils.setup_readline(fuzzy=False)

del jedi

# Note: try not to do many things here, as it will contaminate global
# namespace of the interpreter.
