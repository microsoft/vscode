import os
import pathlib
import sys

# Add the lib path to our sys path so jedi_language_server can find its references
extension_dir = pathlib.Path(__file__).parent.parent
EXTENSION_ROOT = os.fsdecode(extension_dir)
sys.path.insert(0, os.fsdecode(extension_dir / "python_files" / "lib" / "jedilsp"))
del extension_dir


from jedi_language_server.cli import cli  # noqa: E402

sys.exit(cli())
