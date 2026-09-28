# LLM Response Evaluator

A lightweight browser tool for side-by-side evaluation of AI model responses — the same workflow used in RLHF-style AI training and LLM evaluation work.

**Live demo:** https://jadenlittlefielddavis-gif.github.io/llm-response-evaluator/

## What it does

- Paste a prompt and two model responses (A and B)
- Score each response 1–5 on a five-part rubric:
  - Instruction following
  - Factual accuracy
  - Relevance
  - Reasoning quality
  - Clarity & formatting
- Flag common failure modes: hallucination, missed constraint, incomplete answer, unsafe content, unnecessary refusal
- Choose a preference (A much better → B much better) and write a rationale
- **Built-in consistency checks** catch evaluator mistakes before saving:
  - Preference contradicts the score totals
  - Hallucination flagged but accuracy still scored high
  - Missed constraint flagged but instruction following still scored high
  - Rationale too short to be useful
- Export all saved evaluations to **JSON** or **CSV**

## Why I built it

I do contract AI model training and response evaluation. This project turns the evaluation process into a tool: a clear rubric, explicit failure-mode flags, and QA checks that keep ratings consistent, which is what makes evaluation data useful for improving models.

## Tech

Plain JavaScript, HTML, and CSS. No frameworks, no build step, no backend. Saved evaluations stay in the browser (localStorage).

## Run it

Open `index.html` in any browser, or visit the live demo link above.
Click **Load sample task** to try it with a built-in example.
