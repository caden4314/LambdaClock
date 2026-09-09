# Live evaluator direction

The active cube workbench is being converted so the lambda viewport shows the actual term being beta-reduced, not a synthetic state visualization.

The intended boundary is:

1. A pure untyped lambda term constructs the cube graph.
2. A closed pure lambda `STEP` term transforms the graph state.
3. A small JavaScript evaluator performs ordinary leftmost-outermost beta reduction on that term.
4. The lambda viewport draws the exact current evaluator AST while reduction is in progress.
5. Only after a state reaches normal form does the display decoder read the Church-encoded graph and send coordinates to the canvas.
6. Canvas interpolation is visual-only; it does not generate geometry or topology.

The rotation core uses exact 90-degree coordinate permutations/sign negation so the lambda state remains bounded and can run indefinitely without numeric term explosion.
