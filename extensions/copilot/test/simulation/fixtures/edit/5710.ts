interface Formattable {
    format(): string;
}
abstract class Expression implements Formattable {
    abstract format(): string;
}

class BinaryExpression extends Expression implements Formattable {
    format(): string {
        throw new Error("Method not implemented.");
    }
    left: Expression
    right: Expression
    operator: string
    constructor(left: Expression, right: Expression, operator: string) {
        super()
        this.left = left
        this.right = right
        this.operator = operator
    }
}
