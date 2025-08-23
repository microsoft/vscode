from email.mime.nonmultipart import MIMENonMultipart
from email.policy import Policy
from typing import Callable, Optional, Tuple, Union

_ParamsType = Union[str, None, Tuple[str, Optional[str], str]]

class MIMEImage(MIMENonMultipart):
    def __init__(
        self,
        _imagedata: Union[str, bytes],
        _subtype: Optional[str] = ...,
        _encoder: Callable[[MIMEImage], None] = ...,
        *,
        policy: Optional[Policy] = ...,
        **_params: _ParamsType,
    ) -> None: ...
