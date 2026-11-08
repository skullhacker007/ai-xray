// Safe mathematical expression evaluator (No eval, No Function)
// Recursive-descent parser supporting +, -, *, /, %, ^ (power), parentheses, and unary operators

type TokenType = "NUMBER" | "OP" | "LPAREN" | "RPAREN";

interface Token {
  type: TokenType;
  value: string;
}

function tokenizeMath(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const str = expr.trim();

  while (i < str.length) {
    const ch = str[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      while (i < str.length && /[0-9.]/.test(str[i])) {
        numStr += str[i];
        i++;
      }
      if (numStr === "." || (numStr.match(/\./g) || []).length > 1) {
        throw new Error(`Invalid number: ${numStr}`);
      }
      tokens.push({ type: "NUMBER", value: numStr });
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    if (/[+\-*/%^]/.test(ch)) {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected character in expression: '${ch}'`);
  }

  return tokens;
}

export function evaluateSafeMath(expression: string): number {
  if (!expression || !expression.trim()) {
    throw new Error("Empty expression");
  }

  const tokens = tokenizeMath(expression);
  if (tokens.length === 0) {
    throw new Error("No tokens found in expression");
  }

  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(expectedValue?: string): Token {
    const token = tokens[pos];
    if (!token) {
      throw new Error("Unexpected end of expression");
    }
    if (expectedValue && token.value !== expectedValue) {
      throw new Error(`Expected '${expectedValue}', found '${token.value}'`);
    }
    pos++;
    return token;
  }

  // expr -> term (( '+' | '-' ) term)*
  function parseExpression(): number {
    let result = parseTerm();

    while (peek() && peek()!.type === "OP" && (peek()!.value === "+" || peek()!.value === "-")) {
      const op = consume().value;
      const right = parseTerm();
      if (op === "+") {
        result += right;
      } else {
        result -= right;
      }
    }

    return result;
  }

  // term -> power (( '*' | '/' | '%' ) power)*
  function parseTerm(): number {
    let result = parsePower();

    while (peek() && peek()!.type === "OP" && (peek()!.value === "*" || peek()!.value === "/" || peek()!.value === "%")) {
      const op = consume().value;
      const right = parsePower();
      if (op === "*") {
        result *= right;
      } else if (op === "/") {
        if (right === 0) {
          throw new Error("Division by zero");
        }
        result /= right;
      } else if (op === "%") {
        if (right === 0) {
          throw new Error("Modulo by zero");
        }
        result %= right;
      }
    }

    return result;
  }

  // power -> factor ( '^' power )* (right-associative)
  function parsePower(): number {
    const base = parseFactor();

    if (peek() && peek()!.type === "OP" && peek()!.value === "^") {
      consume("^");
      const exponent = parsePower(); // right-associative recursion
      return Math.pow(base, exponent);
    }

    return base;
  }

  // factor -> ( '+' | '-' ) factor | '(' expr ')' | NUMBER
  function parseFactor(): number {
    const token = peek();
    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    // Unary plus or minus
    if (token.type === "OP" && (token.value === "+" || token.value === "-")) {
      consume();
      const val = parseFactor();
      return token.value === "-" ? -val : val;
    }

    // Parentheses
    if (token.type === "LPAREN") {
      consume("(");
      const val = parseExpression();
      if (!peek() || peek()!.value !== ")") {
        throw new Error("Expected ')' to close parentheses");
      }
      consume(")");
      return val;
    }

    // Number
    if (token.type === "NUMBER") {
      consume();
      const num = Number(token.value);
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${token.value}`);
      }
      return num;
    }

    throw new Error(`Unexpected token: '${token.value}'`);
  }

  const finalValue = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`Unexpected trailing input: '${tokens[pos].value}'`);
  }

  if (!isFinite(finalValue)) {
    throw new Error("Calculation resulted in non-finite value");
  }

  return finalValue;
}
