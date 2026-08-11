# 🎯 DrillMCQ

A modern, fully client-side quiz platform built with **React**, **TypeScript**, and **Vite**. Paste quiz questions as plain text or JSON and instantly get a professional online-exam experience: no backend, no database, everything runs in your browser.

## Features

- **Plain-text MCQ import**: paste raw exam dumps or practice questions; a smart parser detects questions, options (A/B/C/D, a/b/c/d, numbered, bulleted), answers, explanations, and categories, with a live preview and per-line error/warning reporting. Common website and PDF clutter (ads, page numbers, "Show Answer" buttons, share widgets) is filtered out and reported as an ignored-lines count.
- **JSON import**: paste JSON into a textarea, with friendly validation errors
- **Multiple correct answers**: a question whose answer line lists more than one option (`Answer: A, C`) automatically becomes a "select all that apply" question with tick boxes and a **Check answer** button. Nothing to configure, and single-answer questions are unaffected.
- **Four clear destinations**: **Home**, **Create Quiz**, **Quiz Library**, and **Results** — a sticky header on desktop and a thumb-reachable bottom bar on phones
- **Home dashboard**: what to do next at a glance, plus a **Continue quiz** banner (with a progress bar) whenever an unfinished run is waiting
- **Guided import flow**: a **Paste → Review → Start** step indicator so it is obvious where you are and what comes next
- **Professional quiz engine**: one question at a time, progress bar, next/previous navigation
- **Distraction-free quiz screen**: while you are answering, the navigation is replaced by a slim bar showing the quiz name, timer, position, and progress — the only way out is a labelled back button behind a confirmation, so a stray tap can't abandon a run
- **Keyboard navigation**: `←`/`→` to move between questions, `1–8` or `A–H` to select answers (they tick and untick on a multi-answer question, with `Enter` to check it)
- **Results & review**: score, percentage, per-question review with correct/incorrect indicators
- **Explanations**: optional expandable explanation per question
- **Quiz library**: save imported quizzes to your **Quiz Library**, with question count, categories, best score, attempts, and status (not started / in progress / completed). Rename, start over, view results, or delete from a per-card menu
- **Resume**: leave or refresh mid-quiz and pick up from home or the library exactly where you left off, with answers, position, timer, and settings intact
- **Results history**: every completed attempt is kept locally, on its own **Results** screen and per quiz, with latest / best / average scores and a full review of any past attempt
- **Session persistence**: progress, answers, and timer survive a page refresh (localStorage)
- **Timer mode**: optional countdown that auto-submits when time runs out
- **Shuffle**: optionally shuffle questions and/or options
- **Category filtering**: pick which categories to include before starting
- **Review tools**: filter to incorrect answers only, search questions
- **JSON export**: download the loaded quiz as a JSON file from the results screen
- **Dark/light mode**: toggle from the header or the ⚙️ **Settings** dialog, with saved preference (respects OS preference by default)
- **Optional AI assistant**: bring your own key to tidy a messy paste, repair broken JSON, double-check answers, or explain a result — off by default, and every request is a deliberate button press
- **Mobile-first and responsive**: touch-sized targets, safe-area aware bottom navigation, and layouts that scale up to desktop

## Getting around

The app has exactly four destinations, in the header on desktop and in a bottom
bar on phones:

| Destination      | What lives there                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| 🏠 **Home**      | A short intro, the four things you can do, a **Continue quiz** banner for any unfinished run, and your most recent results |
| ➕ **Create Quiz** | The **Plain text** / **JSON** importer, the live preview, and the setup options                    |
| 📚 **Quiz Library** | Every saved quiz: start, continue, start over, rename, view its results, or delete                |
| 📊 **Results**   | Every completed attempt across all quizzes, including quizzes never saved to the library            |

⚙️ **Settings** (header) holds the theme switch and the optional AI assistant.

Everything else — the setup screen, an active run, a result, a quiz's history, a
stored attempt — is a layer over one of those four, so you always know where
"back" goes. While a quiz is being answered the navigation is deliberately
hidden: you get the quiz bar instead, and leaving asks first.

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
- [Vitest](https://vitest.dev/) for unit tests
- `localStorage` for persistence: **no backend, no database**

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

That serves the production build on http://localhost:4173.

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
results, corrupted data, migration), the pure library/history logic, the
plain-text parser, and the chunk splitters used by the AI rewrite workflows.

## Importing Questions

**Create Quiz** has two tabs, **Plain text** and **JSON**. Both are paste-only
textareas; there is no file-upload input. A **Paste → Review → Start** indicator
tracks where you are: after a successful import you can name and save the quiz
to your library, then choose shuffle, timer, and category options before
starting.

### Plain text format

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

12. Which of the following are characteristics of living organisms?

a) Growth
b) Reproduction
c) Photosynthesis
d) Respiration

Answer: a, b, d

AI Practitioner Exam Question 5
Which AWS service records configuration changes over time?

❏ A. AWS Security Hub

❏ B. AWS Config

❏ C. AWS CloudTrail

✓ B. AWS Config
```

Parsing rules:

- **Questions** start with a number (`1.`), a header (`Q1.`, `Question:`), a titled header (`AI Practitioner Exam Question 5`), or plain text after a completed question
- **Options** may be lettered (`A.`, `a)`, `(B)`), bulleted (`-`, `*`, `•`), or numbered (a run of 2+ numbered lines under a question). A leading checkbox glyph (`❏`, `☐`, `□`, `○`) is stripped, so exam dumps paste in as-is
- **Answers** use `Answer:`, `Ans:`, `Correct Answer:`, or `Correct:` followed by a letter, number, or the option text itself
- **Ticked answers** are also read: a line marked `✓` (or `✔`, `☑`) names the correct option, whether the tick sits on an option inside the list or repeats the winning option below it. Several ticked lines make the question a "select all that apply". An explicit `Answer:` line wins if both are present
- **Multiple answers** are written as a list on the same answer line: `Answer: A, C`, `Answer: A and C`, `Answer: a, b, d`, `Answer: A; C`. Every part has to resolve to a distinct option, otherwise the line is treated as a single answer — so an option whose own text contains a comma (`Answer: Atomicity, Consistency, Isolation, Durability`) is still matched as one answer
- **Explanations** use `Explanation:`, `Reason:`, `Rationale:`, `Because:`, or `Why:`
- **Categories** use `Category:`, `Topic:`, or `Subject:`
- Malformed questions are skipped with a per-line error message; the rest of the bank still loads

### Quiz JSON schema

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
    "correctAnswers": ["Amazon Web Services"],
    "explanation": "AWS stands for Amazon Web Services, Amazon's cloud computing platform.",
    "category": "Cloud",
    "difficulty": "easy"
  },
  {
    "id": 2,
    "question": "Which of the following are programming languages?",
    "options": ["Python", "HTML", "Java", "CSS"],
    "correctAnswers": ["Python", "Java"]
  }
]
```

| Field            | Type       | Required | Notes                                                                                       |
| ---------------- | ---------- | -------- | ------------------------------------------------------------------------------------------- |
| `id`             | `number`   | Yes      | Must be unique across the quiz                                                                |
| `question`       | `string`   | Yes      | The question text                                                                             |
| `options`        | `string[]` | Yes      | At least 2 options                                                                            |
| `correctAnswers` | `string[]` | Yes      | At least one entry, no duplicates, each exactly matching an option. Two or more make it multi-select |
| `explanation`    | `string`   | No       | Shown in an expandable panel when present                                                     |
| `category`       | `string`   | No       | Enables category filtering on the setup screen                                                |
| `difficulty`     | `string`   | No       | Displayed as a badge (e.g. `easy`, `medium`)                                                  |

A single `"correctAnswer": "…"` string is still accepted in place of
`correctAnswers`, so quizzes exported by an older build keep loading. Everything
the app writes out uses `correctAnswers`.

A ready-to-use sample lives at [`src/data/sampleQuiz.json`](src/data/sampleQuiz.json). You can also click **"Try the sample quiz"** on the JSON tab in the app.

## Multiple correct answers

A question is single- or multi-select purely from the number of entries in
`correctAnswers` — there is no separate setting, and nothing to switch on.

- **One correct answer**: unchanged. Click an option to select it; you can change
  your mind any time before you finish.
- **Two or more**: the card shows a **Select all that apply** badge and tick
  boxes. Tick as many options as you like, then press **Check answer** (or
  `Enter`) to submit them. The button stays disabled until you tick something.
  **A multi-answer question can only be answered once** — it locks after you
  check it, so the card warns you before you commit.

Correctness is never revealed during the quiz. Both kinds of question are marked
on the results screen, where each option is labelled as correct, missed, or a
wrong pick.

Scoring has no partial credit: a multi-answer question is correct only when the
selected set is exactly the correct set. For correct answers `A, C`:

| You selected | Result    |
| ------------ | --------- |
| A, C         | Correct   |
| A            | Incorrect |
| C            | Incorrect |
| A, B, C      | Incorrect |
| B, C         | Incorrect |
| A, B         | Incorrect |

## Data & Storage

Everything is stored in your browser's `localStorage` under versioned keys:

| Key                            | Contents                             |
| ------------------------------ | ------------------------------------ |
| `drillmcq_active_session.v1`   | The in-progress quiz session         |
| `drillmcq_saved_quizzes.v1`    | The **Quiz Library**                 |
| `drillmcq_quiz_results.v1`     | Completed attempts (append-only)     |
| `drillmcq.theme.v1`            | Dark/light preference                |
| `drillmcq_ai_prefs.v1`         | AI provider/model preference         |
| `drillmcq_ai_key.v1`           | Your API key — **only** if you opt in |
| `drillmcq_schema_version`      | Schema version used for migrations   |

The current schema version is **2**. Upgrading from an older version rewrites
stored questions and answers into the multi-answer shape in place, so saved
quizzes, an in-progress run, and your results history all survive the upgrade.

Nothing is ever sent to a server. Clearing site data clears your quizzes and
history. Corrupted records are repaired or dropped on load rather than crashing
the app, and if `localStorage` is full or blocked the app still runs, it just
stops persisting.

## AI assistant (optional)

DrillMCQ can use an AI model as a second opinion. It is **off by default and the
app is fully usable without it** — every feature above works untouched.

Because there is no backend, you bring your own API key: open ⚙️ **Settings** in
the header → **Configure AI assistant**, pick a provider (OpenAI, Google Gemini
or Anthropic Claude), choose a model, paste your key, and hit **Test
connection**. A green dot on the settings button means the assistant is
configured; it turns into a spinner while a request is in flight.

Once it is on, four optional actions appear:

| Where | Action | What it does |
| ----- | ------ | ------------ |
| Paste screen · Plain text | **✨ Format with AI** | Tidies a messy paste into the format the parser expects. The result goes back into the text box — the normal parser still does the actual importing, and you can undo it. |
| Paste screen · JSON | **✨ Fix JSON with AI** | Repairs broken or off-schema quiz JSON (trailing commas, missing fields, answers that don't match an option). The result goes back into the text box and is re-validated immediately, so a repair that didn't work says so straight away — and you can undo it. |
| After importing | **Verify answers** | The AI works out each answer itself and flags where it disagrees with your source. Useful for question banks scraped from the web, which often carry the wrong key. |
| Results screen | **🤖 Ask AI** | Explains why the correct answer is correct, why yours was wrong, and whether the source answer itself looks mistaken. |

Both rewrite buttons work through a long paste in several requests rather than
one, showing progress (`Fixing 2/5…`) as they go, and every AI action can be
cancelled mid-flight. If a part fails, the rest of your paste comes back
untouched with a note saying how far it got — nothing you pasted is ever lost.

**The AI never changes your quiz on its own.** When it disagrees with a source
answer you get both side by side and choose: keep the source, use the AI's
answer, or edit the answers yourself. Nothing runs automatically either — each
check is a button press, because each one costs you money against your own key.

### About your API key

Your key goes from your browser straight to the provider you picked. DrillMCQ
has no server, so it never receives or stores it.

- By default the key is kept **in memory only** — reload the page and it is gone.
- Ticking *"Remember this key on this device"* stores it in this browser in
  plain text. Convenient on your own machine; avoid it on a shared one.
- **Clear API key** removes it immediately.

This is browser-side key handling, so be honest with yourself about the
trade-off: any script running on the page could in principle read it. Prefer a
key scoped or rate-limited to this use.

AI output can be wrong. Treat it as a second opinion, not the final word.

## Deployment

The Vite config uses `base: './'` (relative asset paths), so the **same build works on both GitHub Pages and Vercel** with no changes.

### GitHub Pages

A GitHub Actions workflow is included at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It builds and deploys automatically on every push to `main`.

One-time setup:

1. Push the repository to GitHub
2. Go to **Settings → Pages**
3. Under **Build and deployment**, set **Source** to **GitHub Actions**
4. Push to `main`, and the site deploys to `https://<username>.github.io/DrillMCQ/`

### Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new)
2. Vercel auto-detects Vite, so accept the defaults:
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
 │    ├── AppNav.tsx           # Header + phone bottom bar (4 destinations)
 │    ├── HomeDashboard.tsx    # Home screen + "Continue quiz" banner
 │    ├── QuizTopBar.tsx       # The only chrome shown during a run
 │    ├── StepIndicator.tsx    # Paste → Review → Start
 │    ├── QuizCard.tsx         # Question + options card
 │    ├── QuizSetup.tsx        # Shuffle / timer / category settings
 │    ├── ProgressBar.tsx      # Progress indicator
 │    ├── ResultScreen.tsx     # Score summary + answer review
 │    ├── ExplanationPanel.tsx # Expandable explanation
 │    ├── ThemeToggle.tsx      # Dark/light mode switch
 │    ├── SettingsDialog.tsx   # Appearance + door into the AI assistant
 │    ├── QuizImporter.tsx     # Tabbed import (plain text / JSON)
 │    ├── TextUploader.tsx     # Plain-text MCQ import with live preview
 │    ├── JsonUploader.tsx     # Paste JSON import (+ optional AI repair)
 │    ├── SaveQuizPanel.tsx    # Name + save an import to the library
 │    ├── SavedQuizList.tsx    # Quiz Library + rename / start-over / delete
 │    ├── SavedQuizCard.tsx    # One saved quiz: status, score, actions
 │    ├── QuizHistory.tsx      # Per-quiz results history
 │    ├── RecentResults.tsx    # Home strip + full Results screen
 │    ├── Modal.tsx            # Focus-trapped dialog shell
 │    ├── ConfirmDialog.tsx    # Accessible confirmation modal
 │    ├── OverflowMenu.tsx     # Per-card "…" action menu
 │    ├── Spinner.tsx          # Inline busy indicator
 │    ├── AISettings.tsx       # AI provider / model / key (optional)
 │    ├── AIAnswerExplanation.tsx  # "Ask AI" panel on the results screen
 │    └── AIVerificationPanel.tsx  # AI answer check after importing
 ├── hooks/
 │    ├── useQuiz.ts           # Quiz state machine + persistence
 │    ├── useSavedQuizzes.ts   # Saved quiz library state
 │    ├── useQuizHistory.ts    # Completed attempts state
 │    ├── useTheme.ts          # Theme state
 │    ├── useTimer.ts          # Refresh-safe countdown
 │    ├── useBusyAction.ts     # Busy state for a one-shot async action
 │    └── useAI.ts             # AI config, key, and request lifecycle
 ├── services/
 │    ├── storage.ts           # localStorage wrapper + migration
 │    └── ai/                  # Provider-agnostic AI transport
 │         ├── aiService.ts    # Facade: send, normalize, redact keys
 │         ├── models.ts       # Curated model catalog per provider
 │         └── providers/      # openai / gemini / anthropic over fetch
 ├── types/
 │    ├── quiz.ts              # Shared TypeScript types
 │    ├── navigation.ts        # The four top-level destinations
 │    └── ai.ts                # AI domain types (leaf)
 ├── utils/
 │    ├── quiz.ts              # Validation, shuffling, scoring
 │    ├── library.ts           # Session <-> progress <-> attempt transforms
 │    ├── parseMcqText.ts      # Plain-text MCQ parser
 │    └── ai/                  # Pure prompt builders, chunk splitters,
 │                             # and response validation
 ├── data/
 │    └── sampleQuiz.json      # Sample quiz dataset
 ├── App.tsx
 ├── main.tsx
 └── index.css
```

## License

MIT
