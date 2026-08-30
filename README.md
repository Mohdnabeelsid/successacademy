# SUCCESS Learning Log

A premium, vanilla HTML/CSS/JS study-tracking application for Success Academy, powered by **Supabase Auth + PostgreSQL Database (with Row Level Security)**. Built with native Web Components and modular ES JavaScript (no React, Vue, Angular, Bootstrap, Tailwind, or jQuery).

---

## 1. Setup & Migration to Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon / public key**
3. Paste these values into [`js/config/supabase-config.js`](file:///d:/success-learning-log/js/config/supabase-config.js):
   ```js
   export const SUPABASE_URL = "https://your-project.supabase.co";
   export const SUPABASE_ANON_KEY = "your-anon-key";
   ```

---

## 2. Initialize Database & Security Rules

1. Open your Supabase Dashboard → **SQL Editor** → **New Query**.
2. Copy the contents of [`schema.sql`](file:///d:/success-learning-log/schema.sql) into the query editor.
3. Click **Run** to automatically create:
   - Tables (`users`, `students`, `study_logs`, `branches`, `classes`, `subjects`, `academic_years`)
   - Indexes & `updated_at` triggers
   - Row Level Security (RLS) policies protecting data access based on user role.

---

## 3. Create Your First Admin Account

1. In Supabase Dashboard → **Authentication → Users** → click **Add user**:
   - **Email**: `admin@successacademy.com`
   - **Password**: *(Set your desired admin password)*
2. Copy the generated user's **User UID**.
3. In **SQL Editor**, run the following statement (replace `<ADMIN_USER_UID>` with your copied UID):
   ```sql
   INSERT INTO public.users (id, email, name, role, branch)
   VALUES ('<ADMIN_USER_UID>', 'admin@successacademy.com', 'Mohammed Nabeel', 'admin', 'MAN')
   ON CONFLICT (id) DO NOTHING;
   ```
4. Sign in at `pages/admin-login.html` using the admin email and password.

---

## 4. Adding Students & Password Resets

- Admin can add students via **Student Management** → *Add Student* or *Excel Bulk Import*.
- Each student is assigned a unique Admission Number (e.g. `SA2026001`) and a synthetic login email (`SA2026001@students.successacademy.app`).
- Students log in at `pages/student-login.html` using their **Admission Number** and password.

---

## 5. Folder Structure

```
/css          — variables.css (design tokens), base.css, components.css, landing.css, auth.css, dashboard.css
/js/config    — supabase-config.js
/js/services  — auth-service, supabase-service, student-service, studylog-service, report-service
/js/components— sidebar.js, calendar.js, toast.js
/js/pages     — controller JS for each page
/pages        — application views
schema.sql    — PostgreSQL schema, RLS policies, and index definitions
```

---

## 6. Local Development

Start static HTTP server:
```bash
npx http-server .
```
Access the application at `http://localhost:8080`.
