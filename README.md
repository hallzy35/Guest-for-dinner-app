# From My Table

An iPad app for people who cook for friends and family: record who came to dinner, what you served, what they drank, and how it went — then find it all again in seconds.

## What it does

- **Guest database.** Type a name when planning or recording an event; existing guests autocomplete (with when they were last here), new names are added to the database automatically.
- **Guest preferences.** Drinks, allergies, dislikes, loves, and free-form notes per guest.
- **Dish library.** Dishes autocomplete the same way. Each dish has a course, optional key ingredients, and notes.
- **Search.** One box searches guests, dishes, drinks, and event notes.
  - A guest shows every visit with the menu, drinks, and how each dish went.
  - A dish shows every time it was served, to whom, and what else was on the menu.
- **Autocheck while planning.** As you add guests and dishes to an event, it flags:
  - dishes a guest has been served before (with dates and how they went), and
  - dishes whose name or listed ingredients match a guest’s allergy or dislike.

  The allergy/dislike check is simple word matching, not a food-safety system: it only knows the ingredients you list.
- **Guest briefing.** Adding a guest to an event shows their preferences and what you served them last time.
- **Merge duplicates.** On any guest or dish page, combine it with a duplicate (e.g. “Jim” and “James Smith”) and choose which name to keep. All history, preferences, ingredients and notes are kept.
- **Recipe cards.** Each dish is a full recipe card laid out like the chef's printed pages: main ingredient, style, complexity, category, prep/cooking/total time, ingredients, instructions, cooking style, source, stars and chef's notes. The Dishes tab is a recipe index with a category filter.
- **Recipe files.** Settings → *Add dishes* → *Choose recipe file* loads recipes converted from scanned pages; recipes already in the app are updated in place, keeping their history.
- **Add many dishes at once.** Settings → *Add dishes* → *Add many at once*: paste recipe titles from your cookbook file, use the iPad’s *Scan Text* on a printed page, or copy text from a photo. Page numbers and dot leaders are removed, and headings like “Desserts” set the course. You review the list before anything is saved.
- **Find dishes for these guests.** From an event, open the recipe index filtered to dishes none of the guests has had before and that don't clash with their allergies or dislikes; tap Add to put a dish on the menu.
- **Shopping list.** From an event, list every ingredient by dish, tick off what you already have, then print or share what's left. Quantities are not combined across dishes, since the cards' ingredient lines are free text.
- **Favourite dishes.** Mark a dish as a guest's favourite on their page, or tap ♡ next to a dish on an event's menu to mark it for everyone at that dinner. Favourites are listed first when you plan for that guest (even if they've had them before, longest since last had at the top), the event shows "♥ Jane's favourite · last had …" instead of "Served before", and an allergy or dislike clash still hides them.
- **Cookbook indexes.** The Dishes tab sorts by category & time, cooking style, best rated or under 30 minutes, with combinable filters, as cards or an index table.
- **Add to Calendar.** Each event (with an optional start time) can be added to the iPad’s calendar or Google Calendar, with the guest list, menu and allergies in the notes. The Events tab can add all upcoming events at once.
- **Light and dark mode.** Follows the iPad’s setting by default; the button at the top right switches between Auto, Light and Dark.
- **Works offline** and installs to the Home Screen.

## Where the data lives

Everything is stored in the browser on the device (IndexedDB). There is no server and no account, and nothing is synced. That means:

- **Back up regularly** from the Backup tab (saves a `.json` file to Files/iCloud Drive or wherever you share it). The app reminds you if it has been 30+ days.
- **Add it to the Home Screen** (Safari → Share → Add to Home Screen). iPadOS can clear website data for sites you haven’t visited in a while; Home Screen apps are exempt.
- Data in the Home Screen app and in a Safari tab are separate. Pick one (the Home Screen app).

## Running it

It is plain HTML/CSS/JS with no build step. Any static host works.

- **GitHub Pages:** in the repository settings, set *Pages → Source* to *GitHub Actions*. Pushing to `main` runs the tests and deploys (`.github/workflows/pages.yml`).
- **Locally:** `npm start` (serves on http://localhost:8080), or any static file server. Opening `index.html` directly from disk will not work because ES modules need HTTP.

## Development

```
npm test     # unit tests for search, history, and autocheck logic (Node 20+)
```

- `js/logic.js` — pure functions: search, histories, autocheck, backup validation.
- `js/db.js` — IndexedDB storage.
- `js/app.js` — UI and routing.
- `sw.js` — offline cache. It refreshes in the background, so a new deploy shows up on the second launch.
