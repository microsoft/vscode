import sys
from typing import Optional

def version() -> str: ...

if sys.version_info >= (3, 0):
    def bootstrap(
        *,
        root: Optional[str] = ...,
        upgrade: bool = ...,
        user: bool = ...,
        altinstall: bool = ...,
        default_pip: bool = ...,
        verbosity: int = ...,
    ) -> None: ...

else:
    def bootstrap(
        root: Optional[str] = ...,
        upgrade: bool = ...,
        user: bool = ...,
        altinstall: bool = ...,
        default_pip: bool = ...,
        verbosity: int = ...,
    ) -> None: ...
