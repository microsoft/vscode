import {TextMode, JavascriptMode, JsonMode, CssMode, HtmlMode} from './ace-modes';

//TODO: handle more modes
export function mapToAceMode(mode: string) {
	switch (mode) {
        case 'json':
            return new JsonMode();
        case 'html':
            return new HtmlMode();
        case 'css':
            return new CssMode();
        case 'javascript':
			return new JavascriptMode();
		default:
			return new TextMode();
	}
}
