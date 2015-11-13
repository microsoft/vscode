// Type definitions for React 0.12.RC
// Project: http://facebook.github.io/react/
// Definitions by: Asana <https://asana.com>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

export declare class BaseComponent<P, S> implements Specification<P, S> {
	public state: S;
	public props: P;
	public setState(substate: any, callback?: () => void): void;
	public setProps(subprops:any, callback?: () => void): void;
	public render(): RenderResult;
	public componentWillReceiveProps(nextProps: P): void;
	public shouldComponentUpdate(nextProps: P, nextState: S): boolean;
}

export interface DomReferencer2<T extends Element>  {
    getDOMNode(): T;
}

export interface RenderResult extends ReactElement<any, any> { }

export declare function createFactoryForTS<P>(specification: Specification<P, any>): ReactComponentFactory<P>;




export declare function createClass<P, S>(specification: Specification<P, S>): ReactComponentFactory<P>;

export declare function createFactory<P>(clazz: ReactComponentFactory<P>): ReactComponentFactory<P>;

export declare function createElement<P>(clazz: ReactComponentFactory<P>, props: P, ...children: any[]): ReactComponentElement<P>;

export declare function createElement(type: string, props: DomAttributes, ...children: any[]): ReactHTMLElement;

export declare function createElement(type: string, props: SvgAttributes, ...children: any[]): ReactSVGElement;

export declare function render<P>(component: ReactComponentElement<P>, container: Element, callback?: () => void): ReactComponentElement<P>;

export declare function render(component: ReactHTMLElement, container: Element, callback?: () => void): ReactHTMLElement;

export declare function render(component: ReactSVGElement, container: Element, callback?: () => void): ReactSVGElement;

export declare function unmountComponentAtNode(container: Element): boolean;

export declare function renderToString<P>(component: ReactComponentElement<P>): string;

export declare function renderToString(component: ReactHTMLElement): string;

export declare function renderToString(component: ReactSVGElement): string;

export declare function renderToStaticMarkup<P>(component: ReactComponentElement<P>): string;

export declare function renderToStaticMarkup(component: ReactHTMLElement): string;

export declare function renderToStaticMarkup(component: ReactSVGElement): string;

export declare function isValidClass(factory: ReactComponentFactory<any>): boolean;

export declare function isValidElement(component: ReactComponentElement<any>): boolean;

export declare function isValidElement(component: ReactHTMLElement): boolean;

export declare function isValidElement(component: ReactSVGElement): boolean;

export declare function initializeTouchEvents(shouldUseTouch: boolean): void;


export interface ReactComponentFactory<P> {
    (properties: P, ...children: any[]): ReactComponentElement<P>;
}

export interface ReactElementFactory<P> {
    (properties: P, ...children: any[]): ReactDOMElement<P>;
}

export interface DomElement extends ReactElementFactory<DomAttributes> {
}

export interface SvgElement extends ReactElementFactory<SvgAttributes> {
}

export interface ReactClass<P> {
    (props: P): ReactComponent<P>;
}

export interface ReactComponent<P> {
    props: P;
    render(): ReactElement<any, any>;
}

export interface ReactElement<T, P> {
    type: T;
    props: P;
    key: string;
    ref: string;
}

export interface ReactDOMElement<P> extends ReactElement<string, P> {
    props: P;
}

export interface ReactHTMLElement extends ReactDOMElement<DomAttributes> {
}

export interface ReactSVGElement extends ReactDOMElement<SvgAttributes> {
}

export interface ReactComponentElement<P> extends ReactElement<ReactClass<P>, P> {
    props: P;
}

export interface Mixin<P, S> {
    componentWillMount?(): void;
    componentDidMount?(): void;
    componentWillReceiveProps?(nextProps: P): void;
    shouldComponentUpdate?(nextProps: P, nextState: S): boolean;
    componentWillUpdate?(nextProps: P, nextState: S): void;
    componentDidUpdate?(prevProps: P, prevState: S): void;
    componentWillUnmount?(): void;
}

export interface Specification<P, S> extends Mixin<P, S> {
    displayName?: string;
    mixins?: Mixin<P, S>[];
    statics?: {
        [key: string]: Function;
    };
    propTypes?: ValidationMap<P>;
    getDefaultProps?(): P;
    getInitialState?(): S;
    render(): ReactElement<any, any>;
}

export interface DomReferencer {
    getDOMNode(): Element;
}

export interface Component<P, S> extends DomReferencer {
    refs: {
        [key: string]: DomReferencer
    };
    props: P;
    state: S;
    setState(nextState: S, callback?: () => void): void;
    replaceState(nextState: S, callback?: () => void): void;
    forceUpdate(callback?: () => void): void;
    isMounted(): boolean;
    setProps(nextProps: P, callback?: () => void): void;
    replaceProps(nextProps: P, callback?: () => void): void;
}

export interface Constructable {
    new(): any;
}

export interface Validator<P> {
    (props: P, propName: string, componentName: string): Error;
}

export interface Requireable<P> extends Validator<P> {
    isRequired: Validator<P>;
}

export interface ValidationMap<P> {
    [key: string]: Validator<P>;
}

export declare var PropTypes: {
	any: Requireable<any>;
	array: Requireable<any>;
	bool: Requireable<any>;
	func: Requireable<any>;
	number: Requireable<any>;
	object: Requireable<any>;
	string: Requireable<any>;
	node: Requireable<any>;
	component: Requireable<any>;
	instanceOf: (clazz: Constructable) => Requireable<any>;
	oneOf: (types: any[]) => Requireable<any>;
    oneOfType: (types: Validator<any>[]) => Requireable<any>;
	arrayOf: (type: Validator<any>) => Requireable<any>;
	objectOf: (type: Validator<any>) => Requireable<any>;
	shape: (type: ValidationMap<any>) => Requireable<any>;
};

export declare var Children: {
    map(children: any[], fn: (child: any) => any): any[];
    forEach(children: any[], fn: (child: any) => any): void;
    count(children: any[]): number;
    only(children: any[]): any;
};

// Browser Interfaces
// Taken from https://github.com/nikeee/2048-typescript/blob/master/2048/js/touch.d.ts
export interface AbstractView {
    styleMedia: StyleMedia;
    document: Document;
}

export interface Touch {
    identifier: number;
    target: EventTarget;
    screenX: number;
    screenY: number;
    clientX: number;
    clientY: number;
    pageX: number;
    pageY: number;
}

export interface TouchList {
    [index: number]: Touch;
    length: number;
    item(index: number): Touch;
    identifiedTouch(identifier: number): Touch;
}

// Events
export interface SyntheticEvent {
    bubbles: boolean;
    cancelable: boolean;
    currentTarget: EventTarget;
    defaultPrevented: boolean;
    eventPhase: number;
    nativeEvent: Event;
    preventDefault(): void;
    stopPropagation(): void;
    target: EventTarget;
    timeStamp: number;
    type: string;
}

export interface ClipboardEvent extends SyntheticEvent {
    clipboardData: DataTransfer;
}

export interface KeyboardEvent extends SyntheticEvent {
    altKey: boolean;
    charCode: number;
    ctrlKey: boolean;
    getModifierState(key: string): boolean;
    key: string;
    keyCode: number;
    locale: string;
    location: number;
    metaKey: boolean;
    repeat: boolean;
    shiftKey: boolean;
    which: number;
}

export interface FocusEvent extends SyntheticEvent {
    relatedTarget: EventTarget;
}

export interface MouseEvent extends SyntheticEvent {
    altKey: boolean;
    button: number;
    buttons: number;
    clientX: number;
    clientY: number;
    ctrlKey: boolean;
    getModifierState(key: string): boolean;
    metaKey: boolean;
    pageX: number;
    pageY: number;
    relatedTarget: EventTarget;
    screenX: number;
    screenY: number;
    shiftKey: boolean;
}

export interface TouchEvent extends SyntheticEvent {
    altKey: boolean;
    changedTouches: TouchList;
    ctrlKey: boolean;
    getModifierState(key: string): boolean;
    metaKey: boolean;
    shiftKey: boolean;
    targetTouches: TouchList;
    touches: TouchList;
}

export interface UiEvent extends SyntheticEvent {
    detail: number;
    view: AbstractView;
}

export interface WheelEvent extends SyntheticEvent {
    deltaMode: number;
    deltaX: number;
    deltaY: number;
    deltaZ: number;
}

// Attributes
export interface EventAttributes {
    onCopy?: (event: ClipboardEvent) => void;
    onCut?: (event: ClipboardEvent) => void;
    onPaste?: (event: ClipboardEvent) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    onKeyPress?: (event: KeyboardEvent) => void;
    onKeyUp?: (event: KeyboardEvent) => void;
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;
    onChange?: (event: SyntheticEvent) => void;
    onInput?: (event: SyntheticEvent) => void;
    onSubmit?: (event: SyntheticEvent) => void;
    onClick?: (event: MouseEvent) => void;
    onDoubleClick?: (event: MouseEvent) => void;
    onDrag?: (event: MouseEvent) => void;
    onDragEnd?: (event: MouseEvent) => void;
    onDragEnter?: (event: MouseEvent) => void;
    onDragExit?: (event: MouseEvent) => void;
    onDragLeave?: (event: MouseEvent) => void;
    onDragOver?: (event: MouseEvent) => void;
    onDragStart?: (event: MouseEvent) => void;
    onDrop?: (event: MouseEvent) => void;
    onMouseDown?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
    onMouseMove?: (event: MouseEvent) => void;
    onMouseOut?: (event: MouseEvent) => void;
    onMouseOver?: (event: MouseEvent) => void;
    onMouseUp?: (event: MouseEvent) => void;
    onTouchCancel?: (event: TouchEvent) => void;
    onTouchEnd?: (event: TouchEvent) => void;
    onTouchMove?: (event: TouchEvent) => void;
    onTouchStart?: (event: TouchEvent) => void;
    onScroll?: (event: UiEvent) => void;
    onWheel?: (event: WheelEvent) => void;
}

export interface ReactAttributes {
    dangerouslySetInnerHTML?: {
        __html: string;
    };
    children?: any[];
    key?: string;
    ref?: string;
}

export interface DomAttributes extends EventAttributes, ReactAttributes {
    // HTML Attributes
    accept?: any;
    accessKey?: any;
    action?: any;
    allowFullScreen?: any;
    allowTransparency?: any;
    alt?: any;
    async?: any;
    autoCapitalize?: any;
    autoComplete?: any;
    autoCorrect?: any;
    autoFocus?: any;
    autoPlay?: any;
    cellPadding?: any;
    cellSpacing?: any;
    charSet?: any;
    checked?: any;
    className?: any;
    cols?: any;
    colSpan?: any;
    content?: any;
    contentEditable?: any;
    contextMenu?: any;
    controls?: any;
    coords?: any;
    crossOrigin?: any;
    data?: any;
    dateTime?: any;
    defer?: any;
    dir?: any;
    disabled?: any;
    download?: any;
    draggable?: any;
    encType?: any;
    form?: any;
    formNoValidate?: any;
    frameBorder?: any;
    height?: any;
    hidden?: any;
    href?: any;
    hrefLang?: any;
    htmlFor?: any;
    httpEquiv?: any;
    icon?: any;
    id?: any;
    itemProp?: any;
    itemScope?: any;
    itemType?: any;
    label?: any;
    lang?: any;
    list?: any;
    loop?: any;
    max?: any;
    maxLength?: any;
    mediaGroup?: any;
    method?: any;
    min?: any;
    multiple?: any;
    muted?: any;
    name?: any;
    noValidate?: any;
    open?: any;
    pattern?: any;
    placeholder?: any;
    poster?: any;
    preload?: any;
    property?: any;
    radioGroup?: any;
    readOnly?: any;
    rel?: any;
    required?: any;
    role?: any;
    rows?: any;
    rowSpan?: any;
    sandbox?: any;
    scope?: any;
    scrollLeft?: any;
    scrolling?: any;
    scrollTop?: any;
    seamless?: any;
    selected?: any;
    shape?: any;
    size?: any;
    span?: any;
    spellCheck?: any;
    src?: any;
    srcDoc?: any;
    srcSet?: any;
    start?: any;
    step?: any;
    style?: any;
    tabIndex?: any;
    target?: any;
    title?: any;
    type?: any;
    useMap?: any;
    value?: any;
    width?: any;
    wmode?: any;
}

export interface SvgAttributes extends EventAttributes, ReactAttributes {
    cx?: any;
    cy?: any;
    d?: any;
    dx?: any;
    dy?: any;
    fill?: any;
    fillOpacity?: any;
    fontFamily?: any;
    fontSize?: any;
    fx?: any;
    fy?: any;
    gradientTransform?: any;
    gradientUnits?: any;
    markerEnd?: any;
    markerMid?: any;
    markerStart?: any;
    offset?: any;
    opacity?: any;
    patternContentUnits?: any;
    patternUnits?: any;
    points?: any;
    preserveAspectRatio?: any;
    r?: any;
    rx?: any;
    ry?: any;
    spreadMethod?: any;
    stopColor?: any;
    stopOpacity?: any;
    stroke?: any;
    strokeDasharray?: any;
    strokeLinecap?: any;
    strokeOpacity?: any;
    strokeWidth?: any;
    textAnchor?: any;
    transform?: any;
    version?: any;
    viewBox?: any;
    x1?: any;
    x2?: any;
    x?: any;
    y1?: any;
    y2?: any;
    y?: any;
}

export declare var DOM: {
    // HTML
    a: DomElement;
    abbr: DomElement;
    address: DomElement;
    area: DomElement;
    article: DomElement;
    aside: DomElement;
    audio: DomElement;
    b: DomElement;
    base: DomElement;
    bdi: DomElement;
    bdo: DomElement;
    big: DomElement;
    blockquote: DomElement;
    body: DomElement;
    br: DomElement;
    button: DomElement;
    canvas: DomElement;
    caption: DomElement;
    cite: DomElement;
    code: DomElement;
    col: DomElement;
    colgroup: DomElement;
    data: DomElement;
    datalist: DomElement;
    dd: DomElement;
    del: DomElement;
    details: DomElement;
    dfn: DomElement;
    dialog: DomElement;
    div: DomElement;
    dl: DomElement;
    dt: DomElement;
    em: DomElement;
    embed: DomElement;
    fieldset: DomElement;
    figcaption: DomElement;
    figure: DomElement;
    footer: DomElement;
    form: DomElement;
    h1: DomElement;
    h2: DomElement;
    h3: DomElement;
    h4: DomElement;
    h5: DomElement;
    h6: DomElement;
    head: DomElement;
    header: DomElement;
    hr: DomElement;
    html: DomElement;
    i: DomElement;
    iframe: DomElement;
    img: DomElement;
    input: DomElement;
    ins: DomElement;
    kbd: DomElement;
    keygen: DomElement;
    label: DomElement;
    legend: DomElement;
    li: DomElement;
    link: DomElement;
    main: DomElement;
    map: DomElement;
    mark: DomElement;
    menu: DomElement;
    menuitem: DomElement;
    meta: DomElement;
    meter: DomElement;
    nav: DomElement;
    noscript: DomElement;
    object: DomElement;
    ol: DomElement;
    optgroup: DomElement;
    option: DomElement;
    output: DomElement;
    p: DomElement;
    param: DomElement;
    pre: DomElement;
    progress: DomElement;
    q: DomElement;
    rp: DomElement;
    rt: DomElement;
    ruby: DomElement;
    s: DomElement;
    samp: DomElement;
    script: DomElement;
    section: DomElement;
    select: DomElement;
    small: DomElement;
    source: DomElement;
    span: DomElement;
    strong: DomElement;
    style: DomElement;
    sub: DomElement;
    summary: DomElement;
    sup: DomElement;
    table: DomElement;
    tbody: DomElement;
    td: DomElement;
    textarea: DomElement;
    tfoot: DomElement;
    th: DomElement;
    thead: DomElement;
    time: DomElement;
    title: DomElement;
    tr: DomElement;
    track: DomElement;
    u: DomElement;
    ul: DomElement;
    'var': DomElement;
    video: DomElement;
    wbr: DomElement;
    // SVG
    circle: SvgElement;
    defs: SvgElement;
    ellipse: SvgElement;
    g: SvgElement;
    line: SvgElement;
    linearGradient: SvgElement;
    mask: SvgElement;
    path: SvgElement;
    pattern: SvgElement;
    polygon: SvgElement;
    polyline: SvgElement;
    radialGradient: SvgElement;
    rect: SvgElement;
    stop: SvgElement;
    svg: SvgElement;
    text: SvgElement;
    tspan: SvgElement;
};