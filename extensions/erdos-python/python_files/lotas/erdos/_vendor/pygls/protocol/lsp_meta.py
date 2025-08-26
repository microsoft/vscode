import functools
import logging
from lotas.erdos._vendor.pygls.constants import ATTR_FEATURE_TYPE
from lotas.erdos._vendor.pygls.feature_manager import assign_help_attrs


logger = logging.getLogger(__name__)


def call_user_feature(base_func, method_name):
    """Wraps generic LSP features and calls user registered feature
    immediately after it.
    """

    @functools.wraps(base_func)
    def decorator(self, *args, **kwargs):
        ret_val = base_func(self, *args, **kwargs)

        try:
            user_func = self.fm.features[method_name]
            self._execute_notification(user_func, *args, **kwargs)
        except KeyError:
            pass
        except Exception:
            logger.exception(
                'Failed to handle user defined notification "%s": %s', method_name, args
            )

        return ret_val

    return decorator


class LSPMeta(type):
    """Wraps LSP built-in features (`lsp_` naming convention).

    Built-in features cannot be overridden but user defined features with
    the same LSP name will be called after them.
    """

    def __new__(mcs, cls_name, cls_bases, cls):
        for attr_name, attr_val in cls.items():
            if callable(attr_val) and hasattr(attr_val, "method_name"):
                method_name = attr_val.method_name
                wrapped = call_user_feature(attr_val, method_name)
                assign_help_attrs(wrapped, method_name, ATTR_FEATURE_TYPE)
                cls[attr_name] = wrapped

                logger.debug('Added decorator for lsp method: "%s"', attr_name)

        return super().__new__(mcs, cls_name, cls_bases, cls)
