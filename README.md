# EduMaster LMS

A mini Learning Management System: Express + MongoDB (Mongoose) backend,
plain HTML/CSS/JS glassmorphism frontend. Admins assign courses to
students; students study attached PDFs, track progress, submit
assignments, and download certificates once eligible.

**Everything is stored in MongoDB.** `localStorage` is only ever used for
the JWT session token, the cached logged-in user object, and which
course card you last clicked (pure navigation state) — never as the
source of truth for any real data. See "Where everything is stored"
below for the full breakdown.

## Project structure

```
edumaster-lms/
├── backend/
│   ├── server.js          ← all API routes
│   ├── package.json
│   ├── .env.example         ← copy to .env and fill in your own values
│   └── models/
│       ├── User.js          ← login accounts (admin / student), name+email+password+role
│       ├── Student.js        ← student directory: name, email, course label, department, phone, skills
│       ├── Course.js          ← title, instructor, pdfUrl, modules
│       ├── Enrollment.js       ← admin-created link: which student has which course, + progress %
│       ├── Assignment.js        ← submissions: studentName/email, link, marks, grade
│       └── Certificate.js        ← issued certificates: studentName/email, course, grade
└── frontend/
    ├── login.html            ← split layout: animated gradient brand (left) + glass sign in/up card (right)
    ├── dashboard.html         ← student home — only shows enrolled courses
    ├── courses.html / course.html  ← course list / detail + PDF reader + "Mark as Read"
    ├── attendance.html
    ├── assignments.html         ← student's own submissions
    ├── certificates.html
    ├── profile.html              ← real name/email/password editing + extra info, all saved to MongoDB
    ├── admin.html                  ← admin home: add courses (with PDF link), course list, recent submissions
    ├── students.html                ← admin: add/view/delete students
    ├── enrollments.html              ← admin: assign courses to students, see progress
    ├── admin-assignments.html         ← admin: grade assignments + issue certificates (progress-gated)
    ├── app.js                          ← shared helpers (auth guard, toasts, fetch wrapper, progress ring)
    ├── script.js                        ← login/signup logic + password show/hide toggle
    ├── dashboard.css                     ← glassmorphism design system for all logged-in pages
    └── style.css                          ← login page styling (split layout, animated gradient text)
```

## 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `MONGO_URI` — your MongoDB connection string (Atlas or local)
- `JWT_SECRET` — any long random string (see note below if you're unsure what to put)
- `PORT` — leave as 5000 unless it conflicts with something else

> **What's a JWT_SECRET?** It's not something you "have" already — you
> make it up. Any long random string works, e.g. generate one with
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
> If you don't set one, the code falls back to a default value, so the
> app still works either way — setting your own is just slightly safer.

Start the server:

```bash
npm start
```

You should see:
```
🔥 LMS Backend Starting...
✅ MongoDB Connected
🚀 Server Running On Port 5000
```

**Create the admin account** (one-time, visit in browser or curl):
```
http://localhost:5000/create-admin
```
This creates `admin@lms.com` / `1234`.

## 2. Frontend setup

No build step — it's static HTML/CSS/JS.

**Option A — VS Code Live Server extension** (easiest)
Right-click `frontend/login.html` → "Open with Live Server".

**Option B — any static file server**
```bash
cd frontend
npx serve .
```

Then open the printed URL.

⚠️ Don't just double-click the HTML files (`file://` URLs) — serve them
over `http://` for the most reliable behavior.

## 3. Using it

- Go to `login.html`. Sign up as a new student, or sign in as the admin
  you created (`admin@lms.com` / `1234`). Logging in routes you
  automatically: admins → `admin.html`, students → `dashboard.html`.
- **A brand-new student starts with zero courses.** Their dashboard and
  Courses page show an empty state until an admin assigns them
  something — this is intentional (see "Course assignment model" below).
- As admin: add a course in **Admin Panel** (optionally attach a PDF
  link), add students in **Students**, then go to **Enrollments** and
  assign a course to a student.
- As that student: their dashboard now shows the assigned course. Open
  it, click **Open PDF** to read the material, then **Mark as Read** to
  set progress to 100% for that course.
- Submit an assignment from the course page. As admin, go to
  **Assignment Review** to grade it, and check the **Certificate
  Eligibility** section — once a student's course progress is 50%+, the
  **Issue Certificate** button becomes available.
- As that student, go to **Certificates** and click **Download
  Certificate** — generates a designed PDF on the fly.
- In **Profile**, a student can change their name, email, and password.
  These changes hit the real `User` account — next login must use the
  new email/password.

## Course assignment model

- Students **cannot self-enroll**. The only way a student gets a course
  is via **Admin → Enrollments → Enroll**.
- `GET /courses?studentEmail=...` (used by the student dashboard and
  courses page) returns **only courses that student is enrolled in** —
  not the full course catalog. `GET /courses` with no `studentEmail`
  (used by admin pages) still returns every course, since admins need
  to manage the whole catalog.
- `POST /mark-pdf-read` requires an existing enrollment — it returns
  403 if a student tries to mark a course they aren't assigned to.

## Course PDFs

When adding a course in the admin panel, there's an optional
**"Course PDF link"** field. Paste a direct, publicly-reachable PDF URL
(must start with `http://` or `https://`):

- **GitHub**: upload the PDF → open it → click "Raw" → copy that URL
- **Google Drive**: Share → "Anyone with the link" → take the file ID
  from the share link and use `https://drive.google.com/uc?export=view&id=FILE_ID`
  (this serves the raw file instead of Drive's viewer page)

On the student's course page, if a course has a PDF attached, a
"Course Material" card shows **Open PDF** and **Mark as Read**.

## Certificate eligibility

- Progress is tracked **per student, per course** on the `Enrollment`
  model (0–100%), not on `Course` itself.
- `POST /issue-certificate` takes an `enrollmentId` and is rejected
  (400) server-side unless that enrollment's `progress >= 50` —
  regardless of what the frontend sends, so this can't be bypassed by
  calling the API directly.
- The admin's **Assignment Review** page has a **Certificate
  Eligibility** section listing every enrollment with its progress %,
  and an Issue Certificate button that's disabled until 50%+ progress
  (and shows "Already Issued" once one exists, preventing duplicates).

## Profile / credential changes

- `PUT /update-profile` (requires login) lets a student change their
  `name`, `email`, and/or `password` on their real `User` account.
- Changing the password requires the current password to be correct
  first (checked with bcrypt against the stored hash).
- Changing the email automatically updates the matching `Student`
  directory record, and re-links their historical `Assignment` and
  `Certificate` rows (matched by old email) to the new email — so past
  work doesn't disappear after an email change.
- "Additional Information" (department, phone, skills) is also stored
  in MongoDB on the `Student` document, not `localStorage`.
- After any change, a fresh JWT is issued and the frontend updates its
  stored session — the very next login must use the new credentials.

## Where everything is stored (MongoDB vs. browser)

| Data | Stored in |
|---|---|
| Login accounts, password hashes, roles | MongoDB (`User`) |
| Student directory, department/phone/skills | MongoDB (`Student`) |
| Courses, PDF links, modules | MongoDB (`Course`) |
| Who's enrolled in what, per-student progress | MongoDB (`Enrollment`) |
| Assignment submissions, marks, grades | MongoDB (`Assignment`) |
| Issued certificates | MongoDB (`Certificate`) |
| Attendance | **In-memory mock data in `server.js`** (not a real model — see limitations) |
| JWT session token | Browser `localStorage` (`token`) — standard for auth, not app data |
| Cached logged-in user (name/email/role) | Browser `localStorage` (`user`) — a copy of login response, refreshed on every login/profile update |
| "Which course did I just click" | Browser `localStorage` (`courseId`) — pure UI navigation state |

## UI / design

- Full glassmorphism: frosted, translucent panels (`backdrop-filter:
  blur(...)`) over a deep space-blue background with slowly drifting
  gradient orbs.
- Login page: split layout — large animated, continuously shifting
  gradient "EDUMASTER" wordmark on the left, glass sign-in/sign-up card
  on the right.
- Password fields have a click-to-toggle 👁 / 🙈 visibility button
  (login, signup, and the password-change form in Profile).
- Responsive: sidebar collapses into a slide-out drawer under 768px,
  grids collapse to 1–2 columns, tables scroll horizontally.
- Respects `prefers-reduced-motion` (disables ambient animations for
  users who've asked for that).

## Known simplifications (mini-project scope)

- Attendance is mock/static data returned by the backend — there's no
  real attendance-tracking model or admin UI to record it per day.
- "Progress" is binary per course in practice (0% or 100%, set by one
  "Mark as Read" click) — no partial/page-by-page tracking.
- `localStorage` for the session token is fine for a mini-project demo;
  it isn't meant for production-grade security.

## ⚠️ Security note

If a real MongoDB Atlas connection string was ever shared in this
project outside a trusted channel, rotate the database password in
Atlas (**Database Access → edit user → Edit Password**) before relying
on this project further.
