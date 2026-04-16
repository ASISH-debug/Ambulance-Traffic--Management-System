# Flask Ambulance Auth Enhancement TODO

## Approved Plan Steps (Iterative Implementation)

### 1. Backend Setup (app.py)
- [ ] Integrate SQLite (users.db): CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)
- [ ] Add imports: sqlite3, flash (from flask import flash)
- [ ] Replace users={} with SQLite functions (init_db(), get_user(), create_user(), etc.)
- [x] Implement @app.before_request for protection (exclude /login, /signup, /static/*)
- [x] Integrate SQLite (users.db, init_db, get_user, create_user)
- [x] Enhance routes: /login (flash errors with DB), /signup (validate + DB), /support, dashboard username
- [ ] Test backend flows
- [x] Fix duplicates: merge simulation/home into clean structure, / root → /login or dashboard
- [ ] Test backend flows

### 2. Templates (HTML + Navbar)
- [x] Create shared base.html with navbar (conditional on username), flash messages
- [x] Update login.html, signup.html, support.html, dashboard.html: extend base, auth-box, content blocks
- [x] Test renders/UI consistency

### 3. Styling
- [ ] static/auth.css: auth-box (glass, centered), form inputs/buttons (dark theme, hover), flash messages (green/red slide-in)
- [ ] static/style.css: add .navbar styles (glass topbar, flex, hover underline animation, active bg)
- [ ] Link styles in all templates (style.css + auth.css)
- [ ] Add animations (fadeIn for navbar/flash)

### 4. Validation & UX
- [ ] Signup: pwd len>=6 or flash error
- [ ] Flash: render_template with flash messages displayed
- [ ] Support: store submissions (list or db), print to terminal on POST

### 5. Testing & Completion
- [ ] Run `python app.py`, test full flows: signup→login→dashboard/navbar→support→logout
- [ ] Verify SQLite data, terminal prints, protections, JS map untouched
- [ ] Mobile responsive, dark theme consistent
- [ ] attempt_completion

Progress tracked here. Each step confirmed via tool feedback.

