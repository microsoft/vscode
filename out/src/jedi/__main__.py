from sys import argv
from os.path import join, dirname, abspath, isdir


if len(argv) == 2 and argv[1] == 'repl':
    # don't want to use __main__ only for repl yet, maybe we want to use it for
    # something else. So just use the keyword ``repl`` for now.
    print(join(dirname(abspath(__file__)), 'api', 'replstartup.py'))
elif len(argv) > 1 and argv[1] == 'linter':
    """
    This is a pre-alpha API. You're not supposed to use it at all, except for
    testing. It will very likely change.
    """
    import jedi
    import sys

    if '--debug' in sys.argv:
        jedi.set_debug_function()

    for path in sys.argv[2:]:
        if path.startswith('--'):
            continue
        if isdir(path):
            import fnmatch
            import os

            paths = []
            for root, dirnames, filenames in os.walk(path):
                for filename in fnmatch.filter(filenames, '*.py'):
                    paths.append(os.path.join(root, filename))
        else:
            paths = [path]

        try:
            for path in paths:
                for error in jedi.Script(path=path)._analysis():
                    print(error)
        except Exception:
            if '--pdb' in sys.argv:
                import pdb
                pdb.post_mortem()
            else:
                raise
