# Eval results — 2026-10-28

`*` before a page = chunk from a different PDF than expected.

| # | PDF | Question | Expected page | Top-5 pages | Hit? | Cited correct page? | Time (s) | Answer |
|---|---|---|---|---|---|---|---|---|
| 1 | research-paper.pdf | How many identical layers does the Transformer encoder stack have? | 3 | 3, 5, *212, 2, 2 | Yes | Yes | 2.7 | The Transformer encoder stack has N = 6 identical layers. |
| 2 | research-paper.pdf | What hardware were the Transformer models trained on? | 7 | 8, 7, 2, 8, 10 | Yes | No | 2.4 | The Transformer models were trained on 8 P100 GPUs. The Transformer could reach a new state of the art in translation quality after being trained for as little as twelve hours on eight P100 GPUs. |
| 3 | research-paper.pdf | Which beta values were used with the Adam optimizer? | 7 | 7, *80, *141, 10, *276 | Yes | Yes | 1.9 | The Adam optimizer was used with β1 = 0.9 and β2 = 0.98. |
| 4 | research-paper.pdf | What value of label smoothing was used during training? | 8 | 7, 8, 9, *277, 8 | Yes | Yes | 1.7 | The label smoothing value used during training was ϵls = 0.1. |
| 5 | lecture-notes.pdf | What is the LMS update rule also known as? | 12 | 12, 11, 25, 51, 53 | Yes | Yes | 1.8 | The LMS update rule is also known as the Widrow-Hoff learning rule. |
| 6 | lecture-notes.pdf | What is the logistic or sigmoid function g(z) and how does it behave as z goes to infinity? | 23 | 23, 29, 178, 35, 22 | Yes | Yes | 2.7 | The logistic or sigmoid function is \(g(z)=\frac{1}{1+e^{-z}}\). As \(z \to \infty\), \(g(z)\) tends towards 1. It is always bounded between 0 and 1. |
| 7 | lecture-notes.pdf | What is the clustering problem that k-means solves? | 148 | 148, 150, 149, 147, 168 | Yes | Yes | 2.9 | In the clustering problem, we are given a training set {x(1), . . . , x(n)} and want to group the data into a few cohesive “clusters”. No labels y(i) are given, so this is an unsupervised learning problem. In k-means, k is the number of clusters we want to find, and the cluster centroids represent current guesses for the positions of the centers of the clusters. |
| 8 | lecture-notes.pdf | What does Jensen's inequality state? | 154 | 154, 155, 157, 156, 267 | Yes | Yes | 3.1 | Jensen’s inequality states that for a convex function \(f\) and a random variable \(X\), \(E[f(X)] \ge f(E[X])\). If \(f\) is strictly convex, then \(E[f(X)] = f(E[X])\) holds if and only if \(X = E[X]\) with probability 1. For concave functions, the direction of the inequalities is reversed, so \(E[f(X)] \le f(E[X])\). |
| 9 | lecture-notes.pdf | What does principal components analysis try to identify? | 168 | 168, 170, 173, 172, 171 | Yes | Yes | 1.7 | Principal components analysis tries to identify the subspace in which the data approximately lies. |
| 10 | lecture-notes.pdf | In reinforcement learning, why is the reward at timestep t discounted? | 230 | 230, 262, 246, 248, 229 | Yes | Yes | 3.8 | The reward at timestep t is discounted by a factor of γ^t. This makes the expectation large by encouraging positive rewards to be accrued as soon as possible and negative rewards to be postponed as long as possible. In economic applications, γ also has a natural interpretation in terms of the interest rate, where a dollar today is worth more than a dollar tomorrow. The introduction of γ was partly justified by the necessity of making sure that the infinite sum would be finite and well-defined. In a finite-horizon setting, because the payoff is a finite sum, the discount factor γ is not necessary anymore. |
| 11 | - | What is the capital of France? | - | *7, *10, *80, *2, *8 | – | not found ✅ | 1.4 | The answer was not found in the documents. |
| 12 | - | Who won the 2022 FIFA World Cup? | - | *80, *1, *192, *7, *115 | – | not found ✅ | 1.4 | The answer was not found in the documents. |

- Retrieval hit rate: 10/10
- Citation correctness: 9/10 (target ≥ 90%)
- "Not found" when evidence is missing: 2/2
- Median response time: 1.9 s (target ≤ 5 s)
