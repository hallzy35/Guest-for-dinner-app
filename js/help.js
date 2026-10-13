// The in-app guide. Plain data so it is easy to keep in step with the app:
// each topic says why you'd do it, then a few steps using the exact button names.
// Screenshots live in help/ and are re-taken by tools/help-screenshots.mjs.

export const HELP_TOPICS = [
  {
    id: 'start',
    title: 'Getting started',
    why: 'Do these once on each new iPad or Mac, in this order.',
    steps: [
      'Open the app in Safari, tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, and from then on always open it from that icon. (On a Mac: Safari → File → <strong>Add to Dock</strong>.) The icon and a Safari tab keep <em>separate</em> data, so pick one and stick with it.',
      'Load your recipes: <strong>Settings</strong> → <strong>Choose recipe file</strong> → pick the recipe file → check the list → <strong>Load</strong>.',
      'Add the people you cook for under <strong>Guests</strong> — or just type their names into your first dinner and they’re added for you.',
      'Make your first backup: <strong>Settings</strong> → <strong>Save backup file</strong>, and save it to iCloud Drive.',
    ],
    shot: 'settings-add',
    tips: ['Everything is stored on this device only. Nothing is sent anywhere, so the backup file is your safety net.'],
  },
  {
    id: 'plan',
    title: 'Plan a dinner',
    why: 'Pick guests and a menu, and let the app warn you about repeats, allergies and dislikes.',
    steps: [
      '<strong>Events</strong> → <strong>＋ Plan an event</strong>. Set the date, time and occasion.',
      'Under <strong>Guests</strong>, type a name and pick it from the list. Each guest’s card shows their drinks, allergies, dislikes, favourites and what you served them last time.',
      'Tap <strong>Find dishes for these guests</strong> to browse recipes that none of them has had and that don’t clash with an allergy or dislike. Their favourites are listed first. Tap <strong>Add</strong> to put a dish on the menu.',
      'Or type a dish straight into <strong>Add a dish…</strong> under <strong>Menu</strong>.',
      'Read the coloured notes above the menu: <span class="tag allergy">⚠︎ Allergy</span> and <span class="tag dislike">✗ Dislike</span> need a change; <span class="tag served">↺ Served before</span> is just so you know; <span class="tag fav">♥ favourite</span> means they love it.',
    ],
    shot: 'event',
    tips: [
      'The allergy check matches dish names, main ingredients and ingredient lines only — always double-check for anything serious.',
      'There’s no Save button: everything saves as you type.',
    ],
  },
  {
    id: 'find',
    title: 'Find dishes for your guests',
    why: 'A shortlist of recipes that suit everyone at the table.',
    steps: [
      'From a dinner with guests on it, tap <strong>Find dishes for these guests</strong>.',
      '<strong>♥ Favourites of these guests</strong> come first, with when they last had each one — longest ago at the top.',
      'The two tick boxes hide dishes any of them has had before, and dishes that clash with an allergy or dislike. Untick one to see everything.',
      'Use the sort buttons, search and <strong>Filters</strong> just like the Dishes tab. Tap <strong>Add</strong>, then <strong>← Back to</strong> the dinner.',
    ],
    shot: 'plan',
  },
  {
    id: 'favourites',
    title: 'Favourite dishes',
    why: 'Remember what a guest loved so you can serve it again — without it being flagged as a repeat.',
    steps: [
      'On a dinner’s menu, tap the <strong>♡</strong> next to a dish to make it a favourite of everyone at that dinner. Tap <strong>♥</strong> again to undo.',
      'Or open the guest and add dishes under <strong>♥ Favourite dishes</strong>.',
    ],
    shot: 'guest',
    tips: ['An allergy or dislike always wins: a favourite that clashes is still hidden when planning.'],
  },
  {
    id: 'shop',
    title: 'Shopping list',
    why: 'Every ingredient for the menu, so you can tick off what you already have and shop for the rest.',
    steps: [
      'Put the dishes on the menu first, then tap <strong>Shopping list</strong> on the dinner.',
      'Tick anything you already have. Ticks are saved with the dinner.',
      '<strong>Print</strong> prints only what’s left; <strong>Share or copy</strong> sends it to Notes, Messages or Reminders.',
    ],
    shot: 'shop',
    tips: ['Ingredients are listed by dish exactly as written on the recipe card, so amounts aren’t added together across dishes.'],
  },
  {
    id: 'after',
    title: 'After the dinner',
    why: 'Notes you’ll be glad of next time these guests come.',
    steps: [
      'Open the dinner. Next to each dish, choose <strong>How did it go?</strong> — Loved it, Fine or Fell flat — and add a note if you like.',
      'Under <strong>Notes</strong>, fill in <strong>Beverages served</strong>, <strong>What worked</strong> and <strong>What didn’t</strong>.',
      'Learned something about a guest? Add it on their page — a new dislike, an allergy, a drink they liked.',
    ],
  },
  {
    id: 'recipes',
    title: 'Browse and edit recipes',
    why: 'The Dishes tab works like the index at the back of the cookbook.',
    steps: [
      'Pick how to browse: <strong>By category &amp; time</strong>, <strong>By cooking style</strong>, <strong>Best rated</strong>, <strong>Under 30 minutes</strong> or <strong>A–Z</strong>. Search by name, ingredient or source.',
      '<strong>Filters</strong> narrows by category, course, style, complexity, stars or total time. <strong>Clear filters</strong> resets them.',
      'Switch between <strong>Cards</strong> and <strong>Index</strong>. In the Index, tap a column heading to sort each section by it; tap again to reverse.',
      'Open a recipe to see the full card. <strong>Edit recipe</strong> to change it, <strong>Done</strong> when finished.',
    ],
    shot: 'index',
  },
  {
    id: 'add-recipes',
    title: 'Add recipes',
    why: 'Three ways in, from one dish to a whole file.',
    steps: [
      'One dish: <strong>Settings</strong> → type the name under <strong>One dish</strong> → <strong>Add and open</strong>, then fill in the card.',
      'A list of titles: <strong>Settings</strong> → <strong>Add many at once</strong>. Paste the list (or use the iPad’s Scan Text on a contents page) → <strong>Review list</strong> → <strong>Add them</strong>.',
      'A recipe file: <strong>Settings</strong> → <strong>Choose recipe file</strong>. You see the list first; recipes you already have are marked <em>Updates existing</em>.',
    ],
  },
  {
    id: 'guests',
    title: 'Guests',
    why: 'Everything you know about each guest, in one place.',
    steps: [
      'Open a guest from <strong>Guests</strong> (or tap their name on a dinner).',
      'Fill in <strong>Drinks</strong>, <strong>Allergies</strong>, <strong>Dislikes</strong> (separate with commas), <strong>Loves</strong> and <strong>Notes</strong>.',
      'Below that are their favourite dishes and every visit, with what you served.',
      'Same person entered twice? On either one, use <strong>Duplicate?</strong> to combine them — their visits and preferences are kept. Dishes have the same option.',
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar',
    why: 'Put the dinner in your calendar with the guest list, menu and allergies in the notes.',
    steps: [
      'On a dinner, under <strong>Calendar</strong>, tap <strong>📅 Add to Calendar</strong> (Apple Calendar) or <strong>Google Calendar</strong>.',
      'To add every upcoming dinner at once: <strong>Events</strong> → <strong>📅 Add … to Calendar</strong>.',
    ],
    tips: ['If you change the dinner later, add it again — the calendar updates the existing entry rather than making a second one.'],
  },
  {
    id: 'devices',
    title: 'Backups and two devices',
    why: 'Each iPad or Mac keeps its own copy. Backup files move data between them and keep it safe.',
    steps: [
      '<strong>Save backup file</strong> (Settings) regularly and keep it in iCloud Drive.',
      '<strong>Using two devices?</strong> On the device you last used, <strong>Save backup file</strong>. On the other, <strong>Merge from another device</strong> → choose that file. You’ll see what will change before anything does.',
      'To bring both fully up to date, then do the same the other way round.',
      '<strong>Restore</strong> is different: it <em>replaces</em> everything on this device with the file. Use it to set up a new device or recover from a problem — not to combine two devices.',
    ],
    shot: 'merge',
    tips: [
      'Merge keeps the most recent edit when the same thing was changed on both devices, and keeps deletions.',
      'A dinner typed into both devices separately will appear twice after merging — delete the extra one.',
    ],
  },
  {
    id: 'helpers',
    title: 'For helpers: setting up and fixing things',
    why: 'Notes for whoever is helping set up a device or sort out a problem.',
    steps: [
      '<strong>Where the data lives:</strong> only in the browser storage of each device, tied to the app’s web address. Nothing is on a server. The home-screen icon and a Safari tab have separate storage.',
      '<strong>New device:</strong> on the old device, <strong>Save backup file</strong>; on the new one, add the app to the Home Screen, open it from the icon, then <strong>Restore</strong> that file.',
      '<strong>Updates:</strong> the app updates itself in the background. Close and reopen it once; the next open shows the new version.',
      '<strong>The recipe file:</strong> keep a copy of it somewhere safe. It reloads every recipe if a device is ever wiped, and loading it again won’t duplicate recipes.',
    ],
    trouble: [
      ['Dishes or guests are missing', 'Check you opened the app from the same place as usual (home-screen icon vs Safari). If the data really is gone, <strong>Restore</strong> the latest backup, or load the recipe file again.'],
      ['The app looks out of date', 'Close it completely (swipe it away) and open it again.'],
      ['The home-screen name or icon is old', 'Make a backup, delete the home-screen icon, and add it again from Safari. The data stays.'],
      ['A merge did something unexpected', '<strong>Restore</strong> the backup made just before merging, then try again.'],
    ],
  },
];
