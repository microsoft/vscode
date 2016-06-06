declare namespace ts {
    interface Map<T> {
        [index: string]: T;
    }
    type Path = string & {
        __pathBrand: any;
    };
    interface FileMap<T> {
        get(fileName: Path): T;
        set(fileName: Path, value: T): void;
        contains(fileName: Path): boolean;
        remove(fileName: Path): void;
        forEachValue(f: (key: Path, v: T) => void): void;
        clear(): void;
    }
    interface TextRange {
        pos: number;
        end: number;
    }
    const enum SyntaxKind {
        Unknown = 0,
        EndOfFileToken = 1,
        SingleLineCommentTrivia = 2,
        MultiLineCommentTrivia = 3,
        NewLineTrivia = 4,
        WhitespaceTrivia = 5,
        ShebangTrivia = 6,
        ConflictMarkerTrivia = 7,
        NumericLiteral = 8,
        StringLiteral = 9,
        RegularExpressionLiteral = 10,
        NoSubstitutionTemplateLiteral = 11,
        TemplateHead = 12,
        TemplateMiddle = 13,
        TemplateTail = 14,
        OpenBraceToken = 15,
        CloseBraceToken = 16,
        OpenParenToken = 17,
        CloseParenToken = 18,
        OpenBracketToken = 19,
        CloseBracketToken = 20,
        DotToken = 21,
        DotDotDotToken = 22,
        SemicolonToken = 23,
        CommaToken = 24,
        LessThanToken = 25,
        LessThanSlashToken = 26,
        GreaterThanToken = 27,
        LessThanEqualsToken = 28,
        GreaterThanEqualsToken = 29,
        EqualsEqualsToken = 30,
        ExclamationEqualsToken = 31,
        EqualsEqualsEqualsToken = 32,
        ExclamationEqualsEqualsToken = 33,
        EqualsGreaterThanToken = 34,
        PlusToken = 35,
        MinusToken = 36,
        AsteriskToken = 37,
        AsteriskAsteriskToken = 38,
        SlashToken = 39,
        PercentToken = 40,
        PlusPlusToken = 41,
        MinusMinusToken = 42,
        LessThanLessThanToken = 43,
        GreaterThanGreaterThanToken = 44,
        GreaterThanGreaterThanGreaterThanToken = 45,
        AmpersandToken = 46,
        BarToken = 47,
        CaretToken = 48,
        ExclamationToken = 49,
        TildeToken = 50,
        AmpersandAmpersandToken = 51,
        BarBarToken = 52,
        QuestionToken = 53,
        ColonToken = 54,
        AtToken = 55,
        EqualsToken = 56,
        PlusEqualsToken = 57,
        MinusEqualsToken = 58,
        AsteriskEqualsToken = 59,
        AsteriskAsteriskEqualsToken = 60,
        SlashEqualsToken = 61,
        PercentEqualsToken = 62,
        LessThanLessThanEqualsToken = 63,
        GreaterThanGreaterThanEqualsToken = 64,
        GreaterThanGreaterThanGreaterThanEqualsToken = 65,
        AmpersandEqualsToken = 66,
        BarEqualsToken = 67,
        CaretEqualsToken = 68,
        Identifier = 69,
        BreakKeyword = 70,
        CaseKeyword = 71,
        CatchKeyword = 72,
        ClassKeyword = 73,
        ConstKeyword = 74,
        ContinueKeyword = 75,
        DebuggerKeyword = 76,
        DefaultKeyword = 77,
        DeleteKeyword = 78,
        DoKeyword = 79,
        ElseKeyword = 80,
        EnumKeyword = 81,
        ExportKeyword = 82,
        ExtendsKeyword = 83,
        FalseKeyword = 84,
        FinallyKeyword = 85,
        ForKeyword = 86,
        FunctionKeyword = 87,
        IfKeyword = 88,
        ImportKeyword = 89,
        InKeyword = 90,
        InstanceOfKeyword = 91,
        NewKeyword = 92,
        NullKeyword = 93,
        ReturnKeyword = 94,
        SuperKeyword = 95,
        SwitchKeyword = 96,
        ThisKeyword = 97,
        ThrowKeyword = 98,
        TrueKeyword = 99,
        TryKeyword = 100,
        TypeOfKeyword = 101,
        VarKeyword = 102,
        VoidKeyword = 103,
        WhileKeyword = 104,
        WithKeyword = 105,
        ImplementsKeyword = 106,
        InterfaceKeyword = 107,
        LetKeyword = 108,
        PackageKeyword = 109,
        PrivateKeyword = 110,
        ProtectedKeyword = 111,
        PublicKeyword = 112,
        StaticKeyword = 113,
        YieldKeyword = 114,
        AbstractKeyword = 115,
        AsKeyword = 116,
        AnyKeyword = 117,
        AsyncKeyword = 118,
        AwaitKeyword = 119,
        BooleanKeyword = 120,
        ConstructorKeyword = 121,
        DeclareKeyword = 122,
        GetKeyword = 123,
        IsKeyword = 124,
        ModuleKeyword = 125,
        NamespaceKeyword = 126,
        RequireKeyword = 127,
        NumberKeyword = 128,
        SetKeyword = 129,
        StringKeyword = 130,
        SymbolKeyword = 131,
        TypeKeyword = 132,
        FromKeyword = 133,
        GlobalKeyword = 134,
        OfKeyword = 135,
        QualifiedName = 136,
        ComputedPropertyName = 137,
        TypeParameter = 138,
        Parameter = 139,
        Decorator = 140,
        PropertySignature = 141,
        PropertyDeclaration = 142,
        MethodSignature = 143,
        MethodDeclaration = 144,
        Constructor = 145,
        GetAccessor = 146,
        SetAccessor = 147,
        CallSignature = 148,
        ConstructSignature = 149,
        IndexSignature = 150,
        TypePredicate = 151,
        TypeReference = 152,
        FunctionType = 153,
        ConstructorType = 154,
        TypeQuery = 155,
        TypeLiteral = 156,
        ArrayType = 157,
        TupleType = 158,
        UnionType = 159,
        IntersectionType = 160,
        ParenthesizedType = 161,
        ThisType = 162,
        StringLiteralType = 163,
        ObjectBindingPattern = 164,
        ArrayBindingPattern = 165,
        BindingElement = 166,
        ArrayLiteralExpression = 167,
        ObjectLiteralExpression = 168,
        PropertyAccessExpression = 169,
        ElementAccessExpression = 170,
        CallExpression = 171,
        NewExpression = 172,
        TaggedTemplateExpression = 173,
        TypeAssertionExpression = 174,
        ParenthesizedExpression = 175,
        FunctionExpression = 176,
        ArrowFunction = 177,
        DeleteExpression = 178,
        TypeOfExpression = 179,
        VoidExpression = 180,
        AwaitExpression = 181,
        PrefixUnaryExpression = 182,
        PostfixUnaryExpression = 183,
        BinaryExpression = 184,
        ConditionalExpression = 185,
        TemplateExpression = 186,
        YieldExpression = 187,
        SpreadElementExpression = 188,
        ClassExpression = 189,
        OmittedExpression = 190,
        ExpressionWithTypeArguments = 191,
        AsExpression = 192,
        TemplateSpan = 193,
        SemicolonClassElement = 194,
        Block = 195,
        VariableStatement = 196,
        EmptyStatement = 197,
        ExpressionStatement = 198,
        IfStatement = 199,
        DoStatement = 200,
        WhileStatement = 201,
        ForStatement = 202,
        ForInStatement = 203,
        ForOfStatement = 204,
        ContinueStatement = 205,
        BreakStatement = 206,
        ReturnStatement = 207,
        WithStatement = 208,
        SwitchStatement = 209,
        LabeledStatement = 210,
        ThrowStatement = 211,
        TryStatement = 212,
        DebuggerStatement = 213,
        VariableDeclaration = 214,
        VariableDeclarationList = 215,
        FunctionDeclaration = 216,
        ClassDeclaration = 217,
        InterfaceDeclaration = 218,
        TypeAliasDeclaration = 219,
        EnumDeclaration = 220,
        ModuleDeclaration = 221,
        ModuleBlock = 222,
        CaseBlock = 223,
        ImportEqualsDeclaration = 224,
        ImportDeclaration = 225,
        ImportClause = 226,
        NamespaceImport = 227,
        NamedImports = 228,
        ImportSpecifier = 229,
        ExportAssignment = 230,
        ExportDeclaration = 231,
        NamedExports = 232,
        ExportSpecifier = 233,
        MissingDeclaration = 234,
        ExternalModuleReference = 235,
        JsxElement = 236,
        JsxSelfClosingElement = 237,
        JsxOpeningElement = 238,
        JsxText = 239,
        JsxClosingElement = 240,
        JsxAttribute = 241,
        JsxSpreadAttribute = 242,
        JsxExpression = 243,
        CaseClause = 244,
        DefaultClause = 245,
        HeritageClause = 246,
        CatchClause = 247,
        PropertyAssignment = 248,
        ShorthandPropertyAssignment = 249,
        EnumMember = 250,
        SourceFile = 251,
        JSDocTypeExpression = 252,
        JSDocAllType = 253,
        JSDocUnknownType = 254,
        JSDocArrayType = 255,
        JSDocUnionType = 256,
        JSDocTupleType = 257,
        JSDocNullableType = 258,
        JSDocNonNullableType = 259,
        JSDocRecordType = 260,
        JSDocRecordMember = 261,
        JSDocTypeReference = 262,
        JSDocOptionalType = 263,
        JSDocFunctionType = 264,
        JSDocVariadicType = 265,
        JSDocConstructorType = 266,
        JSDocThisType = 267,
        JSDocComment = 268,
        JSDocTag = 269,
        JSDocParameterTag = 270,
        JSDocReturnTag = 271,
        JSDocTypeTag = 272,
        JSDocTemplateTag = 273,
        SyntaxList = 274,
        Count = 275,
        FirstAssignment = 56,
        LastAssignment = 68,
        FirstReservedWord = 70,
        LastReservedWord = 105,
        FirstKeyword = 70,
        LastKeyword = 135,
        FirstFutureReservedWord = 106,
        LastFutureReservedWord = 114,
        FirstTypeNode = 151,
        LastTypeNode = 163,
        FirstPunctuation = 15,
        LastPunctuation = 68,
        FirstToken = 0,
        LastToken = 135,
        FirstTriviaToken = 2,
        LastTriviaToken = 7,
        FirstLiteralToken = 8,
        LastLiteralToken = 11,
        FirstTemplateToken = 11,
        LastTemplateToken = 14,
        FirstBinaryOperator = 25,
        LastBinaryOperator = 68,
        FirstNode = 136,
    }
    const enum NodeFlags {
        None = 0,
        Export = 2,
        Ambient = 4,
        Public = 8,
        Private = 16,
        Protected = 32,
        Static = 64,
        Abstract = 128,
        Async = 256,
        Default = 512,
        MultiLine = 1024,
        Synthetic = 2048,
        DeclarationFile = 4096,
        Let = 8192,
        Const = 16384,
        OctalLiteral = 32768,
        Namespace = 65536,
        ExportContext = 131072,
        ContainsThis = 262144,
        HasImplicitReturn = 524288,
        HasExplicitReturn = 1048576,
        GlobalAugmentation = 2097152,
        HasClassExtends = 4194304,
        HasDecorators = 8388608,
        HasParamDecorators = 16777216,
        HasAsyncFunctions = 33554432,
        HasJsxSpreadAttribute = 1073741824,
        Modifier = 1022,
        AccessibilityModifier = 56,
        BlockScoped = 24576,
        ReachabilityCheckFlags = 1572864,
        EmitHelperFlags = 62914560,
    }
    const enum ParserContextFlags {
        None = 0,
        DisallowIn = 1,
        Yield = 2,
        Decorator = 4,
        Await = 8,
        ThisNodeHasError = 16,
        JavaScriptFile = 32,
        ParserGeneratedFlags = 63,
        TypeExcludesFlags = 10,
        ThisNodeOrAnySubNodesHasError = 64,
        HasAggregatedChildData = 128,
    }
    const enum JsxFlags {
        None = 0,
        /** An element from a named property of the JSX.IntrinsicElements interface */
        IntrinsicNamedElement = 1,
        /** An element inferred from the string index signature of the JSX.IntrinsicElements interface */
        IntrinsicIndexedElement = 2,
        /** An element backed by a class, class-like, or function value */
        ValueElement = 4,
        /** Element resolution failed */
        UnknownElement = 16,
        IntrinsicElement = 3,
    }
    const enum RelationComparisonResult {
        Succeeded = 1,
        Failed = 2,
        FailedAndReported = 3,
    }
    interface Node extends TextRange {
        kind: SyntaxKind;
        flags: NodeFlags;
        parserContextFlags?: ParserContextFlags;
        decorators?: NodeArray<Decorator>;
        modifiers?: ModifiersArray;
        id?: number;
        parent?: Node;
        jsDocComment?: JSDocComment;
        symbol?: Symbol;
        locals?: SymbolTable;
        nextContainer?: Node;
        localSymbol?: Symbol;
    }
    interface NodeArray<T> extends Array<T>, TextRange {
        hasTrailingComma?: boolean;
    }
    interface ModifiersArray extends NodeArray<Modifier> {
        flags: number;
    }
    interface Modifier extends Node {
    }
    interface Identifier extends PrimaryExpression {
        text: string;
        originalKeywordKind?: SyntaxKind;
    }
    interface QualifiedName extends Node {
        left: EntityName;
        right: Identifier;
    }
    type EntityName = Identifier | QualifiedName;
    type PropertyName = Identifier | LiteralExpression | ComputedPropertyName;
    type DeclarationName = Identifier | LiteralExpression | ComputedPropertyName | BindingPattern;
    interface Declaration extends Node {
        _declarationBrand: any;
        name?: DeclarationName;
    }
    interface DeclarationStatement extends Declaration, Statement {
        name?: Identifier;
    }
    interface ComputedPropertyName extends Node {
        expression: Expression;
    }
    interface Decorator extends Node {
        expression: LeftHandSideExpression;
    }
    interface TypeParameterDeclaration extends Declaration {
        name: Identifier;
        constraint?: TypeNode;
        expression?: Expression;
    }
    interface SignatureDeclaration extends Declaration {
        name?: PropertyName;
        typeParameters?: NodeArray<TypeParameterDeclaration>;
        parameters: NodeArray<ParameterDeclaration>;
        type?: TypeNode;
    }
    interface CallSignatureDeclaration extends SignatureDeclaration, TypeElement {
    }
    interface ConstructSignatureDeclaration extends SignatureDeclaration, TypeElement {
    }
    interface VariableDeclaration extends Declaration {
        parent?: VariableDeclarationList;
        name: Identifier | BindingPattern;
        type?: TypeNode;
        initializer?: Expression;
    }
    interface VariableDeclarationList extends Node {
        declarations: NodeArray<VariableDeclaration>;
    }
    interface ParameterDeclaration extends Declaration {
        dotDotDotToken?: Node;
        name: Identifier | BindingPattern;
        questionToken?: Node;
        type?: TypeNode;
        initializer?: Expression;
    }
    interface BindingElement extends Declaration {
        propertyName?: PropertyName;
        dotDotDotToken?: Node;
        name: Identifier | BindingPattern;
        initializer?: Expression;
    }
    interface PropertySignature extends TypeElement {
        name: PropertyName;
        questionToken?: Node;
        type?: TypeNode;
        initializer?: Expression;
    }
    interface PropertyDeclaration extends ClassElement {
        questionToken?: Node;
        name: PropertyName;
        type?: TypeNode;
        initializer?: Expression;
    }
    interface ObjectLiteralElement extends Declaration {
        _objectLiteralBrandBrand: any;
        name?: PropertyName;
    }
    interface PropertyAssignment extends ObjectLiteralElement {
        _propertyAssignmentBrand: any;
        name: PropertyName;
        questionToken?: Node;
        initializer: Expression;
    }
    interface ShorthandPropertyAssignment extends ObjectLiteralElement {
        name: Identifier;
        questionToken?: Node;
        equalsToken?: Node;
        objectAssignmentInitializer?: Expression;
    }
    interface VariableLikeDeclaration extends Declaration {
        propertyName?: PropertyName;
        dotDotDotToken?: Node;
        name: DeclarationName;
        questionToken?: Node;
        type?: TypeNode;
        initializer?: Expression;
    }
    interface PropertyLikeDeclaration extends Declaration {
        name: PropertyName;
    }
    interface BindingPattern extends Node {
        elements: NodeArray<BindingElement>;
    }
    interface ObjectBindingPattern extends BindingPattern {
    }
    interface ArrayBindingPattern extends BindingPattern {
    }
    /**
     * Several node kinds share function-like features such as a signature,
     * a name, and a body. These nodes should extend FunctionLikeDeclaration.
     * Examples:
     * - FunctionDeclaration
     * - MethodDeclaration
     * - AccessorDeclaration
     */
    interface FunctionLikeDeclaration extends SignatureDeclaration {
        _functionLikeDeclarationBrand: any;
        asteriskToken?: Node;
        questionToken?: Node;
        body?: Block | Expression;
    }
    interface FunctionDeclaration extends FunctionLikeDeclaration, DeclarationStatement {
        name?: Identifier;
        body?: FunctionBody;
    }
    interface MethodSignature extends SignatureDeclaration, TypeElement {
        name: PropertyName;
    }
    interface MethodDeclaration extends FunctionLikeDeclaration, ClassElement, ObjectLiteralElement {
        name: PropertyName;
        body?: FunctionBody;
    }
    interface ConstructorDeclaration extends FunctionLikeDeclaration, ClassElement {
        body?: FunctionBody;
    }
    interface SemicolonClassElement extends ClassElement {
        _semicolonClassElementBrand: any;
    }
    interface AccessorDeclaration extends FunctionLikeDeclaration, ClassElement, ObjectLiteralElement {
        _accessorDeclarationBrand: any;
        name: PropertyName;
        body: FunctionBody;
    }
    interface GetAccessorDeclaration extends AccessorDeclaration {
    }
    interface SetAccessorDeclaration extends AccessorDeclaration {
    }
    interface IndexSignatureDeclaration extends SignatureDeclaration, ClassElement, TypeElement {
        _indexSignatureDeclarationBrand: any;
    }
    interface TypeNode extends Node {
        _typeNodeBrand: any;
    }
    interface ThisTypeNode extends TypeNode {
        _thisTypeNodeBrand: any;
    }
    interface FunctionOrConstructorTypeNode extends TypeNode, SignatureDeclaration {
        _functionOrConstructorTypeNodeBrand: any;
    }
    interface FunctionTypeNode extends FunctionOrConstructorTypeNode {
    }
    interface ConstructorTypeNode extends FunctionOrConstructorTypeNode {
    }
    interface TypeReferenceNode extends TypeNode {
        typeName: EntityName;
        typeArguments?: NodeArray<TypeNode>;
    }
    interface TypePredicateNode extends TypeNode {
        parameterName: Identifier | ThisTypeNode;
        type: TypeNode;
    }
    interface TypeQueryNode extends TypeNode {
        exprName: EntityName;
    }
    interface TypeLiteralNode extends TypeNode, Declaration {
        members: NodeArray<TypeElement>;
    }
    interface ArrayTypeNode extends TypeNode {
        elementType: TypeNode;
    }
    interface TupleTypeNode extends TypeNode {
        elementTypes: NodeArray<TypeNode>;
    }
    interface UnionOrIntersectionTypeNode extends TypeNode {
        types: NodeArray<TypeNode>;
    }
    interface UnionTypeNode extends UnionOrIntersectionTypeNode {
    }
    interface IntersectionTypeNode extends UnionOrIntersectionTypeNode {
    }
    interface ParenthesizedTypeNode extends TypeNode {
        type: TypeNode;
    }
    interface StringLiteralTypeNode extends LiteralLikeNode, TypeNode {
        _stringLiteralTypeBrand: any;
    }
    interface StringLiteral extends LiteralExpression {
        _stringLiteralBrand: any;
    }
    interface Expression extends Node {
        _expressionBrand: any;
        contextualType?: Type;
    }
    interface OmittedExpression extends Expression {
    }
    interface UnaryExpression extends Expression {
        _unaryExpressionBrand: any;
    }
    interface IncrementExpression extends UnaryExpression {
        _incrementExpressionBrand: any;
    }
    interface PrefixUnaryExpression extends IncrementExpression {
        operator: SyntaxKind;
        operand: UnaryExpression;
    }
    interface PostfixUnaryExpression extends IncrementExpression {
        operand: LeftHandSideExpression;
        operator: SyntaxKind;
    }
    interface PostfixExpression extends UnaryExpression {
        _postfixExpressionBrand: any;
    }
    interface LeftHandSideExpression extends IncrementExpression {
        _leftHandSideExpressionBrand: any;
    }
    interface MemberExpression extends LeftHandSideExpression {
        _memberExpressionBrand: any;
    }
    interface PrimaryExpression extends MemberExpression {
        _primaryExpressionBrand: any;
    }
    interface DeleteExpression extends UnaryExpression {
        expression: UnaryExpression;
    }
    interface TypeOfExpression extends UnaryExpression {
        expression: UnaryExpression;
    }
    interface VoidExpression extends UnaryExpression {
        expression: UnaryExpression;
    }
    interface AwaitExpression extends UnaryExpression {
        expression: UnaryExpression;
    }
    interface YieldExpression extends Expression {
        asteriskToken?: Node;
        expression?: Expression;
    }
    interface BinaryExpression extends Expression, Declaration {
        left: Expression;
        operatorToken: Node;
        right: Expression;
    }
    interface ConditionalExpression extends Expression {
        condition: Expression;
        questionToken: Node;
        whenTrue: Expression;
        colonToken: Node;
        whenFalse: Expression;
    }
    type FunctionBody = Block;
    type ConciseBody = FunctionBody | Expression;
    interface FunctionExpression extends PrimaryExpression, FunctionLikeDeclaration {
        name?: Identifier;
        body: FunctionBody;
    }
    interface ArrowFunction extends Expression, FunctionLikeDeclaration {
        equalsGreaterThanToken: Node;
        body: ConciseBody;
    }
    interface LiteralLikeNode extends Node {
        text: string;
        isUnterminated?: boolean;
        hasExtendedUnicodeEscape?: boolean;
    }
    interface LiteralExpression extends LiteralLikeNode, PrimaryExpression {
        _literalExpressionBrand: any;
    }
    interface TemplateLiteralFragment extends LiteralLikeNode {
        _templateLiteralFragmentBrand: any;
    }
    interface TemplateExpression extends PrimaryExpression {
        head: TemplateLiteralFragment;
        templateSpans: NodeArray<TemplateSpan>;
    }
    interface TemplateSpan extends Node {
        expression: Expression;
        literal: TemplateLiteralFragment;
    }
    interface ParenthesizedExpression extends PrimaryExpression {
        expression: Expression;
    }
    interface ArrayLiteralExpression extends PrimaryExpression {
        elements: NodeArray<Expression>;
    }
    interface SpreadElementExpression extends Expression {
        expression: Expression;
    }
    interface ObjectLiteralExpression extends PrimaryExpression, Declaration {
        properties: NodeArray<ObjectLiteralElement>;
    }
    interface PropertyAccessExpression extends MemberExpression, Declaration {
        expression: LeftHandSideExpression;
        dotToken: Node;
        name: Identifier;
    }
    interface ElementAccessExpression extends MemberExpression {
        expression: LeftHandSideExpression;
        argumentExpression?: Expression;
    }
    interface CallExpression extends LeftHandSideExpression, Declaration {
        expression: LeftHandSideExpression;
        typeArguments?: NodeArray<TypeNode>;
        arguments: NodeArray<Expression>;
    }
    interface ExpressionWithTypeArguments extends TypeNode {
        expression: LeftHandSideExpression;
        typeArguments?: NodeArray<TypeNode>;
    }
    interface NewExpression extends CallExpression, PrimaryExpression {
    }
    interface TaggedTemplateExpression extends MemberExpression {
        tag: LeftHandSideExpression;
        template: LiteralExpression | TemplateExpression;
    }
    type CallLikeExpression = CallExpression | NewExpression | TaggedTemplateExpression | Decorator;
    interface AsExpression extends Expression {
        expression: Expression;
        type: TypeNode;
    }
    interface TypeAssertion extends UnaryExpression {
        type: TypeNode;
        expression: UnaryExpression;
    }
    type AssertionExpression = TypeAssertion | AsExpression;
    interface JsxElement extends PrimaryExpression {
        openingElement: JsxOpeningElement;
        children: NodeArray<JsxChild>;
        closingElement: JsxClosingElement;
    }
    interface JsxOpeningElement extends Expression {
        _openingElementBrand?: any;
        tagName: EntityName;
        attributes: NodeArray<JsxAttribute | JsxSpreadAttribute>;
    }
    interface JsxSelfClosingElement extends PrimaryExpression, JsxOpeningElement {
        _selfClosingElementBrand?: any;
    }
    type JsxOpeningLikeElement = JsxSelfClosingElement | JsxOpeningElement;
    interface JsxAttribute extends Node {
        name: Identifier;
        initializer?: Expression;
    }
    interface JsxSpreadAttribute extends Node {
        expression: Expression;
    }
    interface JsxClosingElement extends Node {
        tagName: EntityName;
    }
    interface JsxExpression extends Expression {
        expression?: Expression;
    }
    interface JsxText extends Node {
        _jsxTextExpressionBrand: any;
    }
    type JsxChild = JsxText | JsxExpression | JsxElement | JsxSelfClosingElement;
    interface Statement extends Node {
        _statementBrand: any;
    }
    interface EmptyStatement extends Statement {
    }
    interface DebuggerStatement extends Statement {
    }
    interface MissingDeclaration extends DeclarationStatement, ClassElement, ObjectLiteralElement, TypeElement {
        name?: Identifier;
    }
    type BlockLike = SourceFile | Block | ModuleBlock | CaseClause;
    interface Block extends Statement {
        statements: NodeArray<Statement>;
    }
    interface VariableStatement extends Statement {
        declarationList: VariableDeclarationList;
    }
    interface ExpressionStatement extends Statement {
        expression: Expression;
    }
    interface IfStatement extends Statement {
        expression: Expression;
        thenStatement: Statement;
        elseStatement?: Statement;
    }
    interface IterationStatement extends Statement {
        statement: Statement;
    }
    interface DoStatement extends IterationStatement {
        expression: Expression;
    }
    interface WhileStatement extends IterationStatement {
        expression: Expression;
    }
    interface ForStatement extends IterationStatement {
        initializer?: VariableDeclarationList | Expression;
        condition?: Expression;
        incrementor?: Expression;
    }
    interface ForInStatement extends IterationStatement {
        initializer: VariableDeclarationList | Expression;
        expression: Expression;
    }
    interface ForOfStatement extends IterationStatement {
        initializer: VariableDeclarationList | Expression;
        expression: Expression;
    }
    interface BreakStatement extends Statement {
        label?: Identifier;
    }
    interface ContinueStatement extends Statement {
        label?: Identifier;
    }
    type BreakOrContinueStatement = BreakStatement | ContinueStatement;
    interface ReturnStatement extends Statement {
        expression?: Expression;
    }
    interface WithStatement extends Statement {
        expression: Expression;
        statement: Statement;
    }
    interface SwitchStatement extends Statement {
        expression: Expression;
        caseBlock: CaseBlock;
    }
    interface CaseBlock extends Node {
        clauses: NodeArray<CaseOrDefaultClause>;
    }
    interface CaseClause extends Node {
        expression: Expression;
        statements: NodeArray<Statement>;
    }
    interface DefaultClause extends Node {
        statements: NodeArray<Statement>;
    }
    type CaseOrDefaultClause = CaseClause | DefaultClause;
    interface LabeledStatement extends Statement {
        label: Identifier;
        statement: Statement;
    }
    interface ThrowStatement extends Statement {
        expression: Expression;
    }
    interface TryStatement extends Statement {
        tryBlock: Block;
        catchClause?: CatchClause;
        finallyBlock?: Block;
    }
    interface CatchClause extends Node {
        variableDeclaration: VariableDeclaration;
        block: Block;
    }
    interface ClassLikeDeclaration extends Declaration {
        name?: Identifier;
        typeParameters?: NodeArray<TypeParameterDeclaration>;
        heritageClauses?: NodeArray<HeritageClause>;
        members: NodeArray<ClassElement>;
    }
    interface ClassDeclaration extends ClassLikeDeclaration, DeclarationStatement {
        name?: Identifier;
    }
    interface ClassExpression extends ClassLikeDeclaration, PrimaryExpression {
    }
    interface ClassElement extends Declaration {
        _classElementBrand: any;
        name?: PropertyName;
    }
    interface TypeElement extends Declaration {
        _typeElementBrand: any;
        name?: PropertyName;
        questionToken?: Node;
    }
    interface InterfaceDeclaration extends DeclarationStatement {
        name: Identifier;
        typeParameters?: NodeArray<TypeParameterDeclaration>;
        heritageClauses?: NodeArray<HeritageClause>;
        members: NodeArray<TypeElement>;
    }
    interface HeritageClause extends Node {
        token: SyntaxKind;
        types?: NodeArray<ExpressionWithTypeArguments>;
    }
    interface TypeAliasDeclaration extends DeclarationStatement {
        name: Identifier;
        typeParameters?: NodeArray<TypeParameterDeclaration>;
        type: TypeNode;
    }
    interface EnumMember extends Declaration {
        name: DeclarationName;
        initializer?: Expression;
    }
    interface EnumDeclaration extends DeclarationStatement {
        name: Identifier;
        members: NodeArray<EnumMember>;
    }
    type ModuleBody = ModuleBlock | ModuleDeclaration;
    interface ModuleDeclaration extends DeclarationStatement {
        name: Identifier | LiteralExpression;
        body: ModuleBlock | ModuleDeclaration;
    }
    interface ModuleBlock extends Node, Statement {
        statements: NodeArray<Statement>;
    }
    interface ImportEqualsDeclaration extends DeclarationStatement {
        name: Identifier;
        moduleReference: EntityName | ExternalModuleReference;
    }
    interface ExternalModuleReference extends Node {
        expression?: Expression;
    }
    interface ImportDeclaration extends Statement {
        importClause?: ImportClause;
        moduleSpecifier: Expression;
    }
    interface ImportClause extends Declaration {
        name?: Identifier;
        namedBindings?: NamespaceImport | NamedImports;
    }
    interface NamespaceImport extends Declaration {
        name: Identifier;
    }
    interface ExportDeclaration extends DeclarationStatement {
        exportClause?: NamedExports;
        moduleSpecifier?: Expression;
    }
    interface NamedImports extends Node {
        elements: NodeArray<ImportSpecifier>;
    }
    interface NamedExports extends Node {
        elements: NodeArray<ExportSpecifier>;
    }
    type NamedImportsOrExports = NamedImports | NamedExports;
    interface ImportSpecifier extends Declaration {
        propertyName?: Identifier;
        name: Identifier;
    }
    interface ExportSpecifier extends Declaration {
        propertyName?: Identifier;
        name: Identifier;
    }
    type ImportOrExportSpecifier = ImportSpecifier | ExportSpecifier;
    interface ExportAssignment extends DeclarationStatement {
        isExportEquals?: boolean;
        expression: Expression;
    }
    interface FileReference extends TextRange {
        fileName: string;
    }
    interface CommentRange extends TextRange {
        hasTrailingNewLine?: boolean;
        kind: SyntaxKind;
    }
    interface JSDocTypeExpression extends Node {
        type: JSDocType;
    }
    interface JSDocType extends TypeNode {
        _jsDocTypeBrand: any;
    }
    interface JSDocAllType extends JSDocType {
        _JSDocAllTypeBrand: any;
    }
    interface JSDocUnknownType extends JSDocType {
        _JSDocUnknownTypeBrand: any;
    }
    interface JSDocArrayType extends JSDocType {
        elementType: JSDocType;
    }
    interface JSDocUnionType extends JSDocType {
        types: NodeArray<JSDocType>;
    }
    interface JSDocTupleType extends JSDocType {
        types: NodeArray<JSDocType>;
    }
    interface JSDocNonNullableType extends JSDocType {
        type: JSDocType;
    }
    interface JSDocNullableType extends JSDocType {
        type: JSDocType;
    }
    interface JSDocRecordType extends JSDocType, TypeLiteralNode {
        members: NodeArray<JSDocRecordMember>;
    }
    interface JSDocTypeReference extends JSDocType {
        name: EntityName;
        typeArguments: NodeArray<JSDocType>;
    }
    interface JSDocOptionalType extends JSDocType {
        type: JSDocType;
    }
    interface JSDocFunctionType extends JSDocType, SignatureDeclaration {
        parameters: NodeArray<ParameterDeclaration>;
        type: JSDocType;
    }
    interface JSDocVariadicType extends JSDocType {
        type: JSDocType;
    }
    interface JSDocConstructorType extends JSDocType {
        type: JSDocType;
    }
    interface JSDocThisType extends JSDocType {
        type: JSDocType;
    }
    type JSDocTypeReferencingNode = JSDocThisType | JSDocConstructorType | JSDocVariadicType | JSDocOptionalType | JSDocNullableType | JSDocNonNullableType;
    interface JSDocRecordMember extends PropertySignature {
        name: Identifier | LiteralExpression;
        type?: JSDocType;
    }
    interface JSDocComment extends Node {
        tags: NodeArray<JSDocTag>;
    }
    interface JSDocTag extends Node {
        atToken: Node;
        tagName: Identifier;
    }
    interface JSDocTemplateTag extends JSDocTag {
        typeParameters: NodeArray<TypeParameterDeclaration>;
    }
    interface JSDocReturnTag extends JSDocTag {
        typeExpression: JSDocTypeExpression;
    }
    interface JSDocTypeTag extends JSDocTag {
        typeExpression: JSDocTypeExpression;
    }
    interface JSDocParameterTag extends JSDocTag {
        preParameterName?: Identifier;
        typeExpression?: JSDocTypeExpression;
        postParameterName?: Identifier;
        isBracketed: boolean;
    }
    interface AmdDependency {
        path: string;
        name: string;
    }
    interface SourceFile extends Declaration {
        statements: NodeArray<Statement>;
        endOfFileToken: Node;
        fileName: string;
        path: Path;
        text: string;
        amdDependencies: AmdDependency[];
        moduleName: string;
        referencedFiles: FileReference[];
        languageVariant: LanguageVariant;
        renamedDependencies?: Map<string>;
        /**
         * lib.d.ts should have a reference comment like
         *
         *  /// <reference no-default-lib="true"/>
         *
         * If any other file has this comment, it signals not to include lib.d.ts
         * because this containing file is intended to act as a default library.
         */
        hasNoDefaultLib: boolean;
        languageVersion: ScriptTarget;
        scriptKind: ScriptKind;
        externalModuleIndicator: Node;
        commonJsModuleIndicator: Node;
        identifiers: Map<string>;
        nodeCount: number;
        identifierCount: number;
        symbolCount: number;
        parseDiagnostics: Diagnostic[];
        bindDiagnostics: Diagnostic[];
        lineMap: number[];
        classifiableNames?: Map<string>;
        resolvedModules: Map<ResolvedModule>;
        imports: LiteralExpression[];
        moduleAugmentations: LiteralExpression[];
    }
    interface ScriptReferenceHost {
        getCompilerOptions(): CompilerOptions;
        getSourceFile(fileName: string): SourceFile;
        getCurrentDirectory(): string;
    }
    interface ParseConfigHost {
        readDirectory(rootDir: string, extension: string, exclude: string[]): string[];
    }
    interface WriteFileCallback {
        (fileName: string, data: string, writeByteOrderMark: boolean, onError?: (message: string) => void): void;
    }
    class OperationCanceledException {
    }
    interface CancellationToken {
        isCancellationRequested(): boolean;
        /** @throws OperationCanceledException if isCancellationRequested is true */
        throwIfCancellationRequested(): void;
    }
    interface Program extends ScriptReferenceHost {
        /**
         * Get a list of root file names that were passed to a 'createProgram'
         */
        getRootFileNames(): string[];
        /**
         * Get a list of files in the program
         */
        getSourceFiles(): SourceFile[];
        /**
         * Emits the JavaScript and declaration files.  If targetSourceFile is not specified, then
         * the JavaScript and declaration files will be produced for all the files in this program.
         * If targetSourceFile is specified, then only the JavaScript and declaration for that
         * specific file will be generated.
         *
         * If writeFile is not specified then the writeFile callback from the compiler host will be
         * used for writing the JavaScript and declaration files.  Otherwise, the writeFile parameter
         * will be invoked when writing the JavaScript and declaration files.
         */
        emit(targetSourceFile?: SourceFile, writeFile?: WriteFileCallback, cancellationToken?: CancellationToken): EmitResult;
        getOptionsDiagnostics(cancellationToken?: CancellationToken): Diagnostic[];
        getGlobalDiagnostics(cancellationToken?: CancellationToken): Diagnostic[];
        getSyntacticDiagnostics(sourceFile?: SourceFile, cancellationToken?: CancellationToken): Diagnostic[];
        getSemanticDiagnostics(sourceFile?: SourceFile, cancellationToken?: CancellationToken): Diagnostic[];
        getDeclarationDiagnostics(sourceFile?: SourceFile, cancellationToken?: CancellationToken): Diagnostic[];
        /**
         * Gets a type checker that can be used to semantically analyze source fils in the program.
         */
        getTypeChecker(): TypeChecker;
        getCommonSourceDirectory(): string;
        getDiagnosticsProducingTypeChecker(): TypeChecker;
        getClassifiableNames(): Map<string>;
        getNodeCount(): number;
        getIdentifierCount(): number;
        getSymbolCount(): number;
        getTypeCount(): number;
        getFileProcessingDiagnostics(): DiagnosticCollection;
        structureIsReused?: boolean;
    }
    interface SourceMapSpan {
        /** Line number in the .js file. */
        emittedLine: number;
        /** Column number in the .js file. */
        emittedColumn: number;
        /** Line number in the .ts file. */
        sourceLine: number;
        /** Column number in the .ts file. */
        sourceColumn: number;
        /** Optional name (index into names array) associated with this span. */
        nameIndex?: number;
        /** .ts file (index into sources array) associated with this span */
        sourceIndex: number;
    }
    interface SourceMapData {
        sourceMapFilePath: string;
        jsSourceMappingURL: string;
        sourceMapFile: string;
        sourceMapSourceRoot: string;
        sourceMapSources: string[];
        sourceMapSourcesContent?: string[];
        inputSourceFileNames: string[];
        sourceMapNames?: string[];
        sourceMapMappings: string;
        sourceMapDecodedMappings: SourceMapSpan[];
    }
    /** Return code used by getEmitOutput function to indicate status of the function */
    enum ExitStatus {
        Success = 0,
        DiagnosticsPresent_OutputsSkipped = 1,
        DiagnosticsPresent_OutputsGenerated = 2,
    }
    interface EmitResult {
        emitSkipped: boolean;
        diagnostics: Diagnostic[];
        sourceMaps: SourceMapData[];
    }
    interface TypeCheckerHost {
        getCompilerOptions(): CompilerOptions;
        getSourceFiles(): SourceFile[];
        getSourceFile(fileName: string): SourceFile;
    }
    interface TypeChecker {
        getTypeOfSymbolAtLocation(symbol: Symbol, node: Node): Type;
        getDeclaredTypeOfSymbol(symbol: Symbol): Type;
        getPropertiesOfType(type: Type): Symbol[];
        getPropertyOfType(type: Type, propertyName: string): Symbol;
        getSignaturesOfType(type: Type, kind: SignatureKind): Signature[];
        getIndexTypeOfType(type: Type, kind: IndexKind): Type;
        getBaseTypes(type: InterfaceType): ObjectType[];
        getReturnTypeOfSignature(signature: Signature): Type;
        getSymbolsInScope(location: Node, meaning: SymbolFlags): Symbol[];
        getSymbolAtLocation(node: Node): Symbol;
        getSymbolsOfParameterPropertyDeclaration(parameter: ParameterDeclaration, parameterName: string): Symbol[];
        getShorthandAssignmentValueSymbol(location: Node): Symbol;
        getExportSpecifierLocalTargetSymbol(location: ExportSpecifier): Symbol;
        getTypeAtLocation(node: Node): Type;
        typeToString(type: Type, enclosingDeclaration?: Node, flags?: TypeFormatFlags): string;
        symbolToString(symbol: Symbol, enclosingDeclaration?: Node, meaning?: SymbolFlags): string;
        getSymbolDisplayBuilder(): SymbolDisplayBuilder;
        getFullyQualifiedName(symbol: Symbol): string;
        getAugmentedPropertiesOfType(type: Type): Symbol[];
        getRootSymbols(symbol: Symbol): Symbol[];
        getContextualType(node: Expression): Type;
        getResolvedSignature(node: CallLikeExpression, candidatesOutArray?: Signature[]): Signature;
        getSignatureFromDeclaration(declaration: SignatureDeclaration): Signature;
        isImplementationOfOverload(node: FunctionLikeDeclaration): boolean;
        isUndefinedSymbol(symbol: Symbol): boolean;
        isArgumentsSymbol(symbol: Symbol): boolean;
        isUnknownSymbol(symbol: Symbol): boolean;
        getConstantValue(node: EnumMember | PropertyAccessExpression | ElementAccessExpression): number;
        isValidPropertyAccess(node: PropertyAccessExpression | QualifiedName, propertyName: string): boolean;
        getAliasedSymbol(symbol: Symbol): Symbol;
        getExportsOfModule(moduleSymbol: Symbol): Symbol[];
        getJsxElementAttributesType(elementNode: JsxOpeningLikeElement): Type;
        getJsxIntrinsicTagNames(): Symbol[];
        isOptionalParameter(node: ParameterDeclaration): boolean;
        getDiagnostics(sourceFile?: SourceFile, cancellationToken?: CancellationToken): Diagnostic[];
        getGlobalDiagnostics(): Diagnostic[];
        getEmitResolver(sourceFile?: SourceFile, cancellationToken?: CancellationToken): EmitResolver;
        getNodeCount(): number;
        getIdentifierCount(): number;
        getSymbolCount(): number;
        getTypeCount(): number;
    }
    interface SymbolDisplayBuilder {
        buildTypeDisplay(type: Type, writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags): void;
        buildSymbolDisplay(symbol: Symbol, writer: SymbolWriter, enclosingDeclaration?: Node, meaning?: SymbolFlags, flags?: SymbolFormatFlags): void;
        buildSignatureDisplay(signatures: Signature, writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags, kind?: SignatureKind): void;
        buildParameterDisplay(parameter: Symbol, writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags): void;
        buildTypeParameterDisplay(tp: TypeParameter, writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags): void;
        buildTypePredicateDisplay(predicate: TypePredicate, writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags): void;
        buildTypeParameterDisplayFromSymbol(symbol: Symbol, writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags): void;
        buildDisplayForParametersAndDelimiters(parameters: Symbol[], writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags): void;
        buildDisplayForTypeParametersAndDelimiters(typeParameters: TypeParameter[], writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags): void;
        buildReturnTypeDisplay(signature: Signature, writer: SymbolWriter, enclosingDeclaration?: Node, flags?: TypeFormatFlags): void;
    }
    interface SymbolWriter {
        writeKeyword(text: string): void;
        writeOperator(text: string): void;
        writePunctuation(text: string): void;
        writeSpace(text: string): void;
        writeStringLiteral(text: string): void;
        writeParameter(text: string): void;
        writeSymbol(text: string, symbol: Symbol): void;
        writeLine(): void;
        increaseIndent(): void;
        decreaseIndent(): void;
        clear(): void;
        trackSymbol(symbol: Symbol, enclosingDeclaration?: Node, meaning?: SymbolFlags): void;
        reportInaccessibleThisError(): void;
    }
    const enum TypeFormatFlags {
        None = 0,
        WriteArrayAsGenericType = 1,
        UseTypeOfFunction = 2,
        NoTruncation = 4,
        WriteArrowStyleSignature = 8,
        WriteOwnNameForAnyLike = 16,
        WriteTypeArgumentsOfSignature = 32,
        InElementType = 64,
        UseFullyQualifiedType = 128,
    }
    const enum SymbolFormatFlags {
        None = 0,
        WriteTypeParametersOrArguments = 1,
        UseOnlyExternalAliasing = 2,
    }
    const enum SymbolAccessibility {
        Accessible = 0,
        NotAccessible = 1,
        CannotBeNamed = 2,
    }
    const enum TypePredicateKind {
        This = 0,
        Identifier = 1,
    }
    interface TypePredicateBase {
        kind: TypePredicateKind;
        type: Type;
    }
    interface ThisTypePredicate extends TypePredicateBase {
        _thisTypePredicateBrand: any;
    }
    interface IdentifierTypePredicate extends TypePredicateBase {
        parameterName: string;
        parameterIndex: number;
    }
    type TypePredicate = IdentifierTypePredicate | ThisTypePredicate;
    type AnyImportSyntax = ImportDeclaration | ImportEqualsDeclaration;
    interface SymbolVisibilityResult {
        accessibility: SymbolAccessibility;
        aliasesToMakeVisible?: AnyImportSyntax[];
        errorSymbolName?: string;
        errorNode?: Node;
    }
    interface SymbolAccessiblityResult extends SymbolVisibilityResult {
        errorModuleName?: string;
    }
    /** Indicates how to serialize the name for a TypeReferenceNode when emitting decorator
      * metadata */
    enum TypeReferenceSerializationKind {
        Unknown = 0,
        TypeWithConstructSignatureAndValue = 1,
        VoidType = 2,
        NumberLikeType = 3,
        StringLikeType = 4,
        BooleanType = 5,
        ArrayLikeType = 6,
        ESSymbolType = 7,
        TypeWithCallSignature = 8,
        ObjectType = 9,
    }
    interface EmitResolver {
        hasGlobalName(name: string): boolean;
        getReferencedExportContainer(node: Identifier): SourceFile | ModuleDeclaration | EnumDeclaration;
        getReferencedImportDeclaration(node: Identifier): Declaration;
        getReferencedDeclarationWithCollidingName(node: Identifier): Declaration;
        isDeclarationWithCollidingName(node: Declaration): boolean;
        isValueAliasDeclaration(node: Node): boolean;
        isReferencedAliasDeclaration(node: Node, checkChildren?: boolean): boolean;
        isTopLevelValueImportEqualsWithEntityName(node: ImportEqualsDeclaration): boolean;
        getNodeCheckFlags(node: Node): NodeCheckFlags;
        isDeclarationVisible(node: Declaration): boolean;
        collectLinkedAliases(node: Identifier): Node[];
        isImplementationOfOverload(node: FunctionLikeDeclaration): boolean;
        writeTypeOfDeclaration(declaration: AccessorDeclaration | VariableLikeDeclaration, enclosingDeclaration: Node, flags: TypeFormatFlags, writer: SymbolWriter): void;
        writeReturnTypeOfSignatureDeclaration(signatureDeclaration: SignatureDeclaration, enclosingDeclaration: Node, flags: TypeFormatFlags, writer: SymbolWriter): void;
        writeTypeOfExpression(expr: Expression, enclosingDeclaration: Node, flags: TypeFormatFlags, writer: SymbolWriter): void;
        isSymbolAccessible(symbol: Symbol, enclosingDeclaration: Node, meaning: SymbolFlags): SymbolAccessiblityResult;
        isEntityNameVisible(entityName: EntityName | Expression, enclosingDeclaration: Node): SymbolVisibilityResult;
        getConstantValue(node: EnumMember | PropertyAccessExpression | ElementAccessExpression): number;
        getReferencedValueDeclaration(reference: Identifier): Declaration;
        getTypeReferenceSerializationKind(typeName: EntityName): TypeReferenceSerializationKind;
        isOptionalParameter(node: ParameterDeclaration): boolean;
        moduleExportsSomeValue(moduleReferenceExpression: Expression): boolean;
        isArgumentsLocalBinding(node: Identifier): boolean;
        getExternalModuleFileFromDeclaration(declaration: ImportEqualsDeclaration | ImportDeclaration | ExportDeclaration | ModuleDeclaration): SourceFile;
    }
    const enum SymbolFlags {
        None = 0,
        FunctionScopedVariable = 1,
        BlockScopedVariable = 2,
        Property = 4,
        EnumMember = 8,
        Function = 16,
        Class = 32,
        Interface = 64,
        ConstEnum = 128,
        RegularEnum = 256,
        ValueModule = 512,
        NamespaceModule = 1024,
        TypeLiteral = 2048,
        ObjectLiteral = 4096,
        Method = 8192,
        Constructor = 16384,
        GetAccessor = 32768,
        SetAccessor = 65536,
        Signature = 131072,
        TypeParameter = 262144,
        TypeAlias = 524288,
        ExportValue = 1048576,
        ExportType = 2097152,
        ExportNamespace = 4194304,
        Alias = 8388608,
        Instantiated = 16777216,
        Merged = 33554432,
        Transient = 67108864,
        Prototype = 134217728,
        SyntheticProperty = 268435456,
        Optional = 536870912,
        ExportStar = 1073741824,
        Enum = 384,
        Variable = 3,
        Value = 107455,
        Type = 793056,
        Namespace = 1536,
        Module = 1536,
        Accessor = 98304,
        FunctionScopedVariableExcludes = 107454,
        BlockScopedVariableExcludes = 107455,
        ParameterExcludes = 107455,
        PropertyExcludes = 107455,
        EnumMemberExcludes = 107455,
        FunctionExcludes = 106927,
        ClassExcludes = 899519,
        InterfaceExcludes = 792960,
        RegularEnumExcludes = 899327,
        ConstEnumExcludes = 899967,
        ValueModuleExcludes = 106639,
        NamespaceModuleExcludes = 0,
        MethodExcludes = 99263,
        GetAccessorExcludes = 41919,
        SetAccessorExcludes = 74687,
        TypeParameterExcludes = 530912,
        TypeAliasExcludes = 793056,
        AliasExcludes = 8388608,
        ModuleMember = 8914931,
        ExportHasLocal = 944,
        HasExports = 1952,
        HasMembers = 6240,
        BlockScoped = 418,
        PropertyOrAccessor = 98308,
        Export = 7340032,
        Classifiable = 788448,
    }
    interface Symbol {
        flags: SymbolFlags;
        name: string;
        declarations?: Declaration[];
        valueDeclaration?: Declaration;
        members?: SymbolTable;
        exports?: SymbolTable;
        id?: number;
        mergeId?: number;
        parent?: Symbol;
        exportSymbol?: Symbol;
        constEnumOnlyModule?: boolean;
    }
    interface SymbolLinks {
        target?: Symbol;
        type?: Type;
        declaredType?: Type;
        typeParameters?: TypeParameter[];
        inferredClassType?: Type;
        instantiations?: Map<Type>;
        mapper?: TypeMapper;
        referenced?: boolean;
        containingType?: UnionOrIntersectionType;
        resolvedExports?: SymbolTable;
        exportsChecked?: boolean;
        isDeclaratonWithCollidingName?: boolean;
        bindingElement?: BindingElement;
        exportsSomeValue?: boolean;
    }
    interface TransientSymbol extends Symbol, SymbolLinks {
    }
    interface SymbolTable {
        [index: string]: Symbol;
    }
    const enum NodeCheckFlags {
        TypeChecked = 1,
        LexicalThis = 2,
        CaptureThis = 4,
        SuperInstance = 256,
        SuperStatic = 512,
        ContextChecked = 1024,
        AsyncMethodWithSuper = 2048,
        AsyncMethodWithSuperBinding = 4096,
        CaptureArguments = 8192,
        EnumValuesComputed = 16384,
        LexicalModuleMergesWithClass = 32768,
        LoopWithCapturedBlockScopedBinding = 65536,
        CapturedBlockScopedBinding = 131072,
        BlockScopedBindingInLoop = 262144,
        ClassWithBodyScopedClassBinding = 524288,
        BodyScopedClassBinding = 1048576,
        NeedsLoopOutParameter = 2097152,
    }
    interface NodeLinks {
        resolvedType?: Type;
        resolvedAwaitedType?: Type;
        resolvedSignature?: Signature;
        resolvedSymbol?: Symbol;
        flags?: NodeCheckFlags;
        enumMemberValue?: number;
        isVisible?: boolean;
        generatedName?: string;
        generatedNames?: Map<string>;
        assignmentChecks?: Map<boolean>;
        hasReportedStatementInAmbientContext?: boolean;
        importOnRightSide?: Symbol;
        jsxFlags?: JsxFlags;
        resolvedJsxType?: Type;
        hasSuperCall?: boolean;
        superCall?: ExpressionStatement;
    }
    const enum TypeFlags {
        Any = 1,
        String = 2,
        Number = 4,
        Boolean = 8,
        Void = 16,
        Undefined = 32,
        Null = 64,
        Enum = 128,
        StringLiteral = 256,
        TypeParameter = 512,
        Class = 1024,
        Interface = 2048,
        Reference = 4096,
        Tuple = 8192,
        Union = 16384,
        Intersection = 32768,
        Anonymous = 65536,
        Instantiated = 131072,
        FromSignature = 262144,
        ObjectLiteral = 524288,
        FreshObjectLiteral = 1048576,
        ContainsUndefinedOrNull = 2097152,
        ContainsObjectLiteral = 4194304,
        ContainsAnyFunctionType = 8388608,
        ESSymbol = 16777216,
        ThisType = 33554432,
        ObjectLiteralPatternWithComputedProperties = 67108864,
        Intrinsic = 16777343,
        Primitive = 16777726,
        StringLike = 258,
        NumberLike = 132,
        ObjectType = 80896,
        UnionOrIntersection = 49152,
        StructuredType = 130048,
        RequiresWidening = 6291456,
        PropagatingFlags = 14680064,
    }
    type DestructuringPattern = BindingPattern | ObjectLiteralExpression | ArrayLiteralExpression;
    interface Type {
        flags: TypeFlags;
        id: number;
        symbol?: Symbol;
        pattern?: DestructuringPattern;
    }
    interface IntrinsicType extends Type {
        intrinsicName: string;
    }
    interface StringLiteralType extends Type {
        text: string;
    }
    interface ObjectType extends Type {
    }
    interface InterfaceType extends ObjectType {
        typeParameters: TypeParameter[];
        outerTypeParameters: TypeParameter[];
        localTypeParameters: TypeParameter[];
        thisType: TypeParameter;
        resolvedBaseConstructorType?: Type;
        resolvedBaseTypes: ObjectType[];
    }
    interface InterfaceTypeWithDeclaredMembers extends InterfaceType {
        declaredProperties: Symbol[];
        declaredCallSignatures: Signature[];
        declaredConstructSignatures: Signature[];
        declaredStringIndexType: Type;
        declaredNumberIndexType: Type;
    }
    interface TypeReference extends ObjectType {
        target: GenericType;
        typeArguments: Type[];
    }
    interface GenericType extends InterfaceType, TypeReference {
        instantiations: Map<TypeReference>;
    }
    interface TupleType extends ObjectType {
        elementTypes: Type[];
    }
    interface UnionOrIntersectionType extends Type {
        types: Type[];
        reducedType: Type;
        resolvedProperties: SymbolTable;
    }
    interface UnionType extends UnionOrIntersectionType {
    }
    interface IntersectionType extends UnionOrIntersectionType {
    }
    interface AnonymousType extends ObjectType {
        target?: AnonymousType;
        mapper?: TypeMapper;
    }
    interface ResolvedType extends ObjectType, UnionOrIntersectionType {
        members: SymbolTable;
        properties: Symbol[];
        callSignatures: Signature[];
        constructSignatures: Signature[];
        stringIndexType?: Type;
        numberIndexType?: Type;
    }
    interface FreshObjectLiteralType extends ResolvedType {
        regularType: ResolvedType;
    }
    interface IterableOrIteratorType extends ObjectType, UnionType {
        iterableElementType?: Type;
        iteratorElementType?: Type;
    }
    interface TypeParameter extends Type {
        constraint: Type;
        target?: TypeParameter;
        mapper?: TypeMapper;
        resolvedApparentType: Type;
    }
    const enum SignatureKind {
        Call = 0,
        Construct = 1,
    }
    interface Signature {
        declaration: SignatureDeclaration;
        typeParameters: TypeParameter[];
        parameters: Symbol[];
        resolvedReturnType: Type;
        minArgumentCount: number;
        hasRestParameter: boolean;
        hasStringLiterals: boolean;
        target?: Signature;
        mapper?: TypeMapper;
        unionSignatures?: Signature[];
        erasedSignatureCache?: Signature;
        isolatedSignatureType?: ObjectType;
        typePredicate?: TypePredicate;
    }
    const enum IndexKind {
        String = 0,
        Number = 1,
    }
    interface TypeMapper {
        (t: TypeParameter): Type;
        instantiations?: Type[];
        context?: InferenceContext;
    }
    interface TypeInferences {
        primary: Type[];
        secondary: Type[];
        isFixed: boolean;
    }
    interface InferenceContext {
        typeParameters: TypeParameter[];
        inferUnionTypes: boolean;
        inferences: TypeInferences[];
        inferredTypes: Type[];
        mapper?: TypeMapper;
        failedTypeParameterIndex?: number;
    }
    const enum SpecialPropertyAssignmentKind {
        None = 0,
        ExportsProperty = 1,
        ModuleExports = 2,
        PrototypeProperty = 3,
        ThisProperty = 4,
    }
    interface DiagnosticMessage {
        key: string;
        category: DiagnosticCategory;
        code: number;
        message: string;
    }
    /**
     * A linked list of formatted diagnostic messages to be used as part of a multiline message.
     * It is built from the bottom up, leaving the head to be the "main" diagnostic.
     * While it seems that DiagnosticMessageChain is structurally similar to DiagnosticMessage,
     * the difference is that messages are all preformatted in DMC.
     */
    interface DiagnosticMessageChain {
        messageText: string;
        category: DiagnosticCategory;
        code: number;
        next?: DiagnosticMessageChain;
    }
    interface Diagnostic {
        file: SourceFile;
        start: number;
        length: number;
        messageText: string | DiagnosticMessageChain;
        category: DiagnosticCategory;
        code: number;
    }
    enum DiagnosticCategory {
        Warning = 0,
        Error = 1,
        Message = 2,
    }
    const enum ModuleResolutionKind {
        Classic = 1,
        NodeJs = 2,
    }
    interface CompilerOptions {
        allowNonTsExtensions?: boolean;
        charset?: string;
        declaration?: boolean;
        diagnostics?: boolean;
        emitBOM?: boolean;
        help?: boolean;
        init?: boolean;
        inlineSourceMap?: boolean;
        inlineSources?: boolean;
        jsx?: JsxEmit;
        reactNamespace?: string;
        listFiles?: boolean;
        locale?: string;
        mapRoot?: string;
        module?: ModuleKind;
        newLine?: NewLineKind;
        noEmit?: boolean;
        noEmitHelpers?: boolean;
        noEmitOnError?: boolean;
        noErrorTruncation?: boolean;
        noImplicitAny?: boolean;
        noLib?: boolean;
        noResolve?: boolean;
        out?: string;
        outFile?: string;
        outDir?: string;
        preserveConstEnums?: boolean;
        pretty?: DiagnosticStyle;
        project?: string;
        removeComments?: boolean;
        rootDir?: string;
        sourceMap?: boolean;
        sourceRoot?: string;
        suppressExcessPropertyErrors?: boolean;
        suppressImplicitAnyIndexErrors?: boolean;
        target?: ScriptTarget;
        version?: boolean;
        watch?: boolean;
        isolatedModules?: boolean;
        experimentalDecorators?: boolean;
        emitDecoratorMetadata?: boolean;
        moduleResolution?: ModuleResolutionKind;
        allowUnusedLabels?: boolean;
        allowUnreachableCode?: boolean;
        noImplicitReturns?: boolean;
        noFallthroughCasesInSwitch?: boolean;
        forceConsistentCasingInFileNames?: boolean;
        allowSyntheticDefaultImports?: boolean;
        allowJs?: boolean;
        noImplicitUseStrict?: boolean;
        disableSizeLimit?: boolean;
        stripInternal?: boolean;
        skipDefaultLibCheck?: boolean;
        suppressOutputPathCheck?: boolean;
        noCustomAsyncPromise?: boolean;
        [option: string]: string | number | boolean;
    }
    interface TypingOptions {
        enableAutoDiscovery?: boolean;
        include?: string[];
        exclude?: string[];
        [option: string]: string[] | boolean;
    }
    interface DiscoverTypingsInfo {
        fileNames: string[];
        projectRootPath: string;
        safeListPath: string;
        packageNameToTypingLocation: Map<string>;
        typingOptions: TypingOptions;
        compilerOptions: CompilerOptions;
    }
    const enum ModuleKind {
        None = 0,
        CommonJS = 1,
        AMD = 2,
        UMD = 3,
        System = 4,
        ES6 = 5,
        ES2015 = 5,
    }
    const enum JsxEmit {
        None = 0,
        Preserve = 1,
        React = 2,
    }
    const enum NewLineKind {
        CarriageReturnLineFeed = 0,
        LineFeed = 1,
    }
    interface LineAndCharacter {
        line: number;
        character: number;
    }
    const enum ScriptKind {
        Unknown = 0,
        JS = 1,
        JSX = 2,
        TS = 3,
        TSX = 4,
    }
    const enum ScriptTarget {
        ES3 = 0,
        ES5 = 1,
        ES6 = 2,
        ES2015 = 2,
        Latest = 2,
    }
    const enum LanguageVariant {
        Standard = 0,
        JSX = 1,
    }
    const enum DiagnosticStyle {
        Simple = 0,
        Pretty = 1,
    }
    interface ParsedCommandLine {
        options: CompilerOptions;
        typingOptions?: TypingOptions;
        fileNames: string[];
        errors: Diagnostic[];
    }
    interface CommandLineOptionBase {
        name: string;
        type: "string" | "number" | "boolean" | Map<number>;
        isFilePath?: boolean;
        shortName?: string;
        description?: DiagnosticMessage;
        paramType?: DiagnosticMessage;
        experimental?: boolean;
    }
    interface CommandLineOptionOfPrimitiveType extends CommandLineOptionBase {
        type: "string" | "number" | "boolean";
    }
    interface CommandLineOptionOfCustomType extends CommandLineOptionBase {
        type: Map<number>;
        error: DiagnosticMessage;
    }
    type CommandLineOption = CommandLineOptionOfCustomType | CommandLineOptionOfPrimitiveType;
    const enum CharacterCodes {
        nullCharacter = 0,
        maxAsciiCharacter = 127,
        lineFeed = 10,
        carriageReturn = 13,
        lineSeparator = 8232,
        paragraphSeparator = 8233,
        nextLine = 133,
        space = 32,
        nonBreakingSpace = 160,
        enQuad = 8192,
        emQuad = 8193,
        enSpace = 8194,
        emSpace = 8195,
        threePerEmSpace = 8196,
        fourPerEmSpace = 8197,
        sixPerEmSpace = 8198,
        figureSpace = 8199,
        punctuationSpace = 8200,
        thinSpace = 8201,
        hairSpace = 8202,
        zeroWidthSpace = 8203,
        narrowNoBreakSpace = 8239,
        ideographicSpace = 12288,
        mathematicalSpace = 8287,
        ogham = 5760,
        _ = 95,
        $ = 36,
        _0 = 48,
        _1 = 49,
        _2 = 50,
        _3 = 51,
        _4 = 52,
        _5 = 53,
        _6 = 54,
        _7 = 55,
        _8 = 56,
        _9 = 57,
        a = 97,
        b = 98,
        c = 99,
        d = 100,
        e = 101,
        f = 102,
        g = 103,
        h = 104,
        i = 105,
        j = 106,
        k = 107,
        l = 108,
        m = 109,
        n = 110,
        o = 111,
        p = 112,
        q = 113,
        r = 114,
        s = 115,
        t = 116,
        u = 117,
        v = 118,
        w = 119,
        x = 120,
        y = 121,
        z = 122,
        A = 65,
        B = 66,
        C = 67,
        D = 68,
        E = 69,
        F = 70,
        G = 71,
        H = 72,
        I = 73,
        J = 74,
        K = 75,
        L = 76,
        M = 77,
        N = 78,
        O = 79,
        P = 80,
        Q = 81,
        R = 82,
        S = 83,
        T = 84,
        U = 85,
        V = 86,
        W = 87,
        X = 88,
        Y = 89,
        Z = 90,
        ampersand = 38,
        asterisk = 42,
        at = 64,
        backslash = 92,
        backtick = 96,
        bar = 124,
        caret = 94,
        closeBrace = 125,
        closeBracket = 93,
        closeParen = 41,
        colon = 58,
        comma = 44,
        dot = 46,
        doubleQuote = 34,
        equals = 61,
        exclamation = 33,
        greaterThan = 62,
        hash = 35,
        lessThan = 60,
        minus = 45,
        openBrace = 123,
        openBracket = 91,
        openParen = 40,
        percent = 37,
        plus = 43,
        question = 63,
        semicolon = 59,
        singleQuote = 39,
        slash = 47,
        tilde = 126,
        backspace = 8,
        formFeed = 12,
        byteOrderMark = 65279,
        tab = 9,
        verticalTab = 11,
    }
    interface ModuleResolutionHost {
        fileExists(fileName: string): boolean;
        readFile(fileName: string): string;
        directoryExists?(directoryName: string): boolean;
    }
    interface ResolvedModule {
        resolvedFileName: string;
        isExternalLibraryImport?: boolean;
    }
    interface ResolvedModuleWithFailedLookupLocations {
        resolvedModule: ResolvedModule;
        failedLookupLocations: string[];
    }
    interface CompilerHost extends ModuleResolutionHost {
        getSourceFile(fileName: string, languageVersion: ScriptTarget, onError?: (message: string) => void): SourceFile;
        getCancellationToken?(): CancellationToken;
        getDefaultLibFileName(options: CompilerOptions): string;
        writeFile: WriteFileCallback;
        getCurrentDirectory(): string;
        getCanonicalFileName(fileName: string): string;
        useCaseSensitiveFileNames(): boolean;
        getNewLine(): string;
        resolveModuleNames?(moduleNames: string[], containingFile: string): ResolvedModule[];
    }
    interface TextSpan {
        start: number;
        length: number;
    }
    interface TextChangeRange {
        span: TextSpan;
        newLength: number;
    }
    interface DiagnosticCollection {
        add(diagnostic: Diagnostic): void;
        getGlobalDiagnostics(): Diagnostic[];
        getDiagnostics(fileName?: string): Diagnostic[];
        getModificationCount(): number;
        reattachFileDiagnostics(newFile: SourceFile): void;
    }
}
declare namespace ts {
    /**
     * Ternary values are defined such that
     * x & y is False if either x or y is False.
     * x & y is Maybe if either x or y is Maybe, but neither x or y is False.
     * x & y is True if both x and y are True.
     * x | y is False if both x and y are False.
     * x | y is Maybe if either x or y is Maybe, but neither x or y is True.
     * x | y is True if either x or y is True.
     */
    const enum Ternary {
        False = 0,
        Maybe = 1,
        True = -1,
    }
    function createFileMap<T>(keyMapper?: (key: string) => string): FileMap<T>;
    function toPath(fileName: string, basePath: string, getCanonicalFileName: (path: string) => string): Path;
    const enum Comparison {
        LessThan = -1,
        EqualTo = 0,
        GreaterThan = 1,
    }
    interface StringSet extends Map<any> {
    }
    /**
     * Iterates through 'array' by index and performs the callback on each element of array until the callback
     * returns a truthy value, then returns that value.
     * If no such value is found, the callback is applied to each element of array and undefined is returned.
     */
    function forEach<T, U>(array: T[], callback: (element: T, index: number) => U): U;
    function contains<T>(array: T[], value: T): boolean;
    function indexOf<T>(array: T[], value: T): number;
    function countWhere<T>(array: T[], predicate: (x: T) => boolean): number;
    function filter<T>(array: T[], f: (x: T) => boolean): T[];
    function map<T, U>(array: T[], f: (x: T) => U): U[];
    function concatenate<T>(array1: T[], array2: T[]): T[];
    function deduplicate<T>(array: T[]): T[];
    function sum(array: any[], prop: string): number;
    function addRange<T>(to: T[], from: T[]): void;
    function rangeEquals<T>(array1: T[], array2: T[], pos: number, end: number): boolean;
    /**
     * Returns the last element of an array if non-empty, undefined otherwise.
     */
    function lastOrUndefined<T>(array: T[]): T;
    /**
     * Performs a binary search, finding the index at which 'value' occurs in 'array'.
     * If no such index is found, returns the 2's-complement of first index at which
     * number[index] exceeds number.
     * @param array A sorted array whose first element must be no larger than number
     * @param number The value to be searched for in the array.
     */
    function binarySearch(array: number[], value: number): number;
    function reduceLeft<T>(array: T[], f: (a: T, x: T) => T): T;
    function reduceLeft<T, U>(array: T[], f: (a: U, x: T) => U, initial: U): U;
    function reduceRight<T>(array: T[], f: (a: T, x: T) => T): T;
    function reduceRight<T, U>(array: T[], f: (a: U, x: T) => U, initial: U): U;
    function hasProperty<T>(map: Map<T>, key: string): boolean;
    function getKeys<T>(map: Map<T>): string[];
    function getProperty<T>(map: Map<T>, key: string): T;
    function isEmpty<T>(map: Map<T>): boolean;
    function clone<T>(object: T): T;
    function extend<T1 extends Map<{}>, T2 extends Map<{}>>(first: T1, second: T2): T1 & T2;
    function forEachValue<T, U>(map: Map<T>, callback: (value: T) => U): U;
    function forEachKey<T, U>(map: Map<T>, callback: (key: string) => U): U;
    function lookUp<T>(map: Map<T>, key: string): T;
    function copyMap<T>(source: Map<T>, target: Map<T>): void;
    /**
     * Creates a map from the elements of an array.
     *
     * @param array the array of input elements.
     * @param makeKey a function that produces a key for a given element.
     *
     * This function makes no effort to avoid collisions; if any two elements produce
     * the same key with the given 'makeKey' function, then the element with the higher
     * index in the array will be the one associated with the produced key.
     */
    function arrayToMap<T>(array: T[], makeKey: (value: T) => string): Map<T>;
    /**
     * Reduce the properties of a map.
     *
     * @param map The map to reduce
     * @param callback An aggregation function that is called for each entry in the map
     * @param initial The initial value for the reduction.
     */
    function reduceProperties<T, U>(map: Map<T>, callback: (aggregate: U, value: T, key: string) => U, initial: U): U;
    /**
     * Tests whether a value is an array.
     */
    function isArray(value: any): value is any[];
    function memoize<T>(callback: () => T): () => T;
    let localizedDiagnosticMessages: Map<string>;
    function getLocaleSpecificMessage(message: DiagnosticMessage): string;
    function createFileDiagnostic(file: SourceFile, start: number, length: number, message: DiagnosticMessage, ...args: any[]): Diagnostic;
    function createCompilerDiagnostic(message: DiagnosticMessage, ...args: any[]): Diagnostic;
    function chainDiagnosticMessages(details: DiagnosticMessageChain, message: DiagnosticMessage, ...args: any[]): DiagnosticMessageChain;
    function concatenateDiagnosticMessageChains(headChain: DiagnosticMessageChain, tailChain: DiagnosticMessageChain): DiagnosticMessageChain;
    function compareValues<T>(a: T, b: T): Comparison;
    function compareDiagnostics(d1: Diagnostic, d2: Diagnostic): Comparison;
    function sortAndDeduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[];
    function deduplicateSortedDiagnostics(diagnostics: Diagnostic[]): Diagnostic[];
    function normalizeSlashes(path: string): string;
    function getRootLength(path: string): number;
    let directorySeparator: string;
    function normalizePath(path: string): string;
    function getDirectoryPath(path: Path): Path;
    function getDirectoryPath(path: string): string;
    function isUrl(path: string): boolean;
    function isRootedDiskPath(path: string): boolean;
    function getNormalizedPathComponents(path: string, currentDirectory: string): string[];
    function getNormalizedAbsolutePath(fileName: string, currentDirectory: string): string;
    function getNormalizedPathFromPathComponents(pathComponents: string[]): string;
    function getRelativePathToDirectoryOrUrl(directoryPathOrUrl: string, relativeOrAbsolutePath: string, currentDirectory: string, getCanonicalFileName: (fileName: string) => string, isAbsolutePathAnUrl: boolean): string;
    function getBaseFileName(path: string): string;
    function combinePaths(path1: string, path2: string): string;
    function fileExtensionIs(path: string, extension: string): boolean;
    function ensureScriptKind(fileName: string, scriptKind?: ScriptKind): ScriptKind;
    function getScriptKindFromFileName(fileName: string): ScriptKind;
    /**
     *  List of supported extensions in order of file resolution precedence.
     */
    const supportedTypeScriptExtensions: string[];
    const supportedJavascriptExtensions: string[];
    function getSupportedExtensions(options?: CompilerOptions): string[];
    function isSupportedSourceFileName(fileName: string, compilerOptions?: CompilerOptions): boolean;
    function removeFileExtension(path: string): string;
    interface ObjectAllocator {
        getNodeConstructor(): new (kind: SyntaxKind, pos?: number, end?: number) => Node;
        getSourceFileConstructor(): new (kind: SyntaxKind, pos?: number, end?: number) => SourceFile;
        getSymbolConstructor(): new (flags: SymbolFlags, name: string) => Symbol;
        getTypeConstructor(): new (checker: TypeChecker, flags: TypeFlags) => Type;
        getSignatureConstructor(): new (checker: TypeChecker) => Signature;
    }
    let objectAllocator: ObjectAllocator;
    const enum AssertionLevel {
        None = 0,
        Normal = 1,
        Aggressive = 2,
        VeryAggressive = 3,
    }
    namespace Debug {
        function shouldAssert(level: AssertionLevel): boolean;
        function assert(expression: boolean, message?: string, verboseDebugInfo?: () => string): void;
        function fail(message?: string): void;
    }
    function copyListRemovingItem<T>(item: T, list: T[]): T[];
    function createGetCanonicalFileName(useCaseSensitivefileNames: boolean): (fileName: string) => string;
}
declare namespace ts {
    type FileWatcherCallback = (path: string, removed?: boolean) => void;
    type DirectoryWatcherCallback = (path: string) => void;
    interface System {
        args: string[];
        newLine: string;
        useCaseSensitiveFileNames: boolean;
        write(s: string): void;
        readFile(path: string, encoding?: string): string;
        writeFile(path: string, data: string, writeByteOrderMark?: boolean): void;
        watchFile?(path: Path, callback: FileWatcherCallback): FileWatcher;
        watchDirectory?(path: string, callback: DirectoryWatcherCallback, recursive?: boolean): FileWatcher;
        resolvePath(path: string): string;
        fileExists(path: string): boolean;
        directoryExists(path: string): boolean;
        createDirectory(path: string): void;
        getExecutingFilePath(): string;
        getCurrentDirectory(): string;
        readDirectory(path: string, extension?: string, exclude?: string[]): string[];
        getMemoryUsage?(): number;
        exit(exitCode?: number): void;
    }
    interface FileWatcher {
        close(): void;
    }
    interface DirectoryWatcher extends FileWatcher {
        directoryPath: Path;
        referenceCount: number;
    }
    var sys: System;
}
declare namespace ts {
    var Diagnostics: {
        Unterminated_string_literal: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Identifier_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_file_cannot_have_a_reference_to_itself: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Trailing_comma_not_allowed: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Asterisk_Slash_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unexpected_token: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_rest_parameter_must_be_last_in_a_parameter_list: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_cannot_have_question_mark_and_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_required_parameter_cannot_follow_an_optional_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_signature_cannot_have_a_rest_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_signature_parameter_cannot_have_an_accessibility_modifier: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_signature_parameter_cannot_have_a_question_mark: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_signature_parameter_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_signature_must_have_a_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_signature_parameter_must_have_a_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_signature_parameter_type_must_be_string_or_number: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Accessibility_modifier_already_seen: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_must_precede_1_modifier: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_already_seen: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_appear_on_a_class_element: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        super_must_be_followed_by_an_argument_list_or_member_access: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Only_ambient_modules_can_use_quoted_names: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Statements_are_not_allowed_in_ambient_contexts: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_declare_modifier_cannot_be_used_in_an_already_ambient_context: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Initializers_are_not_allowed_in_ambient_contexts: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_be_used_in_an_ambient_context: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_be_used_with_a_class_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_be_used_here: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_appear_on_a_data_property: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_appear_on_a_module_element: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_0_modifier_cannot_be_used_with_an_interface_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_declare_modifier_is_required_for_a_top_level_declaration_in_a_d_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_rest_parameter_cannot_be_optional: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_rest_parameter_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_set_accessor_must_have_exactly_one_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_set_accessor_cannot_have_an_optional_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_set_accessor_parameter_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_set_accessor_cannot_have_rest_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_get_accessor_cannot_have_parameters: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_is_not_a_valid_async_function_return_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Accessors_are_only_available_when_targeting_ECMAScript_5_and_higher: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_async_function_or_method_must_have_a_valid_awaitable_return_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Operand_for_await_does_not_have_a_valid_callable_then_member: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_expression_in_async_function_does_not_have_a_valid_callable_then_member: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Expression_body_for_async_arrow_function_does_not_have_a_valid_callable_then_member: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Enum_member_must_have_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_is_referenced_directly_or_indirectly_in_the_fulfillment_callback_of_its_own_then_method: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_export_assignment_cannot_be_used_in_a_namespace: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_return_type_of_an_async_function_or_method_must_be_the_global_Promise_T_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        In_ambient_enum_declarations_member_initializer_must_be_constant_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unexpected_token_A_constructor_method_accessor_or_property_was_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_0_modifier_cannot_be_used_with_an_import_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_reference_directive_syntax: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Octal_literals_are_not_available_when_targeting_ECMAScript_5_and_higher: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_accessor_cannot_be_declared_in_an_ambient_context: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_appear_on_a_constructor_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_appear_on_a_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Only_a_single_variable_declaration_is_allowed_in_a_for_in_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameters_cannot_appear_on_a_constructor_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_annotation_cannot_appear_on_a_constructor_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_accessor_cannot_have_type_parameters: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_set_accessor_cannot_have_a_return_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_signature_must_have_exactly_one_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_list_cannot_be_empty: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_list_cannot_be_empty: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_argument_list_cannot_be_empty: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_use_of_0_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        with_statements_are_not_allowed_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        delete_cannot_be_called_on_an_identifier_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_continue_statement_can_only_be_used_within_an_enclosing_iteration_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_break_statement_can_only_be_used_within_an_enclosing_iteration_or_switch_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Jump_target_cannot_cross_function_boundary: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_return_statement_can_only_be_used_within_a_function_body: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Expression_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_class_member_cannot_be_declared_optional: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_default_clause_cannot_appear_more_than_once_in_a_switch_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_label_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_continue_statement_can_only_jump_to_a_label_of_an_enclosing_iteration_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_break_statement_can_only_jump_to_a_label_of_an_enclosing_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_object_literal_cannot_have_multiple_properties_with_the_same_name_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_object_literal_cannot_have_multiple_get_Slashset_accessors_with_the_same_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_object_literal_cannot_have_property_and_accessor_with_the_same_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_export_assignment_cannot_have_modifiers: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Octal_literals_are_not_allowed_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_tuple_type_element_list_cannot_be_empty: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Variable_declaration_list_cannot_be_empty: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Digit_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Hexadecimal_digit_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unexpected_end_of_text: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_character: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Declaration_or_statement_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Statement_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        case_or_default_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_or_signature_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Enum_member_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Variable_declaration_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Argument_expression_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_assignment_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Expression_or_comma_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_declaration_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_declaration_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_argument_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        String_literal_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Line_break_not_permitted_here: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        or_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Modifiers_not_permitted_on_index_signature_members: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Declaration_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Import_declarations_in_a_namespace_cannot_reference_a_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_compile_modules_unless_the_module_flag_is_provided_with_a_valid_module_type_Consider_setting_the_module_compiler_option_in_a_tsconfig_json_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        File_name_0_differs_from_already_included_file_name_1_only_in_casing: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        new_T_cannot_be_used_to_create_an_array_Use_new_Array_T_instead: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        const_declarations_must_be_initialized: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        const_declarations_can_only_be_declared_inside_a_block: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        let_declarations_can_only_be_declared_inside_a_block: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unterminated_template_literal: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unterminated_regular_expression_literal: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_object_member_cannot_be_declared_optional: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_yield_expression_is_only_allowed_in_a_generator_body: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Computed_property_names_are_not_allowed_in_enums: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_computed_property_name_in_an_ambient_context_must_directly_refer_to_a_built_in_symbol: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_computed_property_name_in_a_class_property_declaration_must_directly_refer_to_a_built_in_symbol: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_computed_property_name_in_a_method_overload_must_directly_refer_to_a_built_in_symbol: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_computed_property_name_in_an_interface_must_directly_refer_to_a_built_in_symbol: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_computed_property_name_in_a_type_literal_must_directly_refer_to_a_built_in_symbol: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_comma_expression_is_not_allowed_in_a_computed_property_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        extends_clause_already_seen: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        extends_clause_must_precede_implements_clause: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Classes_can_only_extend_a_single_class: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        implements_clause_already_seen: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Interface_declaration_cannot_have_implements_clause: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Binary_digit_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Octal_digit_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unexpected_token_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_destructuring_pattern_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Array_element_destructuring_pattern_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_destructuring_declaration_must_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_implementation_cannot_be_declared_in_ambient_contexts: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Modifiers_cannot_appear_here: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Merge_conflict_marker_encountered: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_rest_element_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_parameter_property_may_not_be_a_binding_pattern: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Only_a_single_variable_declaration_is_allowed_in_a_for_of_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_variable_declaration_of_a_for_in_statement_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_variable_declaration_of_a_for_of_statement_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_import_declaration_cannot_have_modifiers: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Module_0_has_no_default_export: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_export_declaration_cannot_have_modifiers: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Export_declarations_are_not_permitted_in_a_namespace: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Catch_clause_variable_name_must_be_an_identifier: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Catch_clause_variable_cannot_have_a_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Catch_clause_variable_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_extended_Unicode_escape_value_must_be_between_0x0_and_0x10FFFF_inclusive: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unterminated_Unicode_escape_sequence: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Line_terminator_not_permitted_before_arrow: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Import_assignment_cannot_be_used_when_targeting_ECMAScript_6_modules_Consider_using_import_Asterisk_as_ns_from_mod_import_a_from_mod_import_d_from_mod_or_another_module_format_instead: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Export_assignment_cannot_be_used_when_targeting_ECMAScript_6_modules_Consider_using_export_default_or_another_module_format_instead: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_compile_modules_into_es2015_when_targeting_ES5_or_lower: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Decorators_are_not_valid_here: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Decorators_cannot_be_applied_to_multiple_get_Slashset_accessors_of_the_same_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_compile_namespaces_when_the_isolatedModules_flag_is_provided: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Ambient_const_enums_are_not_allowed_when_the_isolatedModules_flag_is_provided: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_use_of_0_Class_definitions_are_automatically_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_class_declaration_without_the_default_modifier_must_have_a_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Identifier_expected_0_is_a_reserved_word_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Identifier_expected_0_is_a_reserved_word_in_strict_mode_Class_definitions_are_automatically_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Identifier_expected_0_is_a_reserved_word_in_strict_mode_Modules_are_automatically_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_use_of_0_Modules_are_automatically_in_strict_mode: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Export_assignment_is_not_supported_when_module_flag_is_system: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Experimental_support_for_decorators_is_a_feature_that_is_subject_to_change_in_a_future_release_Set_the_experimentalDecorators_option_to_remove_this_warning: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Generators_are_only_available_when_targeting_ECMAScript_6_or_higher: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Generators_are_not_allowed_in_an_ambient_context: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_overload_signature_cannot_be_declared_as_a_generator: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_tag_already_specified: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Signature_0_must_have_a_type_predicate: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_parameter_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_predicate_0_is_not_assignable_to_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_is_not_in_the_same_position_as_parameter_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_type_predicate_is_only_allowed_in_return_type_position_for_functions_and_methods: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_type_predicate_cannot_reference_a_rest_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_type_predicate_cannot_reference_element_0_in_a_binding_pattern: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_export_assignment_can_only_be_used_in_a_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_import_declaration_can_only_be_used_in_a_namespace_or_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_export_declaration_can_only_be_used_in_a_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_ambient_module_declaration_is_only_allowed_at_the_top_level_in_a_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_namespace_declaration_is_only_allowed_in_a_namespace_or_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_return_type_of_a_property_decorator_function_must_be_either_void_or_any: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_return_type_of_a_parameter_decorator_function_must_be_either_void_or_any: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unable_to_resolve_signature_of_class_decorator_when_called_as_an_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unable_to_resolve_signature_of_parameter_decorator_when_called_as_an_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unable_to_resolve_signature_of_property_decorator_when_called_as_an_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unable_to_resolve_signature_of_method_decorator_when_called_as_an_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        abstract_modifier_can_only_appear_on_a_class_or_method_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_modifier_cannot_be_used_with_1_modifier: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Abstract_methods_can_only_appear_within_an_abstract_class: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Method_0_cannot_have_an_implementation_because_it_is_marked_abstract: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_interface_property_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_type_literal_property_cannot_have_an_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_class_member_cannot_have_the_0_keyword: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_decorator_can_only_decorate_a_method_implementation_not_an_overload: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        with_statements_are_not_allowed_in_an_async_function_block: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        await_expression_is_only_allowed_within_an_async_function: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Async_functions_are_only_available_when_targeting_ECMAScript_6_and_higher: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        can_only_be_used_in_an_object_literal_property_inside_a_destructuring_assignment: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_body_of_an_if_statement_cannot_be_the_empty_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_identifier_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Initializer_of_instance_member_variable_0_cannot_reference_identifier_1_declared_in_the_constructor: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Static_members_cannot_reference_class_type_parameters: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Circular_definition_of_import_alias_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Module_0_has_no_exported_member_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        File_0_is_not_a_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_module_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Module_0_has_already_exported_a_member_named_1_Consider_explicitly_re_exporting_to_resolve_the_ambiguity: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_export_assignment_cannot_be_used_in_a_module_with_other_exported_elements: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_recursively_references_itself_as_a_base_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_class_may_only_extend_another_class: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_interface_may_only_extend_a_class_or_another_interface: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_has_a_circular_constraint: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Generic_type_0_requires_1_type_argument_s: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_is_not_generic: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Global_type_0_must_be_a_class_or_interface_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Global_type_0_must_have_1_type_parameter_s: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_global_type_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Named_property_0_of_types_1_and_2_are_not_identical: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Interface_0_cannot_simultaneously_extend_types_1_and_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Excessive_stack_depth_comparing_types_0_and_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_is_not_assignable_to_type_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_redeclare_exported_variable_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_is_missing_in_type_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_is_private_in_type_1_but_not_in_type_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Types_of_property_0_are_incompatible: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_is_optional_in_type_1_but_required_in_type_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Types_of_parameters_0_and_1_are_incompatible: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Index_signature_is_missing_in_type_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Index_signatures_are_incompatible: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        this_cannot_be_referenced_in_a_module_or_namespace_body: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        this_cannot_be_referenced_in_current_location: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        this_cannot_be_referenced_in_constructor_arguments: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        this_cannot_be_referenced_in_a_static_property_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        super_can_only_be_referenced_in_a_derived_class: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        super_cannot_be_referenced_in_constructor_arguments: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Super_calls_are_not_permitted_outside_constructors_or_in_nested_functions_inside_constructors: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        super_property_access_is_permitted_only_in_a_constructor_member_function_or_member_accessor_of_a_derived_class: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_does_not_exist_on_type_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Only_public_and_protected_methods_of_the_base_class_are_accessible_via_the_super_keyword: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_is_private_and_only_accessible_within_class_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_index_expression_argument_must_be_of_type_string_number_symbol_or_any: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_does_not_satisfy_the_constraint_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Argument_of_type_0_is_not_assignable_to_parameter_of_type_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Supplied_parameters_do_not_match_any_signature_of_call_target: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Untyped_function_calls_may_not_accept_type_arguments: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Value_of_type_0_is_not_callable_Did_you_mean_to_include_new: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_invoke_an_expression_whose_type_lacks_a_call_signature: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Only_a_void_function_can_be_called_with_the_new_keyword: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_use_new_with_an_expression_whose_type_lacks_a_call_or_construct_signature: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Neither_type_0_nor_type_1_is_assignable_to_the_other: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Object_literal_may_only_specify_known_properties_and_0_does_not_exist_in_type_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        No_best_common_type_exists_among_return_expressions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_function_whose_declared_type_is_neither_void_nor_any_must_return_a_value: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_arithmetic_operand_must_be_of_type_any_number_or_an_enum_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_operand_of_an_increment_or_decrement_operator_must_be_a_variable_property_or_indexer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_an_instanceof_expression_must_be_of_type_any_an_object_type_or_a_type_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_right_hand_side_of_an_instanceof_expression_must_be_of_type_any_or_of_a_type_assignable_to_the_Function_interface_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_an_in_expression_must_be_of_type_any_string_number_or_symbol: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_right_hand_side_of_an_in_expression_must_be_of_type_any_an_object_type_or_a_type_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_an_arithmetic_operation_must_be_of_type_any_number_or_an_enum_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_right_hand_side_of_an_arithmetic_operation_must_be_of_type_any_number_or_an_enum_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_left_hand_side_of_assignment_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Operator_0_cannot_be_applied_to_types_1_and_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_name_cannot_be_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_parameter_property_is_only_allowed_in_a_constructor_implementation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_rest_parameter_must_be_of_an_array_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_parameter_initializer_is_only_allowed_in_a_function_or_constructor_implementation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_cannot_be_referenced_in_its_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Initializer_of_parameter_0_cannot_reference_identifier_1_declared_after_it: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_string_index_signature: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_number_index_signature: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_super_call_must_be_the_first_statement_in_the_constructor_when_a_class_contains_initialized_properties_or_has_parameter_properties: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Constructors_for_derived_classes_must_contain_a_super_call: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_get_accessor_must_return_a_value: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Getter_and_setter_accessors_do_not_agree_in_visibility: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        get_and_set_accessor_must_have_the_same_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_signature_with_an_implementation_cannot_use_a_string_literal_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specialized_overload_signature_is_not_assignable_to_any_non_specialized_signature: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Overload_signatures_must_all_be_exported_or_not_exported: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Overload_signatures_must_all_be_ambient_or_non_ambient: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Overload_signatures_must_all_be_public_private_or_protected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Overload_signatures_must_all_be_optional_or_required: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Function_overload_must_be_static: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Function_overload_must_not_be_static: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Function_implementation_name_must_be_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Constructor_implementation_is_missing: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Function_implementation_is_missing_or_not_immediately_following_the_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Multiple_constructor_implementations_are_not_allowed: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_function_implementation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Overload_signature_is_not_compatible_with_function_implementation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Individual_declarations_in_merged_declaration_0_must_be_all_exported_or_all_local: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_identifier_arguments_Compiler_uses_arguments_to_initialize_rest_parameters: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Declaration_name_conflicts_with_built_in_global_identifier_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_identifier_this_Compiler_uses_variable_declaration_this_to_capture_this_reference: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Expression_resolves_to_variable_declaration_this_that_compiler_uses_to_capture_this_reference: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_identifier_super_Compiler_uses_super_to_capture_base_class_reference: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Expression_resolves_to_super_that_compiler_uses_to_capture_base_class_reference: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Subsequent_variable_declarations_must_have_the_same_type_Variable_0_must_be_of_type_1_but_here_has_type_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_a_for_in_statement_cannot_use_a_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_a_for_in_statement_must_be_of_type_string_or_any: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_left_hand_side_in_for_in_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_right_hand_side_of_a_for_in_statement_must_be_of_type_any_an_object_type_or_a_type_parameter: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Setters_cannot_return_a_value: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_constructor_signature_must_be_assignable_to_the_instance_type_of_the_class: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        All_symbols_within_a_with_block_will_be_resolved_to_any: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_of_type_1_is_not_assignable_to_string_index_type_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_of_type_1_is_not_assignable_to_numeric_index_type_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Numeric_index_type_0_is_not_assignable_to_string_index_type_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Class_name_cannot_be_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Class_0_incorrectly_extends_base_class_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Class_static_side_0_incorrectly_extends_base_class_static_side_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_name_0_in_extends_clause_does_not_reference_constructor_function_for_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Class_0_incorrectly_implements_interface_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_class_may_only_implement_another_class_or_interface: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Class_0_defines_instance_member_function_1_but_extended_class_2_defines_it_as_instance_member_accessor: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Class_0_defines_instance_member_function_1_but_extended_class_2_defines_it_as_instance_member_property: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Class_0_defines_instance_member_property_1_but_extended_class_2_defines_it_as_instance_member_function: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Class_0_defines_instance_member_accessor_1_but_extended_class_2_defines_it_as_instance_member_function: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Interface_name_cannot_be_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        All_declarations_of_an_interface_must_have_identical_type_parameters: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Interface_0_incorrectly_extends_interface_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Enum_name_cannot_be_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        In_an_enum_with_multiple_declarations_only_one_declaration_can_omit_an_initializer_for_its_first_enum_element: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_namespace_declaration_cannot_be_in_a_different_file_from_a_class_or_function_with_which_it_is_merged: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_namespace_declaration_cannot_be_located_prior_to_a_class_or_function_with_which_it_is_merged: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Ambient_modules_cannot_be_nested_in_other_modules_or_namespaces: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Ambient_module_declaration_cannot_specify_relative_module_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Module_0_is_hidden_by_a_local_declaration_with_the_same_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Import_name_cannot_be_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Import_or_export_declaration_in_an_ambient_module_declaration_cannot_reference_module_through_relative_module_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Import_declaration_conflicts_with_local_declaration_of_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_identifier_0_Compiler_reserves_name_1_in_top_level_scope_of_a_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Types_have_separate_declarations_of_a_private_property_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_is_protected_but_type_1_is_not_a_class_derived_from_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_is_protected_in_type_1_but_public_in_type_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_is_protected_and_only_accessible_within_class_1_and_its_subclasses: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_is_protected_and_only_accessible_through_an_instance_of_class_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_0_operator_is_not_allowed_for_boolean_types_Consider_using_1_instead: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Block_scoped_variable_0_used_before_its_declaration: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_operand_of_an_increment_or_decrement_operator_cannot_be_a_constant: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Left_hand_side_of_assignment_expression_cannot_be_a_constant: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_redeclare_block_scoped_variable_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_enum_member_cannot_have_a_numeric_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_type_argument_for_type_parameter_0_cannot_be_inferred_from_the_usage_Consider_specifying_the_type_arguments_explicitly: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_argument_candidate_1_is_not_a_valid_type_argument_because_it_is_not_a_supertype_of_candidate_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_alias_0_circularly_references_itself: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_alias_name_cannot_be_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_AMD_module_cannot_have_multiple_name_assignments: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_has_no_property_1_and_no_string_index_signature: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_has_no_property_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_is_not_an_array_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_rest_element_must_be_last_in_an_array_destructuring_pattern: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_binding_pattern_parameter_cannot_be_optional_in_an_implementation_signature: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_computed_property_name_must_be_of_type_string_number_symbol_or_any: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        this_cannot_be_referenced_in_a_computed_property_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        super_cannot_be_referenced_in_a_computed_property_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_computed_property_name_cannot_reference_a_type_parameter_from_its_containing_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_global_value_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_0_operator_cannot_be_applied_to_type_symbol: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Symbol_reference_does_not_refer_to_the_global_Symbol_constructor_object: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_computed_property_name_of_the_form_0_must_be_of_type_symbol: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Spread_operator_in_new_expressions_is_only_available_when_targeting_ECMAScript_5_and_higher: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Enum_declarations_must_all_be_const_or_non_const: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        In_const_enum_declarations_member_initializer_must_be_constant_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        const_enums_can_only_be_used_in_property_or_index_access_expressions_or_the_right_hand_side_of_an_import_declaration_or_export_assignment: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_const_enum_member_can_only_be_accessed_using_a_string_literal: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        const_enum_member_initializer_was_evaluated_to_a_non_finite_value: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        const_enum_member_initializer_was_evaluated_to_disallowed_value_NaN: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_does_not_exist_on_const_enum_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        let_is_not_allowed_to_be_used_as_a_name_in_let_or_const_declarations: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_initialize_outer_scoped_variable_0_in_the_same_scope_as_block_scoped_declaration_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_a_for_of_statement_cannot_use_a_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Export_declaration_conflicts_with_exported_declaration_of_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_a_for_of_statement_cannot_be_a_previously_defined_constant: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_a_for_in_statement_cannot_be_a_previously_defined_constant: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_left_hand_side_in_for_of_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_must_have_a_Symbol_iterator_method_that_returns_an_iterator: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_iterator_must_have_a_next_method: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_type_returned_by_the_next_method_of_an_iterator_must_have_a_value_property: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_left_hand_side_of_a_for_in_statement_cannot_be_a_destructuring_pattern: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_redeclare_identifier_0_in_catch_clause: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Tuple_type_0_with_length_1_cannot_be_assigned_to_tuple_with_length_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Using_a_string_in_a_for_of_statement_is_only_supported_in_ECMAScript_5_and_higher: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_is_not_an_array_type_or_a_string_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_arguments_object_cannot_be_referenced_in_an_arrow_function_in_ES3_and_ES5_Consider_using_a_standard_function_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Module_0_resolves_to_a_non_module_entity_and_cannot_be_imported_using_this_construct: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Module_0_uses_export_and_cannot_be_used_with_export_Asterisk: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_interface_can_only_extend_an_identifier_Slashqualified_name_with_optional_type_arguments: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_class_can_only_implement_an_identifier_Slashqualified_name_with_optional_type_arguments: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_rest_element_cannot_contain_a_binding_pattern: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_is_referenced_directly_or_indirectly_in_its_own_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_namespace_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        No_best_common_type_exists_among_yield_expressions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_generator_cannot_have_a_void_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_is_referenced_directly_or_indirectly_in_its_own_base_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_is_not_a_constructor_function_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        No_base_constructor_has_the_specified_number_of_type_arguments: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Base_constructor_return_type_0_is_not_a_class_or_interface_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Base_constructors_must_all_have_the_same_return_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_create_an_instance_of_the_abstract_class_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Overload_signatures_must_all_be_abstract_or_not_abstract: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Abstract_method_0_in_class_1_cannot_be_accessed_via_super_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Classes_containing_abstract_methods_must_be_marked_abstract: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Non_abstract_class_0_does_not_implement_inherited_abstract_member_1_from_class_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        All_declarations_of_an_abstract_method_must_be_consecutive: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_assign_an_abstract_constructor_type_to_a_non_abstract_constructor_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_this_based_type_guard_is_not_compatible_with_a_parameter_based_type_guard: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_identifier_0_Compiler_uses_declaration_1_to_support_async_functions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Expression_resolves_to_variable_declaration_0_that_compiler_uses_to_support_async_functions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_arguments_object_cannot_be_referenced_in_an_async_arrow_function_Consider_using_a_standard_async_function_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        yield_expressions_cannot_be_used_in_a_parameter_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        await_expressions_cannot_be_used_in_a_parameter_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Initializer_provides_no_value_for_this_binding_element_and_the_binding_element_has_no_default_value: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_this_type_is_available_only_in_a_non_static_member_of_a_class_or_interface: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_inferred_type_of_0_references_an_inaccessible_this_type_A_type_annotation_is_necessary: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_module_cannot_have_multiple_default_exports: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Duplicate_identifier_0_Compiler_reserves_name_1_in_top_level_scope_of_a_module_containing_async_functions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_element_attributes_type_0_may_not_be_a_union_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_return_type_of_a_JSX_element_constructor_must_return_an_object_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_element_implicitly_has_type_any_because_the_global_type_JSX_Element_does_not_exist: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_in_type_1_is_not_assignable_to_type_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_element_type_0_does_not_have_any_construct_or_call_signatures: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_element_type_0_is_not_a_constructor_function_for_JSX_elements: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_of_JSX_spread_attribute_is_not_assignable_to_target_property: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_element_class_does_not_support_attributes_because_it_does_not_have_a_0_property: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_global_type_JSX_0_may_not_have_more_than_one_property: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_emit_namespaced_JSX_elements_in_React: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_member_initializer_in_a_enum_declaration_cannot_reference_members_declared_after_it_including_members_defined_in_other_enums: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Merged_declaration_0_cannot_include_a_default_export_declaration_Consider_adding_a_separate_export_default_0_declaration_instead: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Non_abstract_class_expression_does_not_implement_inherited_abstract_member_0_from_class_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Exported_external_package_typings_file_cannot_contain_tripleslash_references_Please_contact_the_package_author_to_update_the_package_definition: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Exported_external_package_typings_file_0_is_not_a_module_Please_contact_the_package_author_to_update_the_package_definition: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_expressions_must_have_one_parent_element: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_0_provides_no_match_for_the_signature_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        super_is_only_allowed_in_members_of_object_literal_expressions_when_option_target_is_ES2015_or_higher: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        super_can_only_be_referenced_in_members_of_derived_classes_or_object_literal_expressions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_re_export_name_that_is_not_defined_in_the_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_name_0_Did_you_mean_the_static_member_1_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_name_0_Did_you_mean_the_instance_member_this_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalid_module_name_in_augmentation_module_0_cannot_be_found: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Module_augmentation_cannot_introduce_new_names_in_the_top_level_scope: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Exports_and_export_assignments_are_not_permitted_in_module_augmentations: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Imports_are_not_permitted_in_module_augmentations_Consider_moving_them_to_the_enclosing_external_module: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        export_modifier_cannot_be_applied_to_ambient_modules_and_module_augmentations_since_they_are_always_visible: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Augmentations_for_the_global_scope_can_only_be_directly_nested_in_external_modules_or_ambient_module_declarations: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Augmentations_for_the_global_scope_should_have_declare_modifier_unless_they_appear_in_already_ambient_context: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_augment_module_0_because_it_resolves_to_a_non_module_entity: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Import_declaration_0_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_of_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_of_exported_interface_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_of_constructor_signature_from_exported_interface_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_of_call_signature_from_exported_interface_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_of_public_static_method_from_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_of_public_method_from_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_of_method_from_exported_interface_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Type_parameter_0_of_exported_function_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Implements_clause_of_exported_class_0_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Extends_clause_of_exported_class_0_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Extends_clause_of_exported_interface_0_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Exported_variable_0_has_or_is_using_name_1_from_external_module_2_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Exported_variable_0_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Exported_variable_0_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Public_static_property_0_of_exported_class_has_or_is_using_name_1_from_external_module_2_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Public_static_property_0_of_exported_class_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Public_static_property_0_of_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Public_property_0_of_exported_class_has_or_is_using_name_1_from_external_module_2_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Public_property_0_of_exported_class_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Public_property_0_of_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_of_exported_interface_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_of_exported_interface_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_static_property_setter_from_exported_class_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_static_property_setter_from_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_property_setter_from_exported_class_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_property_setter_from_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_static_property_getter_from_exported_class_has_or_is_using_name_0_from_external_module_1_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_static_property_getter_from_exported_class_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_static_property_getter_from_exported_class_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_property_getter_from_exported_class_has_or_is_using_name_0_from_external_module_1_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_property_getter_from_exported_class_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_property_getter_from_exported_class_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_constructor_signature_from_exported_interface_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_constructor_signature_from_exported_interface_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_call_signature_from_exported_interface_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_call_signature_from_exported_interface_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_index_signature_from_exported_interface_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_index_signature_from_exported_interface_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_static_method_from_exported_class_has_or_is_using_name_0_from_external_module_1_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_static_method_from_exported_class_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_static_method_from_exported_class_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_method_from_exported_class_has_or_is_using_name_0_from_external_module_1_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_method_from_exported_class_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_public_method_from_exported_class_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_method_from_exported_interface_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_method_from_exported_interface_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_exported_function_has_or_is_using_name_0_from_external_module_1_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_exported_function_has_or_is_using_name_0_from_private_module_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Return_type_of_exported_function_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_constructor_from_exported_class_has_or_is_using_name_1_from_external_module_2_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_constructor_from_exported_class_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_constructor_from_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_constructor_signature_from_exported_interface_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_constructor_signature_from_exported_interface_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_call_signature_from_exported_interface_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_call_signature_from_exported_interface_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_static_method_from_exported_class_has_or_is_using_name_1_from_external_module_2_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_static_method_from_exported_class_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_static_method_from_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_method_from_exported_class_has_or_is_using_name_1_from_external_module_2_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_method_from_exported_class_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_public_method_from_exported_class_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_method_from_exported_interface_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_method_from_exported_interface_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_exported_function_has_or_is_using_name_1_from_external_module_2_but_cannot_be_named: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_exported_function_has_or_is_using_name_1_from_private_module_2: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_of_exported_function_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Exported_type_alias_0_has_or_is_using_private_name_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Default_export_of_the_module_has_or_is_using_private_name_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_current_host_does_not_support_the_0_option: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_the_common_subdirectory_path_for_the_input_files: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_read_file_0_Colon_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unsupported_file_encoding: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Failed_to_parse_file_0_Colon_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unknown_compiler_option_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Compiler_option_0_requires_a_value_of_type_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Could_not_write_file_0_Colon_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Option_project_cannot_be_mixed_with_source_files_on_a_command_line: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Option_isolatedModules_can_only_be_used_when_either_option_module_is_provided_or_option_target_is_ES2015_or_higher: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Option_inlineSources_can_only_be_used_when_either_option_inlineSourceMap_or_option_sourceMap_is_provided: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Option_0_cannot_be_specified_without_specifying_option_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Option_0_cannot_be_specified_with_option_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_tsconfig_json_file_is_already_defined_at_Colon_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_write_file_0_because_it_would_overwrite_input_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_write_file_0_because_it_would_be_overwritten_by_multiple_input_files: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_find_a_tsconfig_json_file_at_the_specified_directory_Colon_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        The_specified_path_does_not_exist_Colon_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Invalide_value_for_reactNamespace_0_is_not_a_valid_identifier: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Concatenate_and_emit_output_to_single_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Generates_corresponding_d_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specifies_the_location_where_debugger_should_locate_map_files_instead_of_generated_locations: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specifies_the_location_where_debugger_should_locate_TypeScript_files_instead_of_source_locations: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Watch_input_files: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Redirect_output_structure_to_the_directory: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Do_not_erase_const_enum_declarations_in_generated_code: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Do_not_emit_outputs_if_any_errors_were_reported: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Do_not_emit_comments_to_output: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Do_not_emit_outputs: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Allow_default_imports_from_modules_with_no_default_export_This_does_not_affect_code_emit_just_typechecking: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specify_ECMAScript_target_version_Colon_ES3_default_ES5_or_ES2015_experimental: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specify_module_code_generation_Colon_commonjs_amd_system_umd_or_es2015: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Print_this_message: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Print_the_compiler_s_version: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Compile_the_project_in_the_given_directory: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Syntax_Colon_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        options: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Examples_Colon_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Options_Colon: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Version_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Insert_command_line_options_and_files_from_a_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        File_change_detected_Starting_incremental_compilation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        KIND: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        FILE: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        VERSION: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        LOCATION: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        DIRECTORY: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Compilation_complete_Watching_for_file_changes: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Generates_corresponding_map_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Compiler_option_0_expects_an_argument: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unterminated_quoted_string_in_response_file_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Argument_for_module_option_must_be_commonjs_amd_system_umd_es2015_or_none: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Argument_for_target_option_must_be_ES3_ES5_or_ES2015: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Locale_must_be_of_the_form_language_or_language_territory_For_example_0_or_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unsupported_locale_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unable_to_open_file_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Corrupted_locale_file_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Raise_error_on_expressions_and_declarations_with_an_implied_any_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        File_0_not_found: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        File_0_has_unsupported_extension_The_only_supported_extensions_are_1: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Suppress_noImplicitAny_errors_for_indexing_objects_lacking_index_signatures: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Do_not_emit_declarations_for_code_that_has_an_internal_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specifies_the_root_directory_of_input_files_Use_to_control_the_output_directory_structure_with_outDir: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        File_0_is_not_under_rootDir_1_rootDir_is_expected_to_contain_all_source_files: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specifies_the_end_of_line_sequence_to_be_used_when_emitting_files_Colon_CRLF_dos_or_LF_unix: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        NEWLINE: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Argument_for_newLine_option_must_be_CRLF_or_LF: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Argument_for_moduleResolution_option_must_be_node_or_classic: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Enables_experimental_support_for_ES7_decorators: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Enables_experimental_support_for_emitting_type_metadata_for_decorators: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Enables_experimental_support_for_ES7_async_functions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specifies_module_resolution_strategy_Colon_node_Node_js_or_classic_TypeScript_pre_1_6: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Initializes_a_TypeScript_project_and_creates_a_tsconfig_json_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Successfully_created_a_tsconfig_json_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Suppress_excess_property_checks_for_object_literals: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Stylize_errors_and_messages_using_color_and_context_experimental: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Do_not_report_errors_on_unused_labels: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Report_error_when_not_all_code_paths_in_function_return_a_value: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Report_errors_for_fallthrough_cases_in_switch_statement: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Do_not_report_errors_on_unreachable_code: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Disallow_inconsistently_cased_references_to_the_same_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specify_JSX_code_generation_Colon_preserve_or_react: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Argument_for_jsx_must_be_preserve_or_react: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Only_amd_and_system_modules_are_supported_alongside_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Allow_javascript_files_to_be_compiled: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Specifies_the_object_invoked_for_createElement_and_spread_when_targeting_react_JSX_emit: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Option_0_should_have_array_of_strings_as_a_value: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Do_not_emit_use_strict_directives_in_module_output: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Variable_0_implicitly_has_an_1_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Parameter_0_implicitly_has_an_1_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Member_0_implicitly_has_an_1_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        new_expression_whose_target_lacks_a_construct_signature_implicitly_has_an_any_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_which_lacks_return_type_annotation_implicitly_has_an_1_return_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Function_expression_which_lacks_return_type_annotation_implicitly_has_an_0_return_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Construct_signature_which_lacks_return_type_annotation_implicitly_has_an_any_return_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Element_implicitly_has_an_any_type_because_index_expression_is_not_of_type_number: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Property_0_implicitly_has_type_any_because_its_set_accessor_lacks_a_type_annotation: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Index_signature_of_object_type_implicitly_has_an_any_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Object_literal_s_property_0_implicitly_has_an_1_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Rest_parameter_0_implicitly_has_an_any_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Call_signature_which_lacks_return_type_annotation_implicitly_has_an_any_return_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_implicitly_has_type_any_because_it_does_not_have_a_type_annotation_and_is_referenced_directly_or_indirectly_in_its_own_initializer: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_implicitly_has_return_type_any_because_it_does_not_have_a_return_type_annotation_and_is_referenced_directly_or_indirectly_in_one_of_its_return_expressions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Function_implicitly_has_return_type_any_because_it_does_not_have_a_return_type_annotation_and_is_referenced_directly_or_indirectly_in_one_of_its_return_expressions: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Generator_implicitly_has_type_0_because_it_does_not_yield_any_values_Consider_supplying_a_return_type: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_element_implicitly_has_type_any_because_no_interface_JSX_0_exists: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unreachable_code_detected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unused_label: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Fallthrough_case_in_switch: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Not_all_code_paths_return_a_value: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        You_cannot_rename_this_element: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        You_cannot_rename_elements_that_are_defined_in_the_standard_TypeScript_library: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        import_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        export_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        type_parameter_declarations_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        implements_clauses_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        interface_declarations_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        module_declarations_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        type_aliases_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        _0_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        types_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        type_arguments_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        parameter_modifiers_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        property_declarations_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        enum_declarations_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        type_assertion_expressions_can_only_be_used_in_a_ts_file: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Only_identifiers_Slashqualified_names_with_optional_type_arguments_are_currently_supported_in_a_class_extends_clauses: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        class_expressions_are_not_currently_supported: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_attributes_must_only_be_assigned_a_non_empty_expression: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_elements_cannot_have_multiple_attributes_with_the_same_name: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Expected_corresponding_JSX_closing_tag_for_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_attribute_expected: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Cannot_use_JSX_unless_the_jsx_flag_is_provided: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_constructor_cannot_contain_a_super_call_when_its_class_extends_null: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        An_unary_expression_with_the_0_operator_is_not_allowed_in_the_left_hand_side_of_an_exponentiation_expression_Consider_enclosing_the_expression_in_parentheses: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        A_type_assertion_expression_is_not_allowed_in_the_left_hand_side_of_an_exponentiation_expression_Consider_enclosing_the_expression_in_parentheses: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        JSX_element_0_has_no_corresponding_closing_tag: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        super_must_be_called_before_accessing_this_in_the_constructor_of_a_derived_class: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Unknown_typing_option_0: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
        Too_many_JavaScript_files_in_the_project_Consider_specifying_the_exclude_setting_in_project_configuration_to_limit_included_source_folders_The_likely_folder_to_exclude_is_0_To_disable_the_project_size_limit_set_the_disableSizeLimit_compiler_option_to_true: {
            code: number;
            category: DiagnosticCategory;
            key: string;
            message: string;
        };
    };
}
declare namespace ts {
    interface ErrorCallback {
        (message: DiagnosticMessage, length: number): void;
    }
    function tokenIsIdentifierOrKeyword(token: SyntaxKind): boolean;
    interface Scanner {
        getStartPos(): number;
        getToken(): SyntaxKind;
        getTextPos(): number;
        getTokenPos(): number;
        getTokenText(): string;
        getTokenValue(): string;
        hasExtendedUnicodeEscape(): boolean;
        hasPrecedingLineBreak(): boolean;
        isIdentifier(): boolean;
        isReservedWord(): boolean;
        isUnterminated(): boolean;
        reScanGreaterToken(): SyntaxKind;
        reScanSlashToken(): SyntaxKind;
        reScanTemplateToken(): SyntaxKind;
        scanJsxIdentifier(): SyntaxKind;
        reScanJsxToken(): SyntaxKind;
        scanJsxToken(): SyntaxKind;
        scanJSDocToken(): SyntaxKind;
        scan(): SyntaxKind;
        setText(text: string, start?: number, length?: number): void;
        setOnError(onError: ErrorCallback): void;
        setScriptTarget(scriptTarget: ScriptTarget): void;
        setLanguageVariant(variant: LanguageVariant): void;
        setTextPos(textPos: number): void;
        lookAhead<T>(callback: () => T): T;
        scanRange<T>(start: number, length: number, callback: () => T): T;
        tryScan<T>(callback: () => T): T;
    }
    function isUnicodeIdentifierStart(code: number, languageVersion: ScriptTarget): boolean;
    function tokenToString(t: SyntaxKind): string;
    function stringToToken(s: string): SyntaxKind;
    function computeLineStarts(text: string): number[];
    function getPositionOfLineAndCharacter(sourceFile: SourceFile, line: number, character: number): number;
    function computePositionOfLineAndCharacter(lineStarts: number[], line: number, character: number): number;
    function getLineStarts(sourceFile: SourceFile): number[];
    /**
     * We assume the first line starts at position 0 and 'position' is non-negative.
     */
    function computeLineAndCharacterOfPosition(lineStarts: number[], position: number): {
        line: number;
        character: number;
    };
    function getLineAndCharacterOfPosition(sourceFile: SourceFile, position: number): LineAndCharacter;
    function isWhiteSpace(ch: number): boolean;
    function isLineBreak(ch: number): boolean;
    function isOctalDigit(ch: number): boolean;
    function couldStartTrivia(text: string, pos: number): boolean;
    function skipTrivia(text: string, pos: number, stopAfterLineBreak?: boolean): number;
    function getLeadingCommentRanges(text: string, pos: number): CommentRange[];
    function getTrailingCommentRanges(text: string, pos: number): CommentRange[];
    /** Optionally, get the shebang */
    function getShebang(text: string): string;
    function isIdentifierStart(ch: number, languageVersion: ScriptTarget): boolean;
    function isIdentifierPart(ch: number, languageVersion: ScriptTarget): boolean;
    function isIdentifier(name: string, languageVersion: ScriptTarget): boolean;
    function createScanner(languageVersion: ScriptTarget, skipTrivia: boolean, languageVariant?: LanguageVariant, text?: string, onError?: ErrorCallback, start?: number, length?: number): Scanner;
}
declare namespace ts {
    let optionDeclarations: CommandLineOption[];
    interface OptionNameMap {
        optionNameMap: Map<CommandLineOption>;
        shortOptionNames: Map<string>;
    }
    function getOptionNameMap(): OptionNameMap;
    function parseCommandLine(commandLine: string[], readFile?: (path: string) => string): ParsedCommandLine;
    /**
      * Read tsconfig.json file
      * @param fileName The path to the config file
      */
    function readConfigFile(fileName: string, readFile: (path: string) => string): {
        config?: any;
        error?: Diagnostic;
    };
    /**
      * Parse the text of the tsconfig.json file
      * @param fileName The path to the config file
      * @param jsonText The text of the config file
      */
    function parseConfigFileTextToJson(fileName: string, jsonText: string): {
        config?: any;
        error?: Diagnostic;
    };
    /**
      * Parse the contents of a config file (tsconfig.json).
      * @param json The contents of the config file to parse
      * @param host Instance of ParseConfigHost used to enumerate files in folder.
      * @param basePath A root directory to resolve relative path entries in the config
      *    file to. e.g. outDir
      */
    function parseJsonConfigFileContent(json: any, host: ParseConfigHost, basePath: string, existingOptions?: CompilerOptions, configFileName?: string): ParsedCommandLine;
    function convertCompilerOptionsFromJson(jsonOptions: any, basePath: string, configFileName?: string): {
        options: CompilerOptions;
        errors: Diagnostic[];
    };
}
declare namespace ts {
    interface ReferencePathMatchResult {
        fileReference?: FileReference;
        diagnosticMessage?: DiagnosticMessage;
        isNoDefaultLib?: boolean;
    }
    interface SynthesizedNode extends Node {
        leadingCommentRanges?: CommentRange[];
        trailingCommentRanges?: CommentRange[];
        startsOnNewLine: boolean;
    }
    function getDeclarationOfKind(symbol: Symbol, kind: SyntaxKind): Declaration;
    interface StringSymbolWriter extends SymbolWriter {
        string(): string;
    }
    interface EmitHost extends ScriptReferenceHost {
        getSourceFiles(): SourceFile[];
        getCommonSourceDirectory(): string;
        getCanonicalFileName(fileName: string): string;
        getNewLine(): string;
        isEmitBlocked(emitFileName: string): boolean;
        writeFile: WriteFileCallback;
    }
    function getSingleLineStringWriter(): StringSymbolWriter;
    function releaseStringWriter(writer: StringSymbolWriter): void;
    function getFullWidth(node: Node): number;
    function arrayIsEqualTo<T>(array1: T[], array2: T[], equaler?: (a: T, b: T) => boolean): boolean;
    function hasResolvedModule(sourceFile: SourceFile, moduleNameText: string): boolean;
    function getResolvedModule(sourceFile: SourceFile, moduleNameText: string): ResolvedModule;
    function setResolvedModule(sourceFile: SourceFile, moduleNameText: string, resolvedModule: ResolvedModule): void;
    function containsParseError(node: Node): boolean;
    function getSourceFileOfNode(node: Node): SourceFile;
    function isStatementWithLocals(node: Node): boolean;
    function getStartPositionOfLine(line: number, sourceFile: SourceFile): number;
    function nodePosToString(node: Node): string;
    function getStartPosOfNode(node: Node): number;
    function nodeIsMissing(node: Node): boolean;
    function nodeIsPresent(node: Node): boolean;
    function getTokenPosOfNode(node: Node, sourceFile?: SourceFile): number;
    function getNonDecoratorTokenPosOfNode(node: Node, sourceFile?: SourceFile): number;
    function getSourceTextOfNodeFromSourceFile(sourceFile: SourceFile, node: Node, includeTrivia?: boolean): string;
    function getTextOfNodeFromSourceText(sourceText: string, node: Node): string;
    function getTextOfNode(node: Node, includeTrivia?: boolean): string;
    function escapeIdentifier(identifier: string): string;
    function unescapeIdentifier(identifier: string): string;
    function makeIdentifierFromModuleName(moduleName: string): string;
    function isBlockOrCatchScoped(declaration: Declaration): boolean;
    function isAmbientModule(node: Node): boolean;
    function isBlockScopedContainerTopLevel(node: Node): boolean;
    function isGlobalScopeAugmentation(module: ModuleDeclaration): boolean;
    function isExternalModuleAugmentation(node: Node): boolean;
    function getEnclosingBlockScopeContainer(node: Node): Node;
    function isCatchClauseVariableDeclaration(declaration: Declaration): boolean;
    function declarationNameToString(name: DeclarationName): string;
    function createDiagnosticForNode(node: Node, message: DiagnosticMessage, arg0?: any, arg1?: any, arg2?: any): Diagnostic;
    function createDiagnosticForNodeFromMessageChain(node: Node, messageChain: DiagnosticMessageChain): Diagnostic;
    function getSpanOfTokenAtPosition(sourceFile: SourceFile, pos: number): TextSpan;
    function getErrorSpanForNode(sourceFile: SourceFile, node: Node): TextSpan;
    function isExternalModule(file: SourceFile): boolean;
    function isExternalOrCommonJsModule(file: SourceFile): boolean;
    function isDeclarationFile(file: SourceFile): boolean;
    function isConstEnumDeclaration(node: Node): boolean;
    function getCombinedNodeFlags(node: Node): NodeFlags;
    function isConst(node: Node): boolean;
    function isLet(node: Node): boolean;
    function isSuperCallExpression(n: Node): boolean;
    function isPrologueDirective(node: Node): boolean;
    function getLeadingCommentRangesOfNode(node: Node, sourceFileOfNode: SourceFile): CommentRange[];
    function getLeadingCommentRangesOfNodeFromText(node: Node, text: string): CommentRange[];
    function getJsDocComments(node: Node, sourceFileOfNode: SourceFile): CommentRange[];
    function getJsDocCommentsFromText(node: Node, text: string): CommentRange[];
    let fullTripleSlashReferencePathRegEx: RegExp;
    let fullTripleSlashAMDReferencePathRegEx: RegExp;
    function isTypeNode(node: Node): boolean;
    function forEachReturnStatement<T>(body: Block, visitor: (stmt: ReturnStatement) => T): T;
    function forEachYieldExpression(body: Block, visitor: (expr: YieldExpression) => void): void;
    function isVariableLike(node: Node): node is VariableLikeDeclaration;
    function isAccessor(node: Node): node is AccessorDeclaration;
    function isClassLike(node: Node): node is ClassLikeDeclaration;
    function isFunctionLike(node: Node): node is FunctionLikeDeclaration;
    function isFunctionLikeKind(kind: SyntaxKind): boolean;
    function introducesArgumentsExoticObject(node: Node): boolean;
    function isIterationStatement(node: Node, lookInLabeledStatements: boolean): boolean;
    function isFunctionBlock(node: Node): boolean;
    function isObjectLiteralMethod(node: Node): node is MethodDeclaration;
    function isIdentifierTypePredicate(predicate: TypePredicate): predicate is IdentifierTypePredicate;
    function isThisTypePredicate(predicate: TypePredicate): predicate is ThisTypePredicate;
    function getContainingFunction(node: Node): FunctionLikeDeclaration;
    function getContainingClass(node: Node): ClassLikeDeclaration;
    function getThisContainer(node: Node, includeArrowFunctions: boolean): Node;
    /**
      * Given an super call\property node returns a closest node where either
      * - super call\property is legal in the node and not legal in the parent node the node.
      *   i.e. super call is legal in constructor but not legal in the class body.
      * - node is arrow function (so caller might need to call getSuperContainer in case it needs to climb higher)
      * - super call\property is definitely illegal in the node (but might be legal in some subnode)
      *   i.e. super property access is illegal in function declaration but can be legal in the statement list
      */
    function getSuperContainer(node: Node, stopOnFunctions: boolean): Node;
    /**
     * Determines whether a node is a property or element access expression for super.
     */
    function isSuperPropertyOrElementAccess(node: Node): boolean;
    function getEntityNameFromTypeNode(node: TypeNode): EntityName | Expression;
    function getInvokedExpression(node: CallLikeExpression): Expression;
    function nodeCanBeDecorated(node: Node): boolean;
    function nodeIsDecorated(node: Node): boolean;
    function isPropertyAccessExpression(node: Node): node is PropertyAccessExpression;
    function isElementAccessExpression(node: Node): node is ElementAccessExpression;
    function isExpression(node: Node): boolean;
    function isExternalModuleNameRelative(moduleName: string): boolean;
    function isInstantiatedModule(node: ModuleDeclaration, preserveConstEnums: boolean): boolean;
    function isExternalModuleImportEqualsDeclaration(node: Node): boolean;
    function getExternalModuleImportEqualsDeclarationExpression(node: Node): Expression;
    function isInternalModuleImportEqualsDeclaration(node: Node): node is ImportEqualsDeclaration;
    function isSourceFileJavaScript(file: SourceFile): boolean;
    function isInJavaScriptFile(node: Node): boolean;
    /**
     * Returns true if the node is a CallExpression to the identifier 'require' with
     * exactly one argument.
     * This function does not test if the node is in a JavaScript file or not.
    */
    function isRequireCall(expression: Node, checkArgumentIsStringLiteral: boolean): expression is CallExpression;
    function getSpecialPropertyAssignmentKind(expression: Node): SpecialPropertyAssignmentKind;
    function getExternalModuleName(node: Node): Expression;
    function hasQuestionToken(node: Node): boolean;
    function isJSDocConstructSignature(node: Node): boolean;
    function getJSDocTypeTag(node: Node): JSDocTypeTag;
    function getJSDocReturnTag(node: Node): JSDocReturnTag;
    function getJSDocTemplateTag(node: Node): JSDocTemplateTag;
    function getCorrespondingJSDocParameterTag(parameter: ParameterDeclaration): JSDocParameterTag;
    function hasRestParameter(s: SignatureDeclaration): boolean;
    function isRestParameter(node: ParameterDeclaration): boolean;
    function isLiteralKind(kind: SyntaxKind): boolean;
    function isTextualLiteralKind(kind: SyntaxKind): boolean;
    function isTemplateLiteralKind(kind: SyntaxKind): boolean;
    function isBindingPattern(node: Node): node is BindingPattern;
    function isNodeDescendentOf(node: Node, ancestor: Node): boolean;
    function isInAmbientContext(node: Node): boolean;
    function isDeclaration(node: Node): boolean;
    function isStatement(n: Node): boolean;
    function isClassElement(n: Node): boolean;
    function isDeclarationName(name: Node): name is Identifier | StringLiteral | LiteralExpression;
    function isIdentifierName(node: Identifier): boolean;
    function isAliasSymbolDeclaration(node: Node): boolean;
    function getClassExtendsHeritageClauseElement(node: ClassLikeDeclaration): ExpressionWithTypeArguments;
    function getClassImplementsHeritageClauseElements(node: ClassLikeDeclaration): NodeArray<ExpressionWithTypeArguments>;
    function getInterfaceBaseTypeNodes(node: InterfaceDeclaration): NodeArray<ExpressionWithTypeArguments>;
    function getHeritageClause(clauses: NodeArray<HeritageClause>, kind: SyntaxKind): HeritageClause;
    function tryResolveScriptReference(host: ScriptReferenceHost, sourceFile: SourceFile, reference: FileReference): SourceFile;
    function getAncestor(node: Node, kind: SyntaxKind): Node;
    function getFileReferenceFromReferencePath(comment: string, commentRange: CommentRange): ReferencePathMatchResult;
    function isKeyword(token: SyntaxKind): boolean;
    function isTrivia(token: SyntaxKind): boolean;
    function isAsyncFunctionLike(node: Node): boolean;
    function isStringOrNumericLiteral(kind: SyntaxKind): boolean;
    /**
     * A declaration has a dynamic name if both of the following are true:
     *   1. The declaration has a computed property name
     *   2. The computed name is *not* expressed as Symbol.<name>, where name
     *      is a property of the Symbol constructor that denotes a built in
     *      Symbol.
     */
    function hasDynamicName(declaration: Declaration): boolean;
    function isDynamicName(name: DeclarationName): boolean;
    /**
     * Checks if the expression is of the form:
     *    Symbol.name
     * where Symbol is literally the word "Symbol", and name is any identifierName
     */
    function isWellKnownSymbolSyntactically(node: Expression): boolean;
    function getPropertyNameForPropertyNameNode(name: DeclarationName): string;
    function getPropertyNameForKnownSymbolName(symbolName: string): string;
    /**
     * Includes the word "Symbol" with unicode escapes
     */
    function isESSymbolIdentifier(node: Node): boolean;
    function isModifierKind(token: SyntaxKind): boolean;
    function isParameterDeclaration(node: VariableLikeDeclaration): boolean;
    function getRootDeclaration(node: Node): Node;
    function nodeStartsNewLexicalEnvironment(n: Node): boolean;
    /**
     * Creates a shallow, memberwise clone of a node. The "kind", "pos", "end", "flags", and "parent"
     * properties are excluded by default, and can be provided via the "location", "flags", and
     * "parent" parameters.
     * @param node The node to clone.
     * @param location An optional TextRange to use to supply the new position.
     * @param flags The NodeFlags to use for the cloned node.
     * @param parent The parent for the new node.
     */
    function cloneNode<T extends Node>(node: T, location?: TextRange, flags?: NodeFlags, parent?: Node): T;
    /**
     * Creates a deep clone of an EntityName, with new parent pointers.
     * @param node The EntityName to clone.
     * @param parent The parent for the cloned node.
     */
    function cloneEntityName(node: EntityName, parent?: Node): EntityName;
    function isQualifiedName(node: Node): node is QualifiedName;
    function nodeIsSynthesized(node: Node): boolean;
    function createSynthesizedNode(kind: SyntaxKind, startsOnNewLine?: boolean): Node;
    function createSynthesizedNodeArray(): NodeArray<any>;
    function createDiagnosticCollection(): DiagnosticCollection;
    /**
     * Based heavily on the abstract 'Quote'/'QuoteJSONString' operation from ECMA-262 (24.3.2.2),
     * but augmented for a few select characters (e.g. lineSeparator, paragraphSeparator, nextLine)
     * Note that this doesn't actually wrap the input in double quotes.
     */
    function escapeString(s: string): string;
    function isIntrinsicJsxName(name: string): boolean;
    function escapeNonAsciiCharacters(s: string): string;
    interface EmitTextWriter {
        write(s: string): void;
        writeTextOfNode(text: string, node: Node): void;
        writeLine(): void;
        increaseIndent(): void;
        decreaseIndent(): void;
        getText(): string;
        rawWrite(s: string): void;
        writeLiteral(s: string): void;
        getTextPos(): number;
        getLine(): number;
        getColumn(): number;
        getIndent(): number;
        reset(): void;
    }
    function getIndentString(level: number): string;
    function getIndentSize(): number;
    function createTextWriter(newLine: String): EmitTextWriter;
    /**
     * Resolves a local path to a path which is absolute to the base of the emit
     */
    function getExternalModuleNameFromPath(host: EmitHost, fileName: string): string;
    function getOwnEmitOutputFilePath(sourceFile: SourceFile, host: EmitHost, extension: string): string;
    function getEmitScriptTarget(compilerOptions: CompilerOptions): ScriptTarget;
    function getEmitModuleKind(compilerOptions: CompilerOptions): ModuleKind;
    interface EmitFileNames {
        jsFilePath: string;
        sourceMapFilePath: string;
        declarationFilePath: string;
    }
    function forEachExpectedEmitFile(host: EmitHost, action: (emitFileNames: EmitFileNames, sourceFiles: SourceFile[], isBundledEmit: boolean) => void, targetSourceFile?: SourceFile): void;
    function getSourceFilePathInNewDir(sourceFile: SourceFile, host: EmitHost, newDirPath: string): string;
    function writeFile(host: EmitHost, diagnostics: DiagnosticCollection, fileName: string, data: string, writeByteOrderMark: boolean): void;
    function getLineOfLocalPosition(currentSourceFile: SourceFile, pos: number): number;
    function getLineOfLocalPositionFromLineMap(lineMap: number[], pos: number): number;
    function getFirstConstructorWithBody(node: ClassLikeDeclaration): ConstructorDeclaration;
    function getSetAccessorTypeAnnotationNode(accessor: AccessorDeclaration): TypeNode;
    function getAllAccessorDeclarations(declarations: NodeArray<Declaration>, accessor: AccessorDeclaration): {
        firstAccessor: AccessorDeclaration;
        secondAccessor: AccessorDeclaration;
        getAccessor: AccessorDeclaration;
        setAccessor: AccessorDeclaration;
    };
    function emitNewLineBeforeLeadingComments(lineMap: number[], writer: EmitTextWriter, node: TextRange, leadingComments: CommentRange[]): void;
    function emitComments(text: string, lineMap: number[], writer: EmitTextWriter, comments: CommentRange[], trailingSeparator: boolean, newLine: string, writeComment: (text: string, lineMap: number[], writer: EmitTextWriter, comment: CommentRange, newLine: string) => void): void;
    /**
     * Detached comment is a comment at the top of file or function body that is separated from
     * the next statement by space.
     */
    function emitDetachedComments(text: string, lineMap: number[], writer: EmitTextWriter, writeComment: (text: string, lineMap: number[], writer: EmitTextWriter, comment: CommentRange, newLine: string) => void, node: TextRange, newLine: string, removeComments: boolean): {
        nodePos: number;
        detachedCommentEndPos: number;
    };
    function writeCommentRange(text: string, lineMap: number[], writer: EmitTextWriter, comment: CommentRange, newLine: string): void;
    function modifierToFlag(token: SyntaxKind): NodeFlags;
    function isLeftHandSideExpression(expr: Expression): boolean;
    function isAssignmentOperator(token: SyntaxKind): boolean;
    function isExpressionWithTypeArgumentsInClassExtendsClause(node: Node): boolean;
    function isSupportedExpressionWithTypeArguments(node: ExpressionWithTypeArguments): boolean;
    function isRightSideOfQualifiedNameOrPropertyAccess(node: Node): boolean;
    function isEmptyObjectLiteralOrArrayLiteral(expression: Node): boolean;
    function getLocalSymbolForExportDefault(symbol: Symbol): Symbol;
    function hasJavaScriptFileExtension(fileName: string): boolean;
    function hasTypeScriptFileExtension(fileName: string): boolean;
    /**
     * Serialize an object graph into a JSON string. This is intended only for use on an acyclic graph
     * as the fallback implementation does not check for circular references by default.
     */
    const stringify: (value: any) => string;
    /**
     * Converts a string to a base-64 encoded ASCII string.
     */
    function convertToBase64(input: string): string;
    function convertToRelativePath(absoluteOrRelativePath: string, basePath: string, getCanonicalFileName: (path: string) => string): string;
    function getNewLineCharacter(options: CompilerOptions): string;
}
declare namespace ts {
    function getDefaultLibFileName(options: CompilerOptions): string;
    function textSpanEnd(span: TextSpan): number;
    function textSpanIsEmpty(span: TextSpan): boolean;
    function textSpanContainsPosition(span: TextSpan, position: number): boolean;
    function textSpanContainsTextSpan(span: TextSpan, other: TextSpan): boolean;
    function textSpanOverlapsWith(span: TextSpan, other: TextSpan): boolean;
    function textSpanOverlap(span1: TextSpan, span2: TextSpan): TextSpan;
    function textSpanIntersectsWithTextSpan(span: TextSpan, other: TextSpan): boolean;
    function textSpanIntersectsWith(span: TextSpan, start: number, length: number): boolean;
    function decodedTextSpanIntersectsWith(start1: number, length1: number, start2: number, length2: number): boolean;
    function textSpanIntersectsWithPosition(span: TextSpan, position: number): boolean;
    function textSpanIntersection(span1: TextSpan, span2: TextSpan): TextSpan;
    function createTextSpan(start: number, length: number): TextSpan;
    function createTextSpanFromBounds(start: number, end: number): TextSpan;
    function textChangeRangeNewSpan(range: TextChangeRange): TextSpan;
    function textChangeRangeIsUnchanged(range: TextChangeRange): boolean;
    function createTextChangeRange(span: TextSpan, newLength: number): TextChangeRange;
    let unchangedTextChangeRange: TextChangeRange;
    /**
     * Called to merge all the changes that occurred across several versions of a script snapshot
     * into a single change.  i.e. if a user keeps making successive edits to a script we will
     * have a text change from V1 to V2, V2 to V3, ..., Vn.
     *
     * This function will then merge those changes into a single change range valid between V1 and
     * Vn.
     */
    function collapseTextChangeRangesAcrossMultipleVersions(changes: TextChangeRange[]): TextChangeRange;
    function getTypeParameterOwner(d: Declaration): Declaration;
    function isParameterPropertyDeclaration(node: ParameterDeclaration): boolean;
}
declare namespace ts {
    let parseTime: number;
    function createNode(kind: SyntaxKind, pos?: number, end?: number): Node;
    function forEachChild<T>(node: Node, cbNode: (node: Node) => T, cbNodeArray?: (nodes: Node[]) => T): T;
    function createSourceFile(fileName: string, sourceText: string, languageVersion: ScriptTarget, setParentNodes?: boolean, scriptKind?: ScriptKind): SourceFile;
    function updateSourceFile(sourceFile: SourceFile, newText: string, textChangeRange: TextChangeRange, aggressiveChecks?: boolean): SourceFile;
    function parseIsolatedJSDocComment(content: string, start?: number, length?: number): {
        jsDocComment: JSDocComment;
        diagnostics: Diagnostic[];
    };
    function parseJSDocTypeExpressionForTests(content: string, start?: number, length?: number): {
        jsDocTypeExpression: JSDocTypeExpression;
        diagnostics: Diagnostic[];
    };
}
declare namespace ts {
    let bindTime: number;
    const enum ModuleInstanceState {
        NonInstantiated = 0,
        Instantiated = 1,
        ConstEnumOnly = 2,
    }
    function getModuleInstanceState(node: Node): ModuleInstanceState;
    function bindSourceFile(file: SourceFile, options: CompilerOptions): void;
}
declare namespace ts {
    function getNodeId(node: Node): number;
    let checkTime: number;
    function getSymbolId(symbol: Symbol): number;
    function createTypeChecker(host: TypeCheckerHost, produceDiagnostics: boolean): TypeChecker;
}
declare namespace ts {
    interface SourceMapWriter {
        getSourceMapData(): SourceMapData;
        setSourceFile(sourceFile: SourceFile): void;
        emitPos(pos: number): void;
        emitStart(range: TextRange): void;
        emitEnd(range: TextRange, stopOverridingSpan?: boolean): void;
        changeEmitSourcePos(): void;
        getText(): string;
        getSourceMappingURL(): string;
        initialize(filePath: string, sourceMapFilePath: string, sourceFiles: SourceFile[], isBundledEmit: boolean): void;
        reset(): void;
    }
    function getNullSourceMapWriter(): SourceMapWriter;
    function createSourceMapWriter(host: EmitHost, writer: EmitTextWriter): SourceMapWriter;
}
declare namespace ts {
    function getDeclarationDiagnostics(host: EmitHost, resolver: EmitResolver, targetSourceFile: SourceFile): Diagnostic[];
    function writeDeclarationFile(declarationFilePath: string, sourceFiles: SourceFile[], isBundledEmit: boolean, host: EmitHost, resolver: EmitResolver, emitterDiagnostics: DiagnosticCollection): boolean;
}
declare namespace ts {
    function getResolvedExternalModuleName(host: EmitHost, file: SourceFile): string;
    function getExternalModuleNameFromDeclaration(host: EmitHost, resolver: EmitResolver, declaration: ImportEqualsDeclaration | ImportDeclaration | ExportDeclaration): string;
    function emitFiles(resolver: EmitResolver, host: EmitHost, targetSourceFile: SourceFile): EmitResult;
}
declare namespace ts {
    let programTime: number;
    let emitTime: number;
    let ioReadTime: number;
    let ioWriteTime: number;
    const maxProgramSizeForNonTsFiles: number;
    const version: string;
    function findConfigFile(searchPath: string, fileExists: (fileName: string) => boolean): string;
    function resolveTripleslashReference(moduleName: string, containingFile: string): string;
    function resolveModuleName(moduleName: string, containingFile: string, compilerOptions: CompilerOptions, host: ModuleResolutionHost): ResolvedModuleWithFailedLookupLocations;
    function nodeModuleNameResolver(moduleName: string, containingFile: string, compilerOptions: CompilerOptions, host: ModuleResolutionHost): ResolvedModuleWithFailedLookupLocations;
    function directoryProbablyExists(directoryName: string, host: {
        directoryExists?: (directoryName: string) => boolean;
    }): boolean;
    function classicNameResolver(moduleName: string, containingFile: string, compilerOptions: CompilerOptions, host: ModuleResolutionHost): ResolvedModuleWithFailedLookupLocations;
    const defaultInitCompilerOptions: CompilerOptions;
    function createCompilerHost(options: CompilerOptions, setParentNodes?: boolean): CompilerHost;
    function getPreEmitDiagnostics(program: Program, sourceFile?: SourceFile, cancellationToken?: CancellationToken): Diagnostic[];
    function flattenDiagnosticMessageText(messageText: string | DiagnosticMessageChain, newLine: string): string;
    function createProgram(rootNames: string[], options: CompilerOptions, host?: CompilerHost, oldProgram?: Program): Program;
}
declare namespace ts.BreakpointResolver {
    /**
     * Get the breakpoint span in given sourceFile
     */
    function spanInSourceFileAtLocation(sourceFile: SourceFile, position: number): TextSpan;
}
declare namespace ts.OutliningElementsCollector {
    function collectElements(sourceFile: SourceFile): OutliningSpan[];
}
declare namespace ts.NavigateTo {
    function getNavigateToItems(program: Program, cancellationToken: CancellationToken, searchValue: string, maxResultCount: number): NavigateToItem[];
}
declare namespace ts.NavigationBar {
    function getNavigationBarItems(sourceFile: SourceFile, compilerOptions: CompilerOptions): ts.NavigationBarItem[];
    function getJsNavigationBarItems(sourceFile: SourceFile, compilerOptions: CompilerOptions): NavigationBarItem[];
}
declare namespace ts {
    enum PatternMatchKind {
        exact = 0,
        prefix = 1,
        substring = 2,
        camelCase = 3,
    }
    interface PatternMatch {
        kind: PatternMatchKind;
        camelCaseWeight?: number;
        isCaseSensitive: boolean;
        punctuationStripped: boolean;
    }
    interface PatternMatcher {
        getMatchesForLastSegmentOfPattern(candidate: string): PatternMatch[];
        getMatches(candidateContainers: string[], candidate: string): PatternMatch[];
        patternContainsDots: boolean;
    }
    function createPatternMatcher(pattern: string): PatternMatcher;
    function breakIntoCharacterSpans(identifier: string): TextSpan[];
    function breakIntoWordSpans(identifier: string): TextSpan[];
}
declare namespace ts.SignatureHelp {
    function getSignatureHelpItems(program: Program, sourceFile: SourceFile, position: number, cancellationToken: CancellationToken): SignatureHelpItems;
}
declare namespace ts {
    interface ListItemInfo {
        listItemIndex: number;
        list: Node;
    }
    function getEndLinePosition(line: number, sourceFile: SourceFile): number;
    function getLineStartPositionForPosition(position: number, sourceFile: SourceFile): number;
    function rangeContainsRange(r1: TextRange, r2: TextRange): boolean;
    function startEndContainsRange(start: number, end: number, range: TextRange): boolean;
    function rangeContainsStartEnd(range: TextRange, start: number, end: number): boolean;
    function rangeOverlapsWithStartEnd(r1: TextRange, start: number, end: number): boolean;
    function startEndOverlapsWithStartEnd(start1: number, end1: number, start2: number, end2: number): boolean;
    function positionBelongsToNode(candidate: Node, position: number, sourceFile: SourceFile): boolean;
    function isCompletedNode(n: Node, sourceFile: SourceFile): boolean;
    function findListItemInfo(node: Node): ListItemInfo;
    function hasChildOfKind(n: Node, kind: SyntaxKind, sourceFile?: SourceFile): boolean;
    function findChildOfKind(n: Node, kind: SyntaxKind, sourceFile?: SourceFile): Node;
    function findContainingList(node: Node): Node;
    function getTouchingWord(sourceFile: SourceFile, position: number): Node;
    function getTouchingPropertyName(sourceFile: SourceFile, position: number): Node;
    /** Returns the token if position is in [start, end) or if position === end and includeItemAtEndPosition(token) === true */
    function getTouchingToken(sourceFile: SourceFile, position: number, includeItemAtEndPosition?: (n: Node) => boolean): Node;
    /** Returns a token if position is in [start-of-leading-trivia, end) */
    function getTokenAtPosition(sourceFile: SourceFile, position: number): Node;
    /**
      * The token on the left of the position is the token that strictly includes the position
      * or sits to the left of the cursor if it is on a boundary. For example
      *
      *   fo|o               -> will return foo
      *   foo <comment> |bar -> will return foo
      *
      */
    function findTokenOnLeftOfPosition(file: SourceFile, position: number): Node;
    function findNextToken(previousToken: Node, parent: Node): Node;
    function findPrecedingToken(position: number, sourceFile: SourceFile, startNode?: Node): Node;
    function isInString(sourceFile: SourceFile, position: number): boolean;
    function isInComment(sourceFile: SourceFile, position: number): boolean;
    /**
     * Returns true if the cursor at position in sourceFile is within a comment that additionally
     * satisfies predicate, and false otherwise.
     */
    function isInCommentHelper(sourceFile: SourceFile, position: number, predicate?: (c: CommentRange) => boolean): boolean;
    function hasDocComment(sourceFile: SourceFile, position: number): boolean;
    /**
     * Get the corresponding JSDocTag node if the position is in a jsDoc comment
     */
    function getJsDocTagAtPosition(sourceFile: SourceFile, position: number): JSDocTag;
    function getNodeModifiers(node: Node): string;
    function getTypeArgumentOrTypeParameterList(node: Node): NodeArray<Node>;
    function isToken(n: Node): boolean;
    function isWord(kind: SyntaxKind): boolean;
    function isComment(kind: SyntaxKind): boolean;
    function isStringOrRegularExpressionOrTemplateLiteral(kind: SyntaxKind): boolean;
    function isPunctuation(kind: SyntaxKind): boolean;
    function isInsideTemplateLiteral(node: LiteralExpression, position: number): boolean;
    function isAccessibilityModifier(kind: SyntaxKind): boolean;
    function compareDataObjects(dst: any, src: any): boolean;
    function isArrayLiteralOrObjectLiteralDestructuringPattern(node: Node): boolean;
}
declare namespace ts {
    function isFirstDeclarationOfSymbolParameter(symbol: Symbol): boolean;
    function symbolPart(text: string, symbol: Symbol): SymbolDisplayPart;
    function displayPart(text: string, kind: SymbolDisplayPartKind, symbol?: Symbol): SymbolDisplayPart;
    function spacePart(): SymbolDisplayPart;
    function keywordPart(kind: SyntaxKind): SymbolDisplayPart;
    function punctuationPart(kind: SyntaxKind): SymbolDisplayPart;
    function operatorPart(kind: SyntaxKind): SymbolDisplayPart;
    function textOrKeywordPart(text: string): SymbolDisplayPart;
    function textPart(text: string): SymbolDisplayPart;
    /**
     * The default is CRLF.
     */
    function getNewLineOrDefaultFromHost(host: LanguageServiceHost | LanguageServiceShimHost): string;
    function lineBreakPart(): SymbolDisplayPart;
    function mapToDisplayParts(writeDisplayParts: (writer: DisplayPartsSymbolWriter) => void): SymbolDisplayPart[];
    function typeToDisplayParts(typechecker: TypeChecker, type: Type, enclosingDeclaration?: Node, flags?: TypeFormatFlags): SymbolDisplayPart[];
    function symbolToDisplayParts(typeChecker: TypeChecker, symbol: Symbol, enclosingDeclaration?: Node, meaning?: SymbolFlags, flags?: SymbolFormatFlags): SymbolDisplayPart[];
    function signatureToDisplayParts(typechecker: TypeChecker, signature: Signature, enclosingDeclaration?: Node, flags?: TypeFormatFlags): SymbolDisplayPart[];
    function getDeclaredName(typeChecker: TypeChecker, symbol: Symbol, location: Node): string;
    function isImportOrExportSpecifierName(location: Node): boolean;
    /**
     * Strip off existed single quotes or double quotes from a given string
     *
     * @return non-quoted string
     */
    function stripQuotes(name: string): string;
    function scriptKindIs(fileName: string, host: LanguageServiceHost, ...scriptKinds: ScriptKind[]): boolean;
    function getScriptKind(fileName: string, host?: LanguageServiceHost): ScriptKind;
}
declare namespace ts.JsTyping {
    interface TypingResolutionHost {
        directoryExists: (path: string) => boolean;
        fileExists: (fileName: string) => boolean;
        readFile: (path: string, encoding?: string) => string;
        readDirectory: (path: string, extension?: string, exclude?: string[], depth?: number) => string[];
    }
    /**
     * @param host is the object providing I/O related operations.
     * @param fileNames are the file names that belong to the same project
     * @param projectRootPath is the path to the project root directory
     * @param safeListPath is the path used to retrieve the safe list
     * @param packageNameToTypingLocation is the map of package names to their cached typing locations
     * @param typingOptions are used to customize the typing inference process
     * @param compilerOptions are used as a source for typing inference
     */
    function discoverTypings(host: TypingResolutionHost, fileNames: string[], projectRootPath: Path, safeListPath: Path, packageNameToTypingLocation: Map<string>, typingOptions: TypingOptions, compilerOptions: CompilerOptions): {
        cachedTypingPaths: string[];
        newTypingNames: string[];
        filesToWatch: string[];
    };
}
declare namespace ts.formatting {
    interface FormattingScanner {
        advance(): void;
        isOnToken(): boolean;
        readTokenInfo(n: Node): TokenInfo;
        getCurrentLeadingTrivia(): TextRangeWithKind[];
        lastTrailingTriviaWasNewLine(): boolean;
        close(): void;
    }
    function getFormattingScanner(sourceFile: SourceFile, startPos: number, endPos: number): FormattingScanner;
}
declare namespace ts.formatting {
    class FormattingContext {
        sourceFile: SourceFile;
        formattingRequestKind: FormattingRequestKind;
        currentTokenSpan: TextRangeWithKind;
        nextTokenSpan: TextRangeWithKind;
        contextNode: Node;
        currentTokenParent: Node;
        nextTokenParent: Node;
        private contextNodeAllOnSameLine;
        private nextNodeAllOnSameLine;
        private tokensAreOnSameLine;
        private contextNodeBlockIsOnOneLine;
        private nextNodeBlockIsOnOneLine;
        constructor(sourceFile: SourceFile, formattingRequestKind: FormattingRequestKind);
        updateContext(currentRange: TextRangeWithKind, currentTokenParent: Node, nextRange: TextRangeWithKind, nextTokenParent: Node, commonParent: Node): void;
        ContextNodeAllOnSameLine(): boolean;
        NextNodeAllOnSameLine(): boolean;
        TokensAreOnSameLine(): boolean;
        ContextNodeBlockIsOnOneLine(): boolean;
        NextNodeBlockIsOnOneLine(): boolean;
        private NodeIsOnOneLine(node);
        private BlockIsOnOneLine(node);
    }
}
declare namespace ts.formatting {
    const enum FormattingRequestKind {
        FormatDocument = 0,
        FormatSelection = 1,
        FormatOnEnter = 2,
        FormatOnSemicolon = 3,
        FormatOnClosingCurlyBrace = 4,
    }
}
declare namespace ts.formatting {
    class Rule {
        Descriptor: RuleDescriptor;
        Operation: RuleOperation;
        Flag: RuleFlags;
        constructor(Descriptor: RuleDescriptor, Operation: RuleOperation, Flag?: RuleFlags);
        toString(): string;
    }
}
declare namespace ts.formatting {
    const enum RuleAction {
        Ignore = 1,
        Space = 2,
        NewLine = 4,
        Delete = 8,
    }
}
declare namespace ts.formatting {
    class RuleDescriptor {
        LeftTokenRange: Shared.TokenRange;
        RightTokenRange: Shared.TokenRange;
        constructor(LeftTokenRange: Shared.TokenRange, RightTokenRange: Shared.TokenRange);
        toString(): string;
        static create1(left: SyntaxKind, right: SyntaxKind): RuleDescriptor;
        static create2(left: Shared.TokenRange, right: SyntaxKind): RuleDescriptor;
        static create3(left: SyntaxKind, right: Shared.TokenRange): RuleDescriptor;
        static create4(left: Shared.TokenRange, right: Shared.TokenRange): RuleDescriptor;
    }
}
declare namespace ts.formatting {
    const enum RuleFlags {
        None = 0,
        CanDeleteNewLines = 1,
    }
}
declare namespace ts.formatting {
    class RuleOperation {
        Context: RuleOperationContext;
        Action: RuleAction;
        constructor();
        toString(): string;
        static create1(action: RuleAction): RuleOperation;
        static create2(context: RuleOperationContext, action: RuleAction): RuleOperation;
    }
}
declare namespace ts.formatting {
    class RuleOperationContext {
        private customContextChecks;
        constructor(...funcs: {
            (context: FormattingContext): boolean;
        }[]);
        static Any: RuleOperationContext;
        IsAny(): boolean;
        InContext(context: FormattingContext): boolean;
    }
}
declare namespace ts.formatting {
    class Rules {
        getRuleName(rule: Rule): string;
        [name: string]: any;
        IgnoreBeforeComment: Rule;
        IgnoreAfterLineComment: Rule;
        NoSpaceBeforeSemicolon: Rule;
        NoSpaceBeforeColon: Rule;
        NoSpaceBeforeQuestionMark: Rule;
        SpaceAfterColon: Rule;
        SpaceAfterQuestionMarkInConditionalOperator: Rule;
        NoSpaceAfterQuestionMark: Rule;
        SpaceAfterSemicolon: Rule;
        SpaceAfterCloseBrace: Rule;
        SpaceBetweenCloseBraceAndElse: Rule;
        SpaceBetweenCloseBraceAndWhile: Rule;
        NoSpaceAfterCloseBrace: Rule;
        NoSpaceBeforeDot: Rule;
        NoSpaceAfterDot: Rule;
        NoSpaceBeforeOpenBracket: Rule;
        NoSpaceAfterCloseBracket: Rule;
        SpaceAfterOpenBrace: Rule;
        SpaceBeforeCloseBrace: Rule;
        NoSpaceBetweenEmptyBraceBrackets: Rule;
        NewLineAfterOpenBraceInBlockContext: Rule;
        NewLineBeforeCloseBraceInBlockContext: Rule;
        NoSpaceAfterUnaryPrefixOperator: Rule;
        NoSpaceAfterUnaryPreincrementOperator: Rule;
        NoSpaceAfterUnaryPredecrementOperator: Rule;
        NoSpaceBeforeUnaryPostincrementOperator: Rule;
        NoSpaceBeforeUnaryPostdecrementOperator: Rule;
        SpaceAfterPostincrementWhenFollowedByAdd: Rule;
        SpaceAfterAddWhenFollowedByUnaryPlus: Rule;
        SpaceAfterAddWhenFollowedByPreincrement: Rule;
        SpaceAfterPostdecrementWhenFollowedBySubtract: Rule;
        SpaceAfterSubtractWhenFollowedByUnaryMinus: Rule;
        SpaceAfterSubtractWhenFollowedByPredecrement: Rule;
        NoSpaceBeforeComma: Rule;
        SpaceAfterCertainKeywords: Rule;
        SpaceAfterLetConstInVariableDeclaration: Rule;
        NoSpaceBeforeOpenParenInFuncCall: Rule;
        SpaceAfterFunctionInFuncDecl: Rule;
        NoSpaceBeforeOpenParenInFuncDecl: Rule;
        SpaceAfterVoidOperator: Rule;
        NoSpaceBetweenReturnAndSemicolon: Rule;
        SpaceBetweenStatements: Rule;
        SpaceAfterTryFinally: Rule;
        SpaceAfterGetSetInMember: Rule;
        SpaceBeforeBinaryKeywordOperator: Rule;
        SpaceAfterBinaryKeywordOperator: Rule;
        NoSpaceAfterConstructor: Rule;
        NoSpaceAfterModuleImport: Rule;
        SpaceAfterCertainTypeScriptKeywords: Rule;
        SpaceBeforeCertainTypeScriptKeywords: Rule;
        SpaceAfterModuleName: Rule;
        SpaceBeforeArrow: Rule;
        SpaceAfterArrow: Rule;
        NoSpaceAfterEllipsis: Rule;
        NoSpaceAfterOptionalParameters: Rule;
        NoSpaceBeforeOpenAngularBracket: Rule;
        NoSpaceBetweenCloseParenAndAngularBracket: Rule;
        NoSpaceAfterOpenAngularBracket: Rule;
        NoSpaceBeforeCloseAngularBracket: Rule;
        NoSpaceAfterCloseAngularBracket: Rule;
        NoSpaceAfterTypeAssertion: Rule;
        NoSpaceBetweenEmptyInterfaceBraceBrackets: Rule;
        HighPriorityCommonRules: Rule[];
        LowPriorityCommonRules: Rule[];
        SpaceAfterComma: Rule;
        NoSpaceAfterComma: Rule;
        SpaceBeforeBinaryOperator: Rule;
        SpaceAfterBinaryOperator: Rule;
        NoSpaceBeforeBinaryOperator: Rule;
        NoSpaceAfterBinaryOperator: Rule;
        SpaceAfterKeywordInControl: Rule;
        NoSpaceAfterKeywordInControl: Rule;
        FunctionOpenBraceLeftTokenRange: Shared.TokenRange;
        SpaceBeforeOpenBraceInFunction: Rule;
        NewLineBeforeOpenBraceInFunction: Rule;
        TypeScriptOpenBraceLeftTokenRange: Shared.TokenRange;
        SpaceBeforeOpenBraceInTypeScriptDeclWithBlock: Rule;
        NewLineBeforeOpenBraceInTypeScriptDeclWithBlock: Rule;
        ControlOpenBraceLeftTokenRange: Shared.TokenRange;
        SpaceBeforeOpenBraceInControl: Rule;
        NewLineBeforeOpenBraceInControl: Rule;
        SpaceAfterSemicolonInFor: Rule;
        NoSpaceAfterSemicolonInFor: Rule;
        SpaceAfterOpenParen: Rule;
        SpaceBeforeCloseParen: Rule;
        NoSpaceBetweenParens: Rule;
        NoSpaceAfterOpenParen: Rule;
        NoSpaceBeforeCloseParen: Rule;
        SpaceAfterOpenBracket: Rule;
        SpaceBeforeCloseBracket: Rule;
        NoSpaceBetweenBrackets: Rule;
        NoSpaceAfterOpenBracket: Rule;
        NoSpaceBeforeCloseBracket: Rule;
        SpaceAfterAnonymousFunctionKeyword: Rule;
        NoSpaceAfterAnonymousFunctionKeyword: Rule;
        SpaceBeforeAt: Rule;
        NoSpaceAfterAt: Rule;
        SpaceAfterDecorator: Rule;
        NoSpaceBetweenFunctionKeywordAndStar: Rule;
        SpaceAfterStarInGeneratorDeclaration: Rule;
        NoSpaceBetweenYieldKeywordAndStar: Rule;
        SpaceBetweenYieldOrYieldStarAndOperand: Rule;
        SpaceBetweenAsyncAndOpenParen: Rule;
        SpaceBetweenAsyncAndFunctionKeyword: Rule;
        NoSpaceBetweenTagAndTemplateString: Rule;
        NoSpaceAfterTemplateHeadAndMiddle: Rule;
        SpaceAfterTemplateHeadAndMiddle: Rule;
        NoSpaceBeforeTemplateMiddleAndTail: Rule;
        SpaceBeforeTemplateMiddleAndTail: Rule;
        constructor();
        static IsForContext(context: FormattingContext): boolean;
        static IsNotForContext(context: FormattingContext): boolean;
        static IsBinaryOpContext(context: FormattingContext): boolean;
        static IsNotBinaryOpContext(context: FormattingContext): boolean;
        static IsConditionalOperatorContext(context: FormattingContext): boolean;
        static IsSameLineTokenOrBeforeMultilineBlockContext(context: FormattingContext): boolean;
        static IsBeforeMultilineBlockContext(context: FormattingContext): boolean;
        static IsMultilineBlockContext(context: FormattingContext): boolean;
        static IsSingleLineBlockContext(context: FormattingContext): boolean;
        static IsBlockContext(context: FormattingContext): boolean;
        static IsBeforeBlockContext(context: FormattingContext): boolean;
        static NodeIsBlockContext(node: Node): boolean;
        static IsFunctionDeclContext(context: FormattingContext): boolean;
        static IsFunctionDeclarationOrFunctionExpressionContext(context: FormattingContext): boolean;
        static IsTypeScriptDeclWithBlockContext(context: FormattingContext): boolean;
        static NodeIsTypeScriptDeclWithBlockContext(node: Node): boolean;
        static IsAfterCodeBlockContext(context: FormattingContext): boolean;
        static IsControlDeclContext(context: FormattingContext): boolean;
        static IsObjectContext(context: FormattingContext): boolean;
        static IsFunctionCallContext(context: FormattingContext): boolean;
        static IsNewContext(context: FormattingContext): boolean;
        static IsFunctionCallOrNewContext(context: FormattingContext): boolean;
        static IsPreviousTokenNotComma(context: FormattingContext): boolean;
        static IsNextTokenNotCloseBracket(context: FormattingContext): boolean;
        static IsArrowFunctionContext(context: FormattingContext): boolean;
        static IsSameLineTokenContext(context: FormattingContext): boolean;
        static IsNotBeforeBlockInFunctionDeclarationContext(context: FormattingContext): boolean;
        static IsEndOfDecoratorContextOnSameLine(context: FormattingContext): boolean;
        static NodeIsInDecoratorContext(node: Node): boolean;
        static IsStartOfVariableDeclarationList(context: FormattingContext): boolean;
        static IsNotFormatOnEnter(context: FormattingContext): boolean;
        static IsModuleDeclContext(context: FormattingContext): boolean;
        static IsObjectTypeContext(context: FormattingContext): boolean;
        static IsTypeArgumentOrParameterOrAssertion(token: TextRangeWithKind, parent: Node): boolean;
        static IsTypeArgumentOrParameterOrAssertionContext(context: FormattingContext): boolean;
        static IsTypeAssertionContext(context: FormattingContext): boolean;
        static IsVoidOpContext(context: FormattingContext): boolean;
        static IsYieldOrYieldStarWithOperand(context: FormattingContext): boolean;
    }
}
declare namespace ts.formatting {
    class RulesMap {
        map: RulesBucket[];
        mapRowLength: number;
        constructor();
        static create(rules: Rule[]): RulesMap;
        Initialize(rules: Rule[]): RulesBucket[];
        FillRules(rules: Rule[], rulesBucketConstructionStateList: RulesBucketConstructionState[]): void;
        private GetRuleBucketIndex(row, column);
        private FillRule(rule, rulesBucketConstructionStateList);
        GetRule(context: FormattingContext): Rule;
    }
    enum RulesPosition {
        IgnoreRulesSpecific = 0,
        IgnoreRulesAny,
        ContextRulesSpecific,
        ContextRulesAny,
        NoContextRulesSpecific,
        NoContextRulesAny,
    }
    class RulesBucketConstructionState {
        private rulesInsertionIndexBitmap;
        constructor();
        GetInsertionIndex(maskPosition: RulesPosition): number;
        IncreaseInsertionIndex(maskPosition: RulesPosition): void;
    }
    class RulesBucket {
        private rules;
        constructor();
        Rules(): Rule[];
        AddRule(rule: Rule, specificTokens: boolean, constructionState: RulesBucketConstructionState[], rulesBucketIndex: number): void;
    }
}
declare namespace ts.formatting {
    module Shared {
        interface ITokenAccess {
            GetTokens(): SyntaxKind[];
            Contains(token: SyntaxKind): boolean;
        }
        class TokenRangeAccess implements ITokenAccess {
            private tokens;
            constructor(from: SyntaxKind, to: SyntaxKind, except: SyntaxKind[]);
            GetTokens(): SyntaxKind[];
            Contains(token: SyntaxKind): boolean;
        }
        class TokenValuesAccess implements ITokenAccess {
            private tokens;
            constructor(tks: SyntaxKind[]);
            GetTokens(): SyntaxKind[];
            Contains(token: SyntaxKind): boolean;
        }
        class TokenSingleValueAccess implements ITokenAccess {
            token: SyntaxKind;
            constructor(token: SyntaxKind);
            GetTokens(): SyntaxKind[];
            Contains(tokenValue: SyntaxKind): boolean;
        }
        class TokenAllAccess implements ITokenAccess {
            GetTokens(): SyntaxKind[];
            Contains(tokenValue: SyntaxKind): boolean;
            toString(): string;
        }
        class TokenRange {
            tokenAccess: ITokenAccess;
            constructor(tokenAccess: ITokenAccess);
            static FromToken(token: SyntaxKind): TokenRange;
            static FromTokens(tokens: SyntaxKind[]): TokenRange;
            static FromRange(f: SyntaxKind, to: SyntaxKind, except?: SyntaxKind[]): TokenRange;
            static AllTokens(): TokenRange;
            GetTokens(): SyntaxKind[];
            Contains(token: SyntaxKind): boolean;
            toString(): string;
            static Any: TokenRange;
            static AnyIncludingMultilineComments: TokenRange;
            static Keywords: TokenRange;
            static BinaryOperators: TokenRange;
            static BinaryKeywordOperators: TokenRange;
            static UnaryPrefixOperators: TokenRange;
            static UnaryPrefixExpressions: TokenRange;
            static UnaryPreincrementExpressions: TokenRange;
            static UnaryPostincrementExpressions: TokenRange;
            static UnaryPredecrementExpressions: TokenRange;
            static UnaryPostdecrementExpressions: TokenRange;
            static Comments: TokenRange;
            static TypeNames: TokenRange;
        }
    }
}
declare namespace ts.formatting {
    class RulesProvider {
        private globalRules;
        private options;
        private activeRules;
        private rulesMap;
        constructor();
        getRuleName(rule: Rule): string;
        getRuleByName(name: string): Rule;
        getRulesMap(): RulesMap;
        ensureUpToDate(options: ts.FormatCodeOptions): void;
        private createActiveRules(options);
    }
}
declare namespace ts.formatting {
    interface TextRangeWithKind extends TextRange {
        kind: SyntaxKind;
    }
    interface TokenInfo {
        leadingTrivia: TextRangeWithKind[];
        token: TextRangeWithKind;
        trailingTrivia: TextRangeWithKind[];
    }
    function formatOnEnter(position: number, sourceFile: SourceFile, rulesProvider: RulesProvider, options: FormatCodeOptions): TextChange[];
    function formatOnSemicolon(position: number, sourceFile: SourceFile, rulesProvider: RulesProvider, options: FormatCodeOptions): TextChange[];
    function formatOnClosingCurly(position: number, sourceFile: SourceFile, rulesProvider: RulesProvider, options: FormatCodeOptions): TextChange[];
    function formatDocument(sourceFile: SourceFile, rulesProvider: RulesProvider, options: FormatCodeOptions): TextChange[];
    function formatSelection(start: number, end: number, sourceFile: SourceFile, rulesProvider: RulesProvider, options: FormatCodeOptions): TextChange[];
    function getIndentationString(indentation: number, options: FormatCodeOptions): string;
}
declare namespace ts.formatting {
    module SmartIndenter {
        function getIndentation(position: number, sourceFile: SourceFile, options: EditorOptions): number;
        function getIndentationForNode(n: Node, ignoreActualIndentationRange: TextRange, sourceFile: SourceFile, options: FormatCodeOptions): number;
        function childStartsOnTheSameLineWithElseInIfStatement(parent: Node, child: TextRangeWithKind, childStartLine: number, sourceFile: SourceFile): boolean;
        function findFirstNonWhitespaceCharacterAndColumn(startPos: number, endPos: number, sourceFile: SourceFile, options: EditorOptions): {
            column: number;
            character: number;
        };
        function findFirstNonWhitespaceColumn(startPos: number, endPos: number, sourceFile: SourceFile, options: EditorOptions): number;
        function nodeWillIndentChild(parent: TextRangeWithKind, child: TextRangeWithKind, indentByDefault: boolean): boolean;
        function shouldIndentChildNode(parent: TextRangeWithKind, child?: TextRangeWithKind): boolean;
    }
}
declare namespace ts {
    /** The version of the language service API */
    const servicesVersion: string;
    interface Node {
        getSourceFile(): SourceFile;
        getChildCount(sourceFile?: SourceFile): number;
        getChildAt(index: number, sourceFile?: SourceFile): Node;
        getChildren(sourceFile?: SourceFile): Node[];
        getStart(sourceFile?: SourceFile): number;
        getFullStart(): number;
        getEnd(): number;
        getWidth(sourceFile?: SourceFile): number;
        getFullWidth(): number;
        getLeadingTriviaWidth(sourceFile?: SourceFile): number;
        getFullText(sourceFile?: SourceFile): string;
        getText(sourceFile?: SourceFile): string;
        getFirstToken(sourceFile?: SourceFile): Node;
        getLastToken(sourceFile?: SourceFile): Node;
    }
    interface Symbol {
        getFlags(): SymbolFlags;
        getName(): string;
        getDeclarations(): Declaration[];
        getDocumentationComment(): SymbolDisplayPart[];
    }
    interface Type {
        getFlags(): TypeFlags;
        getSymbol(): Symbol;
        getProperties(): Symbol[];
        getProperty(propertyName: string): Symbol;
        getApparentProperties(): Symbol[];
        getCallSignatures(): Signature[];
        getConstructSignatures(): Signature[];
        getStringIndexType(): Type;
        getNumberIndexType(): Type;
        getBaseTypes(): ObjectType[];
    }
    interface Signature {
        getDeclaration(): SignatureDeclaration;
        getTypeParameters(): Type[];
        getParameters(): Symbol[];
        getReturnType(): Type;
        getDocumentationComment(): SymbolDisplayPart[];
    }
    interface SourceFile {
        version: string;
        scriptSnapshot: IScriptSnapshot;
        nameTable: Map<number>;
        getNamedDeclarations(): Map<Declaration[]>;
        getLineAndCharacterOfPosition(pos: number): LineAndCharacter;
        getLineStarts(): number[];
        getPositionOfLineAndCharacter(line: number, character: number): number;
        update(newText: string, textChangeRange: TextChangeRange): SourceFile;
    }
    /**
     * Represents an immutable snapshot of a script at a specified time.Once acquired, the
     * snapshot is observably immutable. i.e. the same calls with the same parameters will return
     * the same values.
     */
    interface IScriptSnapshot {
        /** Gets a portion of the script snapshot specified by [start, end). */
        getText(start: number, end: number): string;
        /** Gets the length of this script snapshot. */
        getLength(): number;
        /**
         * Gets the TextChangeRange that describe how the text changed between this text and
         * an older version.  This information is used by the incremental parser to determine
         * what sections of the script need to be re-parsed.  'undefined' can be returned if the
         * change range cannot be determined.  However, in that case, incremental parsing will
         * not happen and the entire document will be re - parsed.
         */
        getChangeRange(oldSnapshot: IScriptSnapshot): TextChangeRange;
        /** Releases all resources held by this script snapshot */
        dispose?(): void;
    }
    namespace ScriptSnapshot {
        function fromString(text: string): IScriptSnapshot;
    }
    interface PreProcessedFileInfo {
        referencedFiles: FileReference[];
        importedFiles: FileReference[];
        ambientExternalModules: string[];
        isLibFile: boolean;
    }
    interface HostCancellationToken {
        isCancellationRequested(): boolean;
    }
    interface LanguageServiceHost {
        getCompilationSettings(): CompilerOptions;
        getNewLine?(): string;
        getProjectVersion?(): string;
        getScriptFileNames(): string[];
        getScriptKind?(fileName: string): ScriptKind;
        getScriptVersion(fileName: string): string;
        getScriptSnapshot(fileName: string): IScriptSnapshot;
        getLocalizedDiagnosticMessages?(): any;
        getCancellationToken?(): HostCancellationToken;
        getCurrentDirectory(): string;
        getDefaultLibFileName(options: CompilerOptions): string;
        log?(s: string): void;
        trace?(s: string): void;
        error?(s: string): void;
        useCaseSensitiveFileNames?(): boolean;
        resolveModuleNames?(moduleNames: string[], containingFile: string): ResolvedModule[];
        directoryExists?(directoryName: string): boolean;
    }
    interface LanguageService {
        cleanupSemanticCache(): void;
        getSyntacticDiagnostics(fileName: string): Diagnostic[];
        getSemanticDiagnostics(fileName: string): Diagnostic[];
        getCompilerOptionsDiagnostics(): Diagnostic[];
        /**
         * @deprecated Use getEncodedSyntacticClassifications instead.
         */
        getSyntacticClassifications(fileName: string, span: TextSpan): ClassifiedSpan[];
        /**
         * @deprecated Use getEncodedSemanticClassifications instead.
         */
        getSemanticClassifications(fileName: string, span: TextSpan): ClassifiedSpan[];
        getEncodedSyntacticClassifications(fileName: string, span: TextSpan): Classifications;
        getEncodedSemanticClassifications(fileName: string, span: TextSpan): Classifications;
        getCompletionsAtPosition(fileName: string, position: number): CompletionInfo;
        getCompletionEntryDetails(fileName: string, position: number, entryName: string): CompletionEntryDetails;
        getQuickInfoAtPosition(fileName: string, position: number): QuickInfo;
        getNameOrDottedNameSpan(fileName: string, startPos: number, endPos: number): TextSpan;
        getBreakpointStatementAtPosition(fileName: string, position: number): TextSpan;
        getSignatureHelpItems(fileName: string, position: number): SignatureHelpItems;
        getRenameInfo(fileName: string, position: number): RenameInfo;
        findRenameLocations(fileName: string, position: number, findInStrings: boolean, findInComments: boolean): RenameLocation[];
        getDefinitionAtPosition(fileName: string, position: number): DefinitionInfo[];
        getTypeDefinitionAtPosition(fileName: string, position: number): DefinitionInfo[];
        getReferencesAtPosition(fileName: string, position: number): ReferenceEntry[];
        findReferences(fileName: string, position: number): ReferencedSymbol[];
        getDocumentHighlights(fileName: string, position: number, filesToSearch: string[]): DocumentHighlights[];
        /** @deprecated */
        getOccurrencesAtPosition(fileName: string, position: number): ReferenceEntry[];
        getNavigateToItems(searchValue: string, maxResultCount?: number): NavigateToItem[];
        getNavigationBarItems(fileName: string): NavigationBarItem[];
        getOutliningSpans(fileName: string): OutliningSpan[];
        getTodoComments(fileName: string, descriptors: TodoCommentDescriptor[]): TodoComment[];
        getBraceMatchingAtPosition(fileName: string, position: number): TextSpan[];
        getIndentationAtPosition(fileName: string, position: number, options: EditorOptions): number;
        getFormattingEditsForRange(fileName: string, start: number, end: number, options: FormatCodeOptions): TextChange[];
        getFormattingEditsForDocument(fileName: string, options: FormatCodeOptions): TextChange[];
        getFormattingEditsAfterKeystroke(fileName: string, position: number, key: string, options: FormatCodeOptions): TextChange[];
        getDocCommentTemplateAtPosition(fileName: string, position: number): TextInsertion;
        getEmitOutput(fileName: string): EmitOutput;
        getProgram(): Program;
        getSourceFile(fileName: string): SourceFile;
        dispose(): void;
    }
    interface Classifications {
        spans: number[];
        endOfLineState: EndOfLineState;
    }
    interface ClassifiedSpan {
        textSpan: TextSpan;
        classificationType: string;
    }
    interface NavigationBarItem {
        text: string;
        kind: string;
        kindModifiers: string;
        spans: TextSpan[];
        childItems: NavigationBarItem[];
        indent: number;
        bolded: boolean;
        grayed: boolean;
    }
    interface TodoCommentDescriptor {
        text: string;
        priority: number;
    }
    interface TodoComment {
        descriptor: TodoCommentDescriptor;
        message: string;
        position: number;
    }
    class TextChange {
        span: TextSpan;
        newText: string;
    }
    interface TextInsertion {
        newText: string;
        /** The position in newText the caret should point to after the insertion. */
        caretOffset: number;
    }
    interface RenameLocation {
        textSpan: TextSpan;
        fileName: string;
    }
    interface ReferenceEntry {
        textSpan: TextSpan;
        fileName: string;
        isWriteAccess: boolean;
    }
    interface DocumentHighlights {
        fileName: string;
        highlightSpans: HighlightSpan[];
    }
    namespace HighlightSpanKind {
        const none: string;
        const definition: string;
        const reference: string;
        const writtenReference: string;
    }
    interface HighlightSpan {
        fileName?: string;
        textSpan: TextSpan;
        kind: string;
    }
    interface NavigateToItem {
        name: string;
        kind: string;
        kindModifiers: string;
        matchKind: string;
        isCaseSensitive: boolean;
        fileName: string;
        textSpan: TextSpan;
        containerName: string;
        containerKind: string;
    }
    interface EditorOptions {
        IndentSize: number;
        TabSize: number;
        NewLineCharacter: string;
        ConvertTabsToSpaces: boolean;
        IndentStyle: IndentStyle;
    }
    enum IndentStyle {
        None = 0,
        Block = 1,
        Smart = 2,
    }
    interface FormatCodeOptions extends EditorOptions {
        InsertSpaceAfterCommaDelimiter: boolean;
        InsertSpaceAfterSemicolonInForStatements: boolean;
        InsertSpaceBeforeAndAfterBinaryOperators: boolean;
        InsertSpaceAfterKeywordsInControlFlowStatements: boolean;
        InsertSpaceAfterFunctionKeywordForAnonymousFunctions: boolean;
        InsertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: boolean;
        InsertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: boolean;
        InsertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: boolean;
        PlaceOpenBraceOnNewLineForFunctions: boolean;
        PlaceOpenBraceOnNewLineForControlBlocks: boolean;
        [s: string]: boolean | number | string;
    }
    interface DefinitionInfo {
        fileName: string;
        textSpan: TextSpan;
        kind: string;
        name: string;
        containerKind: string;
        containerName: string;
    }
    interface ReferencedSymbol {
        definition: DefinitionInfo;
        references: ReferenceEntry[];
    }
    enum SymbolDisplayPartKind {
        aliasName = 0,
        className = 1,
        enumName = 2,
        fieldName = 3,
        interfaceName = 4,
        keyword = 5,
        lineBreak = 6,
        numericLiteral = 7,
        stringLiteral = 8,
        localName = 9,
        methodName = 10,
        moduleName = 11,
        operator = 12,
        parameterName = 13,
        propertyName = 14,
        punctuation = 15,
        space = 16,
        text = 17,
        typeParameterName = 18,
        enumMemberName = 19,
        functionName = 20,
        regularExpressionLiteral = 21,
    }
    interface SymbolDisplayPart {
        text: string;
        kind: string;
    }
    interface QuickInfo {
        kind: string;
        kindModifiers: string;
        textSpan: TextSpan;
        displayParts: SymbolDisplayPart[];
        documentation: SymbolDisplayPart[];
    }
    interface RenameInfo {
        canRename: boolean;
        localizedErrorMessage: string;
        displayName: string;
        fullDisplayName: string;
        kind: string;
        kindModifiers: string;
        triggerSpan: TextSpan;
    }
    interface SignatureHelpParameter {
        name: string;
        documentation: SymbolDisplayPart[];
        displayParts: SymbolDisplayPart[];
        isOptional: boolean;
    }
    /**
     * Represents a single signature to show in signature help.
     * The id is used for subsequent calls into the language service to ask questions about the
     * signature help item in the context of any documents that have been updated.  i.e. after
     * an edit has happened, while signature help is still active, the host can ask important
     * questions like 'what parameter is the user currently contained within?'.
     */
    interface SignatureHelpItem {
        isVariadic: boolean;
        prefixDisplayParts: SymbolDisplayPart[];
        suffixDisplayParts: SymbolDisplayPart[];
        separatorDisplayParts: SymbolDisplayPart[];
        parameters: SignatureHelpParameter[];
        documentation: SymbolDisplayPart[];
    }
    /**
     * Represents a set of signature help items, and the preferred item that should be selected.
     */
    interface SignatureHelpItems {
        items: SignatureHelpItem[];
        applicableSpan: TextSpan;
        selectedItemIndex: number;
        argumentIndex: number;
        argumentCount: number;
    }
    interface CompletionInfo {
        isMemberCompletion: boolean;
        isNewIdentifierLocation: boolean;
        entries: CompletionEntry[];
    }
    interface CompletionEntry {
        name: string;
        kind: string;
        kindModifiers: string;
        sortText: string;
    }
    interface CompletionEntryDetails {
        name: string;
        kind: string;
        kindModifiers: string;
        displayParts: SymbolDisplayPart[];
        documentation: SymbolDisplayPart[];
    }
    interface OutliningSpan {
        /** The span of the document to actually collapse. */
        textSpan: TextSpan;
        /** The span of the document to display when the user hovers over the collapsed span. */
        hintSpan: TextSpan;
        /** The text to display in the editor for the collapsed region. */
        bannerText: string;
        /**
          * Whether or not this region should be automatically collapsed when
          * the 'Collapse to Definitions' command is invoked.
          */
        autoCollapse: boolean;
    }
    interface EmitOutput {
        outputFiles: OutputFile[];
        emitSkipped: boolean;
    }
    const enum OutputFileType {
        JavaScript = 0,
        SourceMap = 1,
        Declaration = 2,
    }
    interface OutputFile {
        name: string;
        writeByteOrderMark: boolean;
        text: string;
    }
    const enum EndOfLineState {
        None = 0,
        InMultiLineCommentTrivia = 1,
        InSingleQuoteStringLiteral = 2,
        InDoubleQuoteStringLiteral = 3,
        InTemplateHeadOrNoSubstitutionTemplate = 4,
        InTemplateMiddleOrTail = 5,
        InTemplateSubstitutionPosition = 6,
    }
    enum TokenClass {
        Punctuation = 0,
        Keyword = 1,
        Operator = 2,
        Comment = 3,
        Whitespace = 4,
        Identifier = 5,
        NumberLiteral = 6,
        StringLiteral = 7,
        RegExpLiteral = 8,
    }
    interface ClassificationResult {
        finalLexState: EndOfLineState;
        entries: ClassificationInfo[];
    }
    interface ClassificationInfo {
        length: number;
        classification: TokenClass;
    }
    interface Classifier {
        /**
         * Gives lexical classifications of tokens on a line without any syntactic context.
         * For instance, a token consisting of the text 'string' can be either an identifier
         * named 'string' or the keyword 'string', however, because this classifier is not aware,
         * it relies on certain heuristics to give acceptable results. For classifications where
         * speed trumps accuracy, this function is preferable; however, for true accuracy, the
         * syntactic classifier is ideal. In fact, in certain editing scenarios, combining the
         * lexical, syntactic, and semantic classifiers may issue the best user experience.
         *
         * @param text                      The text of a line to classify.
         * @param lexState                  The state of the lexical classifier at the end of the previous line.
         * @param syntacticClassifierAbsent Whether the client is *not* using a syntactic classifier.
         *                                  If there is no syntactic classifier (syntacticClassifierAbsent=true),
         *                                  certain heuristics may be used in its place; however, if there is a
         *                                  syntactic classifier (syntacticClassifierAbsent=false), certain
         *                                  classifications which may be incorrectly categorized will be given
         *                                  back as Identifiers in order to allow the syntactic classifier to
         *                                  subsume the classification.
         * @deprecated Use getLexicalClassifications instead.
         */
        getClassificationsForLine(text: string, lexState: EndOfLineState, syntacticClassifierAbsent: boolean): ClassificationResult;
        getEncodedLexicalClassifications(text: string, endOfLineState: EndOfLineState, syntacticClassifierAbsent: boolean): Classifications;
    }
    /**
      * The document registry represents a store of SourceFile objects that can be shared between
      * multiple LanguageService instances. A LanguageService instance holds on the SourceFile (AST)
      * of files in the context.
      * SourceFile objects account for most of the memory usage by the language service. Sharing
      * the same DocumentRegistry instance between different instances of LanguageService allow
      * for more efficient memory utilization since all projects will share at least the library
      * file (lib.d.ts).
      *
      * A more advanced use of the document registry is to serialize sourceFile objects to disk
      * and re-hydrate them when needed.
      *
      * To create a default DocumentRegistry, use createDocumentRegistry to create one, and pass it
      * to all subsequent createLanguageService calls.
      */
    interface DocumentRegistry {
        /**
          * Request a stored SourceFile with a given fileName and compilationSettings.
          * The first call to acquire will call createLanguageServiceSourceFile to generate
          * the SourceFile if was not found in the registry.
          *
          * @param fileName The name of the file requested
          * @param compilationSettings Some compilation settings like target affects the
          * shape of a the resulting SourceFile. This allows the DocumentRegistry to store
          * multiple copies of the same file for different compilation settings.
          * @parm scriptSnapshot Text of the file. Only used if the file was not found
          * in the registry and a new one was created.
          * @parm version Current version of the file. Only used if the file was not found
          * in the registry and a new one was created.
          */
        acquireDocument(fileName: string, compilationSettings: CompilerOptions, scriptSnapshot: IScriptSnapshot, version: string, scriptKind?: ScriptKind): SourceFile;
        /**
          * Request an updated version of an already existing SourceFile with a given fileName
          * and compilationSettings. The update will in-turn call updateLanguageServiceSourceFile
          * to get an updated SourceFile.
          *
          * @param fileName The name of the file requested
          * @param compilationSettings Some compilation settings like target affects the
          * shape of a the resulting SourceFile. This allows the DocumentRegistry to store
          * multiple copies of the same file for different compilation settings.
          * @param scriptSnapshot Text of the file.
          * @param version Current version of the file.
          */
        updateDocument(fileName: string, compilationSettings: CompilerOptions, scriptSnapshot: IScriptSnapshot, version: string, scriptKind?: ScriptKind): SourceFile;
        /**
          * Informs the DocumentRegistry that a file is not needed any longer.
          *
          * Note: It is not allowed to call release on a SourceFile that was not acquired from
          * this registry originally.
          *
          * @param fileName The name of the file to be released
          * @param compilationSettings The compilation settings used to acquire the file
          */
        releaseDocument(fileName: string, compilationSettings: CompilerOptions): void;
        reportStats(): string;
    }
    namespace ScriptElementKind {
        const unknown: string;
        const warning: string;
        const keyword: string;
        const scriptElement: string;
        const moduleElement: string;
        const classElement: string;
        const localClassElement: string;
        const interfaceElement: string;
        const typeElement: string;
        const enumElement: string;
        const variableElement: string;
        const localVariableElement: string;
        const functionElement: string;
        const localFunctionElement: string;
        const memberFunctionElement: string;
        const memberGetAccessorElement: string;
        const memberSetAccessorElement: string;
        const memberVariableElement: string;
        const constructorImplementationElement: string;
        const callSignatureElement: string;
        const indexSignatureElement: string;
        const constructSignatureElement: string;
        const parameterElement: string;
        const typeParameterElement: string;
        const primitiveType: string;
        const label: string;
        const alias: string;
        const constElement: string;
        const letElement: string;
    }
    namespace ScriptElementKindModifier {
        const none: string;
        const publicMemberModifier: string;
        const privateMemberModifier: string;
        const protectedMemberModifier: string;
        const exportedModifier: string;
        const ambientModifier: string;
        const staticModifier: string;
        const abstractModifier: string;
    }
    class ClassificationTypeNames {
        static comment: string;
        static identifier: string;
        static keyword: string;
        static numericLiteral: string;
        static operator: string;
        static stringLiteral: string;
        static whiteSpace: string;
        static text: string;
        static punctuation: string;
        static className: string;
        static enumName: string;
        static interfaceName: string;
        static moduleName: string;
        static typeParameterName: string;
        static typeAliasName: string;
        static parameterName: string;
        static docCommentTagName: string;
        static jsxOpenTagName: string;
        static jsxCloseTagName: string;
        static jsxSelfClosingTagName: string;
        static jsxAttribute: string;
        static jsxText: string;
        static jsxAttributeStringLiteralValue: string;
    }
    const enum ClassificationType {
        comment = 1,
        identifier = 2,
        keyword = 3,
        numericLiteral = 4,
        operator = 5,
        stringLiteral = 6,
        regularExpressionLiteral = 7,
        whiteSpace = 8,
        text = 9,
        punctuation = 10,
        className = 11,
        enumName = 12,
        interfaceName = 13,
        moduleName = 14,
        typeParameterName = 15,
        typeAliasName = 16,
        parameterName = 17,
        docCommentTagName = 18,
        jsxOpenTagName = 19,
        jsxCloseTagName = 20,
        jsxSelfClosingTagName = 21,
        jsxAttribute = 22,
        jsxText = 23,
        jsxAttributeStringLiteralValue = 24,
    }
    interface DisplayPartsSymbolWriter extends SymbolWriter {
        displayParts(): SymbolDisplayPart[];
    }
    function displayPartsToString(displayParts: SymbolDisplayPart[]): string;
    function getDefaultCompilerOptions(): CompilerOptions;
    interface TranspileOptions {
        compilerOptions?: CompilerOptions;
        fileName?: string;
        reportDiagnostics?: boolean;
        moduleName?: string;
        renamedDependencies?: Map<string>;
    }
    interface TranspileOutput {
        outputText: string;
        diagnostics?: Diagnostic[];
        sourceMapText?: string;
    }
    function transpileModule(input: string, transpileOptions: TranspileOptions): TranspileOutput;
    function transpile(input: string, compilerOptions?: CompilerOptions, fileName?: string, diagnostics?: Diagnostic[], moduleName?: string): string;
    function createLanguageServiceSourceFile(fileName: string, scriptSnapshot: IScriptSnapshot, scriptTarget: ScriptTarget, version: string, setNodeParents: boolean, scriptKind?: ScriptKind): SourceFile;
    let disableIncrementalParsing: boolean;
    function updateLanguageServiceSourceFile(sourceFile: SourceFile, scriptSnapshot: IScriptSnapshot, version: string, textChangeRange: TextChangeRange, aggressiveChecks?: boolean): SourceFile;
    function createDocumentRegistry(useCaseSensitiveFileNames?: boolean, currentDirectory?: string): DocumentRegistry;
    function preProcessFile(sourceText: string, readImportFiles?: boolean, detectJavaScriptImports?: boolean): PreProcessedFileInfo;
    function getContainerNode(node: Node): Declaration;
    function getNodeKind(node: Node): string;
    function createLanguageService(host: LanguageServiceHost, documentRegistry?: DocumentRegistry): LanguageService;
    function getNameTable(sourceFile: SourceFile): Map<number>;
    function createClassifier(): Classifier;
    /**
      * Get the path of the default library files (lib.d.ts) as distributed with the typescript
      * node package.
      * The functionality is not supported if the ts module is consumed outside of a node module.
      */
    function getDefaultLibFilePath(options: CompilerOptions): string;
}
declare namespace ts.server {
    function generateSpaces(n: number): string;
    function generateIndentString(n: number, editorOptions: EditorOptions): string;
    interface PendingErrorCheck {
        fileName: string;
        project: Project;
    }
    namespace CommandNames {
        const Brace: string;
        const Change: string;
        const Close: string;
        const Completions: string;
        const CompletionDetails: string;
        const Configure: string;
        const Definition: string;
        const Exit: string;
        const Format: string;
        const Formatonkey: string;
        const Geterr: string;
        const GeterrForProject: string;
        const NavBar: string;
        const Navto: string;
        const Occurrences: string;
        const DocumentHighlights: string;
        const Open: string;
        const Quickinfo: string;
        const References: string;
        const Reload: string;
        const Rename: string;
        const Saveto: string;
        const SignatureHelp: string;
        const TypeDefinition: string;
        const ProjectInfo: string;
        const ReloadProjects: string;
        const Unknown: string;
    }
    interface ServerHost extends ts.System {
    }
    class Session {
        private host;
        private byteLength;
        private hrtime;
        private logger;
        protected projectService: ProjectService;
        private errorTimer;
        private immediateId;
        private changeSeq;
        constructor(host: ServerHost, byteLength: (buf: string, encoding?: string) => number, hrtime: (start?: number[]) => number[], logger: Logger);
        private handleEvent(eventName, project, fileName);
        logError(err: Error, cmd: string): void;
        private sendLineToClient(line);
        send(msg: protocol.Message): void;
        event(info: any, eventName: string): void;
        private response(info, cmdName, reqSeq?, errorMsg?);
        output(body: any, commandName: string, requestSequence?: number, errorMessage?: string): void;
        private semanticCheck(file, project);
        private syntacticCheck(file, project);
        private reloadProjects();
        private updateProjectStructure(seq, matchSeq, ms?);
        private updateErrorCheck(checkList, seq, matchSeq, ms?, followMs?, requireOpen?);
        private getDefinition(line, offset, fileName);
        private getTypeDefinition(line, offset, fileName);
        private getOccurrences(line, offset, fileName);
        private getDocumentHighlights(line, offset, fileName, filesToSearch);
        private getProjectInfo(fileName, needFileNameList);
        private getRenameLocations(line, offset, fileName, findInComments, findInStrings);
        private getReferences(line, offset, fileName);
        /**
         * @param fileName is the name of the file to be opened
         * @param fileContent is a version of the file content that is known to be more up to date than the one on disk
         */
        private openClientFile(fileName, fileContent?);
        private getQuickInfo(line, offset, fileName);
        private getFormattingEditsForRange(line, offset, endLine, endOffset, fileName);
        private getFormattingEditsAfterKeystroke(line, offset, key, fileName);
        private getCompletions(line, offset, prefix, fileName);
        private getCompletionEntryDetails(line, offset, entryNames, fileName);
        private getSignatureHelpItems(line, offset, fileName);
        private getDiagnostics(delay, fileNames);
        private change(line, offset, endLine, endOffset, insertString, fileName);
        private reload(fileName, tempFileName, reqSeq?);
        private saveToTmp(fileName, tempFileName);
        private closeClientFile(fileName);
        private decorateNavigationBarItem(project, fileName, items);
        private getNavigationBarItems(fileName);
        private getNavigateToItems(searchValue, fileName, maxResultCount?);
        private getBraceMatching(line, offset, fileName);
        getDiagnosticsForProject(delay: number, fileName: string): void;
        getCanonicalFileName(fileName: string): string;
        exit(): void;
        private handlers;
        addProtocolHandler(command: string, handler: (request: protocol.Request) => {
            response?: any;
            responseRequired: boolean;
        }): void;
        executeCommand(request: protocol.Request): {
            response?: any;
            responseRequired?: boolean;
        };
        onMessage(message: string): void;
    }
}
declare namespace ts.server {
    interface Logger {
        close(): void;
        isVerbose(): boolean;
        loggingEnabled(): boolean;
        perftrc(s: string): void;
        info(s: string): void;
        startGroup(): void;
        endGroup(): void;
        msg(s: string, type?: string): void;
    }
    class ScriptInfo {
        private host;
        fileName: string;
        content: string;
        isOpen: boolean;
        svc: ScriptVersionCache;
        children: ScriptInfo[];
        defaultProject: Project;
        fileWatcher: FileWatcher;
        formatCodeOptions: FormatCodeOptions;
        path: Path;
        constructor(host: ServerHost, fileName: string, content: string, isOpen?: boolean);
        setFormatOptions(formatOptions: protocol.FormatOptions): void;
        close(): void;
        addChild(childInfo: ScriptInfo): void;
        snap(): LineIndexSnapshot;
        getText(): string;
        getLineInfo(line: number): ILineInfo;
        editContent(start: number, end: number, newText: string): void;
        getTextChangeRangeBetweenVersions(startVersion: number, endVersion: number): ts.TextChangeRange;
        getChangeRange(oldSnapshot: ts.IScriptSnapshot): ts.TextChangeRange;
    }
    class LSHost implements ts.LanguageServiceHost {
        host: ServerHost;
        project: Project;
        ls: ts.LanguageService;
        compilationSettings: ts.CompilerOptions;
        filenameToScript: ts.FileMap<ScriptInfo>;
        roots: ScriptInfo[];
        private resolvedModuleNames;
        private moduleResolutionHost;
        private getCanonicalFileName;
        constructor(host: ServerHost, project: Project);
        resolveModuleNames(moduleNames: string[], containingFile: string): ResolvedModule[];
        getDefaultLibFileName(): string;
        getScriptSnapshot(filename: string): ts.IScriptSnapshot;
        setCompilationSettings(opt: ts.CompilerOptions): void;
        lineAffectsRefs(filename: string, line: number): boolean;
        getCompilationSettings(): CompilerOptions;
        getScriptFileNames(): string[];
        getScriptKind(): ScriptKind;
        getScriptVersion(filename: string): string;
        getCurrentDirectory(): string;
        getScriptIsOpen(filename: string): boolean;
        removeReferencedFile(info: ScriptInfo): void;
        getScriptInfo(filename: string): ScriptInfo;
        addRoot(info: ScriptInfo): void;
        removeRoot(info: ScriptInfo): void;
        saveTo(filename: string, tmpfilename: string): void;
        reloadScript(filename: string, tmpfilename: string, cb: () => any): void;
        editScript(filename: string, start: number, end: number, newText: string): void;
        resolvePath(path: string): string;
        fileExists(path: string): boolean;
        directoryExists(path: string): boolean;
        /**
         *  @param line 1 based index
         */
        lineToTextSpan(filename: string, line: number): ts.TextSpan;
        /**
         * @param line 1 based index
         * @param offset 1 based index
         */
        lineOffsetToPosition(filename: string, line: number, offset: number): number;
        /**
         * @param line 1-based index
         * @param offset 1-based index
         */
        positionToLineOffset(filename: string, position: number): ILineInfo;
    }
    interface ProjectOptions {
        files?: string[];
        compilerOptions?: ts.CompilerOptions;
    }
    class Project {
        projectService: ProjectService;
        projectOptions: ProjectOptions;
        compilerService: CompilerService;
        projectFilename: string;
        projectFileWatcher: FileWatcher;
        directoryWatcher: FileWatcher;
        directoriesWatchedForTsconfig: string[];
        program: ts.Program;
        filenameToSourceFile: ts.Map<ts.SourceFile>;
        updateGraphSeq: number;
        /** Used for configured projects which may have multiple open roots */
        openRefCount: number;
        constructor(projectService: ProjectService, projectOptions?: ProjectOptions);
        addOpenRef(): void;
        deleteOpenRef(): number;
        openReferencedFile(filename: string): ScriptInfo;
        getRootFiles(): string[];
        getFileNames(): string[];
        getSourceFile(info: ScriptInfo): SourceFile;
        getSourceFileFromName(filename: string, requireOpen?: boolean): SourceFile;
        isRoot(info: ScriptInfo): boolean;
        removeReferencedFile(info: ScriptInfo): void;
        updateFileMap(): void;
        finishGraph(): void;
        updateGraph(): void;
        isConfiguredProject(): string;
        addRoot(info: ScriptInfo): void;
        removeRoot(info: ScriptInfo): void;
        filesToString(): string;
        setProjectOptions(projectOptions: ProjectOptions): void;
    }
    interface ProjectOpenResult {
        success?: boolean;
        errorMsg?: string;
        project?: Project;
    }
    interface ProjectServiceEventHandler {
        (eventName: string, project: Project, fileName: string): void;
    }
    interface HostConfiguration {
        formatCodeOptions: ts.FormatCodeOptions;
        hostInfo: string;
    }
    class ProjectService {
        host: ServerHost;
        psLogger: Logger;
        eventHandler: ProjectServiceEventHandler;
        filenameToScriptInfo: ts.Map<ScriptInfo>;
        openFileRoots: ScriptInfo[];
        inferredProjects: Project[];
        configuredProjects: Project[];
        openFilesReferenced: ScriptInfo[];
        openFileRootsConfigured: ScriptInfo[];
        directoryWatchersForTsconfig: ts.Map<FileWatcher>;
        directoryWatchersRefCount: ts.Map<number>;
        hostConfiguration: HostConfiguration;
        timerForDetectingProjectFileListChanges: Map<NodeJS.Timer>;
        constructor(host: ServerHost, psLogger: Logger, eventHandler?: ProjectServiceEventHandler);
        addDefaultHostConfiguration(): void;
        getFormatCodeOptions(file?: string): FormatCodeOptions;
        watchedFileChanged(fileName: string): void;
        /**
         * This is the callback function when a watched directory has added or removed source code files.
         * @param project the project that associates with this directory watcher
         * @param fileName the absolute file name that changed in watched directory
         */
        directoryWatchedForSourceFilesChanged(project: Project, fileName: string): void;
        startTimerForDetectingProjectFileListChanges(project: Project): void;
        handleProjectFileListChanges(project: Project): void;
        /**
         * This is the callback function when a watched directory has an added tsconfig file.
         */
        directoryWatchedForTsconfigChanged(fileName: string): void;
        getCanonicalFileName(fileName: string): string;
        watchedProjectConfigFileChanged(project: Project): void;
        log(msg: string, type?: string): void;
        setHostConfiguration(args: ts.server.protocol.ConfigureRequestArguments): void;
        closeLog(): void;
        createInferredProject(root: ScriptInfo): Project;
        fileDeletedInFilesystem(info: ScriptInfo): void;
        updateConfiguredProjectList(): void;
        removeProject(project: Project): void;
        setConfiguredProjectRoot(info: ScriptInfo): boolean;
        addOpenFile(info: ScriptInfo): void;
        /**
          * Remove this file from the set of open, non-configured files.
          * @param info The file that has been closed or newly configured
          */
        closeOpenFile(info: ScriptInfo): void;
        findReferencingProjects(info: ScriptInfo, excludedProject?: Project): Project[];
        /**
         * This function rebuilds the project for every file opened by the client
         */
        reloadProjects(): void;
        /**
         * This function is to update the project structure for every projects.
         * It is called on the premise that all the configured projects are
         * up to date.
         */
        updateProjectStructure(): void;
        getScriptInfo(filename: string): ScriptInfo;
        /**
         * @param filename is absolute pathname
         * @param fileContent is a known version of the file content that is more up to date than the one on disk
         */
        openFile(fileName: string, openedByClient: boolean, fileContent?: string): ScriptInfo;
        findConfigFile(searchPath: string): string;
        /**
         * Open file whose contents is managed by the client
         * @param filename is absolute pathname
         * @param fileContent is a known version of the file content that is more up to date than the one on disk
         */
        openClientFile(fileName: string, fileContent?: string): ScriptInfo;
        /**
         * This function tries to search for a tsconfig.json for the given file. If we found it,
         * we first detect if there is already a configured project created for it: if so, we re-read
         * the tsconfig file content and update the project; otherwise we create a new one.
         */
        openOrUpdateConfiguredProjectForFile(fileName: string): void;
        /**
         * Close file whose contents is managed by the client
         * @param filename is absolute pathname
         */
        closeClientFile(filename: string): void;
        getProjectForFile(filename: string): Project;
        printProjectsForFile(filename: string): void;
        printProjects(): void;
        configProjectIsActive(fileName: string): boolean;
        findConfiguredProjectByConfigFile(configFileName: string): Project;
        configFileToProjectOptions(configFilename: string): {
            succeeded: boolean;
            projectOptions?: ProjectOptions;
            error?: ProjectOpenResult;
        };
        openConfigFile(configFilename: string, clientFileName?: string): ProjectOpenResult;
        updateConfiguredProject(project: Project): ProjectOpenResult;
        createProject(projectFilename: string, projectOptions?: ProjectOptions): Project;
    }
    class CompilerService {
        project: Project;
        host: LSHost;
        languageService: ts.LanguageService;
        classifier: ts.Classifier;
        settings: ts.CompilerOptions;
        documentRegistry: DocumentRegistry;
        constructor(project: Project, opt?: ts.CompilerOptions);
        setCompilerOptions(opt: ts.CompilerOptions): void;
        isExternalModule(filename: string): boolean;
        static defaultFormatCodeOptions: ts.FormatCodeOptions;
    }
    interface LineCollection {
        charCount(): number;
        lineCount(): number;
        isLeaf(): boolean;
        walk(rangeStart: number, rangeLength: number, walkFns: ILineIndexWalker): void;
    }
    interface ILineInfo {
        line: number;
        offset: number;
        text?: string;
        leaf?: LineLeaf;
    }
    enum CharRangeSection {
        PreStart = 0,
        Start = 1,
        Entire = 2,
        Mid = 3,
        End = 4,
        PostEnd = 5,
    }
    interface ILineIndexWalker {
        goSubtree: boolean;
        done: boolean;
        leaf(relativeStart: number, relativeLength: number, lineCollection: LineLeaf): void;
        pre?(relativeStart: number, relativeLength: number, lineCollection: LineCollection, parent: LineNode, nodeType: CharRangeSection): LineCollection;
        post?(relativeStart: number, relativeLength: number, lineCollection: LineCollection, parent: LineNode, nodeType: CharRangeSection): LineCollection;
    }
    class TextChange {
        pos: number;
        deleteLen: number;
        insertedText: string;
        constructor(pos: number, deleteLen: number, insertedText?: string);
        getTextChangeRange(): TextChangeRange;
    }
    class ScriptVersionCache {
        changes: TextChange[];
        versions: LineIndexSnapshot[];
        minVersion: number;
        private currentVersion;
        private host;
        static changeNumberThreshold: number;
        static changeLengthThreshold: number;
        static maxVersions: number;
        edit(pos: number, deleteLen: number, insertedText?: string): void;
        latest(): LineIndexSnapshot;
        latestVersion(): number;
        reloadFromFile(filename: string, cb?: () => any): void;
        reload(script: string): void;
        getSnapshot(): LineIndexSnapshot;
        getTextChangesBetweenVersions(oldVersion: number, newVersion: number): TextChangeRange;
        static fromString(host: ServerHost, script: string): ScriptVersionCache;
    }
    class LineIndexSnapshot implements ts.IScriptSnapshot {
        version: number;
        cache: ScriptVersionCache;
        index: LineIndex;
        changesSincePreviousVersion: TextChange[];
        constructor(version: number, cache: ScriptVersionCache);
        getText(rangeStart: number, rangeEnd: number): string;
        getLength(): number;
        getLineStartPositions(): number[];
        getLineMapper(): (line: number) => number;
        getTextChangeRangeSinceVersion(scriptVersion: number): TextChangeRange;
        getChangeRange(oldSnapshot: ts.IScriptSnapshot): ts.TextChangeRange;
    }
    class LineIndex {
        root: LineNode;
        checkEdits: boolean;
        charOffsetToLineNumberAndPos(charOffset: number): ILineInfo;
        lineNumberToInfo(lineNumber: number): ILineInfo;
        load(lines: string[]): void;
        walk(rangeStart: number, rangeLength: number, walkFns: ILineIndexWalker): void;
        getText(rangeStart: number, rangeLength: number): string;
        getLength(): number;
        every(f: (ll: LineLeaf, s: number, len: number) => boolean, rangeStart: number, rangeEnd?: number): boolean;
        edit(pos: number, deleteLength: number, newText?: string): LineIndex;
        static buildTreeFromBottom(nodes: LineCollection[]): LineNode;
        static linesFromText(text: string): {
            lines: string[];
            lineMap: number[];
        };
    }
    class LineNode implements LineCollection {
        totalChars: number;
        totalLines: number;
        children: LineCollection[];
        isLeaf(): boolean;
        updateCounts(): void;
        execWalk(rangeStart: number, rangeLength: number, walkFns: ILineIndexWalker, childIndex: number, nodeType: CharRangeSection): boolean;
        skipChild(relativeStart: number, relativeLength: number, childIndex: number, walkFns: ILineIndexWalker, nodeType: CharRangeSection): void;
        walk(rangeStart: number, rangeLength: number, walkFns: ILineIndexWalker): void;
        charOffsetToLineNumberAndPos(lineNumber: number, charOffset: number): ILineInfo;
        lineNumberToInfo(lineNumber: number, charOffset: number): ILineInfo;
        childFromLineNumber(lineNumber: number, charOffset: number): {
            child: LineCollection;
            childIndex: number;
            relativeLineNumber: number;
            charOffset: number;
        };
        childFromCharOffset(lineNumber: number, charOffset: number): {
            child: LineCollection;
            childIndex: number;
            charOffset: number;
            lineNumber: number;
        };
        splitAfter(childIndex: number): LineNode;
        remove(child: LineCollection): void;
        findChildIndex(child: LineCollection): number;
        insertAt(child: LineCollection, nodes: LineCollection[]): LineNode[];
        add(collection: LineCollection): boolean;
        charCount(): number;
        lineCount(): number;
    }
    class LineLeaf implements LineCollection {
        text: string;
        udata: any;
        constructor(text: string);
        setUdata(data: any): void;
        getUdata(): any;
        isLeaf(): boolean;
        walk(rangeStart: number, rangeLength: number, walkFns: ILineIndexWalker): void;
        charCount(): number;
        lineCount(): number;
    }
}
declare namespace ts.server {
    class Logger implements ts.server.Logger {
        logFilename: string;
        level: string;
        fd: number;
        seq: number;
        inGroup: boolean;
        firstInGroup: boolean;
        constructor(logFilename: string, level: string);
        static padStringRight(str: string, padding: string): string;
    }
    class IOSession extends Session {
        constructor(host: ServerHost, logger: ts.server.Logger);
        exit(): void;
        listen(): void;
    }
    const logger: Logger;
}
declare let debugObjectHost: any;
declare namespace ts {
    interface ScriptSnapshotShim {
        /** Gets a portion of the script snapshot specified by [start, end). */
        getText(start: number, end: number): string;
        /** Gets the length of this script snapshot. */
        getLength(): number;
        /**
         * Returns a JSON-encoded value of the type:
         *   { span: { start: number; length: number }; newLength: number }
         *
         * Or undefined value if there was no change.
         */
        getChangeRange(oldSnapshot: ScriptSnapshotShim): string;
        /** Releases all resources held by this script snapshot */
        dispose?(): void;
    }
    interface Logger {
        log(s: string): void;
        trace(s: string): void;
        error(s: string): void;
    }
    /** Public interface of the host of a language service shim instance.*/
    interface LanguageServiceShimHost extends Logger {
        getCompilationSettings(): string;
        /** Returns a JSON-encoded value of the type: string[] */
        getScriptFileNames(): string;
        getScriptKind?(fileName: string): ScriptKind;
        getScriptVersion(fileName: string): string;
        getScriptSnapshot(fileName: string): ScriptSnapshotShim;
        getLocalizedDiagnosticMessages(): string;
        getCancellationToken(): HostCancellationToken;
        getCurrentDirectory(): string;
        getDefaultLibFileName(options: string): string;
        getNewLine?(): string;
        getProjectVersion?(): string;
        useCaseSensitiveFileNames?(): boolean;
        getModuleResolutionsForFile?(fileName: string): string;
        directoryExists(directoryName: string): boolean;
    }
    /** Public interface of the the of a config service shim instance.*/
    interface CoreServicesShimHost extends Logger, ModuleResolutionHost {
        /**
         * Returns a JSON-encoded value of the type: string[]
         *
         * @param exclude A JSON encoded string[] containing the paths to exclude
         *  when enumerating the directory.
         */
        readDirectory(rootDir: string, extension: string, exclude?: string, depth?: number): string;
    }
    interface IFileReference {
        path: string;
        position: number;
        length: number;
    }
    /** Public interface of a language service instance shim. */
    interface ShimFactory {
        registerShim(shim: Shim): void;
        unregisterShim(shim: Shim): void;
    }
    interface Shim {
        dispose(dummy: any): void;
    }
    interface LanguageServiceShim extends Shim {
        languageService: LanguageService;
        dispose(dummy: any): void;
        refresh(throwOnError: boolean): void;
        cleanupSemanticCache(): void;
        getSyntacticDiagnostics(fileName: string): string;
        getSemanticDiagnostics(fileName: string): string;
        getCompilerOptionsDiagnostics(): string;
        getSyntacticClassifications(fileName: string, start: number, length: number): string;
        getSemanticClassifications(fileName: string, start: number, length: number): string;
        getEncodedSyntacticClassifications(fileName: string, start: number, length: number): string;
        getEncodedSemanticClassifications(fileName: string, start: number, length: number): string;
        getCompletionsAtPosition(fileName: string, position: number): string;
        getCompletionEntryDetails(fileName: string, position: number, entryName: string): string;
        getQuickInfoAtPosition(fileName: string, position: number): string;
        getNameOrDottedNameSpan(fileName: string, startPos: number, endPos: number): string;
        getBreakpointStatementAtPosition(fileName: string, position: number): string;
        getSignatureHelpItems(fileName: string, position: number): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { canRename: boolean, localizedErrorMessage: string, displayName: string, fullDisplayName: string, kind: string, kindModifiers: string, triggerSpan: { start; length } }
         */
        getRenameInfo(fileName: string, position: number): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { fileName: string, textSpan: { start: number, length: number } }[]
         */
        findRenameLocations(fileName: string, position: number, findInStrings: boolean, findInComments: boolean): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { fileName: string; textSpan: { start: number; length: number}; kind: string; name: string; containerKind: string; containerName: string }
         *
         * Or undefined value if no definition can be found.
         */
        getDefinitionAtPosition(fileName: string, position: number): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { fileName: string; textSpan: { start: number; length: number}; kind: string; name: string; containerKind: string; containerName: string }
         *
         * Or undefined value if no definition can be found.
         */
        getTypeDefinitionAtPosition(fileName: string, position: number): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { fileName: string; textSpan: { start: number; length: number}; isWriteAccess: boolean }[]
         */
        getReferencesAtPosition(fileName: string, position: number): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { definition: <encoded>; references: <encoded>[] }[]
         */
        findReferences(fileName: string, position: number): string;
        /**
         * @deprecated
         * Returns a JSON-encoded value of the type:
         * { fileName: string; textSpan: { start: number; length: number}; isWriteAccess: boolean }[]
         */
        getOccurrencesAtPosition(fileName: string, position: number): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { fileName: string; highlights: { start: number; length: number, isDefinition: boolean }[] }[]
         *
         * @param fileToSearch A JSON encoded string[] containing the file names that should be
         *  considered when searching.
         */
        getDocumentHighlights(fileName: string, position: number, filesToSearch: string): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { name: string; kind: string; kindModifiers: string; containerName: string; containerKind: string; matchKind: string; fileName: string; textSpan: { start: number; length: number}; } [] = [];
         */
        getNavigateToItems(searchValue: string, maxResultCount?: number): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { text: string; kind: string; kindModifiers: string; bolded: boolean; grayed: boolean; indent: number; spans: { start: number; length: number; }[]; childItems: <recursive use of this type>[] } [] = [];
         */
        getNavigationBarItems(fileName: string): string;
        /**
         * Returns a JSON-encoded value of the type:
         * { textSpan: { start: number, length: number }; hintSpan: { start: number, length: number }; bannerText: string; autoCollapse: boolean } [] = [];
         */
        getOutliningSpans(fileName: string): string;
        getTodoComments(fileName: string, todoCommentDescriptors: string): string;
        getBraceMatchingAtPosition(fileName: string, position: number): string;
        getIndentationAtPosition(fileName: string, position: number, options: string): string;
        getFormattingEditsForRange(fileName: string, start: number, end: number, options: string): string;
        getFormattingEditsForDocument(fileName: string, options: string): string;
        getFormattingEditsAfterKeystroke(fileName: string, position: number, key: string, options: string): string;
        /**
         * Returns JSON-encoded value of the type TextInsertion.
         */
        getDocCommentTemplateAtPosition(fileName: string, position: number): string;
        getEmitOutput(fileName: string): string;
    }
    interface ClassifierShim extends Shim {
        getEncodedLexicalClassifications(text: string, lexState: EndOfLineState, syntacticClassifierAbsent?: boolean): string;
        getClassificationsForLine(text: string, lexState: EndOfLineState, syntacticClassifierAbsent?: boolean): string;
    }
    interface CoreServicesShim extends Shim {
        getPreProcessedFileInfo(fileName: string, sourceText: IScriptSnapshot): string;
        getTSConfigFileInfo(fileName: string, sourceText: IScriptSnapshot): string;
        getDefaultCompilationSettings(): string;
        discoverTypings(discoverTypingsJson: string): string;
    }
    class LanguageServiceShimHostAdapter implements LanguageServiceHost {
        private shimHost;
        private files;
        private loggingEnabled;
        private tracingEnabled;
        resolveModuleNames: (moduleName: string[], containingFile: string) => ResolvedModule[];
        directoryExists: (directoryName: string) => boolean;
        constructor(shimHost: LanguageServiceShimHost);
        log(s: string): void;
        trace(s: string): void;
        error(s: string): void;
        getProjectVersion(): string;
        useCaseSensitiveFileNames(): boolean;
        getCompilationSettings(): CompilerOptions;
        getScriptFileNames(): string[];
        getScriptSnapshot(fileName: string): IScriptSnapshot;
        getScriptKind(fileName: string): ScriptKind;
        getScriptVersion(fileName: string): string;
        getLocalizedDiagnosticMessages(): any;
        getCancellationToken(): HostCancellationToken;
        getCurrentDirectory(): string;
        getDefaultLibFileName(options: CompilerOptions): string;
    }
    class CoreServicesShimHostAdapter implements ParseConfigHost, ModuleResolutionHost {
        private shimHost;
        directoryExists: (directoryName: string) => boolean;
        constructor(shimHost: CoreServicesShimHost);
        readDirectory(rootDir: string, extension: string, exclude: string[], depth?: number): string[];
        fileExists(fileName: string): boolean;
        readFile(fileName: string): string;
    }
    function realizeDiagnostics(diagnostics: Diagnostic[], newLine: string): {
        message: string;
        start: number;
        length: number;
        category: string;
        code: number;
    }[];
    class TypeScriptServicesFactory implements ShimFactory {
        private _shims;
        private documentRegistry;
        getServicesVersion(): string;
        createLanguageServiceShim(host: LanguageServiceShimHost): LanguageServiceShim;
        createClassifierShim(logger: Logger): ClassifierShim;
        createCoreServicesShim(host: CoreServicesShimHost): CoreServicesShim;
        close(): void;
        registerShim(shim: Shim): void;
        unregisterShim(shim: Shim): void;
    }
}
declare namespace TypeScript.Services {
    const TypeScriptServicesFactory: typeof ts.TypeScriptServicesFactory;
}
declare const toolsVersion: string;

export = ts;