from django.core.handlers.wsgi import WSGIRequest
from django.http.response import HttpResponse
from django.utils.deprecation import MiddlewareMixin

class FlatpageFallbackMiddleware(MiddlewareMixin):
    def process_response(self, request: WSGIRequest, response: HttpResponse) -> HttpResponse: ...
