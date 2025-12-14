import { describe, it, expect } from 'vitest';
import { formatUnisonCode } from './unisonFormatter';

describe('Unison Formatter', () => {
  describe('Comments', () => {
    it('preserves single-line comments unchanged', () => {
      const input = '-- This is a comment\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('-- This is a comment\n');
    });

    it('preserves comment dividers with equals signs', () => {
      const input = '-- =============================================================================\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('-- =============================================================================\n');
    });

    it('preserves comment blocks unchanged', () => {
      const input = `-- =============================================================================
-- CLOUD-QUEUES BASED AUDIT PUBLISHING
-- =============================================================================
-- Solution: Use @stew/cloud-queues instead of Volturno KLog
-- - Queues.service only needs {Remote} ability (available in HTTP handlers!)
-- - No stale broker references - queue service handles everything
-- - Simple enqueue/dequeue pattern with ServiceName calls
-- =============================================================================
`;
      const result = formatUnisonCode(input);
      expect(result).toBe(input);
    });

    it('preserves inline comments', () => {
      const input = 'foo = bar -- this is a comment\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo = bar -- this is a comment\n');
    });

    it('does not modify operators inside comments', () => {
      const input = '-- a+b should stay as a+b in comments\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('-- a+b should stay as a+b in comments\n');
    });
  });

  describe('Binary Operators', () => {
    it('adds spaces around ++', () => {
      const input = 'a++b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a ++ b\n');
    });

    it('preserves ++ when already spaced', () => {
      const input = 'a ++ b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a ++ b\n');
    });

    it('adds spaces around &&', () => {
      const input = 'a&&b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a && b\n');
    });

    it('adds spaces around ||', () => {
      const input = 'a||b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a || b\n');
    });

    it('adds spaces around ==', () => {
      const input = 'a==b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a == b\n');
    });

    it('adds spaces around !=', () => {
      const input = 'a!=b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a != b\n');
    });

    it('adds spaces around |>', () => {
      const input = 'a|>b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a |> b\n');
    });

    it('adds spaces around <|', () => {
      const input = 'a<|b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a <| b\n');
    });

    it('adds spaces around >>', () => {
      const input = 'a>>b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a >> b\n');
    });

    it('adds spaces around <<', () => {
      const input = 'a<<b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a << b\n');
    });

    it('adds spaces around <=', () => {
      const input = 'a<=b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a <= b\n');
    });

    it('adds spaces around >=', () => {
      const input = 'a>=b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a >= b\n');
    });

    it('adds spaces around <>', () => {
      const input = 'a<>b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a <> b\n');
    });

    it('adds spaces around +', () => {
      const input = 'a+b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a + b\n');
    });

    it('adds spaces around -', () => {
      const input = 'a-b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a - b\n');
    });

    it('adds spaces around *', () => {
      const input = 'a*b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a * b\n');
    });

    it('adds spaces around /', () => {
      const input = 'a/b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a / b\n');
    });

    it('adds spaces around %', () => {
      const input = 'a%b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a % b\n');
    });
  });

  describe('Compound Operators (should not be broken)', () => {
    it('preserves <|> as a single operator', () => {
      const input = 'a<|>b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a <|> b\n');
    });

    it('does not break <|> into < |>', () => {
      const input = 'foo <|> bar\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo <|> bar\n');
    });

    it('preserves === as a single operator', () => {
      const input = 'a===b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a === b\n');
    });

    it('does not break === into == =', () => {
      const input = 'foo === bar\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo === bar\n');
    });

    it('does not break ++ into + +', () => {
      const input = 'list1 ++ list2\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('list1 ++ list2\n');
    });

    it('preserves -> in type signatures', () => {
      const input = 'foo : Nat -> Nat\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo : Nat -> Nat\n');
    });

    it('preserves -> in lambdas', () => {
      const input = 'x -> x + 1\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('x -> x + 1\n');
    });
  });

  describe('Unary Operators', () => {
    it('preserves unary + before numbers in function calls', () => {
      const input = '(fromHours +0)\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('(fromHours +0)\n');
    });

    it('preserves unary - before numbers in function calls', () => {
      const input = '(fromHours -1)\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('(fromHours -1)\n');
    });

    it('preserves +0 after comma', () => {
      const input = 'foo(a, +0, b)\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo(a, +0, b)\n');
    });

    it('preserves -1 after comma', () => {
      const input = 'foo(a, -1, b)\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo(a, -1, b)\n');
    });

    it('still formats binary + between identifiers', () => {
      const input = 'a+b\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('a + b\n');
    });
  });

  describe('Definitions', () => {
    it('adds spaces around = in definitions', () => {
      const input = 'foo=bar\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo = bar\n');
    });

    it('preserves = when already spaced', () => {
      const input = 'foo = bar\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo = bar\n');
    });

    it('handles multi-line definitions', () => {
      const input = `foo =
  bar
  baz
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('foo =');
    });
  });

  describe('Type Signatures', () => {
    it('adds spaces around : in type signatures', () => {
      const input = 'foo:Nat\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo : Nat\n');
    });

    it('preserves : when already spaced', () => {
      const input = 'foo : Nat -> Nat\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo : Nat -> Nat\n');
    });

    it('handles complex type signatures', () => {
      const input = 'map : (a -> b) -> [a] -> [b]\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('map : (a -> b) -> [a] -> [b]\n');
    });
  });

  describe('Commas', () => {
    it('adds space after commas', () => {
      const input = 'foo(a,b,c)\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo(a, b, c)\n');
    });

    it('preserves comma spacing when already correct', () => {
      const input = 'foo(a, b, c)\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo(a, b, c)\n');
    });
  });

  describe('String Literals', () => {
    it('does not modify operators inside double-quoted strings', () => {
      const input = '"a+b"\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('"a+b"\n');
    });

    it('does not modify operators inside single-quoted strings', () => {
      const input = "foo = 'a+b'\n";
      const result = formatUnisonCode(input);
      expect(result).toContain("'a+b'");
    });

    it('preserves content inside multi-line strings (triple quotes)', () => {
      const input = `message = """
  This is a
  multi-line
  string
"""
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('multi-line');
      expect(result).not.toContain('multi - line');
    });
  });

  describe('Doc Comments', () => {
    it('preserves doc comment blocks {- ... -}', () => {
      const input = `{- This is a
   doc comment -}
foo = 1
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('{- This is a');
      expect(result).not.toContain('{ - This is a');
    });

    it('preserves inline doc comments', () => {
      const input = 'foo = 1 {- inline doc -}\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('{- inline doc -}');
    });
  });

  describe('Dedent Pasted Code', () => {
    it('removes common leading indentation from pasted code', () => {
      const input = `    foo = 1
    bar = 2
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('foo = 1');
      expect(result).toContain('bar = 2');
      // Check they start at column 0
      const lines = result.split('\n');
      expect(lines[0].startsWith('foo')).toBe(true);
    });

    it('preserves relative indentation when dedenting', () => {
      const input = `    deploy env =
      hash = compute x
      hash
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('deploy env =');
      expect(result).toContain('  hash = compute x');
      // Deploy should be at column 0
      const lines = result.split('\n');
      expect(lines[0].startsWith('deploy')).toBe(true);
    });

    it('handles function with type signature pasted with indent', () => {
      const input = `    deploy : Environment -> ServiceHash
    deploy env =
      hash = compute x
      hash
`;
      const result = formatUnisonCode(input);
      // Type sig and definition should be at column 0
      const lines = result.split('\n');
      expect(lines[0].startsWith('deploy : ')).toBe(true);
      expect(lines[1].startsWith('deploy env')).toBe(true);
    });
  });

  describe('Blank Lines', () => {
    it('collapses multiple blank lines into one', () => {
      const input = `foo = 1


bar = 2
`;
      const result = formatUnisonCode(input);
      expect(result).toBe(`foo = 1

bar = 2
`);
    });

    it('adds blank line between top-level definitions if missing', () => {
      const input = `foo = 1
bar = 2
`;
      const result = formatUnisonCode(input);
      expect(result).toBe(`foo = 1

bar = 2
`);
    });

    it('keeps type signature with its definition (no blank line between)', () => {
      const input = `foo : Nat
foo = 1
`;
      const result = formatUnisonCode(input);
      expect(result).toBe(`foo : Nat
foo = 1
`);
    });
  });

  describe('Trailing Whitespace', () => {
    it('removes trailing whitespace from lines', () => {
      const input = 'foo = bar   \n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo = bar\n');
    });
  });

  describe('File Ending', () => {
    it('ensures file ends with single newline', () => {
      const input = 'foo = bar';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo = bar\n');
    });

    it('removes extra trailing newlines', () => {
      const input = 'foo = bar\n\n\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('foo = bar\n');
    });
  });

  describe('List Pattern Operators', () => {
    it('preserves +: cons pattern', () => {
      const input = `head = cases
  [] -> None
  x +: _ -> Some x
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('x +: _');
      expect(result).not.toContain('x + : _');
    });

    it('preserves :+ snoc pattern', () => {
      const input = `last = cases
  [] -> None
  _ :+ x -> Some x
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('_ :+ x');
      expect(result).not.toContain('_ : + x');
    });

    it('preserves ++: append-cons pattern', () => {
      const input = `foo = cases
  xs ++: ys -> bar
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('xs ++: ys');
    });

    it('still formats type signatures with lowercase type vars', () => {
      const input = 'identity:a->a\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('identity : a -> a');
    });
  });

  describe('Unison-Specific Syntax', () => {
    it('preserves watch expressions', () => {
      const input = '> 1 + 2\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('> 1 + 2\n');
    });

    it('preserves test expressions', () => {
      const input = 'test> myTest = expect (1 == 1)\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('test>');
    });

    it('preserves use statements', () => {
      const input = 'use Nat +\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('use Nat +\n');
    });

    it('preserves type declarations', () => {
      const input = 'type MyType = Foo | Bar\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('type MyType');
    });

    it('preserves structural type declarations', () => {
      const input = 'structural type MyType = Foo | Bar\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('structural type');
    });

    it('preserves unique type declarations', () => {
      const input = 'unique type MyType = Foo | Bar\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('unique type');
    });

    it('preserves ability declarations', () => {
      const input = 'ability MyAbility where\n  foo : Nat\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('ability MyAbility');
    });

    it('preserves structural ability declarations', () => {
      const input = 'structural ability MyAbility where\n  foo : Nat\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('structural ability');
    });

    it('preserves unique ability declarations', () => {
      const input = 'unique ability MyAbility where\n  foo : Nat\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('unique ability');
    });
  });

  describe('Indentation', () => {
    it('preserves indentation of nested code', () => {
      const input = `foo =
  let
    x = 1
    y = 2
  x + y
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('  let');
      expect(result).toContain('    x = 1');
    });

    it('handles cases blocks', () => {
      const input = `match x with
  None -> 0
  Some y -> y
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('match x with');
      expect(result).toContain('  None -> 0');
    });

    it('normalizes over-indented sibling bindings to match parent', () => {
      const input = `hash = Cloud.deploy.remote env Queues.service
      serviceName = ServiceName.named ("audit-publisher-" ++ Environment.label env)
`;
      const result = formatUnisonCode(input);
      // serviceName should be at same indent as hash (both top-level)
      expect(result).toContain('hash = Cloud.deploy.remote env Queues.service');
      expect(result).toContain('serviceName = ServiceName.named');
      // Check that serviceName starts at column 0 (no indent)
      const lines = result.split('\n');
      const serviceNameLine = lines.find(l => l.includes('serviceName ='));
      expect(serviceNameLine).toBeDefined();
      expect(serviceNameLine!.startsWith('serviceName')).toBe(true);
    });

    it('normalizes indented sibling bindings in let blocks', () => {
      const input = `foo =
  hash = compute x
      serviceName = getName y
  hash ++ serviceName
`;
      const result = formatUnisonCode(input);
      // Both bindings in the let block should have the same indent
      const lines = result.split('\n');
      const hashLine = lines.find(l => l.includes('hash = compute'));
      const serviceNameLine = lines.find(l => l.includes('serviceName = getName'));
      expect(hashLine).toBeDefined();
      expect(serviceNameLine).toBeDefined();
      const hashIndent = hashLine!.match(/^(\s*)/)?.[1]?.length || 0;
      const serviceNameIndent = serviceNameLine!.match(/^(\s*)/)?.[1]?.length || 0;
      expect(serviceNameIndent).toBe(hashIndent);
    });

    it('preserves indentation inside do blocks', () => {
      const input = `deploy env =
  queueServiceName = getQueueName env
  Cloud.submit env do
    _ = Services.callName queueServiceName
    ()
`;
      const result = formatUnisonCode(input);
      // Bindings inside do block should stay indented (4 spaces)
      const lines = result.split('\n');
      const bindingLine = lines.find(l => l.includes('_ = Services'));
      expect(bindingLine).toBeDefined();
      const bindingIndent = bindingLine!.match(/^(\s*)/)?.[1]?.length || 0;
      expect(bindingIndent).toBe(4); // 2 more than Cloud.submit
    });

    it('preserves indentation inside nested binding do blocks', () => {
      const input = `foo storage = do
  route = getRoute ()
  result = binding do
    user = authenticate() |> bind
    request = getRequest()
    note = process user request
    Right note
  result |> handleResult
`;
      const result = formatUnisonCode(input);
      const lines = result.split('\n');
      // Bindings inside `binding do` should be at 4 spaces
      const userLine = lines.find(l => l.includes('user = authenticate'));
      const requestLine = lines.find(l => l.includes('request = getRequest'));
      expect(userLine).toBeDefined();
      expect(requestLine).toBeDefined();
      expect(userLine!.match(/^(\s*)/)?.[1]?.length).toBe(4);
      expect(requestLine!.match(/^(\s*)/)?.[1]?.length).toBe(4);
      // `result |> handleResult` should be back at 2 spaces
      const resultLine = lines.find(l => l.includes('result |> handleResult'));
      expect(resultLine).toBeDefined();
      expect(resultLine!.match(/^(\s*)/)?.[1]?.length).toBe(2);
    });
  });

  describe('Complex Examples', () => {
    it('formats a complete function definition', () => {
      const input = `add:Nat->Nat->Nat
add x y=x+y
`;
      const result = formatUnisonCode(input);
      expect(result).toContain('add : Nat -> Nat -> Nat');
      expect(result).toContain('add x y = x + y');
    });

    it('handles pipe chains - breaks onto multiple lines', () => {
      const input = 'result = foo|>bar|>baz\n';
      const result = formatUnisonCode(input);
      expect(result).toContain('result =');
      expect(result).toContain('foo');
      expect(result).toContain('|> bar');
      expect(result).toContain('|> baz');
      // Each pipe should be on its own line
      const lines = result.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(4);
    });

    it('keeps single pipe on one line', () => {
      const input = 'result = foo |> bar\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('result = foo |> bar\n');
    });

    it('handles list concatenation', () => {
      const input = 'result = list1++list2++list3\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('result = list1 ++ list2 ++ list3\n');
    });

    it('handles mixed operators correctly', () => {
      const input = 'result = a+b*c-d/e\n';
      const result = formatUnisonCode(input);
      expect(result).toBe('result = a + b * c - d / e\n');
    });

    it('formats complex pipe chain with lambdas', () => {
      const input = 'audit.db.listByEntity storage entityId offset limit = OrderedTable.toStream (auditTable storage) |> Stream.map at2 |> Stream.filter (log -> AuditLog.entity_id log === entityId) |> Stream.toList |> List.reverse |> List.drop offset |> List.take limit\n';
      const result = formatUnisonCode(input);
      // Should break into multiple lines
      expect(result).toContain('audit.db.listByEntity storage entityId offset limit =');
      expect(result).toContain('OrderedTable.toStream (auditTable storage)');
      expect(result).toContain('|> Stream.map at2');
      expect(result).toContain('|> Stream.filter (log -> AuditLog.entity_id log === entityId)');
      expect(result).toContain('|> Stream.toList');
      expect(result).toContain('|> List.reverse');
      expect(result).toContain('|> List.drop offset');
      expect(result).toContain('|> List.take limit');
      // Verify it's on multiple lines
      const lines = result.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(8);
    });

    it('normalizes misaligned multi-line <|> chains', () => {
      const input = `  use Route <|>
  unison_routes_main.Route.run (
    health
        <|> routes.getLogsByEntity storage
      <|> routes.getLogsByEntityRelated storage
      <|> routes.listLogs storage
      <|>    audit.openapi.serveSpec
      <|> audit.openapi.serveSwaggerUI)
`;
      const result = formatUnisonCode(input);
      // All <|> lines should have consistent indentation
      const pipeLines = result.split('\n').filter(l => l.trim().startsWith('<|>'));
      expect(pipeLines.length).toBeGreaterThanOrEqual(5);
      // Check that all pipe lines have the same indentation
      const indents = pipeLines.map(l => l.match(/^(\s*)/)?.[1]?.length || 0);
      const firstIndent = indents[0];
      for (const indent of indents) {
        expect(indent).toBe(firstIndent);
      }
    });

    it('handles <|> alternative operator chains', () => {
      const input = 'result = a <|> b <|> c <|> d\n';
      const result = formatUnisonCode(input);
      // Should break onto multiple lines
      expect(result).toContain('result =');
      expect(result).toContain('<|> b');
      expect(result).toContain('<|> c');
      expect(result).toContain('<|> d');
    });
  });
});
