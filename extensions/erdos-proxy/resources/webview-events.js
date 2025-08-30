// This script handles communication between the preview content and the parent window
// It's injected into preview HTML to enable proper event handling

(function() {
    // Notify parent that content is ready
    if (window.parent !== window) {
        window.parent.postMessage({
            type: 'webview-ready',
            source: 'erdos-preview'
        }, '*');
    }

    // Handle link clicks to ensure proper navigation
    document.addEventListener('click', function(event) {
        if (event.target.tagName === 'A') {
            const href = event.target.getAttribute('href');
            if (href && !href.startsWith('#')) {
                event.preventDefault();
                if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'navigate',
                        url: href,
                        source: 'erdos-preview'
                    }, '*');
                }
            }
        }
    });

    // Handle messages from parent
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type) {
            switch (event.data.type) {
                case 'scroll-to':
                    if (event.data.x !== undefined || event.data.y !== undefined) {
                        window.scrollTo(event.data.x || 0, event.data.y || 0);
                    }
                    break;
                case 'focus':
                    window.focus();
                    break;
            }
        }
    });
})();







