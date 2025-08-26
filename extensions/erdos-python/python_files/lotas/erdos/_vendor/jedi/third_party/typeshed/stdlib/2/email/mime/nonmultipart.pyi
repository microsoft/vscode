from email.mime.base import MIMEBase

class MIMENonMultipart(MIMEBase):
    def attach(self, payload): ...
