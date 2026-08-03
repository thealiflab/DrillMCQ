# 🎯 DrillMCQ

A modern, fully client-side quiz platform built with **React**, **TypeScript**, and **Vite**. Paste quiz questions in JSON format and instantly get a professional online-exam experience — no backend, no database, everything runs in your browser.

## Features

- **Plain-text MCQ import** — paste raw exam dumps or practice questions; a smart parser detects questions, options (A/B/C/D, a/b/c/d, numbered, bulleted), answers, explanations, and categories, with a live preview and per-line error/warning reporting
- **JSON import** — paste JSON into a textarea, with friendly validation errors
- **Professional quiz engine** — one question at a time, progress bar, next/previous navigation
- **Keyboard navigation** — `←`/`→` to move between questions, `1–8` or `A–H` to select answers
- **Results & review** — score, percentage, per-question review with correct/incorrect indicators
- **Explanations** — optional expandable explanation per question
- **Quiz library** — save imported quizzes to a local **My Quizzes** section on the main screen, with question count, categories, last score, and attempt status (not started / in progress / completed)
- **Resume** — leave or refresh mid-quiz and pick up from the library exactly where you left off, with answers, position, timer, and settings intact
- **Results history** — every completed attempt is kept locally per quiz, with latest / best / average scores and a full review of any past attempt
- **Session persistence** — progress, answers, and timer survive a page refresh (localStorage)
- **Timer mode** — optional countdown that auto-submits when time runs out
- **Shuffle** — optionally shuffle questions and/or options
- **Category filtering** — pick which categories to include before starting
- **Review tools** — filter to incorrect answers only, search questions
- **Import/export** — export the loaded quiz back to a JSON file
- **Dark/light mode** — toggle with saved preference (respects OS preference by default)
- **Responsive** — works on mobile, tablet, and desktop

## Screenshots

> _Add screenshots here_
>
> ![Setup screen](docs/screenshots/setup.png)
> ![Quiz screen](docs/screenshots/quiz.png)
> ![Results screen](docs/screenshots/results.png)

## Tech Stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) (strict mode)
- [Vite](https://vite.dev/) for dev server and builds
- [Tailwind CSS v4](https://tailwindcss.com/) for styling
- `localStorage` for persistence — **no backend, no database**

## Getting Started

### Prerequisites

- Node.js 20+ and npm

### Installation

```bash
git clone https://github.com/thealiflab/DrillMCQ.git
cd DrillMCQ
npm install
```

### Run locally

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### Build for production

```bash
npm run build
```

The optimized static site is emitted to `dist/`. Preview it locally with:

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

### Test

```bash
npm test          # run once
npm run test:watch
```

Tests cover the storage layer (saving, loading, updating and deleting quizzes and
results, corrupted data, migration) and the pure library/history logic.

## Plain Text Format

The **Plain text** tab accepts loosely formatted MCQ content. All of these work (and can be mixed in one paste):

```text
1. What does AWS stand for?

A. Advanced Web System
B. Amazon Web Services
C. Automated Web Solution
D. Application Web Service

Answer: B
Explanation: AWS stands for Amazon Web Services.

What is the capital of Australia?
a) Sydney
b) Melbourne
c) Canberra
d) Perth

Correct Answer: Canberra

Question: Which language runs in the browser?
- Python
- Java
- JavaScript
- C++

Answer: JavaScript
```

Parsing rules:

- **Questions** start with a number (`1.`), a header (`Q1.`, `Question:`), or plain text after a completed question
- **Options** may be lettered (`A.`, `a)`, `(B)`), bulleted (`-`, `*`, `•`), or numbered (a run of 2+ numbered lines under a question)
- **Answers** use `Answer:`, `Ans:`, `Correct Answer:`, or `Correct:` followed by a letter, number, or the option text itself
- **Explanations** use `Explanation:`, `Reason:`, `Rationale:`, `Because:`, or `Why:`
- **Categories** use `Category:`, `Topic:`, or `Subject:`
- Malformed questions are skipped with a per-line error message; the rest of the bank still loads

## Quiz JSON Schema

The app accepts an **array of question objects**:

```json
[
  {
    "id": 1,
    "question": "What does AWS stand for?",
    "options": [
      "Amazon Web Services",
      "Advanced Web System",
      "Application Web Services",
      "Automated Web Solution"
    ],
    "correctAnswer": "Amazon Web Services",
    "explanation": "AWS stands for Amazon Web Services, Amazon's cloud computing platform.",
    "category": "Cloud",
    "difficulty": "easy"
  }
]
```

| Field           | Type       | Required | Notes                                             |
| --------------- | ---------- | -------- | ------------------------------------------------- |
| `id`            | `number`   | ✅       | Must be unique across the quiz                    |
| `question`      | `string`   | ✅       | The question text                                 |
| `options`       | `string[]` | ✅       | At least 2 options                                |
| `correctAnswer` | `string`   | ✅       | Must exactly match one of the `options`           |
| `explanation`   | `string`   | —        | Shown in an expandable panel when present         |
| `category`      | `string`   | —        | Enables category filtering on the setup screen    |
| `difficulty`    | `string`   | —        | Displayed as a badge (e.g. `easy`, `medium`)      |

A ready-to-use sample lives at [`src/data/sampleQuiz.json`](src/data/sampleQuiz.json) — or click **"Try the sample quiz"** in the app.

## Deployment

The Vite config uses `base: './'` (relative asset paths), so the **same build works on both GitHub Pages and Vercel** with no changes.

### GitHub Pages

A GitHub Actions workflow is included at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It builds and deploys automatically on every push to `main`.

One-time setup:

1. Push the repository to GitHub
2. Go to **Settings → Pages**
3. Under **Build and deployment**, set **Source** to **GitHub Actions**
4. Push to `main` — the site deploys to `https://<username>.github.io/DrillMCQ/`

### Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new)
2. Vercel auto-detects Vite — accept the defaults:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
3. Deploy 🎉

Or via the CLI:

```bash
npm i -g vercel
vercel
```

## Project Structure

```text
src/
 ├── components/
 │    ├── QuizCard.tsx         # Question + options card
 │    ├── QuizSetup.tsx        # Shuffle / timer / category settings
 │    ├── ProgressBar.tsx      # Progress indicator
 │    ├── ResultScreen.tsx     # Score summary + answer review
 │    ├── ExplanationPanel.tsx # Expandable explanation
 │    ├── ThemeToggle.tsx      # Dark/light mode switch
 │    ├── QuizImporter.tsx     # Tabbed import (plain text / JSON)
 │    ├── TextUploader.tsx     # Plain-text MCQ import with live preview
 │    ├── JsonUploader.tsx     # Paste JSON import
 │    ├── SaveQuizPanel.tsx    # Name + save an import to the library
 │    ├── SavedQuizList.tsx    # "My Quizzes" section + delete flow
 │    ├── SavedQuizCard.tsx    # One saved quiz: status, score, actions
 │    ├── QuizHistory.tsx      # Per-quiz results history
 │    ├── RecentResults.tsx    # Recent attempts across all quizzes
 │    └── ConfirmDialog.tsx    # Accessible confirmation modal
 ├── hooks/
 │    ├── useQuiz.ts           # Quiz state machine + persistence
 │    ├── useSavedQuizzes.ts   # Saved quiz library state
 │    ├── useQuizHistory.ts    # Completed attempts state
 │    ├── useTheme.ts          # Theme state
 │    └── useTimer.ts          # Refresh-safe countdown
 ├── services/
 │    └── storage.ts           # localStorage wrapper + migration
 ├── types/
 │    └── quiz.ts              # Shared TypeScript types
 ├── utils/
 │    ├── quiz.ts              # Validation, shuffling, scoring
 │    ├── library.ts           # Session <-> progress <-> attempt transforms
 │    └── parseMcqText.ts      # Plain-text MCQ parser
 ├── data/
 │    └── sampleQuiz.json      # Sample quiz dataset
 ├── App.tsx
 ├── main.tsx
 └── index.css
```

## License

MIT
