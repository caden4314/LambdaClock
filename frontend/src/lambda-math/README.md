# Lambda Math Library

This folder is an internal reusable math subsystem for LambdaClock projects. It is not a standalone page or project.

## Design rule

If a result is presented as Lambda-computed, the mathematical path must come from Lambda reduction. Host JavaScript may encode inputs, schedule work, cache/share closures, measure runtime, and decode/format final values, but it must not secretly replace the Lambda operation with a native arithmetic or transcendental call.

## Layers

- `core.js` — untyped Lambda AST, de Bruijn compilation, call-by-need evaluator, beta-step accounting.
- `library.js` — Church booleans, pairs, fixed-width words, ripple-carry arithmetic, shifts/sign tests, fixed-point helpers, and CORDIC.
- `display.js` — formatting/view-model helpers for binary words, fixed-point registers, CORDIC output, and evaluator statistics. Display helpers never calculate the underlying result.
- `index.js` — stable import surface for projects. Prefer this over direct imports from implementation files.

## Example

```js
import {runCordicSinCos,cordicView,runAlu,wordView} from './lambda-math/index.js';

const trig=runCordicSinCos(Math.PI/6,{iterations:12});
const trigDisplay=cordicView(trig);

const sum=runAlu('add',12,7);
const sumDisplay=wordView(sum,{label:'SUM'});
```

`Math.PI` in this example is only used to encode the requested input angle. The displayed sine/cosine values are produced by the Lambda CORDIC term, not `Math.sin` or `Math.cos`.

## Current reusable capabilities

- Church TRUE/FALSE and boolean logic
- Church pairs/selectors
- 16-bit signed words
- full adder and ripple-carry add
- two's-complement negate/subtract
- arithmetic right shift
- sign selection
- Q2.13 fixed-point helpers
- circular CORDIC rotation for sine/cosine
- beta applications, force count, AST node statistics
- binary/hex/fixed-point display view models

## Extension policy

New math should be added as composable Lambda terms first, then exposed through `index.js`, then covered by `scripts/lambda-math-check.mjs`. New projects should consume the library rather than duplicating Church encodings, word arithmetic, CORDIC constants, or result-formatting code.
