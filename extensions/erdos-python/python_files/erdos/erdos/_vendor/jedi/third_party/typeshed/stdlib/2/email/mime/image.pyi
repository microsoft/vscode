from email.mime.nonmultipart import MIMENonMultipart

class MIMEImage(MIMENonMultipart):
    def __init__(self, _imagedata, _subtype=..., _encoder=..., **_params) -> None: ...
