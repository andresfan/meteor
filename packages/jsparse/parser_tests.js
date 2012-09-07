

var makeTester = function (test) {
  var parseTestASTFormat = function (str) {
    var results = [];
    var ptrStack = [];
    var ptr = results;
    _.each(str.match(/\s?\(|\)|`.*?`|`|[^\s()`]+/g), function (txt) {
      var whitespaceBeforeOpen = false;
      if (/^\s\($/.test(txt)) {
        // paren preceded by whitespace
        txt = '(';
        whitespaceBeforeOpen = true;
      }
      switch (txt.charAt(0)) {
      case '(':
        var newArray =
              ((! whitespaceBeforeOpen) && ptr.length &&
               (typeof ptr[ptr.length - 1] === "string")) ?
              [ptr.pop()] : [];
        ptr.push(newArray);
        ptrStack.push(ptr);
        ptr = newArray;
        break;
      case ')':
        ptr = ptrStack.pop();
        break;
      case '`':
        if (txt.length === 1)
          throw new Error("Mismatched ` in " + str);
        ptr.push(txt.slice(1, -1));
        break;
      default:
        ptr.push(txt);
        break;
      }
      if (results.length > 1)
        throw new Error("Not expecting " + txt + " in " + str);
    });
    if (ptr !== results)
      throw new Error("Mismatched parentheses in " + str);
    return results[0];
  };
  var stringifyTestASTFormat = function (obj) {
    if (typeof obj === "string") {
      if (obj.charAt(0) === '(' || obj.charAt(0) === ')')
        return '`' + obj + '`';
      else
        return obj;
    } else {
      if (! obj.length)
        return '()';
      else
        return (stringifyTestASTFormat(obj[0]) + '(' +
                _.map(obj.slice(1), stringifyTestASTFormat).join(' ') +
                ')');
    }
  };

  return {
    goodParse: function (code, expectedAstString) {
      var expectedAst = parseTestASTFormat(expectedAstString);

      // first use lexer to collect all tokens
      var lexer = new Lexer(code);
      var allTokensInOrder = [];
      while (lexer.next() !== 'EOF') {
        if (lexer.type === 'ERROR')
          test.fail("Lexer error at " + lexer.lastPos);
        if (Lexer.isToken(lexer.type))
          allTokensInOrder.push({ pos: lexer.lastPos, text: lexer.text });
      }
      lexer = new Lexer(code);

      var tokenizer = new Tokenizer(code);
      var ast = parse(tokenizer);

      var nextTokenIndex = 0;
      var informalize = function (part) {
        if (_.isArray(part)) {
          if (part.length === 0) {
            // This is an EMPTY -- `[]`.  All good, pass it through
            return [];
          } else {
            // This is a NODE (non-terminal).  Make sure it actually is.
            if (! (part[0] && typeof part[0] === "string"))
              test.fail("Not a node name: " + part[0]);
            return part.slice(0, 1).concat(
              _.map(part.slice(1), informalize));
          }
        } else if (typeof part === 'object' && part.text &&
                   (typeof part.pos === 'number')) {
          // This is a TOKEN (terminal).
          // Make sure we are visiting every token once, in order.
          if (nextTokenIndex >= allTokensInOrder.length)
            test.fail("Too many tokens: " + (nextTokenIndex + 1));
          var referenceToken = allTokensInOrder[nextTokenIndex++];
          test.equal(part.text, referenceToken.text);
          test.equal(part.pos, referenceToken.pos);
          test.equal(code.substring(part.pos,
                                    part.pos + part.text.length), part.text);
          return part.text;
        } else {
          test.fail("Unknown AST part: " + part);
          return [];
        }
      };

      var actualAst = informalize(ast);
      if (nextTokenIndex !== allTokensInOrder.length)
        test.fail("Too few tokens: " + nextTokenIndex);

      test.equal(stringifyTestASTFormat(actualAst),
                 stringifyTestASTFormat(expectedAst));
    }
    // XXX write badParse
  };
};


Tinytest.add("jsparse - basics", function (test) {
  var tester = makeTester(test);
  tester.goodParse('1', "program(expression(number(1) ;()))");
  tester.goodParse('1 + 1', "program(expression(binary(number(1) + number(1)) ;()))");
  tester.goodParse('1*2+3*4', "program(expression(binary(binary(number(1) * number(2)) + " +
                "binary(number(3) * number(4))) ;()))");
  tester.goodParse('1 + 1;', "program(expression(binary(number(1) + number(1)) ;))");
  tester.goodParse('1 + 1;;', "program(expression(binary(number(1) + number(1)) ;) empty(;))");
  tester.goodParse('', "program()");
  tester.goodParse('\n', "program()");
  tester.goodParse(';;;\n\n;\n', "program(empty(;) empty(;) empty(;) empty(;))");
  tester.goodParse('foo', "program(expression(identifier(foo) ;()))");
  tester.goodParse('foo();', "program(expression(call(identifier(foo) `(` `)`) ;))");
  tester.goodParse('var x = 3', "program(var(var varDecl(x = number(3)) ;()))");
  tester.goodParse('++x;', "program(expression(unary(++ identifier(x)) ;))");
  tester.goodParse('x++;', "program(expression(postfix(identifier(x) ++) ;))");
  tester.goodParse(
    'throw new Error',
    "program(throw(throw new(new identifier(Error)) ;()))");
  tester.goodParse(
    'var x = function () { return 123; };',
    'program(var(var varDecl(x = functionExpr(function () `(` `)` ' +
      '{ return(return number(123) ;) })) ;))');
});
