from email.mime.nonmultipart import MIMENonMultipart
from email.policy import Policy
from typing import Callable, Optional, Tuple, Union

_ParamsType = Union[str, None, Tuple[str, Optional[str], str]]

class MIMEApplication(MIMENonMultipart):
    def __init__(
        self,
        _data: Union[str, bytes],
        _subtype: str = ...,
        _encoder: Callable[[MIMEApplication], None] = ...,
        *,
        policy: Optional[Policy] = ...,
        **_params: _ParamsType,
    ) -> None: ...
