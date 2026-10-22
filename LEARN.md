# Learning to work on SleepSphere

This is a guide to *your own app*, written to teach rather than to document.

You have something most beginners never get: a real, working app that you
care about and understand the purpose of. That is worth more than any
tutorial, because you will never have to pretend to care whether the button
turns blue.

Work through this in order. Each step is a real change to the real app, and
you can see every one of them on screen.

---

## 0. The loop you need before anything else

Everything in programming is this loop:

```
change something  →  look at it  →  it's wrong  →  change it again
```

The whole job is making that loop fast. So set it up first.

**Open a terminal** (on a Mac: Cmd+Space, type "Terminal", Enter). Then:

```bash
cd ~/SleepSphere          # wherever you put the folder
python3 -m http.server 8099
```

Leave that running. Open **http://localhost:8099** in your browser.

Now open `index.html` in a text editor. [VS Code](https://code.visualstudio.com)
is free and is what most people use.

Change something, save, refresh the browser. **That is the loop.** Everything
below is just choosing what to change.

> Why a server instead of double-clicking the file? Browsers treat files
> opened directly as a different kind of thing and block some features the
> app uses. One command saves you an evening of confusion.

---

## 1. The shape of the thing

`index.html` is about 6,200 lines and contains the whole app: the HTML,
the CSS and the JavaScript, in that order.

That is unusual. Most apps split into many files. This one doesn't, and the
reason is worth knowing: it has **no build step**. There is nothing to
install, nothing to compile, no `npm` anything. The file you edit is the file
that runs. For a solo project you want to be able to pick up in six months,
that is a real advantage — the cost is that the file is long, and you find
things by searching rather than by opening a folder.

**So the most important skill here is search, not scrolling.** In VS Code,
Cmd+F searches the file. Cmd+Shift+F searches every file.

The three parts:

| Lines | What | How to recognise it |
|---|---|---|
| ~1–700 | **HTML** — the elements on screen | angle brackets: `<div>`, `<button>` |
| ~700–1700 | **CSS** — what they look like | curly braces with `colour: value;` inside |
| ~1700–6235 | **JavaScript** — what happens | `function`, `const`, `if` |

HTML is the nouns. CSS is the adjectives. JavaScript is the verbs.

---

## 2. Your first five changes

Do these in order. They take about an hour total and each one is real.

### Change 1 — words

Search for `Too tired` — that's the Lazy mode button. Change the words
between `>` and `<`, leaving the pointy brackets alone:

```html
<button class="btn ghost" id="lazyStart">Too tired — just go to bed</button>
                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^
                                         only this part
```

Save. Refresh. **You just edited the app.**

> **If nothing changes, you have not done anything wrong.** Two things in
> this app can eat your edit, and both are worth meeting now rather than at
> midnight some other day.
>
> **The app caches itself** so it works offline, so the browser may be
> showing you an older copy. Try **Cmd+Shift+R** instead of Cmd+R. If that
> fails, stop the server (Ctrl+C) and restart it on a different port —
> `python3 -m http.server 8100` — then use `localhost:8100`. A new port is a
> new address, so there is nothing cached to fight.
>
> **Some text is written by JavaScript, not by the HTML.** If you edit the
> HTML version of something JavaScript controls, it gets overwritten a
> split second after the page loads and you will never see your change. The
> headline on the Tonight screen is one of these — `pageTitle` looks
> editable in the HTML but line 2721 rewrites it every time you navigate.
>
> **How to tell which you are looking at:** search the file for the `id`
> (like `lazyStart` or `pageTitle`). Find it once → it is static, safe to
> edit. Find it in the JavaScript too → the JavaScript is the boss of that
> text, and that is where you change it.

### Change 2 — a number that changes a feeling

Go to **line 4890**:

```js
if (!calm.matches) spin += dt * 0.0000035;
```

That is how fast the night sky rotates. Change `0.0000035` to `0.00005`.
Save, refresh, look at the stars.

Too fast, isn't it? Now try `0.000001`. Too slow. Find one you like.

**What you just learned:** a single number can be the difference between
"calm" and "distracting". Most design work is finding those numbers. Nobody
gets them right first try — I didn't, which is why you told me the stars
looked wrong twice.

### Change 3 — a number that changes a fact

Go to **line 5574**:

```js
const FATIMI = { fajr: 17.7, maghrib: 0.833, isha: 14, asrFactor: 1,
                 ihtiyat: 2 };
```

This is the whole prayer convention — the thing you and I spent a long time
getting right. Change `fajr: 17.7` to `fajr: 16`, refresh, and look at the
Fajr time. It moves by about eight minutes.

**Now change it back**, because 16 is wrong and you know why.

**What you just learned:** somewhere in every program there is a small set of
values that decide what it *means*, as opposed to how it looks. Finding those
is how you understand a codebase you didn't write.

### Change 4 — make the change prove itself

Open a **second** terminal window (keep the server running in the first):

```bash
cd ~/SleepSphere
node test/fatimi-convention.js
```

You should see a column of `PASS`. Now go and break something on purpose —
set `fajr` back to `16` — and run it again.

It fails, and it tells you exactly what and by how much.

**This is the single most valuable habit in programming.** Not writing tests
— *running* them. Change something, run the tests, and the computer tells you
whether you broke something you weren't even thinking about. Set `fajr` back
to `17.7` and watch it go green again.

### Change 5 — read an error on purpose

In `index.html`, find any line ending in `;` inside the JavaScript and delete
a closing bracket `)`. Save. Refresh. The app will be blank or broken.

Now open the browser console: **Cmd+Option+J** (Chrome) or **Cmd+Option+C**
(Safari, after enabling the Develop menu in Settings → Advanced).

There is a red error with a **line number**. Go to that line. Fix it.

**What you just learned:** broken does not mean mysterious. The browser tells
you where. Most beginners panic at red text; the red text is the most helpful
thing on the screen. Get comfortable there early and everything after is
easier.

---

## 3. The five ideas that cover most of it

You don't need computer science. You need these.

**A variable is a labelled box.**
```js
const bedtime = '23:40';
```
`const` means the label won't be pointed at something else later. `let` means
it might. That's the whole distinction.

**A function is a recipe with a name.**
```js
function typicalLatency() { ...; return 15; }
```
Defining it does nothing. *Calling* it — `typicalLatency()` — runs it. The
brackets are the difference between a recipe in a book and actually cooking.

**An object is a labelled box of labelled boxes.**
```js
const FATIMI = { fajr: 17.7, maghrib: 0.833 };
FATIMI.fajr   // 17.7
```
Almost all of this app's data is objects. A saved night is one. A city is one.

**An array is an ordered list.**
```js
state.mornings        // every night you've recorded
state.mornings[0]     // the first one — counting starts at 0, always
```

**An event is "when this happens, run that."**
```js
$('#lazyStart').addEventListener('click', startLazyNight);
```
Read it as: *when the thing called `lazyStart` is clicked, run
`startLazyNight`.* Nearly every button in this app is one of these lines.
Search for `addEventListener` and you are looking at a list of everything a
person can do in the app.

That's it. Those five ideas explain most of the 6,000 lines.

---

## 4. Follow one thing all the way through

This is the exercise that turns "I can change things" into "I understand
this." Do it slowly and it will click.

**Trace what happens when you tap "Too tired — just go to bed."**

1. Search for `lazyStart`. You'll find it twice: once in the HTML (the button
   itself) and once in the JavaScript (`addEventListener`).
2. The listener calls `startLazyNight`. Search for
   `function startLazyNight` — **line 5019**.
3. Read it line by line. It: gets the time now, puts it in `state.lazyNight`,
   calls `saveState()`, writes a sentence onto the screen, shows the overlay,
   and sets a timer to hide it.
4. Search for `function saveState` — **line 2678**. That writes everything to
   the browser's storage.
5. Now find `function checkLazyMorning`, just below. That is what runs *next
   morning* when the app opens.

**You have just read a whole feature end to end.** Every feature in every app
is this shape: something happens → a function runs → data changes → the screen
updates.

Do the same trace for the prayer card (`renderPrayer`) and you'll have the
two halves of the app.

---

## 5. Real changes to make next

Graded. Each is genuinely useful, not homework.

**Warm-up — you can do these now**
- [ ] Change the three Lazy mode words (`Rough` / `OK` / `Good`) to wording
      you prefer. Search `data-lazy-rate`.
- [ ] Change the star colours. **Line ~4715**, the `HUES` list — those are
      red/green/blue values 0–255. Try making them warmer.
- [ ] Add your city to `CITIES` if it's missing. **Line 5581**. Copy a
      neighbouring line and change the name, latitude, longitude and timezone.

**Next — a bit of thinking**
- [ ] Make Lazy mode's overlay stay up for 10 seconds instead of 6.5. Search
      `6500` near line 5019. Then ask yourself why it auto-hides at all.
- [ ] The nap guard is "under 2 hours isn't a night" (**line 5042**,
      `elapsed < 120`). Is 2 hours right? Change it and justify your answer.
- [ ] Add a fourth Lazy mode option between Rough and OK. You'll need to touch
      the HTML *and* check the rating still saves. Run `node test/lazy-mode.js`
      after.

**Real work — ask me and we'll pair on it**
- [ ] Show a "nights recorded" count on the Tonight screen.
- [ ] Let someone delete a single night from My records.
- [ ] Add a second timetable city to `GROUND_TRUTH` in
      `test/fatimi-convention.js` — this is the one that would settle the
      Fajr angle question for good.

---

## 6. How to use me well

Now that you're editing this yourself, the way you ask changes.

**Ask for explanation before code.** "Explain how `renderPrayer` decides what
to show" teaches you something. "Add a feature" doesn't.

**Try first, then ask.** Even a broken attempt is worth more than a blank
page, because then the question becomes "why didn't this work?" — and *that*
is the question that makes things stick.

**Ask me to review what you wrote.** Paste it and ask what I'd change and
why. This is what a senior engineer does for a junior, and it's the fastest
way to improve.

**Ask why, not just what.** "Why a canvas instead of CSS for the stars?" has
a real answer, and the answer is a lesson you'll reuse.

**Make me justify myself.** If I write something you don't understand, say
so. If it can't be explained clearly it's probably worse than it needs to be
— and you catching that has already happened in this project more than once.

---

## 7. What to say about who built this

Don't oversell and don't undersell. Both damage you.

> *"I designed and built it with Claude. I specified it, validated every
> prayer time against our Dawat timetable — I caught three fiqh errors the AI
> had wrong — and I'm now maintaining the code myself."*

That is true, it's stronger than a claim you'd have to defend, and every week
you spend in this file makes the last clause truer.

Using AI to write code is what most working programmers now do. The part
that's actually yours — knowing what to build, for whom, and being able to
tell when it's wrong — is the part that was never automatable. You've already
demonstrated it: I had Maghrib at 4° depression, my tests passed, two
published references agreed with me, and it was **fourteen minutes wrong
every day** until you said so.

No amount of coding skill would have caught that. That's your contribution,
and it's the one that mattered most.
