from email import message

class MIMEBase(message.Message):
    def __init__(self, _maintype, _subtype, **_params) -> None: ...
