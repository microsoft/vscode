try:
    import gssapi

    if hasattr(gssapi, "__title__") and gssapi.__title__ == "python-gssapi":
        # old, unmaintained python-gssapi package
        _API = "MIT"  # keep this for compatibility
        GSS_EXCEPTIONS = (gssapi.GSSException,)
    else:
        _API = "PYTHON-GSSAPI-NEW"
        GSS_EXCEPTIONS = (
            gssapi.exceptions.GeneralError,
            gssapi.raw.misc.GSSError,
        )
except (ImportError, OSError):
    try:
        import pywintypes
        import sspicon
        import sspi

        _API = "SSPI"
        GSS_EXCEPTIONS = (pywintypes.error,)
    except ImportError:
        GSS_AUTH_AVAILABLE = False
        _API = None

from paramiko.common import MSG_USERAUTH_REQUEST
from paramiko.ssh_exception import SSHException
from paramiko._version import __version_info__
