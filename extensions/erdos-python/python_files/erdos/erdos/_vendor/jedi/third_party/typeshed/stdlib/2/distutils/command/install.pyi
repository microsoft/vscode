from distutils.cmd import Command
from typing import Optional, Text

class install(Command):
    user: bool
    prefix: Optional[Text]
    home: Optional[Text]
    root: Optional[Text]
    install_lib: Optional[Text]
    def initialize_options(self) -> None: ...
    def finalize_options(self) -> None: ...
    def run(self) -> None: ...
