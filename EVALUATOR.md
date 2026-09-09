# Pure Lambda Cube Evaluator

The active cube experiment is designed around a pure untyped lambda-calculus program with a small browser host.

The lambda program generates the cube topology from a zero-dimensional seed, stores coordinates as signed binary values encoded with lambda terms, applies exact scaled 5-12-13 rotations, and carries the common scale in the lambda state.

The browser host does not run the cube arithmetic. It provides a call-by-need graph reducer, schedules reductions continuously, decodes completed lambda data into BigInt values, and projects those completed coordinates to pixels.

There is no fixed math clock. Reduction runs continuously and yields briefly so the browser can paint the live evaluator state.
