from email.mime.nonmultipart import MIMENonMultipart
from typing import Callable, Optional, Tuple, Union

_ParamsType = Union[str, None, Tuple[str, Optional[str], str]]

class MIMEApplication(MIMENonMultipart):
    def __init__(
        self, _data: bytes, _subtype: str = ..., _encoder: Callable[[MIMEApplication], None] = ..., **_params: _ParamsType
    ) -> None: ...
