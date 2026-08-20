Maintenance Tracker

Files:
- index.html
- style.css
- app.js

How it works:
- Add a maintenance task with location, task, optional part number, maintenance interval, and last-completed date.
- The app calculates the next due date automatically.
- Tasks are sorted by due date, with the most overdue first.
- "Complete Today" resets the maintenance clock using today's date.
- Tasks can be edited or deleted.
- Data is stored in the browser using localStorage.

To use on GitHub Pages:
1. Create a new GitHub repository.
2. Upload index.html, style.css, and app.js into the root of the repository.
3. In Settings > Pages, deploy from the main branch/root folder.
4. Open the resulting Pages address on your phone.
5. Optionally use Safari > Share > Add to Home Screen.

Important:
This first version stores data only on the device/browser where it is used. It does not yet sync between multiple phones.
